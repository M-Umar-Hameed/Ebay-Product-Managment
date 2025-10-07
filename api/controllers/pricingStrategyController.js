// controllers/pricingStrategyController.js

import {
  createStrategy,
  getAllStrategies,
  getStrategyById,
  updateStrategy,
  deleteStrategy,
  applyStrategyToItems,
  getStrategiesForItem,
  removeStrategyFromItem,
  getActiveStrategies,
  getStrategyDisplayForProduct,
  executeAllActiveStrategies,
  executeStrategyForItem,
} from '../services/strategyService.js';
import PricingStrategy from '../models/PricingStrategy.js';
import Product from '../models/Product.js';
/**
 * Create a new pricing strategy
 * POST /api/pricing-strategies
 */
const createPricingStrategy = async (req, res) => {
  try {
    const {
      strategyName,
      repricingRule,
      beatBy,
      stayAboveBy,
      value,
      noCompetitionAction,
      maxPrice,
      minPrice,
      description,
      isDefault,
    } = req.body;

    if (!strategyName || !repricingRule) {
      return res.status(400).json({
        success: false,
        message: 'Strategy name and repricing rule are required',
      });
    }

    if (
      repricingRule === 'BEAT_LOWEST' &&
      (beatBy === undefined || value === undefined)
    ) {
      return res.status(400).json({
        success: false,
        message: 'BEAT_LOWEST strategy requires beatBy and value fields',
      });
    }

    if (
      repricingRule === 'STAY_ABOVE' &&
      (stayAboveBy === undefined || value === undefined)
    ) {
      return res.status(400).json({
        success: false,
        message: 'STAY_ABOVE strategy requires stayAboveBy and value fields',
      });
    }

    // Import the service function correctly
    const { createStrategy } = await import('../services/strategyService.js');

    const strategy = await createStrategy({
      strategyName,
      repricingRule,
      description,
      beatBy,
      stayAboveBy,
      value,
      noCompetitionAction,
      maxPrice,
      minPrice,
      isDefault: isDefault || false,
      createdBy: req.user?._id || req.user?.id,
    });

    return res.status(201).json({
      success: true,
      message: 'Pricing strategy created successfully',
      data: strategy,
    });
  } catch (error) {
    console.error('Error creating pricing strategy:', error);
    return res.status(500).json({
      success: false,
      message: error.message.includes('already exists')
        ? error.message
        : 'Error creating pricing strategy',
      error: error.message,
    });
  }
};

/**
 * Get all pricing strategies
 * GET /api/pricing-strategies
 */
const getAllPricingStrategies = async (req, res) => {
  try {
    const { active } = req.query;
    let isActive = null;

    if (active === 'true') {
      isActive = true;
    } else if (active === 'false') {
      isActive = false;
    }

    // Handle userId from multiple sources: query param, route-set userId, or authenticated user
    const userId = req.query.userId || req.userId || req.user?._id;

    const strategies = await getAllStrategies(isActive, userId);

    return res.status(200).json({
      success: true,
      count: strategies.length,
      strategies, // Return in the format expected by frontend
      data: strategies,
    });
  } catch (error) {
    console.error('Error fetching pricing strategies:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pricing strategies',
      error: error.message,
    });
  }
};

/**
 * Get a single pricing strategy
 * GET /api/pricing-strategies/:id
 */
const getPricingStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const strategy = await getStrategyById(id);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: 'Pricing strategy not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: strategy,
    });
  } catch (error) {
    console.error('Error fetching pricing strategy:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pricing strategy',
      error: error.message,
    });
  }
};

/**
 * Update a pricing strategy
 * PUT /api/pricing-strategies/:id
 */
const updatePricingStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      strategyName,
      repricingRule,
      description,
      beatBy,
      stayAboveBy,
      value,
      noCompetitionAction,
      isActive,
      isDefault,
    } = req.body;

    const strategy = await updateStrategy(id, {
      strategyName,
      repricingRule,
      description,
      beatBy,
      stayAboveBy,
      value,
      noCompetitionAction,
      isActive,
      isDefault,
    });

    return res.status(200).json({
      success: true,
      message: 'Pricing strategy updated successfully',
      data: strategy,
    });
  } catch (error) {
    console.error('Error updating pricing strategy:', error.message);
    const statusCode = error.message.includes('not found')
      ? 404
      : error.message.includes('already exists')
      ? 409
      : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

/**
 * Delete a pricing strategy
 * DELETE /api/pricing-strategies/:id
 */
const deletePricingStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteStrategy(id);

    return res.status(200).json({
      success: true,
      message: 'Pricing strategy deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting pricing strategy:', error.message);
    const statusCode = error.message.includes('not found')
      ? 404
      : error.message.includes('applied to')
      ? 400
      : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

/**
 * Apply a strategy to items
 * POST /api/pricing-strategies/:id/apply
 */
const applyStrategyToItemsController = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of items to apply strategy to is required',
      });
    }

    // Updated to pass min/max prices per item
    const results = await applyStrategyToItems(id, items);

    return res.status(200).json({
      success: true,
      message: `Strategy applied to ${
        results.filter((r) => r.success).length
      } items`,
      totalItems: items.length,
      results,
    });
  } catch (error) {
    console.error('Error applying pricing strategy:', error.message);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

/**
 * Get strategies applied to an item
 * GET /api/pricing-strategies/item/:itemId
 */
const getStrategiesForItemController = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku } = req.query;

    const strategies = await getStrategiesForItem(itemId, sku);

    return res.status(200).json({
      success: true,
      count: strategies.length,
      itemId,
      sku: sku || 'all',
      data: strategies,
    });
  } catch (error) {
    console.error('Error fetching strategies for item:', error.message);
    const statusCode = error.message.includes('required') ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

/**
 * Remove a strategy from an item
 */
const removeStrategyFromItemController = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { sku } = req.query;

    await removeStrategyFromItem(id, itemId, sku);

    return res.status(200).json({
      success: true,
      message: 'Strategy removed from item successfully',
      itemId,
      sku: sku || 'all',
    });
  } catch (error) {
    console.error('Error removing strategy from item:', error.message);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

/**
 * Get all active pricing strategies
 * GET /api/pricing-strategies/active-listings
 */
const getActivePricingStrategies = async (req, res) => {
  try {
    const strategies = await getActiveStrategies();

    return res.status(200).json({
      success: true,
      count: strategies.length,
      data: strategies,
    });
  } catch (error) {
    console.error('Error fetching active strategies:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error fetching active strategies',
      error: error.message,
    });
  }
};

/**
 * Get strategy display information for a product
 * GET /api/pricing-strategies/products/:itemId/display
 */
const getStrategyDisplayForProductController = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku } = req.query;

    const displayInfo = await getStrategyDisplayForProduct(itemId, sku);

    return res.status(200).json({
      success: true,
      data: displayInfo,
    });
  } catch (error) {
    console.error('Error getting strategy display for product:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error getting strategy display information',
      error: error.message,
    });
  }
};

/**
 * Execute all active strategies manually
 * POST /api/pricing-strategies/execute-all
 */
const executeAllStrategiesController = async (req, res) => {
  try {
    const results = await executeAllActiveStrategies();

    return res.status(200).json({
      success: true,
      message: 'Strategy execution completed',
      data: results,
    });
  } catch (error) {
    console.error('Error executing all strategies:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error executing strategies',
      error: error.message,
    });
  }
};

/**
 * Execute strategies for a specific item
 * POST /api/pricing-strategies/products/:itemId/execute
 */
export const executeStrategyForItemController = async (req, res) => {
  const { itemId } = req.params;
  try {
    const result = await executeStrategyForItem(itemId);

    if (result.success) {
      return res.status(200).json({ success: true, data: result });
    } else {
      // e.g. “No strategy assigned to product”
      return res.status(400).json({ success: false, message: result.reason });
    }
  } catch (err) {
    console.error('❌ executeStrategyForItemController error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export async function setStrategyForItemController(req, res) {
  try {
    const { itemId } = req.params;
    const { strategyId, minPrice, maxPrice } = req.body;

    if (!strategyId) {
      return res
        .status(400)
        .json({ success: false, message: 'strategyId required' });
    }

    // 1) make sure the strategy exists
    const strategy = await PricingStrategy.findById(strategyId);
    if (!strategy) {
      return res
        .status(404)
        .json({ success: false, message: 'Strategy not found' });
    }

    // 2) upsert the Product record, setting its single .strategy + bounds
    const updated = await Product.findOneAndUpdate(
      { itemId, ebayAccountId: req.user.ebayAccountId },
      {
        $setOnInsert: {
          itemId,
          userId: req.user._id,
          ebayAccountId: req.user.ebayAccountId,
        },
        $set: {
          strategy: strategy._id,
          // Ensure min/max prices are properly stored as numbers
          minPrice: minPrice != null ? parseFloat(minPrice) : null,
          maxPrice: maxPrice != null ? parseFloat(maxPrice) : null,
        },
      },
      { upsert: true, new: true }
    );

    console.log(`📊 Product updated with min/max prices:`, {
      itemId,
      minPrice: updated.minPrice,
      maxPrice: updated.maxPrice,
    });

    // 3) immediately execute that strategy on eBay
    const execution = await executeStrategyForItem(itemId);

    return res.json({
      success: true,
      message: `Product ${itemId} now uses strategy "${strategy.strategyName}"`,
      data: {
        product: updated,
        execution,
      },
    });
  } catch (err) {
    console.error('setStrategyForItemController error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export {
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
};
