// services/strategyService.js

import PricingStrategy from '../models/PricingStrategy.js';
import mongoose from 'mongoose';
import { updateEbayPrice as patchOfferPrice } from './inventoryService.js';
import ManualCompetitor from '../models/ManualCompetitor.js';
import Product from '../models/Product.js';

/**
 * Create a new pricing strategy WITHOUT applying it to any listings.
 * @param {Object} data
 *   - strategyName:       String (required)
 *   - repricingRule:      String ("MATCH_LOWEST" | "BEAT_LOWEST" | "STAY_ABOVE" | "CUSTOM") (required)
 *   - description:        String (optional)
 *   - beatBy:             String ("AMOUNT" | "PERCENTAGE") (required if repricingRule === "BEAT_LOWEST")
 *   - stayAboveBy:        String ("AMOUNT" | "PERCENTAGE") (required if repricingRule === "STAY_ABOVE")
 *   - value:              Number (required if repricingRule is "BEAT_LOWEST" or "STAY_ABOVE")
 *   - noCompetitionAction:String ("USE_MAX_PRICE" | "KEEP_CURRENT" | "USE_MIN_PRICE") (optional)
 *   - maxPrice:           Number (optional)
 *   - minPrice:           Number (optional)
 *   - isDefault:          Boolean (optional)
 *   - createdBy:          ObjectId of user (optional)
 */
export async function createStrategy(data) {
  const {
    strategyName,
    repricingRule,
    description = null,
    beatBy = null,
    stayAboveBy = null,
    value = null,
    noCompetitionAction = 'USE_MAX_PRICE',
    maxPrice = null,
    minPrice = null,
    isDefault = false,
    createdBy = null,
  } = data;

  // Validation is largely handled by the schema, but check uniqueness here
  const existing = await PricingStrategy.findOne({ strategyName });
  if (existing) {
    throw new Error(`Strategy with name "${strategyName}" already exists`);
  }

  // If isDefault is true, clear any previous default
  if (isDefault) {
    await PricingStrategy.updateMany({ isDefault: true }, { isDefault: false });
  }

  // FIXED: Create strategy WITHOUT auto-applying to any listings
  const strategy = new PricingStrategy({
    strategyName,
    displayName: strategyName,
    repricingRule,
    description,
    beatBy,
    stayAboveBy,
    value,
    noCompetitionAction,
    maxPrice,
    minPrice,
    isDefault,
    createdBy,
    appliesTo: [], // IMPORTANT: Start with empty appliesTo array
  });

  const savedStrategy = await strategy.save();

  return savedStrategy;
}

/**
 * Get all pricing strategies, optionally filtered by isActive.
 * @param {Boolean|null} isActive - If true/false, filter by that; if null, return all.
 */
export async function getAllStrategies(isActive = null, userId = null) {
  const query = {};

  if (isActive !== null) {
    query.isActive = isActive;
  }

  if (userId) {
    query.createdBy = new mongoose.Types.ObjectId(userId); // Filter by createdBy
  }

  return await PricingStrategy.find(query).sort({ strategyName: 1 });
}

/**
 * Get a single pricing strategy by its Mongo _id or by its strategyId.
 * @param {String} idOrStrategyId
 */
export async function getStrategyById(idOrStrategyId) {
  return await PricingStrategy.findOne({
    $or: [{ _id: idOrStrategyId }, { strategyId: idOrStrategyId }],
  });
}

/**
 * Update a pricing strategy’s fields.
 * @param {String} idOrStrategyId
 * @param {Object} updates
 *   - strategyName, repricingRule, description, beatBy, stayAboveBy, value,
 *     noCompetitionAction, maxPrice, minPrice, isActive, isDefault
 */
