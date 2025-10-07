import express from 'express';
import xml2js from 'xml2js';
import axios from 'axios';
import User from '../models/Users.js';
import Product from '../models/Product.js';
import ManualCompetitor from '../models/ManualCompetitor.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  ebayRateLimit,
  logEbayUsage,
} from '../middleware/rateLimitMiddleware.js';
import ebayUsageService from '../services/ebayUsageService.js';
import {
  createCompetitorRule,
  applyRuleToItems,
  getAllCompetitorRules,
  createRuleForProduct,
  getCompetitorRuleForProduct,
  createCompetitorRuleLogic,
} from '../controllers/competitorRule.js';

const router = express.Router();

// Apply rate limiting and usage logging to all routes
router.use(logEbayUsage);

/**
 * ===============================
 * COMPETITOR RULES API
 * ===============================
 *
 * This file contains all competitor rule management APIs:
 * - Create competitor rule on specific product
 * - Create competitor rule and assign to all active listings
 * - Fetch competitor rules from specific product
 * - Fetch all active listings with competitor rules
 * - Update competitor rule on specific product
 * - Delete competitor rule from specific product
 * - Delete competitor rules from all active listings
 */

/**
 * Helper Functions
 */

// Parse XML response helper
async function parseXMLResponse(xmlData) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix],
  });
  return await parser.parseStringPromise(xmlData);
}

// Check if eBay API response is successful
function isEBayResponseSuccessful(result, operationName) {
  const response = result[operationName + 'Response'];
  if (response.Ack !== 'Success' && response.Ack !== 'Warning') {
    const errors = response.Errors;
    const errorMsg = Array.isArray(errors)
      ? errors.map((e) => e.LongMessage || e.ShortMessage).join(', ')
      : errors?.LongMessage || errors?.ShortMessage || 'Unknown error';
    throw new Error(`eBay API Error: ${errorMsg}`);
  }
  return response;
}

// Make eBay XML API call
async function makeEBayAPICall(xmlRequest, callName) {
  const response = await axios({
    method: 'post',
    url: 'https://api.ebay.com/ws/api.dll',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID': '0', // US site
    },
    data: xmlRequest,
  });
  return response.data;
}

// Create competitor rule XML specifics
function createCompetitorRuleSpecifics(ruleData) {
  const {
    ruleName,
    minPercentOfCurrentPrice,
    maxPercentOfCurrentPrice,
    excludeCountries = [],
    excludeConditions = [],
    excludeProductTitleWords = [],
    excludeSellers = [],
    findCompetitorsBasedOnMPN = false,
  } = ruleData;

  const ruleSpecifics = [
    { name: 'CompetitorRuleName', value: ruleName },
    {
      name: 'FindCompetitorsBasedOnMPN',
      value: findCompetitorsBasedOnMPN.toString(),
    },
  ];

  if (minPercentOfCurrentPrice !== undefined) {
    ruleSpecifics.push({
      name: 'MinPercentOfCurrentPrice',
      value: minPercentOfCurrentPrice.toString(),
    });
  }

  if (maxPercentOfCurrentPrice !== undefined) {
    ruleSpecifics.push({
      name: 'MaxPercentOfCurrentPrice',
      value: maxPercentOfCurrentPrice.toString(),
    });
  }

  // Handle arrays by joining with semicolons
  if (excludeCountries.length > 0) {
    ruleSpecifics.push({
      name: 'ExcludeCountries',
      value: excludeCountries.join(';'),
    });
  }

  if (excludeConditions.length > 0) {
    ruleSpecifics.push({
      name: 'ExcludeConditions',
      value: excludeConditions.join(';'),
    });
  }

  if (excludeProductTitleWords.length > 0) {
    ruleSpecifics.push({
      name: 'ExcludeProductTitleWords',
      value: excludeProductTitleWords.join(';'),
    });
  }

  if (excludeSellers.length > 0) {
    ruleSpecifics.push({
      name: 'ExcludeSellers',
      value: excludeSellers.join(';'),
    });
  }

  // Add timestamp
  ruleSpecifics.push({
    name: 'CompetitorRuleCreatedAt',
    value: new Date().toISOString(),
  });

  return ruleSpecifics;
}

/**
 * ===============================
 * 1. CREATE COMPETITOR RULE ON SPECIFIC PRODUCT
 * ===============================
 */

