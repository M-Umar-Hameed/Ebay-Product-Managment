// routes/pricingStrategyRoutes.js

import express from 'express';
import {
  createPricingStrategy,
  getAllPricingStrategies,
  getPricingStrategy,
  updatePricingStrategy,
  deletePricingStrategy,
  applyStrategyToItemsController,
  getStrategiesForItemController,
  removeStrategyFromItemController,
  getActivePricingStrategies,
  getStrategyDisplayForProductController,
  executeAllStrategiesController,
  setStrategyForItemController,
  executeStrategyForItemController,
} from '../controllers/pricingStrategyController.js';
import PricingStrategy from '../models/PricingStrategy.js';
import {
  getStrategiesForItem,
  executeStrategyForItem,
  applyStrategiesToItem,
} from '../services/strategyService.js';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// FIXED: Apply authentication middleware to all routes
router.use(requireAuth);

// 1) Create a new strategy WITHOUT applying it to any listing
//    POST /api/pricing-strategies
router.post('/', async (req, res) => {
  try {
    // Use the correct import - createStrategy is the service function
    const { createStrategy } = await import('../services/strategyService.js');

    const strategy = await createStrategy({
      ...req.body,
      createdBy: req.user.id || req.user._id,
    });

    return res.status(201).json({
      success: true,
      data: strategy,
      message: `Strategy "${strategy.strategyName}" created successfully. You can now apply it to specific listings.`,
    });
  } catch (err) {
    console.error('Error in POST /api/pricing-strategies:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// 2) Get all strategies (optional: ?active=true|false)
//    GET /api/pricing-strategies
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    let isActive = null;
    if (active === 'true') isActive = true;
    else if (active === 'false') isActive = false;

    // FIXED: Use authenticated user's ID
    const userId = req.user.id || req.user._id;
    console.log(`📊 Getting all strategies for user: ${userId}`);

    const strategies = await getAllPricingStrategies(isActive, userId);
    return res.status(200).json({
      success: true,
      strategies, // Wrap strategies in the specified format
      rules: [], // Placeholder for rulesData if applicable
    });
  } catch (err) {
    console.error('Error in GET /api/pricing-strategies:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2.5) Get active listings with strategies
//      GET /api/pricing-strategies/active-listings
router.get('/active-listings', async (req, res) => {
  try {
    const { active } = req.query;

    // FIXED: Use authenticated user's ID instead of query parameter
    const userId = req.user.id || req.user._id;

    console.log(`📊 Active listings request for authenticated user: ${userId}`);

    // Set the userId in req for the controller to use
    req.userId = userId;
    req.query.userId = userId; // Also set in query for backward compatibility

    // Call the controller function instead of service directly
    const { getAllPricingStrategies } = await import(
      '../controllers/pricingStrategyController.js'
    );
    return getAllPricingStrategies(req, res);
  } catch (err) {
    console.error('Error in GET /active-listings:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
      error: 'Failed to fetch active listings',
    });
  }
});

// 2.6) Get all "active" strategies only
//      GET /api/pricing-strategies/active
router.get('/active', async (req, res) => {
  try {
    // FIXED: Use authenticated user's ID
    const userId = req.user.id || req.user._id;
    console.log(`✅ Getting active strategies for user: ${userId}`);

    const strategies = await getActivePricingStrategies(null, userId);
    return res.status(200).json({
      success: true,
      strategies, // Wrap strategies in the specified format
      rules: [], // Placeholder for rulesData if applicable
    });
  } catch (err) {
    console.error('Error in GET /active:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3) Get a single strategy by ID or strategyId
//    GET /api/pricing-strategies/:id
router.get('/:id', async (req, res) => {
  try {
    console.log(`🔍 Getting strategy by ID: ${req.params.id}`);

    const strategy = await getPricingStrategy(req.params.id);
    if (!strategy) {
      return res
        .status(404)
        .json({ success: false, message: 'Strategy not found' });
    }
    return res.json({ success: true, data: strategy });
  } catch (err) {
    console.error('Error in GET /api/pricing-strategies/:id:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4) Update a strategy
//    PUT /api/pricing-strategies/:id
router.put('/:id', async (req, res) => {
  try {
    console.log(`📝 Updating strategy: ${req.params.id}`);
    return await updatePricingStrategy(req, res);
  } catch (err) {
    console.error('Error in PUT /api/pricing-strategies/:id:', err.message);
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 5) Delete a strategy (only if it has no appliesTo[] entries)
//    DELETE /api/pricing-strategies/:id
router.delete('/:id', async (req, res) => {
  try {
    console.log(`🗑️ Deleting strategy: ${req.params.id}`);

    await deletePricingStrategy(req.params.id);
    return res.json({
      success: true,
      message: 'Strategy deleted successfully',
    });
  } catch (err) {
    console.error('Error in DELETE /api/pricing-strategies/:id:', err.message);
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6) Apply a strategy to multiple items
//    POST /api/pricing-strategies/:id/apply
router.post('/:id/apply', async (req, res) => {
  try {
    const items = req.body.items; // should be [{ itemId, sku?, title? }, …]
    const strategyId = req.params.id;

    console.log(
      `📋 Applying strategy ${strategyId} to ${items?.length || 0} items`
    );

    const results = await applyStrategyToItemsController(strategyId, items);
    return res.json({
      success: true,
      message: `Applied to ${results.filter((r) => r.success).length} item(s)`,
      results,
    });
  } catch (err) {
    console.error('Error in POST /:id/apply:', err.message);
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6.8) Get strategy display information for a product (MOVE THIS BEFORE THE GENERAL GET)
//      GET /api/pricing-strategies/products/:itemId/display
router.get('/products/:itemId/display', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku = null } = req.query;

    console.log(`🎨 Getting strategy display for product: ${itemId}`);

    const { getStrategyDisplayForProduct } = await import(
      '../services/strategyService.js'
    );
    const displayInfo = await getStrategyDisplayForProduct(itemId, sku);

    // Add cache control headers to prevent caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return res.json({
      success: true,
      data: displayInfo,
    });
  } catch (err) {
    console.error('Error in GET /products/:itemId/display:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
      data: {
        strategy: 'Assign Strategy',
        minPrice: 'Set',
        maxPrice: 'Set',
        hasStrategy: false,
        appliedStrategies: [],
        strategyCount: 0,
      },
    });
  }
});

// 6.12) Get applied strategy from MongoDB price history
//       GET /api/pricing-strategies/products/:itemId/mongo-strategy
router.get('/products/:itemId/mongo-strategy', async (req, res) => {
  try {
    const { itemId } = req.params;
    // FIXED: Use authenticated user's ID
    const userId = req.user.id || req.user._id;

    console.log(
      `📊 Getting mongo strategy for product ${itemId}, user: ${userId}`
    );

    // Import PriceHistory model
    const { default: PriceHistory } = await import('../models/PriceHistory.js');

    // Find the most recent price history record with a strategy for this item
    const latestRecord = await PriceHistory.findOne({
      itemId: itemId,
      strategyName: { $exists: true, $ne: null },
      userId: userId, // FIXED: Always filter by authenticated user
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!latestRecord) {
      return res.json({
        success: false,
        message: 'No strategy found in price history for this item',
        data: null,
      });
    }

    // Get the strategy details from the strategy collection
    const { getStrategyById } = await import('../services/strategyService.js');

    // Try to find the strategy by name first
    const { default: PricingStrategy } = await import(
      '../models/PricingStrategy.js'
    );
    const strategy = await PricingStrategy.findOne({
      strategyName: latestRecord.strategyName,
      createdBy: userId, // FIXED: Filter by user
    }).lean();

    if (strategy) {
      return res.json({
        success: true,
        data: {
          strategyName: strategy.strategyName,
          minPrice: strategy.minPrice,
          maxPrice: strategy.maxPrice,
          repricingRule: strategy.repricingRule,
          appliedAt: latestRecord.createdAt,
          lastExecutedPrice: latestRecord.newPrice,
          competitorPrice: latestRecord.competitorLowestPrice,
        },
      });
    } else {
      // Return basic info from price history if strategy not found in collection
      return res.json({
        success: true,
        data: {
          strategyName: latestRecord.strategyName,
          minPrice: null,
          maxPrice: null,
          appliedAt: latestRecord.createdAt,
          lastExecutedPrice: latestRecord.newPrice,
          competitorPrice: latestRecord.competitorLowestPrice,
        },
      });
    }
  } catch (err) {
    console.error(
      'Error in GET /products/:itemId/mongo-strategy:',
      err.message
    );
    return res.status(500).json({
      success: false,
      message: err.message,
      data: null,
    });
  }
});

// 6.6) Get strategies applied to a specific product (MOVE THIS AFTER THE MONGO-STRATEGY ROUTE)
//      GET /api/pricing-strategies/products/:itemId
router.get('/products/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku = null } = req.query;

    console.log(`🔍 Getting strategies for product: ${itemId}`);

    const strategies = await getStrategiesForItem(itemId, sku);
    return res.json({
      success: true,
      count: strategies.length,
      data: strategies,
    });
  } catch (err) {
    console.error('Error in GET /products/:itemId:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6.7) Update/Apply strategy to a specific product/item (PUT method)
//      PUT /api/pricing-strategies/products/:itemId
router.put('/products/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const strategyData = req.body;
    const userId = req.user.id || req.user._id; // FIXED: Use authenticated user

    console.log(
      `📝 Updating strategies for product ${itemId}, user: ${userId}`
    );

    // If the request contains a strategy ID, apply it to the product
    if (strategyData._id || strategyData.strategyId) {
      const strategyId = strategyData._id || strategyData.strategyId;
      const results = await applyStrategiesToItem(itemId, [strategyId], null);

      return res.json({
        success: true,
        message: `Strategy applied to item ${itemId}`,
        results,
      });
    }

    // If strategyIds array is provided, apply multiple strategies
    if (strategyData.strategyIds && Array.isArray(strategyData.strategyIds)) {
      const results = await applyStrategiesToItem(
        itemId,
        strategyData.strategyIds,
        strategyData.sku || null
      );
      const successCount = results.filter((r) => r.success).length;

      return res.json({
        success: true,
        message: `Applied ${successCount} of ${strategyData.strategyIds.length} strategies to item ${itemId}`,
        results,
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Strategy ID or strategyIds array is required',
    });
  } catch (err) {
    console.error('Error updating strategies for product:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 7) Get strategies that apply to a single item
//    GET /api/pricing-strategies/item/:itemId?sku=<optional>
router.get('/item/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku = null } = req.query;

    console.log(`🔍 Getting strategies for item: ${itemId}`);

    const strategies = await getStrategiesForItem(itemId, sku);
    return res.json({
      success: true,
      count: strategies.length,
      data: strategies,
    });
  } catch (err) {
    console.error('Error in GET /item/:itemId:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 8) Remove a strategy from a specific item (and optional SKU)
//    DELETE /api/pricing-strategies/:id/item/:itemId?sku=<optional>
router.delete('/:id/item/:itemId', async (req, res) => {
  try {
    const { sku = null } = req.query;

    console.log(
      `🗑️ Removing strategy ${req.params.id} from item ${req.params.itemId}`
    );

    await removeStrategyFromItemController(
      req.params.id,
      req.params.itemId,
      sku
    );
    return res.json({
      success: true,
      message: `Removed strategy from item ${req.params.itemId}`,
    });
  } catch (err) {
    console.error('Error in DELETE /:id/item/:itemId:', err.message);
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6.9) Execute all active strategies manually
//      POST /api/pricing-strategies/execute-all
router.post('/execute-all', async (req, res) => {
  try {
    console.log('🚀 Executing all active strategies');
    return await executeAllStrategiesController(req, res);
  } catch (err) {
    console.error('Error in POST /execute-all:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6.11) Force price update for a specific item
//       POST /api/pricing-strategies/products/:itemId/update-price
router.post('/products/:itemId/update-price', async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?.id || req.user?._id; // FIXED: Use authenticated user

    console.log(`💰 Force price update for item ${itemId}, user: ${userId}`);

    // Get strategies for this item
    const strategies = await getStrategiesForItem(itemId);

    if (!strategies || strategies.length === 0) {
      return res.json({
        success: false,
        message: 'No strategies found for this item',
      });
    }

    // Execute the most recent strategy
    const { executeStrategyForItem } = await import(
      '../services/strategyService.js'
    );
    const result = await executeStrategyForItem(itemId);

    // Also try to get competitor price for logging
    try {
      const { getCompetitorPrice } = await import(
        '../services/inventoryService.js'
      );
      const competitorData = await getCompetitorPrice(itemId);

      if (competitorData.success && competitorData.price) {
        const competitorPrice = parseFloat(
          competitorData.price.replace('USD', '')
        );
        const strategy = strategies[0]; // Use first strategy

        let calculatedPrice = competitorPrice;
        if (strategy.repricingRule === 'MATCH_LOWEST') {
          calculatedPrice = competitorPrice;
        }

        // Apply min/max constraints
        if (strategy.minPrice && calculatedPrice < strategy.minPrice) {
          calculatedPrice = strategy.minPrice;
        }
        if (strategy.maxPrice && calculatedPrice > strategy.maxPrice) {
          calculatedPrice = strategy.maxPrice;
        }
      }
    } catch (competitorError) {
      console.error('Error getting competitor price:', competitorError.message);
    }

    return res.json({
      success: true,
      message: `Price update completed for item ${itemId}`,
      data: result,
    });
  } catch (err) {
    console.error('Error in POST /products/:itemId/update-price:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Apply strategy to a single product
// POST /api/pricing-strategies/products/:itemId/apply
router.post('/products/:itemId/apply', async (req, res) => {
  try {
    const { itemId } = req.params;
    const {
      strategyId,
      strategyIds,
      minPrice = null,
      maxPrice = null,
      sku = null,
      title = null,
    } = req.body;

    // FIXED: Use authenticated user's ID
    const userId = req.user.id || req.user._id;

    console.log(`💼 Applying strategy to product ${itemId} for user ${userId}`);

    // 1) Normalize incoming strategy IDs
    const ids = strategyIds?.length
      ? strategyIds
      : strategyId
      ? [strategyId]
      : [];

    if (!ids.length) {
      return res.status(400).json({
        success: false,
        message: 'Provide either strategyId or strategyIds array',
      });
    }

    // 2) Verify each strategy exists and belongs to this user
    const found = await PricingStrategy.find({
      _id: { $in: ids },
      createdBy: userId, // FIXED: Ensure user owns the strategies
    });

    if (found.length !== ids.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more strategy IDs not found or not accessible',
      });
    }

    // 3) Associate these strategy IDs to the item (no min/max here)
    const applyResults = await applyStrategiesToItem(itemId, ids, sku);

    // 4) Upsert listing-level overrides on Product
    const ebayAccountId =
      req.user?.ebayAccountId || process.env.DEFAULT_EBAY_ACCOUNT_ID;

    const updated = await Product.findOneAndUpdate(
      { itemId, ebayAccountId },
      {
        $setOnInsert: { itemId, title, sku, userId, ebayAccountId },
        $set: {
          minPrice: minPrice != null ? +minPrice : null,
          maxPrice: maxPrice != null ? +maxPrice : null,
        },
      },
      { upsert: true, new: true }
    );

    // 5) Immediately execute those strategies on eBay
    const execResult = await executeStrategyForItem(itemId, userId);

    // 6) Respond
    return res.json({
      success: true,
      message: `Applied ${
        applyResults.filter((r) => r.success).length
      } strategy(ies) and executed price update`,
      applyResults,
      executionResults: execResult.results || [],
      priceUpdated: execResult.priceChanges > 0,
      listingOverrides: {
        itemId: updated.itemId,
        minPrice: updated.minPrice,
        maxPrice: updated.maxPrice,
      },
    });
  } catch (err) {
    console.error('Error in /products/:itemId/apply:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Set/Update strategy for a specific item
// PUT /api/pricing-strategies/products/:itemId/strategy
router.put('/products/:itemId/strategy', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { strategyId, minPrice, maxPrice, sku } = req.body;
    const userId = req.user.id || req.user._id;

    console.log(`🔄 Setting strategy for product ${itemId}, user: ${userId}`);

    return await setStrategyForItemController(req, res);
  } catch (err) {
    console.error('Error in PUT /products/:itemId/strategy:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Execute strategy for a specific item
// POST /api/pricing-strategies/products/:itemId/execute
router.post('/products/:itemId/execute', async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id || req.user._id;

    console.log(`⚡ Executing strategy for item ${itemId}, user: ${userId}`);

    return await executeStrategyForItemController(req, res);
  } catch (err) {
    console.error('Error in POST /products/:itemId/execute:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