export async function updateStrategy(idOrStrategyId, updates) {
  const strategy = await getStrategyById(idOrStrategyId);
  if (!strategy) {
    throw new Error('Pricing strategy not found');
  }

  // If user wants to change the name, ensure no duplicate
  if (updates.strategyName && updates.strategyName !== strategy.strategyName) {
    const conflict = await PricingStrategy.findOne({
      strategyName: updates.strategyName,
      _id: { $ne: strategy._id },
    });
    if (conflict) {
      throw new Error(
        `Strategy with name "${updates.strategyName}" already exists`
      );
    }
    strategy.strategyName = updates.strategyName;
  }

  if (updates.repricingRule) strategy.repricingRule = updates.repricingRule;
  if (updates.description !== undefined)
    strategy.description = updates.description;

  // Handle beatBy and stayAboveBy - only set if not empty string
  if (updates.beatBy !== undefined) {
    strategy.beatBy =
      updates.beatBy && updates.beatBy.trim() !== '' ? updates.beatBy : null;
  }
  if (updates.stayAboveBy !== undefined) {
    strategy.stayAboveBy =
      updates.stayAboveBy && updates.stayAboveBy.trim() !== ''
        ? updates.stayAboveBy
        : null;
  }

  if (updates.value !== undefined) strategy.value = updates.value;
  if (updates.noCompetitionAction)
    strategy.noCompetitionAction = updates.noCompetitionAction;

  // Handle min/max prices properly
  if (updates.minPrice !== undefined) {
    strategy.minPrice =
      updates.minPrice !== null && updates.minPrice !== ''
        ? parseFloat(updates.minPrice)
        : null;
  }
  if (updates.maxPrice !== undefined) {
    strategy.maxPrice =
      updates.maxPrice !== null && updates.maxPrice !== ''
        ? parseFloat(updates.maxPrice)
        : null;
  }

  if (updates.isActive !== undefined) strategy.isActive = updates.isActive;

  if (updates.isDefault === true) {
    // Clear previous default
    await PricingStrategy.updateMany({ isDefault: true }, { isDefault: false });
    strategy.isDefault = true;
  } else if (updates.isDefault === false) {
    strategy.isDefault = false;
  }

  return await strategy.save();
}

/**
 * Delete a pricing strategy. Will fail if strategy.appliesTo is non-empty.
 * @param {String} idOrStrategyId
 */
export async function deleteStrategy(idOrStrategyId) {
  const strategy = await getStrategyById(idOrStrategyId);
  if (!strategy) {
    throw new Error('Pricing strategy not found');
  }
  if (strategy.appliesTo && strategy.appliesTo.length > 0) {
    throw new Error(
      'Cannot delete a strategy that is applied to one or more items'
    );
  }
  return await strategy.remove();
}

/**
 * Apply a strategy to multiple items at once.
 * @param {String} idOrStrategyId
 * @param {Array<Object>} items
 *   Each item object must have:
 *     - itemId: String (required)
 *     - sku:    String or null
 *     - title:  String or null
 *
 * Returns an array of result objects:
 *   { success: Boolean, itemId, sku, message? }
 */
export async function applyStrategyToItems(idOrStrategyId, items) {
  const strategy = await getStrategyById(idOrStrategyId);
  if (!strategy) {
    throw new Error('Pricing strategy not found');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('An array of items to apply strategy to is required');
  }

  const results = [];
  for (const item of items) {
    if (!item.itemId) {
      results.push({
        success: false,
        message: 'Item ID is required',
        itemId: null,
        sku: item.sku || null,
      });
      continue;
    }
    try {
      // Remove any existing entry for this item/sku
      strategy.appliesTo = strategy.appliesTo.filter(
        (entry) =>
          !(
            entry.itemId === item.itemId &&
            (!item.sku || entry.sku === item.sku)
          )
      );
      // Add new entry without min/max pricing
      strategy.appliesTo.push({
        itemId: item.itemId,
        sku: item.sku || null,
        title: item.title || null,
        dateApplied: new Date(),
      });

      // Update listing specific pricing in Product collection
      const { default: Product } = await import('../models/Product.js');
      await Product.findOneAndUpdate(
        { itemId: item.itemId },
        {
          $set: {
            minPrice:
              item.minPrice !== undefined && item.minPrice !== null
                ? parseFloat(item.minPrice)
                : null,
            maxPrice:
              item.maxPrice !== undefined && item.maxPrice !== null
                ? parseFloat(item.maxPrice)
                : null,
          },
        },
        { new: true }
      );
      results.push({
        success: true,
        itemId: item.itemId,
        sku: item.sku || null,
        minPrice: item.minPrice,
        maxPrice: item.maxPrice,
      });
    } catch (err) {
      results.push({
        success: false,
        message: err.message,
        itemId: item.itemId,
        sku: item.sku || null,
      });
    }
  }
  strategy.usageCount += results.filter((r) => r.success).length;
  strategy.lastUsed = new Date();
  await strategy.save();
  return results;
}

/**
 * Get all strategies that are applied to a specific item (and optional SKU).
 * @param {String} itemId
 * @param {String|null} sku
 */
