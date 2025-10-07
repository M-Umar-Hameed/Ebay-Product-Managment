// Competitor Rule Execution Engine
import axios from 'axios';
import xml2js from 'xml2js';
import User from '../models/Users.js';
import ManualCompetitor from '../models/ManualCompetitor.js';

class CompetitorRuleEngine {
  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix],
    });
  }

  // Execute competitor rule for a specific item
  async executeRule(itemId, rule, userToken) {
    try {
      console.log(`🔄 Executing competitor rule for item ${itemId}`);

      // Step 1: Get current item data
      const currentItem = await this.getCurrentItemData(itemId, userToken);

      // Step 2: Find competitors based on rule criteria
      const foundCompetitors = await this.findCompetitors(
        currentItem,
        rule,
        userToken
      );

      // Step 3: Filter competitors based on exclusion rules
      const filteredCompetitors = this.filterCompetitors(
        foundCompetitors,
        rule
      );

      // Step 4: Analyze competitor prices
      const priceAnalysis = this.analyzePrices(
        filteredCompetitors,
        currentItem.price,
        rule
      );

      // Step 5: Store found competitors
      await this.storeCompetitors(
        itemId,
        currentItem.userId,
        filteredCompetitors
      );

      // Step 6: Suggest or apply price adjustments (if enabled)
      const priceSuggestion = this.calculatePriceSuggestion(
        priceAnalysis,
        currentItem.price,
        rule
      );

      return {
        success: true,
        itemId,
        currentPrice: currentItem.price,
        competitorsFound: foundCompetitors.length,
        competitorsAfterFiltering: filteredCompetitors.length,
        priceAnalysis,
        priceSuggestion,
        competitors: filteredCompetitors,
      };
    } catch (error) {
      console.error(`❌ Error executing rule for ${itemId}:`, error.message);
      return {
        success: false,
        itemId,
        error: error.message,
      };
    }
  }

  // Get current item data from eBay
  async getCurrentItemData(itemId, userToken) {
    const getItemXml = `
      <?xml version="1.0" encoding="utf-8"?>
      <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${userToken}</eBayAuthToken>
        </RequesterCredentials>
        <ItemID>${itemId}</ItemID>
        <DetailLevel>ReturnAll</DetailLevel>
        <IncludeItemSpecifics>true</IncludeItemSpecifics>
      </GetItemRequest>
    `;

    const response = await this.makeEBayAPICall(getItemXml, 'GetItem');
    const result = await this.parser.parseStringPromise(response);
    const item = result.GetItemResponse.Item;

    const itemSpecifics = item.ItemSpecifics?.NameValueList || [];
    const specifics = Array.isArray(itemSpecifics)
      ? itemSpecifics
      : [itemSpecifics];

    return {
      itemId,
      title: item.Title,
      price: this.extractPrice(item.StartPrice || item.CurrentPrice),
      currency: this.extractCurrency(item.StartPrice || item.CurrentPrice),
      condition: item.ConditionDisplayName,
      mpn: this.extractSpecific(specifics, 'MPN'),
      upc: this.extractSpecific(specifics, 'UPC'),
      ean: this.extractSpecific(specifics, 'EAN'),
      brand: this.extractSpecific(specifics, 'Brand'),
      category: item.PrimaryCategory?.CategoryID,
      country: item.Country || item.Site,
      sellerId: item.Seller?.UserID,
      userId: this.extractUserIdFromToken(userToken),
    };
  }

  // Find competitors based on rule criteria
  async findCompetitors(currentItem, rule, userToken) {
    const competitors = [];

    // Search strategy 1: MPN-based search
    if (rule.findCompetitorsBasedOnMPN && currentItem.mpn) {
      const mpnCompetitors = await this.searchByMPN(
        currentItem.mpn,
        currentItem,
        userToken
      );
      competitors.push(...mpnCompetitors);
    }

    // Search strategy 2: Title keyword search
    const titleCompetitors = await this.searchByTitleKeywords(
      currentItem.title,
      currentItem,
      userToken
    );
    competitors.push(...titleCompetitors);

    // Search strategy 3: Category search
    if (currentItem.category) {
      const categoryCompetitors = await this.searchByCategory(
        currentItem.category,
        currentItem,
        userToken
      );
      competitors.push(...categoryCompetitors);
    }

    // Search strategy 4: UPC search
    if (currentItem.upc) {
      const upcCompetitors = await this.searchByUPC(
        currentItem.upc,
        currentItem,
        userToken
      );
      competitors.push(...upcCompetitors);
    }

    // Search strategy 5: EAN search
    if (currentItem.ean) {
      const eanCompetitors = await this.searchByEAN(
        currentItem.ean,
        currentItem,
        userToken
      );
      competitors.push(...eanCompetitors);
    }

    // Remove duplicates
    const uniqueCompetitors = this.removeDuplicateCompetitors(competitors);

    return uniqueCompetitors;
  }

  // Search competitors by MPN
  async searchByMPN(mpn, currentItem, userToken) {
    try {
      const searchXml = `
        <?xml version="1.0" encoding="utf-8"?>
        <FindItemsAdvancedRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${userToken}</eBayAuthToken>
          </RequesterCredentials>
          <keywords>MPN:${mpn}</keywords>
          <paginationInput>
            <entriesPerPage>50</entriesPerPage>
            <pageNumber>1</pageNumber>
          </paginationInput>
          <sortOrder>PricePlusShippingLowest</sortOrder>
          <itemFilter>
            <name>ListingType</name>
            <value>FixedPrice</value>
          </itemFilter>
          <itemFilter>
            <name>ExcludeSeller</name>
            <value>${currentItem.userId}</value>
          </itemFilter>
        </FindItemsAdvancedRequest>
      `;

      const response = await this.makeEBayAPICall(
        searchXml,
        'FindItemsAdvanced'
      );
      const result = await this.parser.parseStringPromise(response);

      if (result.FindItemsAdvancedResponse?.searchResult?.item) {
        const items = Array.isArray(
          result.FindItemsAdvancedResponse.searchResult.item
        )
          ? result.FindItemsAdvancedResponse.searchResult.item
          : [result.FindItemsAdvancedResponse.searchResult.item];

        return this.formatCompetitorData(items, 'MPN Search');
      }

      return [];
    } catch (error) {
      console.error('MPN search failed:', error.message);
      return [];
    }
  }

  // Search competitors by title keywords
  async searchByTitleKeywords(title, currentItem, userToken) {
    try {
      // Extract key words from title (remove common words)
      const keywords = this.extractKeywords(title);
      const searchQuery = keywords.slice(0, 3).join(' '); // Use top 3 keywords

      const searchXml = `
        <?xml version="1.0" encoding="utf-8"?>
        <FindItemsAdvancedRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${userToken}</eBayAuthToken>
          </RequesterCredentials>
          <keywords>${searchQuery}</keywords>
          <paginationInput>
            <entriesPerPage>30</entriesPerPage>
            <pageNumber>1</pageNumber>
          </paginationInput>
          <sortOrder>PricePlusShippingLowest</sortOrder>
          <itemFilter>
            <name>ListingType</name>
            <value>FixedPrice</value>
          </itemFilter>
          <itemFilter>
            <name>ExcludeSeller</name>
            <value>${currentItem.userId}</value>
          </itemFilter>
        </FindItemsAdvancedRequest>
      `;

      const response = await this.makeEBayAPICall(
        searchXml,
        'FindItemsAdvanced'
      );
      const result = await this.parser.parseStringPromise(response);

      if (result.FindItemsAdvancedResponse?.searchResult?.item) {
        const items = Array.isArray(
          result.FindItemsAdvancedResponse.searchResult.item
        )
          ? result.FindItemsAdvancedResponse.searchResult.item
          : [result.FindItemsAdvancedResponse.searchResult.item];

        return this.formatCompetitorData(items, 'Title Search');
      }

      return [];
    } catch (error) {
      console.error('Title search failed:', error.message);
      return [];
    }
  }

  // Search competitors by UPC
  async searchByUPC(upc, currentItem, userToken) {
    try {
      const searchXml = `
        <?xml version="1.0" encoding="utf-8"?>
        <FindItemsAdvancedRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${userToken}</eBayAuthToken>
          </RequesterCredentials>
          <keywords>UPC:${upc}</keywords>
          <paginationInput>
            <entriesPerPage>30</entriesPerPage>
            <pageNumber>1</pageNumber>
          </paginationInput>
          <sortOrder>PricePlusShippingLowest</sortOrder>
          <itemFilter>
            <name>ListingType</name>
            <value>FixedPrice</value>
          </itemFilter>
          <itemFilter>
            <name>ExcludeSeller</name>
            <value>${this.extractSellerFromToken(userToken)}</value>
          </itemFilter>
        </FindItemsAdvancedRequest>
      `;

      const response = await this.makeEBayAPICall(
        searchXml,
        'FindItemsAdvanced'
      );
      const result = await this.parser.parseStringPromise(response);

      if (result.FindItemsAdvancedResponse?.searchResult?.item) {
        const items = Array.isArray(
          result.FindItemsAdvancedResponse.searchResult.item
        )
          ? result.FindItemsAdvancedResponse.searchResult.item
          : [result.FindItemsAdvancedResponse.searchResult.item];

        return this.formatCompetitorData(items, 'UPC Search');
      }

      return [];
    } catch (error) {
      console.error('UPC search failed:', error.message);
      return [];
    }
  }

  // Search competitors by EAN
  async searchByEAN(ean, currentItem, userToken) {
    try {
      const searchXml = `
        <?xml version="1.0" encoding="utf-8"?>
        <FindItemsAdvancedRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${userToken}</eBayAuthToken>
          </RequesterCredentials>
          <keywords>EAN:${ean}</keywords>
          <paginationInput>
            <entriesPerPage>30</entriesPerPage>
            <pageNumber>1</pageNumber>
          </paginationInput>
          <sortOrder>PricePlusShippingLowest</sortOrder>
          <itemFilter>
            <name>ListingType</name>
            <value>FixedPrice</value>
          </itemFilter>
          <itemFilter>
            <name>ExcludeSeller</name>
            <value>${this.extractSellerFromToken(userToken)}</value>
          </itemFilter>
        </FindItemsAdvancedRequest>
      `;

      const response = await this.makeEBayAPICall(
        searchXml,
        'FindItemsAdvanced'
      );
      const result = await this.parser.parseStringPromise(response);

      if (result.FindItemsAdvancedResponse?.searchResult?.item) {
        const items = Array.isArray(
          result.FindItemsAdvancedResponse.searchResult.item
        )
          ? result.FindItemsAdvancedResponse.searchResult.item
          : [result.FindItemsAdvancedResponse.searchResult.item];

        return this.formatCompetitorData(items, 'EAN Search');
      }

      return [];
    } catch (error) {
      console.error('EAN search failed:', error.message);
      return [];
    }
  }

  // Filter competitors based on exclusion rules
  filterCompetitors(competitors, rule) {
    return competitors.filter((competitor) => {
      // Filter by country
      if (rule.excludeCountries?.length > 0) {
        if (rule.excludeCountries.includes(competitor.country)) {
          return false;
        }
      }

      // Filter by condition
      if (rule.excludeConditions?.length > 0) {
        if (rule.excludeConditions.includes(competitor.condition)) {
          return false;
        }
      }

      // Filter by title words
      if (rule.excludeProductTitleWords?.length > 0) {
        const titleLower = competitor.title.toLowerCase();
        for (const word of rule.excludeProductTitleWords) {
          if (titleLower.includes(word.toLowerCase())) {
            return false;
          }
        }
      }

      // Filter by sellers
      if (rule.excludeSellers?.length > 0) {
        if (rule.excludeSellers.includes(competitor.sellerId)) {
          return false;
        }
      }

      return true;
    });
  }

  // Analyze competitor prices
  analyzePrices(competitors, currentPrice, rule) {
    if (competitors.length === 0) {
      return {
        competitorCount: 0,
        averagePrice: 0,
        lowestPrice: 0,
        highestPrice: 0,
        recommendation: 'No competitors found',
      };
    }

    const prices = competitors.map((c) => c.price).filter((p) => p > 0);
    const averagePrice =
      prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);

    // Price range analysis based on rule
    const minAcceptablePrice =
      currentPrice * (rule.minPercentOfCurrentPrice / 100);
    const maxAcceptablePrice =
      currentPrice * (rule.maxPercentOfCurrentPrice / 100);

    const competitorsInRange = competitors.filter(
      (c) => c.price >= minAcceptablePrice && c.price <= maxAcceptablePrice
    );

    return {
      competitorCount: competitors.length,
      competitorsInPriceRange: competitorsInRange.length,
      averagePrice: Math.round(averagePrice * 100) / 100,
      lowestPrice,
      highestPrice,
      minAcceptablePrice,
      maxAcceptablePrice,
      recommendation: this.generatePriceRecommendation(
        currentPrice,
        averagePrice,
        lowestPrice
      ),
    };
  }

  // Calculate price suggestion
  calculatePriceSuggestion(analysis, currentPrice, rule) {
    if (analysis.competitorCount === 0) {
      return {
        suggested: currentPrice,
        reason: 'No competitors found - keep current price',
        change: 0,
      };
    }

    // Strategy: Price slightly below average competitor price
    const targetPrice = analysis.averagePrice * 0.95; // 5% below average

    // Ensure within rule bounds
    const minPrice = currentPrice * (rule.minPercentOfCurrentPrice / 100);
    const maxPrice = currentPrice * (rule.maxPercentOfCurrentPrice / 100);

    const suggestedPrice = Math.max(minPrice, Math.min(maxPrice, targetPrice));
    const change = suggestedPrice - currentPrice;

    return {
      suggested: Math.round(suggestedPrice * 100) / 100,
      reason: `Price to compete with ${analysis.competitorCount} competitors`,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round((change / currentPrice) * 100 * 100) / 100,
    };
  }

  // Store competitors in database
  async storeCompetitors(itemId, userId, competitors) {
    try {
      // Clear existing API competitors for this item
      await ManualCompetitor.updateOne(
        { userId, itemId },
        {
          $pull: {
            competitors: { source: 'API Search' },
          },
        }
      );

      // Add new API competitors
      const competitorData = competitors.map((comp) => ({
        competitorItemId: comp.itemId,
        title: comp.title,
        price: comp.price,
        currency: comp.currency,
        condition: comp.condition,
        imageUrl: comp.imageUrl,
        productUrl: comp.productUrl,
        locale: comp.country,
        source: 'API Search',
        addedAt: new Date(),
      }));

      await ManualCompetitor.updateOne(
        { userId, itemId },
        {
          $addToSet: {
            competitors: { $each: competitorData },
          },
        },
        { upsert: true }
      );

      console.log(
        `✅ Stored ${competitors.length} competitors for item ${itemId}`
      );
    } catch (error) {
      console.error('Failed to store competitors:', error.message);
    }
  }

  // Helper methods
  makeEBayAPICall(xmlRequest, callName) {
    return axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
        'X-EBAY-API-CALL-NAME': callName,
        'X-EBAY-API-SITEID': '0',
      },
      data: xmlRequest,
    }).then((response) => response.data);
  }

  extractPrice(priceObj) {
    if (!priceObj) return 0;
    if (typeof priceObj === 'object') {
      return parseFloat(priceObj.Value || priceObj.__value__ || 0);
    }
    return parseFloat(priceObj) || 0;
  }

  extractCurrency(priceObj) {
    if (!priceObj) return 'USD';
    if (typeof priceObj === 'object') {
      return priceObj.__attributes__?.currencyID || 'USD';
    }
    return 'USD';
  }

  extractMPN(itemSpecifics) {
    if (!itemSpecifics) return null;
    const specifics = Array.isArray(itemSpecifics)
      ? itemSpecifics
      : [itemSpecifics];
    const mpnSpec = specifics.find((spec) => spec.Name === 'MPN');
    return mpnSpec?.Value || null;
  }

  extractKeywords(title) {
    const commonWords = [
      'for',
      'the',
      'and',
      'or',
      'with',
      'in',
      'on',
      'at',
      'to',
      'a',
      'an',
    ];
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.includes(word))
      .slice(0, 5);
  }

  formatCompetitorData(items, source) {
    return items.map((item) => ({
      itemId: item.itemId,
      title: item.title,
      price: this.extractPrice(item.sellingStatus?.currentPrice),
      currency: this.extractCurrency(item.sellingStatus?.currentPrice),
      condition: item.condition?.conditionDisplayName || 'Unknown',
      imageUrl: item.galleryURL,
      productUrl: item.viewItemURL,
      country: item.country,
      sellerId: item.sellerInfo?.sellerUserName,
      source,
    }));
  }

  // Extract specific value from item specifics
  extractSpecific(specifics, name) {
    const specific = specifics.find((spec) => spec.Name === name);
    return specific?.Value || null;
  }

  // Remove duplicates, excluding our own item
  removeDuplicateCompetitors(competitors, excludeItemId = null) {
    const seen = new Set();
    return competitors.filter((comp) => {
      // Exclude our own listing
      if (excludeItemId && comp.itemId === excludeItemId) {
        return false;
      }

      if (seen.has(comp.itemId)) {
        return false;
      }
      seen.add(comp.itemId);
      return true;
    });
  }

  generatePriceRecommendation(current, average, lowest) {
    if (current > average) {
      return 'Consider lowering price to be more competitive';
    } else if (current < lowest) {
      return 'You have the lowest price - consider raising slightly';
    } else {
      return 'Your price is competitive';
    }
  }

  extractUserIdFromToken(token) {
    // This would need to be implemented based on your token structure
    return 'current-user'; // Placeholder
  }

  // Enhanced seller extraction
  extractSellerFromToken(userToken) {
    // This should extract the seller ID from the token
    // For now, return a placeholder - you'd need to decode the actual token
    return 'current-seller';
  }
}

export default CompetitorRuleEngine;
