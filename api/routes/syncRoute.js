import express from 'express';
import { triggerAutoSync } from '../services/syncService.js';

const router = express.Router();

// Middleware for API key authentication
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing API key',
    });
  }

  next();
};

// Middleware for request logging
const logRequest = (req, res, next) => {
  next();
};

/**
 * @route   POST /api/sync/scheduled
 * @desc    Trigger auto-sync of all listings
 * @access  Private (requires API key)
 * @body    { syncType, batchSize, delayBetweenBatches, forceUpdate, dryRun }
 */
router.post('/scheduled', authenticateAPI, logRequest, triggerAutoSync);

/**
 * @route   GET /api/sync/scheduled
 * @desc    Trigger auto-sync with default parameters (for cron jobs)
 * @access  Private (requires API key)
 */
router.get('/scheduled', authenticateAPI, logRequest, (req, res) => {
  // Convert query parameters to body format for consistency
  req.body = {
    syncType: 'price',
    batchSize: parseInt(req.query.batchSize) || 25,
    delayBetweenBatches: parseInt(req.query.delayBetweenBatches) || 2000,
    forceUpdate: req.query.forceUpdate === 'true',
    dryRun: req.query.dryRun === 'true',
  };

  return triggerAutoSync(req, res);
});

/**
 * @route   POST /api/sync/preview
 * @desc    Preview what would be synced without making changes (dry run)
 * @access  Private (requires API key)
 */
router.post('/preview', authenticateAPI, logRequest, (req, res) => {
  // Force dry run mode
  req.body.dryRun = true;

  return triggerAutoSync(req, res);
});

/**
 * @route   GET /api/sync/health
 * @desc    Health check for sync service
 * @access  Public
 */
router.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'eBay Auto-Sync API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      environment: {
        status: process.env.CLIENT_ID ? 'OK' : 'ERROR',
        message: process.env.CLIENT_ID
          ? 'eBay credentials configured'
          : 'Missing eBay credentials',
      },
      api: {
        status: 'OK',
        message: 'API is responding',
      },
    },
  };

  const isHealthy = Object.values(healthStatus.checks).every(
    (check) => check.status === 'OK'
  );

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    data: healthStatus,
  });
});

/**
 * @route   GET /api/sync/status
 * @desc    Get current sync service status
 * @access  Private (requires API key)
 */
router.get('/status', authenticateAPI, (req, res) => {
  // This would typically fetch from your database
  // For now, return a sample status

  const status = {
    lastSync: {
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      status: 'completed',
      totalListings: 45,
      successCount: 42,
      errorCount: 1,
      skippedCount: 2,
      duration: 125000, // milliseconds
    },
    nextScheduledSync: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    isRunning: false,
    configuration: {
      defaultBatchSize: 25,
      defaultSyncType: 'all',
      autoSyncEnabled: true,
    },
  };

  return res.status(200).json({
    success: true,
    message: 'Sync service status retrieved',
    data: status,
  });
});

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('🚨 Sync API Error:', error);

  return res.status(500).json({
    success: false,
    message: 'Internal server error in sync service',
    error:
      process.env.NODE_ENV === 'development'
        ? error.message
        : 'Internal server error',
  });
});

export default router;