export async function getStrategiesForItem(itemId, sku = null) {
  if (!itemId) {
    throw new Error('Item ID is required');
  }
  const query = { 'appliesTo.itemId': itemId };
  if (sku) query['appliesTo.sku'] = sku;
  return await PricingStrategy.find(query);
}

/**
 * Remove a strategy’s association with a specific item (and optional SKU).
 * @param {String} idOrStrategyId
 * @param {String} itemId
 * @param {String|null} sku
 *
 * Returns the updated strategy document.
 */
export async function removeStrategyFromItem(
  idOrStrategyId,
  itemId,
  sku = null
) {
  const strategy = await getStrategyById(idOrStrategyId);
  if (!strategy) {
    throw new Error('Pricing strategy not found');
  }

  const initialCount = strategy.appliesTo.length;
  strategy.appliesTo = strategy.appliesTo.filter((entry) => {
    if (entry.itemId !== itemId) return true;
    if (sku && entry.sku !== sku) return true;
    return false;
  });

  const removedCount = initialCount - strategy.appliesTo.length;
  if (removedCount === 0) {
    throw new Error('Item not found in strategy’s applied items');
  }

  await strategy.save();
  return strategy;
}

/**
 * Get all active pricing strategies (isActive === true), sorted by strategyName.
 */
export async function getActiveStrategies() {
  return await PricingStrategy.find({ isActive: true }).sort({
    strategyName: 1,
  });
}

/**
 * Compute the “raw” target price from the strategy rules,
 * without applying any per-listing min/max clamps.
 */
function calculateRawPrice(strategy, competitorPrice, currentPrice) {
  // No-competition fallbacks:
  if (!competitorPrice || competitorPrice <= 0) {
    switch (strategy.noCompetitionAction) {
      case 'USE_MAX_PRICE':
        return strategy.maxPrice ?? currentPrice;
      case 'USE_MIN_PRICE':
        return strategy.minPrice ?? currentPrice;
      case 'KEEP_CURRENT':
      default:
        return currentPrice;
    }
  }

  // Core repricing rules:
  switch (strategy.repricingRule) {
    case 'MATCH_LOWEST':
      return competitorPrice;

    case 'BEAT_LOWEST':
      if (strategy.beatBy === 'AMOUNT') {
        return competitorPrice - (strategy.value || 0);
      } else {
        return competitorPrice * (1 - (strategy.value || 0));
      }

    case 'STAY_ABOVE':
      if (strategy.stayAboveBy === 'AMOUNT') {
        return competitorPrice + (strategy.value || 0);
      } else {
        return competitorPrice * (1 + (strategy.value || 0));
      }

    default:
      console.warn(`Unknown rule ${strategy.repricingRule}, keeping current`);
      return currentPrice;
  }
}

function clamp(price, min, max) {
  if (min != null && price < min) return min;
  if (max != null && price > max) return max;
  return price;
}

/**
 * Calculate new price based on strategy and competitor price
 * @param {Object} strategy - The pricing strategy from MongoDB
 * @param {Number} competitorPrice - The lowest competitor price
 * @param {Number} currentPrice - Current product price
 */
function calculateNewPrice(
  strategy,
  competitorPrice,
  currentPrice,
  listingMinPrice = null,
  listingMaxPrice = null
) {
  // 1) compute raw target
  const raw = calculateRawPrice(strategy, competitorPrice, currentPrice);

  // 2) clamp to listing-specific bounds
  let clamped = clamp(raw, listingMinPrice, listingMaxPrice);

  // 3) “STAY_ABOVE” special max-price bump:
  if (
    strategy.repricingRule === 'STAY_ABOVE' &&
    listingMaxPrice != null &&
    listingMaxPrice - raw >= 2
  ) {
    clamped = listingMaxPrice;
  }

  // 4) ensure positivity and round
  if (clamped <= 0) return currentPrice;
  return Math.round(clamped * 100) / 100;
}

// NEW: Add execution tracking to prevent duplicate/rapid executions
const executionCache = new Map();
const EXECUTION_COOLDOWN = 60000; // 1 minute cooldown between executions for same item

/**
 * Check if item was recently processed to prevent duplicate executions
 */
function isItemInCooldown(itemId) {
  const lastExecution = executionCache.get(itemId);
  if (!lastExecution) return false;

  const timeSinceLastExecution = Date.now() - lastExecution;
  return timeSinceLastExecution < EXECUTION_COOLDOWN;
}

