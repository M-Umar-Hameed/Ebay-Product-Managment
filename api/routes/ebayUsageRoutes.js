import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import ebayUsageService from '../services/ebayUsageService.js';
import axios from 'axios';

const router = express.Router();

/**
 * Get detailed API usage statistics
 * GET /api/ebay-usage/detailed
 */
router.get('/detailed', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = await ebayUsageService.getAPIUsage(userId);

    return res.json({
      success: true,
      data: usage,
      note:
        usage.source === 'mock_fallback'
          ? 'Using simulated data - eBay Usage API unavailable'
          : 'Live data from eBay API',
    });
  } catch (error) {
    console.error('Error getting detailed usage:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving API usage',
      error: error.message,
    });
  }
});

/**
 * Get usage summary
 * GET /api/ebay-usage/summary
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await ebayUsageService.getUsageSummary(userId);

    return res.json({
      success: true,
      data: summary,
      note: summary.isEstimated
        ? 'Estimated usage data - eBay Usage API unavailable'
        : 'Live usage data from eBay API',
    });
  } catch (error) {
    console.error('Error getting usage summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving usage summary',
      error: error.message,
    });
  }
});

/**
 * Check if specific API call is allowed
 * GET /api/ebay-usage/check/:callName
 */
router.get('/check/:callName', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { callName } = req.params;

    const permission = await ebayUsageService.canMakeAPICall(userId, callName);

    return res.json({
      success: true,
      data: permission,
    });
  } catch (error) {
    console.error('Error checking API permission:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking API permission',
      error: error.message,
    });
  }
});

/**
 * Test eBay API connectivity
 * GET /api/ebay-usage/test-connectivity
 */
router.get('/test-connectivity', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await ebayUsageService.testEbayConnectivity(userId);

    return res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Error testing connectivity:', error);
    return res.status(500).json({
      success: false,
      message: 'Error testing eBay connectivity',
      error: error.message,
    });
  }
});

/**
 * Clear usage cache
 * POST /api/ebay-usage/clear-cache
 */
router.post('/clear-cache', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    ebayUsageService.clearCache(userId);

    return res.json({
      success: true,
      message: 'Usage cache cleared',
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({
      success: false,
      message: 'Error clearing cache',
      error: error.message,
    });
  }
});

/**
 * Get API limits dashboard data
 * GET /api/ebay-usage/dashboard
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [usage, summary, connectivity] = await Promise.all([
      ebayUsageService.getAPIUsage(userId),
      ebayUsageService.getUsageSummary(userId),
      ebayUsageService.testEbayConnectivity(userId),
    ]);

    const dashboard = {
      summary,
      recentWarnings: usage.warnings.slice(0, 5),
      topCalls: summary.topUsedCalls.slice(0, 5),
      status:
        summary.daily.percentUsed > 95
          ? 'critical'
          : summary.daily.percentUsed > 80
          ? 'warning'
          : 'normal',
      connectivity: connectivity,
      dataSource: usage.source,
      isEstimated: usage.source !== 'ebay_api',
      lastUpdated: usage.timestamp,
    };

    return res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving dashboard data',
      error: error.message,
    });
  }
});

/**
 * Force refresh usage data (clear cache and fetch fresh)
 * POST /api/ebay-usage/refresh
 */
router.post('/refresh', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear cache first
    ebayUsageService.clearCache(userId);

    // Fetch fresh data
    const usage = await ebayUsageService.getAPIUsage(userId);

    return res.json({
      success: true,
      message: 'Usage data refreshed',
      data: usage,
      refreshed: true,
    });
  } catch (error) {
    console.error('Error refreshing usage data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error refreshing usage data',
      error: error.message,
    });
  }
});

/**
 * Debug eBay API issues
 * GET /api/ebay-usage/debug
 */
