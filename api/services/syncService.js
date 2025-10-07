// services/syncService.js

import { fetchEbayListings, editPrice } from './ebayService.js';
import Strategy from '../models/PricingStrategy.js';
import { runAutoSync } from './pricingEngine.js';

/**
 * Trigger auto-sync of listings: fetch active listings, apply pricing rules, update prices.
 * Protected route: expects req.user.id.
 */
export const triggerAutoSync = async (req, res) => {
  try {
    const userId = req.user.id;
    const dryRun = req.query.dryRun === 'true';

    // 1) Load all active pricing strategies for this user
    //    Each document should have: { itemId, strategy: { type, params } }
    const strategies = await Strategy.find({ userId, isActive: true })
      .lean()
      .select('itemId strategy');

    if (!strategies.length) {
      return res.status(200).json({
        success: true,
        message: 'No active pricing strategies found',
        data: { totalListings: 0, results: [] },
      });
    }

    // 2) Run the pricing engine across all active listings
    const results = await runAutoSync(
      userId,
      fetchEbayListings,
      editPrice,
      strategies,
      { dryRun }
    );

    // 3) Summarize results
    const summary = {
      totalListings: results.length,
      updated: results.filter((r) => r.updated).length,
      skipped: results.filter((r) => r.skipped).length,
      errors: results.filter((r) => r.error).length,
    };

    return res.status(200).json({
      success: true,
      message: `Auto-sync completed${dryRun ? ' (dry run)' : ''}`,
      summary,
      results,
    });
  } catch (error) {
    console.error('Auto-sync failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Auto-sync failed',
      error: error.message,
    });
  }
};