/**
 * Mark item as recently executed
 */
function markItemExecuted(itemId) {
  executionCache.set(itemId, Date.now());

  // Clean up old entries after 5 minutes
  setTimeout(() => {
    executionCache.delete(itemId);
  }, 5 * 60 * 1000);
}

/**
 * Record strategy execution in history - FIXED to only record actual price changes
 */
async function recordStrategyExecution(strategyId, itemId, executionData) {
  try {
    // CRITICAL FIX: Only record if there was an ACTUAL price change
    const oldPrice = parseFloat(executionData.oldPrice);
    const newPrice = parseFloat(executionData.newPrice);

    // Skip recording if prices are the same (no actual change)
    if (oldPrice && newPrice && Math.abs(newPrice - oldPrice) < 0.01) {
      return;
    }

    // Only record if there was a meaningful price change
    if (!executionData.priceChanged || !executionData.success) {
      return;
    }

    // Check if we recently recorded for this item with same price
    const recentRecordKey = `${itemId}_${newPrice}`;
    if (executionCache.has(recentRecordKey)) {
      return;
    }

    try {
      const { default: PriceHistory } = await import(
        '../models/PriceHistory.js'
      );

      // Check if identical record exists in last 2 minutes
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const existingRecord = await PriceHistory.findOne({
        itemId: itemId,
        newPrice: newPrice,
        oldPrice: oldPrice,
        createdAt: { $gte: twoMinutesAgo },
      });

      if (existingRecord) {
        return;
      }

      // Calculate change metrics
      const changeAmount = newPrice - oldPrice;
      const changePercentage =
        oldPrice > 0 ? (changeAmount / oldPrice) * 100 : 0;
      const changeDirection =
        changeAmount > 0
          ? 'increased'
          : changeAmount < 0
          ? 'decreased'
          : 'unchanged';

      // Get strategy info
      let strategyInfo = null;
      try {
        const strategy = await getStrategyById(strategyId);
        strategyInfo = strategy;
      } catch (strategyError) {
        console.warn('Could not fetch strategy info:', strategyError.message);
      }

      // Get product info for min/max prices
      const { default: Product } = await import('../models/Product.js');
      const productDoc = await Product.findOne({ itemId });

      const historyRecord = {
        itemId: itemId,
        sku: executionData.sku || null,
        oldPrice: oldPrice,
        newPrice: newPrice,
        currency: 'USD',
        changeAmount: Number(changeAmount.toFixed(2)),
        changePercentage: Number(changePercentage.toFixed(2)),
        changeDirection,
        competitorPrice: executionData.competitorPrice || null,
        competitorLowestPrice: executionData.competitorPrice || null,
        strategyName: strategyInfo?.strategyName || 'Unknown Strategy',
        repricingRule: strategyInfo?.repricingRule || null,
        // Use min/max from product document (which gets set from form)
        minPrice: productDoc?.minPrice || null,
        maxPrice: productDoc?.maxPrice || null,
        userId: strategyInfo?.createdBy || null,
        source: 'strategy',
        status: 'completed',
        success: true,
        timestamp: executionData.timestamp || new Date(),
        date: executionData.timestamp || new Date(),
        reason: `Price changed from $${oldPrice} to $${newPrice} due to strategy execution`,
        apiResponse: executionData.apiResponse || null,
        metadata: {
          strategyId: strategyId,
          executionId: new Date().getTime(),
          competitorCount: executionData.competitorCount || 0,
          priceChangeMagnitude: Math.abs(changeAmount),
        },
      };

      const savedRecord = await new PriceHistory(historyRecord).save();

      // Mark this record to prevent immediate duplicates
      executionCache.set(recentRecordKey, Date.now());
      setTimeout(() => {
        executionCache.delete(recentRecordKey);
      }, 2 * 60 * 1000); // 2 minutes cache

      return savedRecord;
    } catch (historyError) {
      console.error('❌ Failed to record price history:', historyError);
    }
  } catch (error) {
    console.error('❌ Failed to record strategy execution:', error);
  }
}

/**
 * Get current eBay price for an item
 * @param {String} itemId
 */