router.get('/debug', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`🔍 Starting eBay API debug session for user: ${userId}`);

    // Get user details
    const User = (await import('../models/Users.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      userId: userId,
      userEmail: user.email,
      ebayCredentials: {
        hasAccessToken: !!user.ebay?.accessToken,
        hasRefreshToken: !!user.ebay?.refreshToken,
        tokenLength: user.ebay?.accessToken?.length || 0,
        expiresAt: user.ebay?.expiresAt,
        isExpired: user.ebay?.expiresAt
          ? new Date() > new Date(user.ebay.expiresAt)
          : null,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasClientId: !!process.env.CLIENT_ID,
        hasClientSecret: !!process.env.CLIENT_SECRET,
        hasRedirectUri: !!process.env.REDIRECT_URI,
      },
    };

    // Test connectivity
    const connectivityResult = await ebayUsageService.testEbayConnectivity(
      userId
    );

    // Check eBay API status
    const apiStatus = await ebayUsageService.checkEbayApiStatus();

    return res.json({
      success: true,
      debug: debugInfo,
      connectivity: connectivityResult,
      apiStatus: apiStatus,
      recommendations: [
        "If you see 503 errors consistently, eBay's API might be temporarily down",
        'Check https://developer.ebay.com for any announced maintenance',
        "Verify your API credentials haven't expired",
        'Try switching between production and sandbox endpoints',
        'Consider implementing exponential backoff retry logic',
      ],
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message,
    });
  }
});

/**
 * Check eBay API status
 * GET /api/ebay-usage/api-status
 */
router.get('/api-status', async (req, res) => {
  try {
    const status = await ebayUsageService.checkEbayApiStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking API status',
      error: error.message,
    });
  }
});

/**
 * Test eBay Developer Analytics API specifically
 * GET /api/ebay-usage/test-analytics
 */
router.get('/test-analytics', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's eBay token
    const User = (await import('../models/Users.js')).default;
    const user = await User.findById(userId);

    if (!user || !user.ebay.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found',
      });
    }

    console.log('🔍 Testing eBay Developer Analytics API...');

    try {
      const response = await axios.get(
        'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/',
        {
          headers: {
            Authorization: `Bearer ${user.ebay.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
        }
      );

      return res.json({
        success: true,
        message: 'eBay Developer Analytics API is working',
        statusCode: response.status,
        dataStructure: {
          hasRateLimits: !!response.data?.rateLimits,
          rateLimitsCount: response.data?.rateLimits?.length || 0,
          apis:
            response.data?.rateLimits?.map((api) => ({
              name: api.apiName,
              context: api.apiContext,
              version: api.apiVersion,
              resourceCount: api.resources?.length || 0,
            })) || [],
        },
        rawResponse: response.data, // Include raw response for debugging
      });
    } catch (apiError) {
      return res.status(apiError.response?.status || 500).json({
        success: false,
        message: 'eBay Developer Analytics API failed',
        error: apiError.message,
        statusCode: apiError.response?.status,
        errorDetails: apiError.response?.data,
        possibleCauses: [
          'OAuth token may not have the required scope: https://api.ebay.com/oauth/api_scope',
          'Application may not have access to Developer Analytics API',
          'Token may be expired or invalid',
          'API endpoint may be temporarily unavailable',
        ],
      });
    }
  } catch (error) {
    console.error('Error testing Analytics API:', error);
    return res.status(500).json({
      success: false,
      message: 'Error testing eBay Analytics API',
      error: error.message,
    });
  }
});

/**
 * Get detailed rate limits with filters
 * GET /api/ebay-usage/rate-limits
 */
router.get('/rate-limits', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { api_name, api_context } = req.query;

    // Get user's eBay token
    const User = (await import('../models/Users.js')).default;
    const user = await User.findById(userId);

    if (!user || !user.ebay.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found',
      });
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (api_name) queryParams.append('api_name', api_name);
    if (api_context) queryParams.append('api_context', api_context);

    const url = `https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?${queryParams.toString()}`;

    console.log(`📊 Fetching filtered rate limits: ${url}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${user.ebay.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    return res.json({
      success: true,
      message: 'Rate limits retrieved successfully',
      filters: { api_name, api_context },
      data: response.data,
    });
  } catch (error) {
    console.error('Error getting filtered rate limits:', error);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Error retrieving rate limits',
      error: error.message,
      statusCode: error.response?.status,
    });
  }
});

/**
 * Check specific API call status
 * GET /api/ebay-usage/check-api/:callName
 */