router.post(
  '/products/:itemId',
  ebayRateLimit('ReviseItem'),
  async (req, res) => {
    try {
      const { itemId } = req.params;
      const { userId, sku, title } = req.body;

      // Rate limit check first
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required in request body',
        });
      }

      // Create competitor rule using the extracted logic
      const rule = await createCompetitorRuleLogic(
        {
          ...req.body,
          appliesTo: [
            {
              itemId,
              sku: sku || null,
              title: title || null,
              dateApplied: new Date(),
            },
          ],
        },
        userId
      );

      // Associate the created rule with the product
      await Product.findOneAndUpdate(
        { itemId },
        { competitorRule: rule._id },
        { new: true }
      );

      return res.status(201).json({
        success: true,
        message: 'Competitor rule created successfully and applied to product',
        data: rule,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ===============================
 * 2. APPLY COMPETITOR RULE - RATE LIMITED AND OPTIMIZED
 * ===============================
 */

router.post(
  '/apply-competitor-rule/:itemId',
  ebayRateLimit('ReviseItem'),
  async (req, res) => {
    try {
      const { itemId } = req.params;
      const ruleOptions = req.body;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required in request body',
        });
      }

      // Get user's eBay token with rate limiting
      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'No eBay credentials found for this user',
        });
      }

      const authToken = user.ebay.accessToken;

      // ONLY retrieve existing item specifics if absolutely necessary
      const getItemXml = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${authToken}</eBayAuthToken>
          </RequesterCredentials>
          <ItemID>${itemId}</ItemID>
          <DetailLevel>ItemSpecificsOnly</DetailLevel>
          <IncludeItemSpecifics>true</IncludeItemSpecifics>
        </GetItemRequest>
      `;

      const getItemResponse = await makeEBayAPICall(getItemXml, 'GetItem');
      const getItemResult = await parseXMLResponse(getItemResponse);
      const item = isEBayResponseSuccessful(getItemResult, 'GetItem');

      // Extract existing item specifics
      const existingSpecifics = item.Item.ItemSpecifics?.NameValueList || [];

      // Filter out competitor rule related specifics if they exist
      const nonCompetitorRuleSpecifics = existingSpecifics.filter(
        (spec) => !isCompetitorRuleSpecific(spec.Name)
      );

      // Create new competitor rule specifics
      const competitorRuleSpecifics =
        createCompetitorRuleSpecifics(ruleOptions);

      // Build XML for the update with both sets of specifics
      const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
        <ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${authToken}</eBayAuthToken>
          </RequesterCredentials>
          <Item>
            <ItemID>${itemId}</ItemID>
            <ItemSpecifics>
              <!-- Include existing non-competitor rule specifics -->
              ${nonCompetitorRuleSpecifics
                .map(
                  (spec) => `
                <NameValueList>
                  <Name>${spec.Name}</Name>
                  <Value>${spec.Value}</Value>
                </NameValueList>
              `
                )
                .join('')}
              
              <!-- Add new competitor rule specifics -->
              ${competitorRuleSpecifics
                .map(
                  (spec) => `
                <NameValueList>
                  <Name>${spec.name}</Name>
                  <Value>${spec.value}</Value>
                </NameValueList>
              `
                )
                .join('')}
              
              <!-- Ensure Brand and Type are present -->
              ${
                !nonCompetitorRuleSpecifics.some(
                  (spec) => spec.Name === 'Brand'
                )
                  ? `
                <NameValueList>
                  <Name>Brand</Name>
                  <Value>YourBrandName</Value>
                </NameValueList>
              `
                  : ''
              }
              
              ${
                !nonCompetitorRuleSpecifics.some((spec) => spec.Name === 'Type')
                  ? `
                <NameValueList>
                  <Name>Type</Name>
                  <Value>YourTypeName</Value>
                </NameValueList>
              `
                  : ''
              }
            </ItemSpecifics>
          </Item>
        </ReviseItemRequest>
      `;

      const xmlResponse = await makeEBayAPICall(xmlRequest, 'ReviseItem');
      const result = await parseXMLResponse(xmlResponse);
      const response = isEBayResponseSuccessful(result, 'ReviseItem');
      createCompetitorRule(req, res);
      applyRuleToItems(req, res);
      return res.json({
        success: true,
        message: 'Competitor rule applied successfully',
        itemId,
        ebayResponse: {
          itemId: response.ItemID,
          startTime: response.StartTime,
          endTime: response.EndTime,
        },
      });
    } catch (error) {
      console.error('Apply Competitor Rule Error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * ===============================
 * 3. ASSIGN TO ALL ACTIVE - HEAVILY RATE LIMITED
 * ===============================
 */

router.post(
  '/assign-to-all-active',
  ebayRateLimit('GetMyeBaySelling'),
  async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required in request body',
        });
      }

      // Check if user has hit rate limits
      const permission = await ebayUsageService.canMakeAPICall(
        userId,
        'GetMyeBaySelling'
      );
      if (!permission.allowed) {
        return res.status(429).json({
          success: false,
          message: permission.message,
          resetTime: permission.resetTime,
        });
      }

      // Get user's eBay token
      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'No eBay credentials found for this user',
        });
      }

      const authToken = user.ebay.accessToken;

      // Get all active listings with pagination and limits
      const getActiveListingsXML = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${authToken}</eBayAuthToken>
          </RequesterCredentials>
          <ActiveList>
            <Include>true</Include>
            <Pagination>
              <EntriesPerPage>20</EntriesPerPage>
              <PageNumber>1</PageNumber>
            </Pagination>
          </ActiveList>
          <DetailLevel>ReturnSummary</DetailLevel>
        </GetMyeBaySellingRequest>
      `;

      const activeListingsResponse = await makeEBayAPICall(
        getActiveListingsXML,
        'GetMyeBaySelling'
      );
      const activeListingsResult = await parseXMLResponse(
        activeListingsResponse
      );
      const activeListingsData = isEBayResponseSuccessful(
        activeListingsResult,
        'GetMyeBaySelling'
      );

      const activeList = activeListingsData.ActiveList;
      if (!activeList || !activeList.ItemArray) {
        return res.json({
          success: true,
          message: 'No active listings found',
          assignedCount: 0,
          listings: [],
        });
      }

      const items = Array.isArray(activeList.ItemArray.Item)
        ? activeList.ItemArray.Item
        : [activeList.ItemArray.Item];

      // LIMIT to maximum 10 items to prevent API abuse
      const limitedItems = items.slice(0, 10);

      console.log(
        `⚠️ Processing only ${limitedItems.length} of ${items.length} items to prevent API rate limiting`
      );

      const results = [];
      const errors = [];

      // Process items with longer delays
      for (const item of limitedItems) {
        try {
          const itemId = item.ItemID;

          // Check rate limits before each call
          const itemPermission = await ebayUsageService.canMakeAPICall(
            userId,
            'ReviseItem'
          );
          if (!itemPermission.allowed) {
            errors.push({
              itemId,
              title: item.Title,
              success: false,
              error: 'Rate limit exceeded',
            });
            break; // Stop processing if rate limited
          }

          // Create rule specifics
          const ruleSpecifics = createCompetitorRuleSpecifics(req.body);

          const xmlRequest = `
            <?xml version="1.0" encoding="utf-8"?>
            <ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
              <RequesterCredentials>
                <eBayAuthToken>${authToken}</eBayAuthToken>
              </RequesterCredentials>
              <Item>
                <ItemID>${itemId}</ItemID>
                <ItemSpecifics>
                  ${ruleSpecifics
                    .map(
                      (spec) => `
                  <NameValueList>
                    <Name>${spec.name}</Name>
                    <Value>${spec.value}</Value>
                  </NameValueList>
                  `
                    )
                    .join('')}
                </ItemSpecifics>
              </Item>
            </ReviseItemRequest>
          `;

          const xmlResponse = await makeEBayAPICall(xmlRequest, 'ReviseItem');
          const result = await parseXMLResponse(xmlResponse);
          isEBayResponseSuccessful(result, 'ReviseItem');

          results.push({
            itemId,
            title: item.Title,
            success: true,
            message: 'Competitor rule applied successfully',
          });

          // Longer delay between API calls (5 seconds)
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(
            `❌ Error applying competitor rule to item ${item.ItemID}:`,
            error.message
          );
          errors.push({
            itemId: item.ItemID,
            title: item.Title,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.length;
      const errorCount = errors.length;

      res.json({
        success: true,
        message: `Competitor rule assigned to ${successCount} of ${limitedItems.length} items (limited from ${items.length} total)`,
        competitorRule: {
          name: req.body.ruleName,
          // ...other rule properties
        },
        summary: {
          totalActiveListings: items.length,
          processedListings: limitedItems.length,
          successfulAssignments: successCount,
          failedAssignments: errorCount,
        },
        successfulAssignments: results,
        failedAssignments: errors,
      });
    } catch (error) {
      console.error(
        'eBay Bulk Competitor Rule Assignment Error:',
        error.message
      );
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ===============================
 * 4. FETCH COMPETITOR RULE - OPTIMIZED TO PREVENT REPEATED CALLS
 * ===============================
 */
router.get('/products/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required as query parameter',
      });
    }

    // First check MongoDB for existing rule (faster)
    try {
      const mockReq = { query: { userId } };
      const rules = await new Promise((resolve, reject) => {
        const mockRes = {
          headersSent: false,
          status: () => mockRes,
          json: (data) => {
            if (data.success) {
              resolve(data.data || data.rules || []);
            } else {
              resolve([]);
            }
          },
        };

        getAllCompetitorRules(mockReq, mockRes).catch(reject);
      });

      // Filter for the specific product
      const productRule = rules.find(
        (rule) =>
          rule.appliesTo &&
          rule.appliesTo.some((item) => item.itemId === itemId)
      );

      if (productRule) {
        return res.status(200).json({
          success: true,
          hasCompetitorRule: true,
          competitorRule: productRule,
          source: 'mongodb',
        });
      }

      // Only call eBay API if no rule found in MongoDB
      console.log(
        `No rule found in MongoDB for ${itemId}, checking eBay API...`
      );

      // Rate limit the eBay API call
      const permission = await ebayUsageService.canMakeAPICall(
        userId,
        'GetItem'
      );
      if (!permission.allowed) {
        return res.status(429).json({
          success: false,
          message: 'Rate limit exceeded',
          resetTime: permission.resetTime,
        });
      }

      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'No eBay credentials found for this user',
        });
      }

      const authToken = user.ebay.accessToken;

      const xmlRequest = `
          <?xml version="1.0" encoding="utf-8"?>
          <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <RequesterCredentials>
              <eBayAuthToken>${authToken}</eBayAuthToken>
            </RequesterCredentials>
            <ItemID>${itemId}</ItemID>
            <DetailLevel>ItemSpecificsOnly</DetailLevel>
            <IncludeItemSpecifics>true</IncludeItemSpecifics>
          </GetItemRequest>
        `;

      const xmlResponse = await makeEBayAPICall(xmlRequest, 'GetItem');
      const result = await parseXMLResponse(xmlResponse);
      const response = isEBayResponseSuccessful(result, 'GetItem');

      const item = response.Item;
      if (!item) {
        throw new Error(`Item ${itemId} not found`);
      }

      // Extract competitor rule data from ItemSpecifics
      const itemSpecifics = item.ItemSpecifics?.NameValueList || [];
      const competitorRule = parseCompetitorRuleFromSpecifics(
        itemSpecifics,
        itemId
      );
      const hasCompetitorRule = competitorRule !== null;

      res.json({
        success: true,
        itemId,
        itemTitle: item.Title,
        hasCompetitorRule,
        competitorRule,
        source: 'ebay_api',
        rateLimitInfo: req.ebayUsage,
      });
    } catch (controllerError) {
      console.error('Error calling getAllCompetitorRules:', controllerError);
      return res.status(200).json({
        success: true,
        hasCompetitorRule: false,
        competitorRule: null,
        source: 'error_fallback',
      });
    }
  } catch (error) {
    console.error('eBay Competitor Rule Fetch Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ===============================
 * 5. MANUALLY ADD COMPETITORS - RATE LIMITED
 * ===============================
 */
router.post(
  '/add-competitors-manually/:itemId',
  ebayRateLimit('GetItem'),
  async (req, res) => {
    try {
      const { itemId } = req.params;
      const { userId, competitorItemIds } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required in request body',
        });
      }

      // LIMIT competitor checks to prevent API abuse
      const maxCompetitors = 5;
      const limitedCompetitorIds = competitorItemIds.slice(0, maxCompetitors);

      if (competitorItemIds.length > maxCompetitors) {
        console.log(
          `⚠️ Limiting competitor checks from ${competitorItemIds.length} to ${maxCompetitors} to prevent API abuse`
        );
      }

      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'No eBay credentials found for this user',
        });
      }

      const authToken = user.ebay.accessToken;
      const validCompetitors = [];
      const invalidCompetitors = [];

      // Process competitors with rate limiting
      for (const compItemId of limitedCompetitorIds) {
        try {
          // Check rate limits before each GetItem call
          const permission = await ebayUsageService.canMakeAPICall(
            userId,
            'GetItem'
          );
          if (!permission.allowed) {
            invalidCompetitors.push({
              itemId: compItemId.trim(),
              error: 'Rate limit exceeded - stopping competitor checks',
            });
            break;
          }

          const getItemXml = `
            <?xml version="1.0" encoding="utf-8"?>
            <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
              <RequesterCredentials>
                <eBayAuthToken>${authToken}</eBayAuthToken>
              </RequesterCredentials>
              <ItemID>${compItemId.trim()}</ItemID>
              <DetailLevel>ReturnSummary</DetailLevel>
            </GetItemRequest>
          `;

          const getItemResponse = await makeEBayAPICall(getItemXml, 'GetItem');
          const getItemResult = await parseXMLResponse(getItemResponse);
          const item = isEBayResponseSuccessful(getItemResult, 'GetItem');

          const itemData = item.Item;

          // Extract price with enhanced logic
          let price = 0;
          let currency = 'USD';

          const extractPrice = (priceObj) => {
            if (!priceObj) return { price: 0, currency: 'USD' };

            if (typeof priceObj === 'object') {
              const priceValue = parseFloat(
                priceObj.Value || priceObj.__value__ || priceObj._ || 0
              );
              const currencyValue =
                priceObj.__attributes__?.currencyID ||
                priceObj.currencyID ||
                priceObj['@currencyID'] ||
                'USD';
              return { price: priceValue, currency: currencyValue };
            } else {
              return { price: parseFloat(priceObj) || 0, currency: 'USD' };
            }
          };

          // Try different price fields
          if (itemData.StartPrice) {
            const extracted = extractPrice(itemData.StartPrice);
            price = extracted.price;
            currency = extracted.currency;
          } else if (itemData.CurrentPrice) {
            const extracted = extractPrice(itemData.CurrentPrice);
            price = extracted.price;
            currency = extracted.currency;
          }

          const competitorInfo = {
            competitorItemId: compItemId.trim(), // Use competitorItemId for consistency
            title: itemData.Title || 'Unknown Title',
            price: price,
            currency: currency,
            condition: itemData.ConditionDisplayName || 'Unknown',
            imageUrl: itemData.PictureDetails?.PictureURL?.[0] || null,
            productUrl:
              itemData.ViewItemURL || `https://www.ebay.com/itm/${compItemId}`,
            locale: itemData.Country || 'US',
            addedAt: new Date(),
            source: 'Manual',
          };

          validCompetitors.push(competitorInfo);

          // Add delay between competitor checks (3 seconds)
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (error) {
          console.error(
            `❌ Failed to fetch competitor ${compItemId}:`,
            error.message
          );
          invalidCompetitors.push({
            itemId: compItemId.trim(),
            error: error.message,
          });
        }
      }

      // Save to MongoDB - THIS IS THE KEY ADDITION
      if (validCompetitors.length > 0) {
        try {
          const result = await ManualCompetitor.findOneAndUpdate(
            { userId, itemId },
            {
              $addToSet: {
                competitors: { $each: validCompetitors },
              },
            },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
            }
          );

          console.log(
            `✅ Saved ${validCompetitors.length} competitors to MongoDB for item ${itemId}`
          );

          // Execute strategy if available
          try {
            const { executeStrategyForItem } = await import(
              '../services/strategyService.js'
            );
            const strategyResult = await executeStrategyForItem(itemId, userId);

            if (strategyResult.success) {
              console.log(
                `🎯 Strategy executed for ${itemId} after adding competitors`
              );
            }
          } catch (strategyError) {
            console.error(
              `❌ Error executing strategy for ${itemId}:`,
              strategyError
            );
          }
        } catch (saveError) {
          console.error('❌ Error saving competitors to MongoDB:', saveError);
          return res.status(500).json({
            success: false,
            message: 'Failed to save competitors to database',
            error: saveError.message,
          });
        }
      }

      res.json({
        success: true,
        message: `Successfully processed ${validCompetitors.length} of ${limitedCompetitorIds.length} competitors (limited from ${competitorItemIds.length} requested)`,
        itemId,
        addedCompetitors: validCompetitors,
        invalidCompetitors,
        summary: {
          totalRequested: competitorItemIds.length,
          processed: limitedCompetitorIds.length,
          successfullyAdded: validCompetitors.length,
          failed: invalidCompetitors.length,
        },
        rateLimitInfo: req.ebayUsage,
      });
    } catch (error) {
      console.error('Manual Add Competitors Error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ===============================
 * 6. GET MANUALLY ADDED COMPETITORS FROM MONGODB
 * ===============================
 */
router.get('/get-manual-competitors/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required as query parameter',
        competitors: [],
        count: 0,
      });
    }

    // Get manually added competitors from MongoDB
    const manualCompetitorDoc = await ManualCompetitor.findOne({
      userId,
      itemId,
    });

    if (!manualCompetitorDoc || !manualCompetitorDoc.competitors.length) {
      return res.json({
        success: true,
        itemId,
        competitors: [],
        count: 0,
      });
    }

    // Fix the transformation to handle the actual data structure properly
    const competitors = manualCompetitorDoc.competitors.map((comp) => ({
      // Use competitorItemId as the primary identifier since that's what's in the DB
      itemId: comp.competitorItemId || comp.itemId,
      competitorItemId: comp.competitorItemId || comp.itemId, // Ensure this field exists
      title: comp.title,
      price: comp.price,
      currency: comp.currency,
      imageUrl: comp.imageUrl,
      productUrl: comp.productUrl,
      locale: comp.locale,
      condition: comp.condition,
      addedAt: comp.addedAt,
      source: 'Manual',
    }));

    res.json({
      success: true,
      itemId,
      competitors,
      count: competitors.length,
    });
  } catch (error) {
    console.error('Get Manual Competitors Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      competitors: [],
      count: 0,
    });
  }
});