async function getCurrentEbayPrice(itemId) {
  try {
    // Use dynamic import to avoid module conflicts
    const inventoryModule = await import('./inventoryService.js');
    const { getActiveListings } = inventoryModule;

    // Try to get user ID from various sources
    const userId = process.env.DEFAULT_USER_ID || '68430c2b0e746fb6c6ef1a7a';

    const response = await getActiveListings(userId);

    if (response.success && response.data.GetMyeBaySellingResponse) {
      const itemArray =
        response.data.GetMyeBaySellingResponse.ActiveList?.ItemArray;
      let items = [];

      if (Array.isArray(itemArray?.Item)) {
        items = itemArray.Item;
      } else if (itemArray?.Item) {
        items = [itemArray.Item];
      }

      const item = items.find((i) => i.ItemID === itemId);
      if (item && item.BuyItNowPrice) {
        return parseFloat(item.BuyItNowPrice);
      }
    }

    console.warn(`Item ${itemId} not found in eBay listings`);
    return null;
  } catch (error) {
    console.error(`Error getting current eBay price for ${itemId}:`, error);
    return null;
  }
}

/**
 * Trigger sync for related items when competitor prices change
 * @param {String} changedItemId - The item that triggered the change
 */
async function triggerRelatedItemSync(changedItemId) {
  try {
    const activeStrategies = await PricingStrategy.find({
      isActive: true,
      'appliesTo.0': { $exists: true },
    });

    const itemsToSync = [];

    for (const strategy of activeStrategies) {
      for (const appliedItem of strategy.appliesTo) {
        if (appliedItem.itemId !== changedItemId) {
          itemsToSync.push(appliedItem.itemId);
        }
      }
    }

    const uniqueItems = [...new Set(itemsToSync)];

    // Sync each item (with delay to avoid rate limiting)
    for (let i = 0; i < uniqueItems.length; i++) {
      setTimeout(async () => {
        try {
          await executeStrategyForItem(uniqueItems[i]);
        } catch (error) {
          // Handle error silently
        }
      }, i * 3000); // 3 second delay between each sync
    }
  } catch (error) {
    // Handle error silently
  }
}

/**
 * Apply pricing logic to update product prices based on strategy
 */
