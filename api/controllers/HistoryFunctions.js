// controllers/HistoryFunctions.js

import PriceHistory from '../models/PriceHistory.js';

/**
 * Get price history for a given item (and optional SKU)
 * GET /api/history/:itemId?sku=&limit=
 */
const getItemPriceHistory = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku, limit = 20 } = req.query;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'Item ID is required',
      });
    }

    const priceHistory = await PriceHistory.getItemPriceHistory(
      itemId,
      sku || null,
      parseInt(limit) || 20
    );

    let stats = null;
    if (priceHistory.length > 0) {
      // Find first successful (oldest) and last successful (most recent)
      const firstSuccessful = [...priceHistory]
        .reverse()
        .find((p) => p.success);
      const lastSuccessful = priceHistory.find((p) => p.success);

      if (firstSuccessful && lastSuccessful) {
        const firstPrice = firstSuccessful.newPrice;
        const currentPrice = lastSuccessful.newPrice;
        const totalChange = currentPrice - firstPrice;
        const percentChange =
          firstPrice > 0 ? (totalChange / firstPrice) * 100 : null;

        stats = {
          firstRecordedPrice: firstPrice,
          currentPrice,
          totalChange,
          percentChange,
          priceDirection:
            totalChange > 0
              ? 'increased'
              : totalChange < 0
              ? 'decreased'
              : 'unchanged',
          totalRecords: priceHistory.length,
          firstRecordDate: firstSuccessful.createdAt,
          lastUpdateDate: lastSuccessful.createdAt,
        };
      }
    }

    return res.status(200).json({
      success: true,
      itemId,
      sku: sku || 'all variations',
      priceHistory,
      stats,
      count: priceHistory.length,
    });
  } catch (error) {
    console.error('Error fetching price history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error fetching price history',
      error: error.message,
    });
  }
};

/**
 * Add a manual price history record
 * POST /api/history/manual
 */
const addManualPriceRecord = async (req, res) => {
  try {
    const {
      itemId,
      sku,
      price,
      oldPrice,
      currency = 'USD',
      title,
      notes,
    } = req.body;

    if (!itemId || !sku || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Required fields missing (itemId, sku, price)',
      });
    }

    let changeAmount = null;
    let changePercentage = null;
    let changeDirection = null;
    if (oldPrice !== undefined && oldPrice !== null) {
      const oldPriceValue = parseFloat(oldPrice);
      const newPriceValue = parseFloat(price);
      changeAmount = newPriceValue - oldPriceValue;
      if (oldPriceValue > 0) {
        changePercentage = (changeAmount / oldPriceValue) * 100;
      }
      changeDirection =
        changeAmount > 0
          ? 'increased'
          : changeAmount < 0
          ? 'decreased'
          : 'unchanged';
    }

    const priceRecord = new PriceHistory({
      itemId,
      sku,
      title,
      oldPrice: oldPrice !== undefined ? parseFloat(oldPrice) : null,
      newPrice: parseFloat(price),
      currency,
      changeAmount,
      changePercentage,
      changeDirection,
      source: 'manual',
      success: true,
      metadata: {
        notes: notes || 'Manually added price point',
      },
    });

    await priceRecord.save();
    return res.status(201).json({
      success: true,
      message: 'Manual price record added successfully',
      priceRecord,
    });
  } catch (error) {
    console.error('Error adding manual price record:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error adding manual price record',
      error: error.message,
    });
  }
};

export { getItemPriceHistory, addManualPriceRecord };