/**
 * ===============================
 * 7. DELETE MANUALLY ADDED COMPETITOR
 * ===============================
 */
router.delete(
  '/remove-manual-competitor/:itemId/:competitorItemId',
  async (req, res) => {
    try {
      const { itemId, competitorItemId } = req.params;
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required as query parameter',
        });
      }

      // Get current competitor data before removal to calculate price impact
      const beforeDoc = await ManualCompetitor.findOne({ userId, itemId });

      let currentLowest = null;
      if (beforeDoc && beforeDoc.competitors.length > 0) {
        const currentPrices = beforeDoc.competitors
          .map((comp) => parseFloat(comp.price))
          .filter((price) => !isNaN(price) && price > 0);
        currentLowest =
          currentPrices.length > 0 ? Math.min(...currentPrices) : null;
      }

      // Find and update the document - handle both itemId and competitorItemId fields
      const result = await ManualCompetitor.updateOne(
        { userId, itemId },
        {
          $pull: {
            competitors: {
              $or: [{ competitorItemId }, { itemId: competitorItemId }],
            },
          },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Competitor not found or already removed',
        });
      }

      // Get new competitor data after removal
      const afterDoc = await ManualCompetitor.findOne({ userId, itemId });

      let newLowest = null;
      if (afterDoc && afterDoc.competitors.length > 0) {
        const newPrices = afterDoc.competitors
          .map((comp) => parseFloat(comp.price))
          .filter((price) => !isNaN(price) && price > 0);
        newLowest = newPrices.length > 0 ? Math.min(...newPrices) : null;
      }

      // Check if competitor price landscape changed and execute strategy
      let strategyExecuted = false;
      let strategyResult = null;

      try {
        // Always execute strategy when competitors are removed to recalculate pricing
        const { executeStrategyForItem } = await import(
          '../services/strategyService.js'
        );

        strategyResult = await executeStrategyForItem(itemId, userId);

        if (strategyResult.success) {
          strategyExecuted = true;
        }
      } catch (strategyError) {
        console.error(
          `❌ Error executing strategy for ${itemId}:`,
          strategyError
        );
      }

      res.json({
        success: true,
        message: 'Competitor removed successfully',
        itemId,
        competitorItemId,
        priceChange: {
          currentLowest,
          newLowest,
          strategyExecuted,
          strategyResult,
          competitorsRemaining: afterDoc?.competitors?.length || 0,
        },
      });
    } catch (error) {
      console.error('Remove Manual Competitor Error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ===============================
 * 8. SEARCH COMPETITORS MANUALLY (NEW ENDPOINT)
 * ===============================
 */
router.post(
  '/search-competitors-manually/:itemId',
  ebayRateLimit('GetItem'),
  async (req, res) => {
    try {
      const { itemId } = req.params;
      const { userId, competitorItemIds } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required in request body',
        });
      }

      if (!competitorItemIds || !Array.isArray(competitorItemIds)) {
        return res.status(400).json({
          success: false,
          message: 'competitorItemIds array is required',
        });
      }

      // LIMIT competitor checks to prevent API abuse
      const maxCompetitors = 10;
      const limitedCompetitorIds = competitorItemIds.slice(0, maxCompetitors);

      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'No eBay credentials found for this user',
        });
      }

      const authToken = user.ebay.accessToken;
      const foundCompetitors = [];
      const notFoundCompetitors = [];

      // Get existing competitors to check for duplicates
      const existingDoc = await ManualCompetitor.findOne({ userId, itemId });
      const existingCompetitorIds = existingDoc
        ? existingDoc.competitors.map((c) => c.competitorItemId || c.itemId)
        : [];

      // Process competitors with rate limiting
      for (const compItemId of limitedCompetitorIds) {
        try {
          // Check rate limits before each GetItem call
          const permission = await ebayUsageService.canMakeAPICall(
            userId,
            'GetItem'
          );
          if (!permission.allowed) {
            notFoundCompetitors.push({
              itemId: compItemId.trim(),
              error: 'Rate limit exceeded - stopping competitor search',
            });
            break;
          }

          const getItemXml = `
            <?xml version="1.0" encoding="utf-8"?>
            <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
              <RequesterCredentials>
                <eBayAuthToken>${authToken}</eBayAuthToken>
              </RequesterCredentials>
              <ItemID>${compItemId.trim()}</ItemID>
              <DetailLevel>ReturnSummary</DetailLevel>
            </GetItemRequest>
          `;

          const getItemResponse = await makeEBayAPICall(getItemXml, 'GetItem');
          const getItemResult = await parseXMLResponse(getItemResponse);
          const item = isEBayResponseSuccessful(getItemResult, 'GetItem');

          const itemData = item.Item;

          // Extract price with enhanced logic
          let price = 0;
          let currency = 'USD';

          const extractPrice = (priceObj) => {
            if (!priceObj) return { price: 0, currency: 'USD' };

            if (typeof priceObj === 'object') {
              const priceValue = parseFloat(
                priceObj.Value || priceObj.__value__ || priceObj._ || 0
              );
              const currencyValue =
                priceObj.__attributes__?.currencyID ||
                priceObj.currencyID ||
                priceObj['@currencyID'] ||
                'USD';
              return { price: priceValue, currency: currencyValue };
            } else {
              return { price: parseFloat(priceObj) || 0, currency: 'USD' };
            }
          };

          // Try different price fields
          if (itemData.StartPrice) {
            const extracted = extractPrice(itemData.StartPrice);
            price = extracted.price;
            currency = extracted.currency;
          } else if (itemData.CurrentPrice) {
            const extracted = extractPrice(itemData.CurrentPrice);
            price = extracted.price;
            currency = extracted.currency;
          }

          // Check if already added
          const isAlreadyAdded = existingCompetitorIds.includes(
            compItemId.trim()
          );

          const competitorInfo = {
            itemId: compItemId.trim(),
            title: itemData.Title || 'Unknown Title',
            price: price,
            currency: currency,
            condition: itemData.ConditionDisplayName || 'Unknown',
            imageUrl: itemData.PictureDetails?.PictureURL?.[0] || null,
            productUrl:
              itemData.ViewItemURL || `https://www.ebay.com/itm/${compItemId}`,
            locale: itemData.Country || 'US',
            isAlreadyAdded,
          };

          foundCompetitors.push(competitorInfo);

          // Add delay between competitor checks (2 seconds)
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(
            `❌ Failed to search competitor ${compItemId}:`,
            error.message
          );
          notFoundCompetitors.push({
            itemId: compItemId.trim(),
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        message: `Found ${foundCompetitors.length} of ${limitedCompetitorIds.length} competitors`,
        itemId,
        foundCompetitors,
        notFoundCompetitors,
        summary: {
          totalRequested: competitorItemIds.length,
          processed: limitedCompetitorIds.length,
          found: foundCompetitors.length,
          notFound: notFoundCompetitors.length,
          alreadyAdded: foundCompetitors.filter((c) => c.isAlreadyAdded).length,
        },
      });
    } catch (error) {
      console.error('Search Competitors Manually Error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/**
 * ===============================
 * MONITORING ROUTES
 * ===============================
 */
router.put('/monitoring/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { enabled, frequency } = req.body;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const { default: ManualCompetitor } = await import(
      '../models/ManualCompetitor.js'
    );

    const doc = await ManualCompetitor.findOne({ userId, itemId });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No competitors found for this item',
      });
    }

    doc.monitoringEnabled =
      enabled !== undefined ? enabled : doc.monitoringEnabled;
    doc.monitoringFrequency = frequency || doc.monitoringFrequency;

    await doc.save();

    return res.json({
      success: true,
      message: `Monitoring ${
        enabled ? 'enabled' : 'disabled'
      } for item ${itemId}`,
      monitoring: {
        enabled: doc.monitoringEnabled,
        frequency: doc.monitoringFrequency,
        lastCheck: doc.lastMonitoringCheck,
      },
    });
  } catch (error) {
    console.error('Error updating monitoring settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating monitoring settings',
      error: error.message,
    });
  }
});