export default async function executePricingStrategy(itemId, strategy) {
  try {
    console.log(`\n🔍 [${itemId}] running strategy "${strategy.strategyName}"`);

    // 1) Try your manual competitors first
    const manual = await ManualCompetitor.findOne({
      itemId,
      userId: strategy.createdBy,
    }).sort({ updatedAt: -1 });
    const manualPrices = (manual?.competitors || [])
      .map((c) => parseFloat(c.price))
      .filter((p) => p > 0);

    const competitorPrice = manualPrices.length
      ? Math.min(...manualPrices)
      : null;

    // 2) Fallback to the eBay scan only if no manual price
    if (competitorPrice === null) {
      const { getCompetitorPrice } = await import('./inventoryService.js');
      const auto = await getCompetitorPrice(itemId);
      if (auto.success && auto.price) {
        competitorPrice = parseFloat(auto.price.replace(/[^0-9.]/g, ''));
      }
    }

    // Add debug log for competitor price
    console.log(`[${itemId}] Manual competitor price:`, competitorPrice);

    const currentPrice = await getCurrentEbayPrice(itemId);
    if (!currentPrice) {
      console.warn(`[${itemId}] No current price found, skipping update`);
      return {
        success: false,
        reason: 'Current price not found',
        itemId,
        competitorPrice,
        strategyUsed: strategy.strategyName,
      };
    }

    const { default: Product } = await import('../models/Product.js');
    const productDoc = await Product.findOne({ itemId });
    const listingMin = productDoc?.minPrice ?? null;
    const listingMax = productDoc?.maxPrice ?? null;

    // ─── Instrumentation ────────────────────────────────────────────────────
    const rawPrice = calculateRawPrice(strategy, competitorPrice, currentPrice);
    const newPrice = calculateNewPrice(
      strategy,
      competitorPrice,
      currentPrice,
      listingMin,
      listingMax
    );
    const delta = newPrice - currentPrice;

    // Add debug logs for price calculation
    console.log(
      `[${itemId}] currentPrice: ${currentPrice}, competitorPrice: ${competitorPrice}, rawPrice: ${rawPrice}, newPrice: ${newPrice}, delta: ${delta}`
    );

    if (Math.abs(delta) < 0.01) {
      console.log(`⏭️ [${itemId}] skipping update; change too small`);
      return {
        success: true,
        reason: 'Price already optimal',
        oldPrice: currentPrice,
        newPrice: currentPrice,
        competitorPrice,
        priceChanged: false,
        strategyUsed: strategy.strategyName,
      };
    }
    console.log(`🚀 [${itemId}] updating to ${newPrice}`);
    // ─────────────────────────────────────────────────────────────────────────

    // ENHANCED: More precise price change detection
    const priceChangeAmount = Math.abs(newPrice - currentPrice);
    const needsPriceUpdate = priceChangeAmount >= 0.01;

    if (!needsPriceUpdate) {
      return {
        success: true,
        reason: 'Price already optimal',
        oldPrice: currentPrice,
        newPrice: currentPrice,
        competitorPrice,
        priceChanged: false,
        strategyUsed: strategy.strategyName,
      };
    }

    // Update the price on eBay

    // Patch price on eBay via Inventory API
    // FIX: Pass userId if available on strategy or productDoc
    let userId = strategy.createdBy || productDoc?.userId || null;
    if (!userId && manual?.userId) userId = manual.userId;
    if (!userId) userId = process.env.DEFAULT_USER_ID || null;

    console.log(`[${itemId}] Using userId for price update:`, userId);

    if (!userId) {
      console.warn(`[${itemId}] No userId found for price update, skipping`);
      return {
        success: false,
        reason: 'No userId for eBay update',
        oldPrice: currentPrice,
        newPrice,
        competitorPrice,
        priceChanged: false,
        strategyUsed: strategy.strategyName,
      };
    }

    const updateResult = await patchOfferPrice(
      itemId,
      /* sku */ null,
      newPrice,
      userId // pass userId
    );

    if (updateResult.success) {
      console.log(
        `[${itemId}] Price update succeeded via ${
          updateResult.method || 'unknown method'
        }`
      );
      // FIXED: Only record in price history if eBay update was successful
      await recordStrategyExecution(strategy._id, itemId, {
        oldPrice: currentPrice,
        newPrice: newPrice,
        competitorPrice: competitorPrice,
        timestamp: new Date(),
        success: true,
        priceChanged: true, // Confirm this was an actual price change
        reason: `Strategy execution: ${strategy.strategyName}`,
        sku: null,
        apiResponse: updateResult,
        competitorCount: manualPrices.length,
      });

      return {
        success: true,
        oldPrice: currentPrice,
        newPrice,
        competitorPrice,
        priceChanged: true,
        updateDetails: updateResult,
        strategyUsed: strategy.strategyName,
        changeAmount: newPrice - currentPrice,
      };
    } else {
      console.error(
        `❌ Failed to update price for ${itemId}:`,
        updateResult.error
      );

      return {
        success: false,
        reason: updateResult.error,
        oldPrice: currentPrice,
        calculatedPrice: newPrice,
        competitorPrice,
        priceChanged: false,
        strategyUsed: strategy.strategyName,
      };
    }
  } catch (error) {
    console.error(`❌ Error executing pricing strategy for ${itemId}:`, error);

    return {
      success: false,
      reason: error.message,
      strategyUsed: strategy?.strategyName || 'Unknown',
      priceChanged: false,
    };
  }
}

/**
 * Execute all active strategies for competitor price monitoring
 * This should be called periodically (e.g., every hour)
 */
export async function executeAllActiveStrategies() {
  // 1) Find every product that has a single strategy assigned
  const products = await Product.find({ strategy: { $exists: true } }).populate(
    {
      path: 'strategy',
      match: { isActive: true },
    }
  );

  const results = {
    totalProducts: products.length,
    successfulUpdates: 0,
    failedUpdates: 0,
    errors: [],
  };

  for (const product of products) {
    const { itemId, strategy } = product;

    // Skip if strategy was filtered out by populate(match)
    if (!strategy) {
      results.failedUpdates++;
      results.errors.push({ itemId, error: 'Strategy inactive or missing' });
      continue;
    }

    try {
      // This will run your existing executePricingStrategy(itemId, strategy)
      const updateResult = await executePricingStrategy(itemId, strategy);

      if (updateResult.success) {
        results.successfulUpdates++;
      } else {
        results.failedUpdates++;
        results.errors.push({
          itemId,
          error: updateResult.reason || 'Unknown failure',
        });
      }
    } catch (err) {
      results.failedUpdates++;
      results.errors.push({ itemId, error: err.message });
    }
  }

  return results;
}

/**
 * Execute strategies for a specific item using the proven editProduct method - FIXED throttling
 */
