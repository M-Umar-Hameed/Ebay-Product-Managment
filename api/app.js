// app.js

import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';

// Routes
import syncRoutes from './routes/syncRoute.js';
import ebayRoutes from './routes/ebayRoutes.js';
import authRoutes from './routes/authRoute.js';
import pricingStrategiesRouter from './routes/pricingStrategies.js';
import priceHistoryRoutes from './routes/priceHistory.js';
import competitorRulesRouter from './routes/competitorRule.js';
import ebayUsageRoutes from './routes/ebayUsageRoutes.js'; // Import the new routes

// Models (if you need to attach models to `app.locals` or `app.set('models', {...})`)
import PriceHistory from './models/PriceHistory.js';

dotenv.config();
const app = express();

// ── Connect to MongoDB ─────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
  });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(
  cors({
    origin: ['https://17autoparts.com', 'http://localhost:5173'],
    credentials: true,
  })
);
app.use(morgan('short'));

// If you want to make models available to controllers via `req.app.get('models')`:
app.set('models', { PriceHistory });

// ── Mounting All Routers ───────────────────────────────────────────────────────

// 1) Authentication (login, register, logout, OAuth callback, etc.)
app.use('/auth', authRoutes);

// 2) eBay "fetch‐and‐edit" routes (listings, policies, competitor‐prices, etc.)
app.use('/api/ebay', ebayRoutes);

// 3) Sync service (auto‐sync listings)
app.use('/api/sync', syncRoutes);

// 4) Pricing‐strategies endpoints (create/update/delete strategies, apply to items, etc.)
app.use('/api/pricing-strategies', pricingStrategiesRouter);

// 5) Price-history endpoints (history/:itemId, analytics/:itemId, export/:itemId)
app.use('/api/price-history', priceHistoryRoutes); // This should now work correctly

// 6) Competitor‐rules endpoints (create/edit/delete competitor rules, debug, etc.)
app.use('/api/competitor-rules', competitorRulesRouter);

// 7) eBay usage statistics routes
app.use('/api/ebay-usage', ebayUsageRoutes); // Add the new routes

// ── Basic sanity check endpoint ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'eBay Auth & API Service is running',
    endpoints: {
      user_auth_flow: [
        '/auth/login',
        '/auth/register',
        '/auth/ebay-login',
        '/auth/generate-code',
        '/auth/automated-login',
      ],
      get_token: '/auth/token',
      application_token: '/auth/application_token',
      refresh_token: '/auth/refresh',
      api_docs: '/api-docs',
    },
  });
});

// Error reporting endpoint for client-side issues
app.post('/api/error-reports', express.json(), (req, res) => {
  const report = req.body;

  console.log('🚨 Client Error Report Received:', {
    timestamp: report.timestamp,
    userAgent: report.environment?.browser?.name,
    error: report.error?.message,
    connectivity: report.connectivity?.map((c) => ({
      url: c.url,
      success: c.success,
      error: c.error?.message,
    })),
  });

  // Log full report for debugging
  console.log('📋 Full Error Report:', JSON.stringify(report, null, 2));

  // In production, you might want to save this to a database or send to a monitoring service
  // For now, we'll just log it

  res.status(200).json({
    success: true,
    message: 'Error report received',
    reportId: Date.now().toString(),
  });
});

// Add manual trigger endpoint for testing
app.post('/api/competitor-monitoring/trigger-manual', async (req, res) => {
  try {
    const { itemId } = req.body;
    const { manualCompetitorUpdate } = await import(
      './services/competitorMonitoringService.js'
    );
    const result = await manualCompetitorUpdate(itemId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the competitor monitoring service
async function startServices() {
  try {
    // Import and start competitor monitoring
    const { startCompetitorMonitoring } = await import(
      './services/competitorMonitoringService.js'
    );
    startCompetitorMonitoring();

    console.log('✅ All background services started successfully');
  } catch (error) {
    console.error('❌ Error starting background services:', error);
  }
}

// Add this after imports but before starting services
async function checkApiLimitsBeforeStart() {
  try {
    console.log('🔍 Checking eBay API limits before starting services...');
    
    const ebayUsageService = await import('./services/ebayUsageService.js');
    const getItemStatus = await ebayUsageService.default.canMakeAPICall('system', 'GetItem');
    
    console.log('📊 Current GetItem API status:', {
      allowed: getItemStatus.allowed,
      usage: getItemStatus.usage,
      limit: getItemStatus.limit,
      percentUsed: ((getItemStatus.usage / getItemStatus.limit) * 100).toFixed(1) + '%'
    });
    
    if (!getItemStatus.allowed) {
      console.log('🚨 WARNING: GetItem API limit exceeded!');
      console.log('🛑 BACKGROUND SERVICES WILL NOT START to prevent further API calls');
      console.log('⏰ Reset time:', getItemStatus.resetTime);
      return false;
    }
    
    if (getItemStatus.usage / getItemStatus.limit > 0.8) {
      console.log('⚠️ WARNING: GetItem API usage > 80% - starting with reduced monitoring');
      return 'reduced';
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error checking API limits:', error);
    return false;
  }
}

// Modify your server startup section:
async function startServer() {
  try {
    await connectToMongoDB();
    
    // Check API limits before starting any services
    const apiStatus = await checkApiLimitsBeforeStart();
    
    if (apiStatus === false) {
      console.log('🚨 Server starting in SAFE MODE - no background services');
      console.log('💡 To start services manually, call: POST /api/competitor-rules/start-services');
      // Don't start any monitoring services
    } else if (apiStatus === 'reduced') {
      console.log('⚠️ Server starting in REDUCED MODE - limited monitoring');
      // Only start if explicitly enabled
      if (process.env.ENABLE_SCHEDULER === 'true') {
        const result = await startSchedulerService();
        console.log('📊 Scheduler start result:', result);
      }
    } else {
      console.log('✅ API limits OK - starting normal services');
      if (process.env.ENABLE_SCHEDULER !== 'false') {
        const result = await startSchedulerService();
        console.log('📊 Scheduler start result:', result);
      }
    }
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Mode: ${apiStatus === false ? 'SAFE' : apiStatus === 'reduced' ? 'REDUCED' : 'NORMAL'}`);
      console.log(`🔧 Scheduler enabled: ${process.env.ENABLE_SCHEDULER !== 'false'}`);
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Start services after a delay to ensure database is connected
setTimeout(() => {
  startServices();
}, 5000);

// ── Start the server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {});