router.get('/monitoring/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId } = req.query;

    const { default: ManualCompetitor } = await import(
      '../models/ManualCompetitor.js'
    );

    const doc = await ManualCompetitor.findOne({ userId, itemId });

    if (!doc) {
      return res.json({
        success: true,
        monitoring: {
          enabled: false,
          frequency: 20,
          lastCheck: null,
          competitorCount: 0,
        },
      });
    }

    return res.json({
      success: true,
      monitoring: {
        enabled: doc.monitoringEnabled,
        frequency: doc.monitoringFrequency,
        lastCheck: doc.lastMonitoringCheck,
        competitorCount: doc.competitors.length,
      },
    });
  } catch (error) {
    console.error('Error getting monitoring status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting monitoring status',
      error: error.message,
    });
  }
});

router.get('/monitoring-status', requireAuth, async (req, res) => {
  try {
    const { userId } = req.query;

    const { default: ManualCompetitor } = await import(
      '../models/ManualCompetitor.js'
    );

    const stats = await ManualCompetitor.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          monitoringEnabled: {
            $sum: { $cond: ['$monitoringEnabled', 1, 0] },
          },
          totalCompetitors: {
            $sum: { $size: '$competitors' },
          },
          lastCheck: { $max: '$lastMonitoringCheck' },
        },
      },
    ]);

    const status = stats[0] || {
      totalItems: 0,
      monitoringEnabled: 0,
      totalCompetitors: 0,
      lastCheck: null,
    };

    return res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('❌ Error getting monitoring status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting monitoring status',
      error: error.message,
    });
  }
});

