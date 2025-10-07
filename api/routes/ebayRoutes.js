// routes/ebayRoutes.js
import express from 'express';
import xml2js from 'xml2js';
import axios from 'axios';
import ebayService from '../services/ebayService.js';
import getEbayListings from '../controllers/ebayController.js';
import fetchProducts from '../services/getInventory.js';
import editProductService from '../services/editProduct.js';
import User from '../models/Users.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  ebayRateLimit,
  logEbayUsage,
} from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// FIXED: Apply authentication middleware to all routes FIRST
router.use(requireAuth);

// Apply rate limiting and usage logging to all routes AFTER auth
router.use(logEbayUsage);

// ── Helper Functions ────────────────────────────────────────────────────────────

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

// ── Routes ──────────────────────────────────────────────────────────────────────

/**
 * Get active listings from eBay
 * GET /api/ebay/active-listings
 */
router.get(
  '/active-listings',
  ebayRateLimit('GetMyeBaySelling'),
  async (req, res) => {
    try {
      // FIXED: Use authenticated user's ID
      const userId = req.user.id || req.user._id;

      console.log(
        `📊 Fetching active listings for authenticated user: ${userId}`
      );

      // Add userId to request for the controller
      req.query.userId = userId;
      req.userId = userId; // Also set directly on req

      // Call the controller
      return await fetchProducts.getActiveListings(req, res);
    } catch (error) {
      console.error('Error in /active-listings route:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch active listings',
        error: error.message,
      });
    }
  }
);

/**
 * Get competitor prices for a specific item
 * GET /api/ebay/competitor-prices/:itemId
 */
