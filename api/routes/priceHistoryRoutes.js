// routes/priceHistoryRoutes.js

import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import PriceHistory from '../models/PriceHistory.js';

const router = express.Router();

/**
 * Get price history for a specific product
 * GET /api/price-history/product/:itemId
 */
router.get('/product/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { limit = 100, sku = null } = req.query;

    console.log(`📊 Fetching price history for ${itemId}, limit: ${limit}`);

    const query = { itemId };
    if (sku) query.sku = sku;

    const history = await PriceHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    return res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching price history',
      error: error.message,
    });
  }
});

/**
 * Get price history summary for a product
 * GET /api/price-history/summary/:itemId
 */
router.get('/summary/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku = null } = req.query;

    const query = { itemId, success: true };
    if (sku) query.sku = sku;

    const stats = await PriceHistory.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalChanges: { $sum: 1 },
          avgPrice: { $avg: '$newPrice' },
          minPrice: { $min: '$newPrice' },
          maxPrice: { $max: '$newPrice' },
          lastUpdate: { $max: '$createdAt' },
          firstRecord: { $min: '$createdAt' },
        },
      },
    ]);

    const latest = await PriceHistory.findOne(query).sort({ createdAt: -1 });

    const summary = {
      hasHistory: stats.length > 0,
      totalChanges: stats[0]?.totalChanges || 0,
      latestChange: latest,
      currentPrice: latest?.newPrice || null,
      priceDirection: latest?.changeDirection || 'unchanged',
      stats: stats[0] || null,
    };

    return res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('Error fetching price history summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching price history summary',
      error: error.message,
    });
  }
});

/**
 * Add a manual price history record
 * POST /api/price-history/manual
 */
router.post('/manual', requireAuth, async (req, res) => {
  try {
    const {
      itemId,
      sku,
      oldPrice,
      newPrice,
      reason,
      currency = 'USD',
    } = req.body;

    if (!itemId || newPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: 'itemId and newPrice are required',
      });
    }

    const record = new PriceHistory({
      itemId,
      sku,
      oldPrice,
      newPrice,
      currency,
      source: 'manual',
      status: 'completed',
      success: true,
      userId: req.user.id,
      metadata: { reason: reason || 'Manual update' },
    });

    await record.save();

    return res.status(201).json({
      success: true,
      message: 'Price history record created',
      data: record,
    });
  } catch (error) {
    console.error('Error creating manual price history record:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating price history record',
      error: error.message,
    });
  }
});

export default router;
