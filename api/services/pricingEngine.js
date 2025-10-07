// services/pricingEngine.js

import { getItemDetails } from './itemService.js';
import { fetchCompetitorPrices } from './competitorPriceService.js';
import User from '../models/Users.js';

/**
 * Example pricing rules. In practice, you’d read these from Mongo (e.g. via a Strategy schema).
 * For demonstration, here are three simple rule types:
 *
 *  1. "matchLowest": Set price = lowest competitor price
 *  2. "beatByAmount": Set price = (lowest competitor price) - X
 *  3. "stayAbovePercent": Set price = max( (lowest competitor price) * (1 + PERCENT), MIN_PRICE )
 *
 * Each rule object should include:
 *   - type: one of "matchLowest" | "beatByAmount" | "stayAbovePercent"
 *   - params: an object, e.g. { amount: 0.50 } or { percent: 0.10, minPrice: 5.00 }
 */
const RULE_TYPES = {
  matchLowest: async ({ lowestPrice }) => {
    return lowestPrice;
  },

  beatByAmount: async ({ lowestPrice, params }) => {
    const { amount } = params;
    return Math.max(lowestPrice - amount, 0);
  },

  stayAbovePercent: async ({ lowestPrice, params }) => {
    const { percent, minPrice } = params;
    const target = lowestPrice * (1 + percent);
    return Math.max(target, minPrice || 0);
  },
};

/**
 * Main function: apply a single pricing rule to one item.
 */
export async function applyPricingRule(userId, itemId, strategy) {
  console.log(`🔄 Applying pricing rule for item ${itemId}:`, strategy);

  try {
    // 1) Fetch full item details (including current price, title, category)
    const item = await getItemDetails(userId, itemId);
    const currentPrice = Number(item.price.value || 0);
    const title = item.title;
    const categoryId = item.category.id;

    // Fetch min/max from Product document
    let listingMinPrice = strategy.minPrice;
    let listingMaxPrice = strategy.maxPrice;
    try {
      const { default: Product } = await import('../models/Product.js');
      let productDoc = await Product.findOne({ itemId });
      if (!productDoc) {
        // Upsert a new Product document if missing
        productDoc = await Product.create({ itemId });
      }
      if (productDoc) {
        if (productDoc.minPrice !== undefined && productDoc.minPrice !== null) {
          listingMinPrice = productDoc.minPrice;
        }
        if (productDoc.maxPrice !== undefined && productDoc.maxPrice !== null) {
          listingMaxPrice = productDoc.maxPrice;
        }
      }
    } catch (err) {
      // ignore error, fallback to strategy values
    }

    console.log(`📊 Current item details:`, {
      itemId,
      title,
      currentPrice,
      categoryId,
    });

    // 2) Fetch competitor prices via Browse API
    const { lowestPrice: lowestCompetitorPrice } = await fetchCompetitorPrices(
      userId,
      itemId,
      title,
      categoryId
    );

    console.log(`💰 Competitor analysis:`, {
      lowestCompetitorPrice,
    });

    // 3) Calculate new price based on the rule type and params
    const ruleFn = RULE_TYPES[strategy.type];
    if (!ruleFn) {
      throw new Error(`Unknown pricing rule type: ${strategy.type}`);
    }

    const newPriceRaw = await ruleFn({
      lowestPrice: lowestCompetitorPrice,
      params: strategy.params || {},
    });

    // 4) Apply min/max constraints if provided
    let constrainedPrice = newPriceRaw;
    let constraintApplied = false;

    if (listingMinPrice && constrainedPrice < listingMinPrice) {
      constrainedPrice = listingMinPrice;
      constraintApplied = true;
      console.log(`⬆️ Price constrained by minimum: ${listingMinPrice}`);
    }

    if (listingMaxPrice && constrainedPrice > listingMaxPrice) {
      constrainedPrice = listingMaxPrice;
      constraintApplied = true;
      console.log(`⬇️ Price constrained by maximum: ${listingMaxPrice}`);
    }

    // 5) Round to two decimals (eBay requires valid currency formats)
    const newPrice = Number(constrainedPrice.toFixed(2));

    // 6) Decide whether to update: only if newPrice differs from currentPrice
    const shouldUpdate = Math.abs(newPrice - currentPrice) >= 0.01;

    console.log(`🎯 Pricing decision:`, {
      currentPrice,
      calculatedPrice: newPriceRaw,
      finalPrice: newPrice,
      shouldUpdate,
      constraintApplied,
    });

    return {
      itemId,
      currentPrice,
      lowestCompetitorPrice,
      newPrice,
      shouldUpdate,
      constraintApplied,
      strategy: strategy.type,
      params: strategy.params,
      minPrice: listingMinPrice,
      maxPrice: listingMaxPrice,
    };
  } catch (error) {
    console.error(`❌ Error applying pricing rule for ${itemId}:`, error);
    throw error;
  }
}

/**
 * Batch‐apply pricing rules to all active listings for a user.
 */
export async function runAutoSync(
  userId,
  fetchActiveListings,
  updatePriceFn,
  strategies
) {
  console.log(
    `🚀 Starting auto-sync for user ${userId} with ${strategies.length} strategies`
  );

  try {
    // 1) Retrieve all active listings for the user
    const listings = await fetchActiveListings(userId);
    console.log(`📋 Found ${listings.length} active listings`);

    const results = [];

    // 2) Loop through each listing
    for (const listing of listings) {
      const itemId = listing.ItemID || listing.itemId;
      console.log(`🔄 Processing listing ${itemId}`);

      // Find strategy for this item
      const stratEntry = strategies.find((s) => s.itemId === itemId);
      if (!stratEntry) {
        console.log(`⚠️ No strategy defined for ${itemId}`);
        results.push({
          itemId,
          skipped: true,
          reason: 'No strategy defined',
        });
        continue;
      }

      try {
        // 3) Compute pricing decision
        const {
          currentPrice,
          lowestCompetitorPrice,
          newPrice,
          shouldUpdate,
          constraintApplied,
        } = await applyPricingRule(userId, itemId, stratEntry.strategy);

        if (shouldUpdate) {
          // 4) Push update through provided update function
          console.log(
            `💰 Updating price for ${itemId}: ${currentPrice} → ${newPrice}`
          );
          await updatePriceFn(userId, itemId, newPrice);

          results.push({
            itemId,
            currentPrice,
            lowestCompetitorPrice,
            newPrice,
            updated: true,
            constraintApplied,
            strategy: stratEntry.strategy.type,
          });
        } else {
          console.log(
            `✅ Price already optimal for ${itemId}: ${currentPrice}`
          );
          results.push({
            itemId,
            currentPrice,
            lowestCompetitorPrice,
            newPrice,
            updated: false,
            reason: 'Price already optimal',
            strategy: stratEntry.strategy.type,
          });
        }
      } catch (err) {
        console.error(`❌ Error processing ${itemId}:`, err);
        results.push({
          itemId,
          error: err.message,
          strategy: stratEntry.strategy?.type,
        });
      }
    }

    const successCount = results.filter((r) => r.updated).length;
    const errorCount = results.filter((r) => r.error).length;

    console.log(
      `✅ Auto-sync completed: ${successCount} updates, ${errorCount} errors, ${
        results.length - successCount - errorCount
      } skipped`
    );

    return {
      totalProcessed: results.length,
      successfulUpdates: successCount,
      errors: errorCount,
      results,
    };
  } catch (error) {
    console.error(`❌ Error in runAutoSync:`, error);
    throw error;
  }
}