router.get(
  '/competitor-prices/:itemId',
  ebayRateLimit('GetItem'),
  async (req, res) => {
    try {
      const { itemId } = req.params;
      // FIXED: Use authenticated user ID
      const userId = req.user.id || req.user._id;

      console.log(
        `🔍 Getting competitor prices for item ${itemId}, user: ${userId}`
      );

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const user = await User.findById(userId);
      if (!user || !user.ebay?.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'No eBay credentials found for this user',
        });
      }

      const authToken = user.ebay.accessToken;

      // Create XML request for GetItem
      const xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${authToken}</eBayAuthToken>
          </RequesterCredentials>
          <ItemID>${itemId}</ItemID>
          <DetailLevel>ReturnAll</DetailLevel>
        </GetItemRequest>
      `;

      const xmlResponse = await makeEBayAPICall(xmlRequest, 'GetItem');
      const result = await parseXMLResponse(xmlResponse);
      const response = isEBayResponseSuccessful(result, 'GetItem');

      const item = response.Item;

      console.log(
        `✅ Successfully retrieved competitor data for item ${itemId}`
      );

      res.json({
        success: true,
        data: {
          itemId: item.ItemID,
          title: item.Title,
          currentPrice: item.StartPrice || item.BuyItNowPrice,
          currency: item.Currency,
          condition: item.ConditionDisplayName,
          listingType: item.ListingType,
          timeLeft: item.TimeLeft,
        },
      });
    } catch (error) {
      console.error('Error getting competitor prices:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error fetching competitor prices',
        error: error.message,
      });
    }
  }
);

/**
 * Edit/update a listing price
 * PUT /api/ebay/edit-listing/:itemId
 */
router.put(
  '/edit-listing/:itemId',
  ebayRateLimit('ReviseInventoryStatus'),
  async (req, res) => {
    try {
      const { itemId } = req.params;
      const { newPrice } = req.body;
      // FIXED: Use authenticated user ID
      const userId = req.user.id || req.user._id;

      console.log(
        `💰 Updating price for item ${itemId} to ${newPrice}, user: ${userId}`
      );

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User authentication required',
        });
      }

      if (!newPrice || isNaN(parseFloat(newPrice))) {
        return res.status(400).json({
          success: false,
          message: 'Valid new price is required',
        });
      }

      const result = await editProductService.updateListingPrice(
        userId,
        itemId,
        parseFloat(newPrice)
      );

      console.log(`✅ Successfully updated price for item ${itemId}`);

      res.json(result);
    } catch (error) {
      console.error('Error editing listing:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error updating listing',
        error: error.message,
      });
    }
  }
);

/**
 * Get single item details
 * GET /api/ebay/item/:itemId
 */
router.get('/item/:itemId', ebayRateLimit('GetItem'), async (req, res) => {
  try {
    const { itemId } = req.params;
    // FIXED: Use authenticated user ID
    const userId = req.user.id || req.user._id;

    console.log(`📦 Getting item details for ${itemId}, user: ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required',
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.ebay?.accessToken) {
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
          <DetailLevel>ReturnAll</DetailLevel>
        </GetItemRequest>
      `;

    const xmlResponse = await makeEBayAPICall(xmlRequest, 'GetItem');
    const result = await parseXMLResponse(xmlResponse);
    const response = isEBayResponseSuccessful(result, 'GetItem');

    console.log(`✅ Successfully retrieved item details for ${itemId}`);

    res.json({
      success: true,
      data: response.Item,
    });
  } catch (error) {
    console.error('Error getting item details:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching item details',
      error: error.message,
    });
  }
});

/**
 * Search eBay for similar items (for competitor analysis)
 * GET /api/ebay/search
 */
router.get('/search', ebayRateLimit('GetSearchResults'), async (req, res) => {
  try {
    const { keywords, category, maxResults = 10 } = req.query;
    // FIXED: Use authenticated user ID
    const userId = req.user.id || req.user._id;

    console.log(`🔎 Searching eBay for "${keywords}", user: ${userId}`);

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Keywords parameter is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required',
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.ebay?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found for this user',
      });
    }

    // Use Finding API for search
    const searchUrl = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const searchParams = {
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': process.env.CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      keywords: keywords,
      'paginationInput.entriesPerPage': Math.min(maxResults, 50),
      sortOrder: 'BestMatch',
    };

    if (category) {
      searchParams['categoryId'] = category;
    }

    const searchResponse = await axios.get(searchUrl, { params: searchParams });
    const searchResults = searchResponse.data.findItemsAdvancedResponse[0];

    if (searchResults.ack[0] !== 'Success') {
      throw new Error('eBay search failed');
    }

    const items = searchResults.searchResult[0]?.item || [];

    console.log(`✅ Found ${items.length} search results for "${keywords}"`);

    res.json({
      success: true,
      count: items.length,
      data: items.map((item) => ({
        itemId: item.itemId[0],
        title: item.title[0],
        price: item.sellingStatus[0].currentPrice[0].__value__,
        currency: item.sellingStatus[0].currentPrice[0]['@currencyId'],
        endTime: item.listingInfo[0].endTime[0],
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || 'Unknown',
        url: item.viewItemURL[0],
      })),
    });
  } catch (error) {
    console.error('Error searching eBay:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error searching eBay',
      error: error.message,
    });
  }
});

/**
 * Get eBay categories
 * GET /api/ebay/categories
 */
router.get('/categories', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    console.log(`📂 Getting eBay categories for user: ${userId}`);

    // This is a simple endpoint that doesn't require user-specific eBay tokens
    // You can implement category fetching logic here

    res.json({
      success: true,
      message: 'Categories endpoint - implement as needed',
      data: [],
    });
  } catch (error) {
    console.error('Error getting categories:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message,
    });
  }
});

/**
 * Validate eBay item ID
 * GET /api/ebay/validate/:itemId
 */
router.get('/validate/:itemId', ebayRateLimit('GetItem'), async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id || req.user._id;

    console.log(`✅ Validating eBay item ${itemId} for user: ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User authentication required',
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.ebay?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found for this user',
      });
    }

    const authToken = user.ebay.accessToken;

    // Simple GetItem call to validate the item exists
    const xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${authToken}</eBayAuthToken>
          </RequesterCredentials>
          <ItemID>${itemId}</ItemID>
          <DetailLevel>ItemReturnDescription</DetailLevel>
        </GetItemRequest>
      `;

    const xmlResponse = await makeEBayAPICall(xmlRequest, 'GetItem');
    const result = await parseXMLResponse(xmlResponse);
    const response = isEBayResponseSuccessful(result, 'GetItem');

    const item = response.Item;

    console.log(`✅ Item ${itemId} is valid`);

    res.json({
      success: true,
      valid: true,
      data: {
        itemId: item.ItemID,
        title: item.Title,
        status: item.SellingStatus?.ListingStatus || 'Unknown',
      },
    });
  } catch (error) {
    console.error('Error validating item:', error.message);

    // If it's an eBay API error about item not found, return valid: false
    if (
      error.message.includes('Invalid item ID') ||
      error.message.includes('Item not found')
    ) {
      return res.json({
        success: true,
        valid: false,
        message: 'Item not found or invalid',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error validating item',
      error: error.message,
    });
  }
});

/**
 * Get user's eBay account info
 * GET /api/ebay/account-info
 */
router.get('/account-info', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    console.log(`👤 Getting eBay account info for user: ${userId}`);

    const user = await User.findById(userId);
    if (!user || !user.ebay?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found for this user',
      });
    }

    res.json({
      success: true,
      data: {
        hasEbayConnection: !!user.ebay?.accessToken,
        ebayUserId: user.ebay?.ebayUserId || null,
        connectionDate: user.ebay?.createdAt || null,
        tokenExpiry: user.ebay?.tokenExpiry || null,
      },
    });
  } catch (error) {
    console.error('Error getting account info:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching account information',
      error: error.message,
    });
  }
});

export default router;