export async function executeStrategyForItem(itemId) {
  // 1) find product and populate its single strategy
  const product = await Product.findOne({ itemId }).populate('strategy');
  if (!product || !product.strategy) {
    return { success: false, reason: 'No strategy assigned to product' };
  }

  // 2) execute using the one strategy
  return await executePricingStrategy(itemId, product.strategy);
}

/**
 * Remove an item from all strategies that it's currently applied to
 * @param {String} itemId
 * @param {String|null} sku
 */
async function removeItemFromAllStrategies(itemId, sku = null) {
  try {
    const strategies = await PricingStrategy.find({
      'appliesTo.itemId': itemId,
    });

    for (const strategy of strategies) {
      strategy.appliesTo = strategy.appliesTo.filter((entry) => {
        if (entry.itemId !== itemId) return true;
        if (sku && entry.sku !== sku) return true;
        return false;
      });
      await strategy.save();
    }
  } catch (error) {
    console.error('Error removing item from strategies:', error);
  }
}

/**
 * Apply multiple strategies to a single item - FIXED to avoid race conditions
 */
export async function applyStrategiesToItem(itemId, strategyIds, sku = null) {
  if (!itemId) {
    throw new Error('Item ID is required');
  }
  if (!Array.isArray(strategyIds) || strategyIds.length === 0) {
    throw new Error('Strategy IDs array is required');
  }

  // First, remove the item from all existing strategies to avoid duplicates
  await removeItemFromAllStrategies(itemId, sku);

  const results = [];
  for (const strategyId of strategyIds) {
    try {
      const strategy = await getStrategyById(strategyId);
      if (!strategy) {
        results.push({
          strategyId,
          success: false,
          error: 'Strategy not found',
        });
        continue;
      }

      // FIXED: Use atomic operations to avoid version conflicts
      await PricingStrategy.updateOne(
        { _id: strategy._id },
        {
          $push: {
            appliesTo: {
              itemId,
              sku,
              title: null,
              dateApplied: new Date(),
            },
          },
          $inc: { usageCount: 1 },
          $set: { lastUsed: new Date() },
        }
      );

      results.push({
        strategyId,
        success: true,
        strategyName: strategy.strategyName,
        repricingRule: strategy.repricingRule,
        message: `Strategy ${strategy.strategyName} applied successfully`,
      });
    } catch (error) {
      results.push({
        strategyId,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Get display information for a product's pricing strategy
 * @param {String} itemId
 * @param {String|null} sku
 */
export async function getStrategyDisplayForProduct(itemId, sku = null) {
  try {
    // 1) Load the product and populate its single strategy ref
    const { default: Product } = await import('../models/Product.js');
    const product = await Product.findOne({ itemId }).populate({
      path: 'strategy',
      match: { isActive: true },
    });

    // 2) Pull out per-listing overrides
    const rawMin = product?.minPrice ?? null;
    const rawMax = product?.maxPrice ?? null;
    const listingMin = rawMin != null ? `$${rawMin.toFixed(2)}` : 'Set';
    const listingMax = rawMax != null ? `$${rawMax.toFixed(2)}` : 'Set';

    // 3) If there’s no product or no active strategy: prompt “Assign Strategy”
    if (!product || !product.strategy) {
      return {
        strategy: 'Assign Strategy',
        strategyId: null,
        minPrice: 'Set',
        maxPrice: 'Set',
        hasStrategy: false,
        repricingRule: null,
        appliedStrategies: [],
        strategyCount: 0,
      };
    }

    // 4) Build the UI payload from the one strategy + listing overrides
    const s = product.strategy;
    return {
      strategy: s.strategyName,
      strategyId: s._id.toString(),
      minPrice: listingMin,
      maxPrice: listingMax,
      hasStrategy: true,
      repricingRule: s.repricingRule,
      value: s.value,
      beatBy: s.beatBy,
      stayAboveBy: s.stayAboveBy,
      rawStrategy: {
        ...s.toObject(),
        minPrice: rawMin,
        maxPrice: rawMax,
      },
    };
  } catch (error) {
    // on any error, fall back to “Assign Strategy”
    return {
      strategy: 'Assign Strategy',
      strategyId: null,
      minPrice: 'Set',
      maxPrice: 'Set',
      hasStrategy: false,
      repricingRule: null,
      appliedStrategies: [],
      strategyCount: 0,
      error: error.message,
    };
  }
}