/**
 * ===============================
 * STRATEGY EXECUTION ROUTES
 * ===============================
 */
router.post('/trigger-monitoring', requireAuth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    // FIX: Import the function correctly
    const competitorMonitoringService = await import(
      '../services/competitorMonitoringService.js'
    );

    // Call the exported function
    const result = await competitorMonitoringService.updateCompetitorPrices();

    return res.json({
      success: true,
      message: 'Monitoring run completed',
      result, // contains whatever summary updateCompetitorPrices returns
    });
  } catch (error) {
    console.error('❌ Error triggering monitoring:', error);
    return res.status(500).json({
      success: false,
      message: 'Error triggering competitor monitoring',
      error: error.message,
    });
  }
});

router.post('/execute-strategies', requireAuth, async (req, res) => {
  try {
    const { userId, itemId } = req.body;

    // FIX: Import the functions correctly
    const competitorMonitoringService = await import(
      '../services/competitorMonitoringService.js'
    );

    let result;
    if (itemId) {
      // Execute for specific item
      result = await competitorMonitoringService.triggerStrategyForItem(
        itemId,
        userId
      );
    } else {
      // Execute for all items WITHOUT changing competitor prices
      result = await competitorMonitoringService.executeStrategiesForAllItems();
    }

    return res.json({
      success: true,
      message: 'Strategy execution completed (competitor prices unchanged)',
      result,
    });
  } catch (error) {
    console.error('❌ Error executing strategies:', error);
    return res.status(500).json({
      success: false,
      message: 'Error executing strategies',
      error: error.message,
    });
  }
});