router.get('/check-api/:callName', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { callName } = req.params;

    console.log(`🔍 Checking API status for: ${callName}`);

    const permission = await ebayUsageService.canMakeAPICall(userId, callName);

    // Get detailed usage for this specific call
    const usage = await ebayUsageService.getAPIUsage(userId);
    const dailyLimit = usage.dailyLimits[callName];
    const hourlyLimit = usage.hourlyLimits[callName];

    return res.json({
      success: true,
      callName,
      permission,
      details: {
        daily: dailyLimit
          ? {
              used: dailyLimit.used,
              limit: dailyLimit.limit,
              remaining: dailyLimit.remaining,
              percentUsed: dailyLimit.percentUsed.toFixed(1),
              reset: dailyLimit.reset,
              status: dailyLimit.remaining > 0 ? 'available' : 'exceeded',
            }
          : null,
        hourly: hourlyLimit
          ? {
              used: hourlyLimit.used,
              limit: hourlyLimit.limit,
              remaining: hourlyLimit.remaining,
              percentUsed: hourlyLimit.percentUsed.toFixed(1),
              reset: hourlyLimit.reset,
              status: hourlyLimit.remaining > 0 ? 'available' : 'exceeded',
            }
          : null,
      },
      recommendations: !permission.allowed
        ? [
            `${callName} limit exceeded - wait until ${permission.resetTime}`,
            'Consider using alternative APIs if available',
            'Implement request queuing until limit resets',
            "Review your application's API usage patterns",
          ]
        : [
            'API call allowed',
            dailyLimit && dailyLimit.percentUsed > 80
              ? 'Approaching daily limit - use carefully'
              : null,
            hourlyLimit && hourlyLimit.percentUsed > 80
              ? 'Approaching hourly limit - use carefully'
              : null,
          ].filter(Boolean),
    });
  } catch (error) {
    console.error('Error checking specific API:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking API status',
      error: error.message,
    });
  }
});

/**
 * Get rate limit violations summary
 * GET /api/ebay-usage/violations
 */
router.get('/violations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = await ebayUsageService.getAPIUsage(userId);

    const violations = [];
    const warnings = [];

    // Check daily limits
    Object.entries(usage.dailyLimits).forEach(([callName, limit]) => {
      if (limit.remaining <= 0 && limit.limit > 0) {
        violations.push({
          type: 'daily_exceeded',
          callName,
          used: limit.used,
          limit: limit.limit,
          overage: limit.used - limit.limit,
          reset: limit.reset,
          severity: 'critical',
        });
      } else if (limit.percentUsed > 90) {
        warnings.push({
          type: 'daily_warning',
          callName,
          used: limit.used,
          limit: limit.limit,
          percentUsed: limit.percentUsed,
          remaining: limit.remaining,
          reset: limit.reset,
          severity: 'warning',
        });
      }
    });

    // Check hourly limits
    Object.entries(usage.hourlyLimits).forEach(([callName, limit]) => {
      if (limit.remaining <= 0 && limit.limit > 0) {
        violations.push({
          type: 'hourly_exceeded',
          callName,
          used: limit.used,
          limit: limit.limit,
          overage: limit.used - limit.limit,
          reset: limit.reset,
          severity: 'critical',
        });
      } else if (limit.percentUsed > 90) {
        warnings.push({
          type: 'hourly_warning',
          callName,
          used: limit.used,
          limit: limit.limit,
          percentUsed: limit.percentUsed,
          remaining: limit.remaining,
          reset: limit.reset,
          severity: 'warning',
        });
      }
    });

    return res.json({
      success: true,
      summary: {
        totalViolations: violations.length,
        totalWarnings: warnings.length,
        dataSource: usage.source,
        isEstimated: usage.source !== 'ebay_developer_analytics',
      },
      violations,
      warnings,
      nextActions:
        violations.length > 0
          ? [
              'Stop making API calls to exceeded endpoints',
              'Wait for limits to reset',
              'Review and optimize API usage patterns',
              'Consider rate limiting in your application',
            ]
          : [
              'No critical violations found',
              'Monitor warnings to prevent future violations',
            ],
    });
  } catch (error) {
    console.error('Error getting violations:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting rate limit violations',
      error: error.message,
    });
  }
});

export default router;