/**
 * ===============================
 * DEBUG ROUTES
 * ===============================
 */
router.get('/debug/actual-competitors/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required as query parameter',
      });
    }

    // Get manually added competitors from MongoDB
    const manualCompetitorDoc = await ManualCompetitor.findOne({
      userId,
      itemId,
    });

    // Get competitor rules
    const { default: CompetitorRule } = await import(
      '../models/competitorSchema.js'
    );
    const competitorRules = await CompetitorRule.find({
      'appliesTo.itemId': itemId,
      createdBy: userId,
    });

    // Simulate the same logic as getCompetitorPrice
    let calculatedPrice = null;
    let priceSource = 'none';

    if (manualCompetitorDoc && manualCompetitorDoc.competitors.length > 0) {
      const prices = manualCompetitorDoc.competitors

        .map((comp) => parseFloat(comp.price))
        .filter((price) => !isNaN(price) && price > 0);

      if (prices.length > 0) {
        calculatedPrice = Math.min(...prices);
        priceSource = 'manual_competitors';
      }
    }

    return res.json({
      success: true,
      itemId,
      userId,
      manualCompetitors: {
        found: !!manualCompetitorDoc,
        count: manualCompetitorDoc?.competitors?.length || 0,
        competitors: manualCompetitorDoc?.competitors || [],
        prices:
          manualCompetitorDoc?.competitors?.map((c) => ({
            itemId: c.competitorItemId,
            price: c.price,
            title: c.title,
          })) || [],
      },
      competitorRules: {
        found: competitorRules.length > 0,
        count: competitorRules.length,
        rules: competitorRules.map((rule) => ({
          id: rule._id,
          name: rule.ruleName,
          isActive: rule.isActive,
        })),
      },
      calculatedLowestPrice: calculatedPrice,
      priceSource,
      expectedNewPrice: calculatedPrice
        ? {
            stayAbove_amount_0_5: calculatedPrice + 0.5,
            beatLowest_amount_0_02: calculatedPrice - 0.02,
          }
        : null,
    });
  } catch (error) {
    console.error('Debug Actual Competitors Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * ===============================
 * CONTROLLER ROUTES (NO DUPLICATES)
 * ===============================
 */
// Get all competitor rules
router.get('/', getAllCompetitorRules);

// Route to create and assign a competitor rule to a specific product
router.post('/create-rule/:itemId', createRuleForProduct);

// Route to fetch a competitor rule for a specific product
router.get('/fetch-rule/:itemId', getCompetitorRuleForProduct);

/**
 * ===============================
 * EMERGENCY CONTROLS
 * ===============================
 */

/**
 * Emergency stop all monitoring (use when API limits hit)
 * POST /api/competitor-rules/emergency-stop
 */
router.post('/emergency-stop', requireAuth, async (req, res) => {
  try {
    console.log('🚨 EMERGENCY STOP TRIGGERED');

    // Stop competitor monitoring
    const { emergencyStopMonitoring } = await import(
      '../services/competitorMonitoringService.js'
    );
    emergencyStopMonitoring();

    // Stop scheduler
    const { default: schedulerService } = await import(
      '../services/schedulerService.js'
    );
    if (
      schedulerService &&
      typeof schedulerService.emergencyStopAll === 'function'
    ) {
      schedulerService.emergencyStopAll();
    }

    // Clear any global intervals
    if (global.competitorMonitoringInterval) {
      clearInterval(global.competitorMonitoringInterval);
      global.competitorMonitoringInterval = null;
    }

    return res.json({
      success: true,
      message:
        '🚨 EMERGENCY STOP ACTIVATED - All monitoring and scheduled tasks stopped',
      timestamp: new Date().toISOString(),
      actions: [
        'Competitor monitoring stopped',
        'Scheduler service stopped',
        'All cron jobs destroyed',
        'Global intervals cleared',
      ],
    });
  } catch (error) {
    console.error('❌ Error in emergency stop:', error);
    return res.status(500).json({
      success: false,
      message: 'Error executing emergency stop',
      error: error.message,
    });
  }
});

/**
 * Check what's currently running
 * GET /api/competitor-rules/system-status
 */
router.get('/system-status', requireAuth, async (req, res) => {
  try {
    const cron = await import('node-cron');
    const jobs = cron.getTasks();

    const status = {
      timestamp: new Date().toISOString(),
      cronJobs: {
        count: jobs.size,
        active: Array.from(jobs.keys()),
      },
      schedulerService: {
        // Try to get scheduler status
        initialized: false,
        runningJobs: 0,
      },
      recommendations: [],
    };

    if (jobs.size > 0) {
      status.recommendations.push(
        '⚠️ Active cron jobs detected - consider emergency stop if API limits hit'
      );
    }

    // Check API usage
    const { canMakeAPICall } = await import('../services/ebayUsageService.js');
    const getItemStatus = await canMakeAPICall('system', 'GetItem');

    status.apiStatus = {
      GetItem: {
        allowed: getItemStatus.allowed,
        reason: getItemStatus.reason,
        usage: getItemStatus.usage,
        limit: getItemStatus.limit,
      },
    };

    if (!getItemStatus.allowed) {
      status.recommendations.push(
        '🚨 API limits exceeded - immediate action required'
      );
      status.recommendations.push(
        'Use /emergency-stop endpoint to halt all monitoring'
      );
    }

    return res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('❌ Error getting system status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting system status',
      error: error.message,
    });
  }
});

/**
 * ===============================
 * SERVICE CONTROL ENDPOINTS
 * ===============================
 */

/**
 * Manually start background services
 * POST /api/competitor-rules/start-services
 */
router.post('/start-services', requireAuth, async (req, res) => {
  try {
    console.log('🔄 Manual service start requested');

    // Check API limits first
    const ebayUsageService = await import('../services/ebayUsageService.js');
    const getItemStatus = await ebayUsageService.default.canMakeAPICall(
      'system',
      'GetItem'
    );

    if (!getItemStatus.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Cannot start services - API limits exceeded',
        usage: getItemStatus.usage,
        limit: getItemStatus.limit,
        resetTime: getItemStatus.resetTime,
      });
    }

    // Start scheduler service
    const { startSchedulerService } = await import(
      '../services/schedulerService.js'
    );
    const result = await startSchedulerService();

    return res.json({
      success: true,
      message: 'Background services start attempt completed',
      schedulerResult: result,
      apiStatus: {
        usage: getItemStatus.usage,
        limit: getItemStatus.limit,
        percentUsed:
          ((getItemStatus.usage / getItemStatus.limit) * 100).toFixed(1) + '%',
      },
    });
  } catch (error) {
    console.error('❌ Error starting services:', error);
    return res.status(500).json({
      success: false,
      message: 'Error starting background services',
      error: error.message,
    });
  }
});

/**
 * Check service status
 * GET /api/competitor-rules/service-status
 */
router.get('/service-status', requireAuth, async (req, res) => {
  try {
    // Check API usage
    const ebayUsageService = await import('../services/ebayUsageService.js');
    const getItemStatus = await ebayUsageService.default.canMakeAPICall(
      'system',
      'GetItem'
    );

    // Check cron jobs
    const cron = await import('node-cron');
    const jobs = cron.getTasks();

    const status = {
      timestamp: new Date().toISOString(),
      services: {
        cronJobs: {
          count: jobs.size,
          active: Array.from(jobs.keys()),
        },
        apiLimits: {
          GetItem: {
            allowed: getItemStatus.allowed,
            usage: getItemStatus.usage,
            limit: getItemStatus.limit,
            percentUsed:
              ((getItemStatus.usage / getItemStatus.limit) * 100).toFixed(1) +
              '%',
            resetTime: getItemStatus.resetTime,
          },
        },
      },
      recommendations: [],
    };

    if (!getItemStatus.allowed) {
      status.recommendations.push(
        '🚨 API limits exceeded - services should be stopped'
      );
    } else if (getItemStatus.usage / getItemStatus.limit > 0.8) {
      status.recommendations.push(
        '⚠️ High API usage - consider reducing service frequency'
      );
    }

    return res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('❌ Error getting service status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting service status',
      error: error.message,
    });
  }
});

export default router;
