import axios from 'axios';
import xml2js from 'xml2js';
import User from '../models/Users.js';
import { refreshUserAccessToken } from './ebayAuthService.js';
import mongoose from 'mongoose';

/**
 * eBay API Usage Monitoring Service
 * Tracks API call limits and usage statistics
 */

class EbayUsageService {
  constructor() {
    this.usageCache = new Map(); // Cache usage data to avoid excessive API calls
    this.rateLimitCache = new Map(); // Track rate limits per user
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.mockData = this.generateMockUsageData(); // Fallback mock data

    // Simple usage tracking schema
    this.ebayUsageSchema = new mongoose.Schema(
      {
        userId: { type: String, default: 'system' },
        apiCall: { type: String, required: true },
        date: { type: String, required: true }, // YYYY-MM-DD format
        count: { type: Number, default: 0 },
        hour: { type: Number, default: 0 }, // For hourly tracking
      },
      { timestamps: true }
    );

    this.EbayUsage = mongoose.model('EbayUsage', this.ebayUsageSchema);

    this.limits = {
      GetItem: { daily: 5000, hourly: null },
      GetMyeBaySelling: { daily: 1000, hourly: 100 },
      ReviseItem: { daily: 5000, hourly: 500 },
      ReviseInventoryStatus: { daily: 5000, hourly: 500 },
    };
  }

  /**
   * Generate mock usage data for fallback when API is unavailable
   */
  generateMockUsageData() {
    return {
      timestamp: new Date().toISOString(),
      source: 'mock_fallback',
      dailyLimits: {
        GetItem: {
          used: Math.floor(Math.random() * 100),
          softLimit: 5000,
          hardLimit: 5000,
          percentUsed: Math.floor(Math.random() * 50),
        },
        GetMyeBaySelling: {
          used: Math.floor(Math.random() * 50),
          softLimit: 1000,
          hardLimit: 1000,
          percentUsed: Math.floor(Math.random() * 30),
        },
        ReviseInventoryStatus: {
          used: Math.floor(Math.random() * 200),
          softLimit: 5000,
          hardLimit: 5000,
          percentUsed: Math.floor(Math.random() * 40),
        },
      },
      hourlyLimits: {
        GetItem: {
          used: Math.floor(Math.random() * 50),
          softLimit: 500,
          hardLimit: 500,
          percentUsed: Math.floor(Math.random() * 20),
        },
        GetMyeBaySelling: {
          used: Math.floor(Math.random() * 20),
          softLimit: 100,
          hardLimit: 100,
          percentUsed: Math.floor(Math.random() * 15),
        },
        ReviseInventoryStatus: {
          used: Math.floor(Math.random() * 100),
          softLimit: 500,
          hardLimit: 500,
          percentUsed: Math.floor(Math.random() * 25),
        },
      },
      warnings: [],
      debugInfo: {
        reason: 'eBay API returned 503 - Service Unavailable',
        possibleCauses: [
          'eBay API temporary outage',
          'Invalid API endpoint',
          'Authentication issues',
          'Rate limiting at CDN level',
          'Maintenance window',
        ],
        recommendedActions: [
          'Retry after delay',
          'Check eBay Developer Program status',
          'Verify API credentials',
          'Use alternative endpoints',
        ],
      },
    };
  }

  /**
   * Enhanced API call with better error handling and debugging
   */
  async makeEbayApiCall(url, xmlRequest, headers, callName) {
    const requestId = Math.random().toString(36).substring(7);

    console.log(`🔍 [${requestId}] Making eBay API call: ${callName}`);
    console.log(`🔍 [${requestId}] URL: ${url}`);
    console.log(`🔍 [${requestId}] Headers:`, Object.keys(headers));

    try {
      const response = await axios({
        method: 'post',
        url: url,
        headers: headers,
        data: xmlRequest,
        timeout: 15000, // Increased timeout
        validateStatus: function (status) {
          // Don't throw for any status code, we'll handle it manually
          return true;
        },
      });

      console.log(`📊 [${requestId}] Response status: ${response.status}`);
      console.log(
        `📊 [${requestId}] Response headers:`,
        Object.keys(response.headers)
      );

      if (response.status === 503) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          url: url,
          callName: callName,
          timestamp: new Date().toISOString(),
        };

        console.error(
          `❌ [${requestId}] eBay API 503 Error Details:`,
          errorDetails
        );

        // Check if it's a CDN/Akamai error
        const server = response.headers.server || response.headers.Server;
        const cdnInfo = response.headers['x-cdn'] || response.headers['X-CDN'];

        if (server?.includes('Akamai') || cdnInfo?.includes('Akamai')) {
          throw new Error(
            `eBay CDN (Akamai) returned 503 - likely temporary outage or maintenance. Server: ${server}, CDN: ${cdnInfo}`
          );
        }

        throw new Error(`eBay API returned 503 Service Unavailable. This could be due to:
          1. eBay API temporary outage
          2. Rate limiting at infrastructure level
          3. Maintenance window
          4. Invalid endpoint or authentication
          Response: ${response.data}`);
      }

      if (response.status >= 400) {
        throw new Error(
          `eBay API returned ${response.status}: ${response.statusText}. Data: ${response.data}`
        );
      }

      console.log(`✅ [${requestId}] eBay API call successful`);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`eBay API timeout after 15 seconds for ${callName}`);
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to eBay API (${error.code}). Check internet connection and eBay API status.`
        );
      }

      console.error(`❌ [${requestId}] eBay API call failed:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });

      throw error;
    }
  }

  /**
   * Try different eBay API endpoints to find working one
   */
  async tryMultipleEndpoints(authToken, callName = 'GeteBayOfficialTime') {
    const endpoints = [
      'https://api.ebay.com/ws/api.dll', // Production
      'https://api.sandbox.ebay.com/ws/api.dll', // Sandbox
    ];

    const xmlRequest = `
      <?xml version="1.0" encoding="utf-8"?>
      <${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${authToken}</eBayAuthToken>
        </RequesterCredentials>
        <Version>1155</Version>
      </${callName}Request>
    `;

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      const endpointType = endpoint.includes('sandbox')
        ? 'sandbox'
        : 'production';

      try {
        console.log(`🔄 Trying ${endpointType} endpoint: ${endpoint}`);

        const headers = {
          'Content-Type': 'text/xml',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
          'X-EBAY-API-CALL-NAME': callName,
          'X-EBAY-API-SITEID': '0',
          'User-Agent': 'eBayUsageMonitor/1.0',
        };

        const response = await this.makeEbayApiCall(
          endpoint,
          xmlRequest,
          headers,
          callName
        );

        console.log(`✅ ${endpointType} endpoint working`);
        return {
          success: true,
          endpoint: endpoint,
          endpointType: endpointType,
          response: response,
        };
      } catch (error) {
        console.error(`❌ ${endpointType} endpoint failed:`, error.message);

        if (i === endpoints.length - 1) {
          // Last endpoint failed
          throw new Error(
            `All eBay API endpoints failed. Last error: ${error.message}`
          );
        }
      }
    }
  }

  /**
   * eBay API Usage Monitoring Service
   * Tracks API call limits and usage statistics
   */

  /**
   * Get API usage statistics using the official eBay Developer Analytics API
   */
  async getAPIUsage(userId) {
    try {
      // Check cache first
      const cacheKey = `usage_${userId}`;
      const cached = this.usageCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // Get user's eBay token
      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        throw new Error('No eBay credentials found for this user');
      }

      // Refresh token if needed
      if (new Date() >= new Date(user.ebay.expiresAt)) {
        const tokenResponse = await refreshUserAccessToken(userId);
        user.ebay.accessToken = tokenResponse.access_token;
        user.ebay.expiresAt = new Date(
          Date.now() + tokenResponse.expires_in * 1000
        );
        await user.save();
      }

      const authToken = user.ebay.accessToken;

      // Try different approaches to get usage data
      let usageData = null;
      const approaches = [
        () => this.tryGetRateLimitsAPI(authToken),
        () => this.tryGetUsageViaHeaders(authToken),
        () => this.getMockUsageData(),
      ];

      for (let i = 0; i < approaches.length; i++) {
        try {
          console.log(`📊 Trying approach ${i + 1} for eBay usage data...`);
          usageData = await approaches[i]();
          if (usageData) {
            console.log(
              `✅ Successfully got usage data from approach ${i + 1}`
            );
            break;
          }
        } catch (error) {
          console.warn(`⚠️ Approach ${i + 1} failed:`, error.message);
          if (i === approaches.length - 1) {
            // Last approach failed, use mock data
            console.log('📊 Using mock data as final fallback');
            usageData = this.getMockUsageData();
          }
        }
      }

      // Cache the result
      this.usageCache.set(cacheKey, {
        data: usageData,
        timestamp: Date.now(),
      });

      return usageData;
    } catch (error) {
      console.error('Error getting eBay API usage:', error);
      // Return mock data as fallback
      return this.getMockUsageData();
    }
  }

  /**
   * Try to get usage via the official eBay Developer Analytics API
   */
  async tryGetRateLimitsAPI(authToken) {
    console.log(
      '📊 Attempting to use eBay Developer Analytics API for rate limits...'
    );

    try {
      // Use the official eBay Developer Analytics API
      const response = await axios.get(
        'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/',
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
        }
      );

      if (response.status === 200 && response.data) {
        console.log(
          '✅ Successfully retrieved rate limits from Developer Analytics API'
        );
        return this.parseRateLimitsResponse(response.data);
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Developer Analytics API failed:', error.message);

      // Check if it's a specific error we can handle
      if (error.response?.status === 403) {
        throw new Error(
          'Access denied to eBay Developer Analytics API - check OAuth scopes'
        );
      } else if (error.response?.status === 401) {
        throw new Error(
          'Unauthorized access to eBay Developer Analytics API - token may be invalid'
        );
      } else if (error.response?.status === 429) {
        throw new Error('Rate limited by eBay Developer Analytics API');
      }

      throw error;
    }
  }

  /**
   * Parse the response from eBay Developer Analytics API
   */
  parseRateLimitsResponse(responseData) {
    const usageStats = {
      timestamp: new Date().toISOString(),
      source: 'ebay_developer_analytics',
      dailyLimits: {},
      hourlyLimits: {},
      warnings: [],
      rawData: responseData, // Include raw data for debugging
    };

    try {
      if (!responseData.rateLimits || !Array.isArray(responseData.rateLimits)) {
        throw new Error('Invalid rate limits response structure');
      }

      responseData.rateLimits.forEach((apiData) => {
        const apiName = apiData.apiName || 'unknown';
        const apiContext = apiData.apiContext || 'unknown';
        const apiKey = `${apiContext}_${apiName}`;

        console.log(`📊 Processing rate limits for ${apiKey}...`);

        if (apiData.resources && Array.isArray(apiData.resources)) {
          apiData.resources.forEach((resource) => {
            const resourceName = resource.name || 'unknown';
            const fullResourceName = `${apiKey}_${resourceName}`;

            if (resource.rates && Array.isArray(resource.rates)) {
              resource.rates.forEach((rate) => {
                // Map the timeWindow to daily/hourly categories
                const timeWindowSeconds = rate.timeWindow || 3600; // Default to 1 hour
                const isDaily = timeWindowSeconds >= 86400; // 24 hours or more
                const isHourly =
                  timeWindowSeconds >= 3600 && timeWindowSeconds < 86400; // 1-24 hours

                // Fix the remaining calculation - eBay sometimes returns 0 when it should be limit-count
                const count = rate.count || 0;
                const limit = rate.limit || 0;
                let remaining = rate.remaining;

                // If remaining is 0 but count < limit, calculate it properly
                if (remaining === 0 && count < limit) {
                  remaining = limit - count;
                }

                // If count exceeds limit, remaining should be 0
                if (count >= limit) {
                  remaining = 0;
                }

                const percentUsed = limit > 0 ? (count / limit) * 100 : 0;

                const rateInfo = {
                  used: count,
                  limit: limit,
                  remaining: remaining,
                  percentUsed: percentUsed,
                  reset: rate.reset,
                  timeWindow: timeWindowSeconds,
                  resourceName: fullResourceName,
                  // Add debug info
                  debug: {
                    originalRemaining: rate.remaining,
                    calculatedRemaining: remaining,
                    wasRecalculated: rate.remaining !== remaining,
                  },
                };

                if (isDaily) {
                  usageStats.dailyLimits[resourceName] = {
                    ...rateInfo,
                    softLimit: limit, // eBay doesn't distinguish soft/hard limits in this API
                    hardLimit: limit,
                  };
                } else if (isHourly) {
                  usageStats.hourlyLimits[resourceName] = {
                    ...rateInfo,
                    softLimit: limit,
                    hardLimit: limit,
                  };
                }

                // Add warnings for high usage (using corrected percentage)
                if (limit > 0 && percentUsed > 80) {
                  const timeWindowType = isDaily
                    ? 'daily'
                    : isHourly
                    ? 'hourly'
                    : `${timeWindowSeconds}s`;
                  usageStats.warnings.push({
                    type: `${timeWindowType}_limit_warning`,
                    resource: fullResourceName,
                    message: `${resourceName} ${timeWindowType} usage is at ${percentUsed.toFixed(
                      1
                    )}%`,
                    usage: count,
                    limit: limit,
                    remaining: remaining,
                    resetTime: rate.reset,
                  });
                }

                // Add critical warning if limit exceeded
                if (count >= limit) {
                  const timeWindowType = isDaily
                    ? 'daily'
                    : isHourly
                    ? 'hourly'
                    : `${timeWindowSeconds}s`;
                  usageStats.warnings.push({
                    type: `${timeWindowType}_limit_exceeded`,
                    resource: fullResourceName,
                    message: `🚨 ${resourceName} ${timeWindowType} limit EXCEEDED! Used ${count}/${limit}`,
                    usage: count,
                    limit: limit,
                    remaining: 0,
                    resetTime: rate.reset,
                    severity: 'critical',
                  });
                }
              });
            }
          });
        }
      });

      console.log(
        `📊 Parsed ${
          Object.keys(usageStats.dailyLimits).length
        } daily limits and ${
          Object.keys(usageStats.hourlyLimits).length
        } hourly limits`
      );

      // Add summary of critical issues
      const criticalWarnings = usageStats.warnings.filter(
        (w) => w.severity === 'critical'
      );
      if (criticalWarnings.length > 0) {
        console.warn(
          `🚨 Found ${criticalWarnings.length} API limits that are EXCEEDED!`
        );
        criticalWarnings.forEach((warning) => {
          console.warn(`🚨 ${warning.message}`);
        });
      }

      return usageStats;
    } catch (parseError) {
      console.error('❌ Error parsing rate limits response:', parseError);

      // Return partial data with error info
      usageStats.warnings.push({
        type: 'parse_error',
        message: `Error parsing rate limits: ${parseError.message}`,
        timestamp: new Date().toISOString(),
      });

      return usageStats;
    }
  }

  /**
   * Check if API call is allowed using the new rate limit data
   */
  async canMakeAPICall(userId, callName = 'GetItem') {
    try {
      const usage = await this.getAPIUsage(userId);

      // If using mock data, always allow calls with a warning
      if (usage.source === 'mock_fallback') {
        return {
          allowed: true,
          warning: 'Rate limiting unavailable - using estimated limits',
          dailyRemaining: 'unknown',
          hourlyRemaining: 'unknown',
          mockData: true,
        };
      }

      // Map common call names to resource names from the API response
      const callMappings = {
        GetItem: ['GetItem'],
        GetMyeBaySelling: ['GetMyeBaySelling'],
        ReviseInventoryStatus: ['ReviseInventoryStatus'],
        ReviseItem: ['ReviseItem'],
        AddItem: ['AddItem'],
        EndItem: ['EndItem'],
      };

      const possibleKeys = callMappings[callName] || [callName];

      // Check all possible matching limits
      for (const key of possibleKeys) {
        // Check daily limits
        const dailyLimit = usage.dailyLimits[key];
        if (
          dailyLimit &&
          dailyLimit.remaining !== undefined &&
          dailyLimit.remaining <= 0
        ) {
          return {
            allowed: false,
            reason: 'daily_limit_exceeded',
            message: `Daily limit exceeded for ${key} (${dailyLimit.used}/${dailyLimit.limit})`,
            resetTime: dailyLimit.reset || 'unknown',
            resource: key,
            usage: dailyLimit.used,
            limit: dailyLimit.limit,
          };
        }

        // Check hourly limits
        const hourlyLimit = usage.hourlyLimits[key];
        if (
          hourlyLimit &&
          hourlyLimit.remaining !== undefined &&
          hourlyLimit.remaining <= 0
        ) {
          return {
            allowed: false,
            reason: 'hourly_limit_exceeded',
            message: `Hourly limit exceeded for ${key} (${hourlyLimit.used}/${hourlyLimit.limit})`,
            resetTime: hourlyLimit.reset || 'unknown',
            resource: key,
            usage: hourlyLimit.used,
            limit: hourlyLimit.limit,
          };
        }
      }

      // Find the best matching limits for remaining counts
      let bestDailyRemaining = 'unlimited';
      let bestHourlyRemaining = 'unlimited';
      let dailyLimitInfo = null;
      let hourlyLimitInfo = null;

      for (const key of possibleKeys) {
        const dailyLimit = usage.dailyLimits[key];
        const hourlyLimit = usage.hourlyLimits[key];

        if (dailyLimit && dailyLimit.remaining !== undefined) {
          if (
            bestDailyRemaining === 'unlimited' ||
            dailyLimit.remaining < bestDailyRemaining
          ) {
            bestDailyRemaining = dailyLimit.remaining;
            dailyLimitInfo = {
              used: dailyLimit.used,
              limit: dailyLimit.limit,
              percentUsed: dailyLimit.percentUsed,
              reset: dailyLimit.reset,
            };
          }
        }

        if (hourlyLimit && hourlyLimit.remaining !== undefined) {
          if (
            bestHourlyRemaining === 'unlimited' ||
            hourlyLimit.remaining < bestHourlyRemaining
          ) {
            bestHourlyRemaining = hourlyLimit.remaining;
            hourlyLimitInfo = {
              used: hourlyLimit.used,
              limit: hourlyLimit.limit,
              percentUsed: hourlyLimit.percentUsed,
              reset: hourlyLimit.reset,
            };
          }
        }
      }

      return {
        allowed: true,
        dailyRemaining: bestDailyRemaining,
        hourlyRemaining: bestHourlyRemaining,
        dataSource: usage.source,
        checkedResources: possibleKeys,
        dailyLimitInfo,
        hourlyLimitInfo,
        warnings: usage.warnings.filter((w) =>
          possibleKeys.some((key) => w.resource?.includes(key))
        ),
      };
    } catch (error) {
      console.error('Error checking API call permission:', error);
      // If we can't check limits, allow the call but log the error
      return {
        allowed: true,
        warning: 'Could not verify rate limits - proceeding with caution',
        error: error.message,
      };
    }
  }

  /**
   * Get summary of API usage across all calls
   */
  async getUsageSummary(userId) {
    try {
      const usage = await this.getAPIUsage(userId);

      let totalDailyUsed = 0;
      let totalDailyLimit = 0;
      let totalHourlyUsed = 0;
      let totalHourlyLimit = 0;

      Object.values(usage.dailyLimits).forEach((limit) => {
        if (typeof limit.used === 'number') totalDailyUsed += limit.used;
        if (typeof limit.hardLimit === 'number')
          totalDailyLimit += limit.hardLimit;
      });

      Object.values(usage.hourlyLimits).forEach((limit) => {
        if (typeof limit.used === 'number') totalHourlyUsed += limit.used;
        if (typeof limit.hardLimit === 'number')
          totalHourlyLimit += limit.hardLimit;
      });

      return {
        daily: {
          used: totalDailyUsed,
          limit: totalDailyLimit,
          percentUsed:
            totalDailyLimit > 0 ? (totalDailyUsed / totalDailyLimit) * 100 : 0,
        },
        hourly: {
          used: totalHourlyUsed,
          limit: totalHourlyLimit,
          percentUsed:
            totalHourlyLimit > 0
              ? (totalHourlyUsed / totalHourlyLimit) * 100
              : 0,
        },
        warnings: usage.warnings,
        topUsedCalls: this.getTopUsedCalls(usage),
        dataSource: usage.source,
        isEstimated: usage.source !== 'ebay_api',
      };
    } catch (error) {
      console.error('Error getting usage summary:', error);
      throw error;
    }
  }

  /**
   * Get top used API calls
   */
  getTopUsedCalls(usage) {
    const calls = [];

    Object.entries(usage.dailyLimits).forEach(([callName, data]) => {
      calls.push({
        callName,
        dailyUsed: data.used,
        dailyLimit: data.hardLimit,
        percentUsed: data.percentUsed,
      });
    });

    return calls
      .sort((a, b) => (b.dailyUsed || 0) - (a.dailyUsed || 0))
      .slice(0, 10);
  }

  /**
   * Clear usage cache for a user
   */
  clearCache(userId) {
    const cacheKey = `usage_${userId}`;
    this.usageCache.delete(cacheKey);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.usageCache.clear();
    this.rateLimitCache.clear();
  }

  /**
   * Test eBay API connectivity with enhanced debugging
   */
  async testEbayConnectivity(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.ebay.accessToken) {
        return {
          success: false,
          message: 'No eBay credentials found',
        };
      }

      console.log(`🔍 Testing eBay connectivity for user: ${userId}`);

      // Test 1: Try Developer Analytics API
      try {
        const analyticsResponse = await axios.get(
          'https://api.ebay.com/developer/analytics/v1_beta/rate_limit/',
          {
            headers: {
              Authorization: `Bearer ${user.ebay.accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        return {
          success: true,
          message: 'eBay Developer Analytics API connectivity successful',
          endpoint: 'analytics',
          statusCode: analyticsResponse.status,
          responseTime: Date.now(),
          rateLimitsAvailable: !!analyticsResponse.data?.rateLimits,
        };
      } catch (analyticsError) {
        console.warn(
          'Analytics API failed, trying fallback:',
          analyticsError.message
        );
      }

      // Test 2: Try multiple endpoints as fallback
      const result = await this.tryMultipleEndpoints(user.ebay.accessToken);

      return {
        success: true,
        message: `eBay API connectivity successful via ${result.endpointType}`,
        endpoint: result.endpoint,
        endpointType: result.endpointType,
        responseTime: Date.now(),
      };
    } catch (error) {
      console.error('❌ eBay connectivity test failed:', error);

      return {
        success: false,
        message: 'eBay API connectivity failed',
        error: error.message,
        possibleSolutions: [
          'Check eBay Developer Program status at https://developer.ebay.com',
          'Verify your API credentials are correct and not expired',
          'Ensure your application has the required OAuth scopes: https://api.ebay.com/oauth/api_scope',
          'Try again in a few minutes (temporary outage)',
          'Check if your application is still active in eBay Developer Console',
        ],
        debugInfo: {
          timestamp: new Date().toISOString(),
          userId: userId,
          hasAccessToken: !!user?.ebay?.accessToken,
          tokenExpiry: user?.ebay?.expiresAt,
          isTokenExpired: user?.ebay?.expiresAt
            ? new Date() > new Date(user.ebay.expiresAt)
            : null,
        },
      };
    }
  }

  /**
   * Check eBay API status from external sources
   */
  async checkEbayApiStatus() {
    try {
      // Check eBay's status page (if publicly accessible)
      const statusChecks = [
        {
          name: 'eBay API Health Check',
          url: 'https://api.ebay.com',
          method: 'GET',
        },
      ];

      const results = [];

      for (const check of statusChecks) {
        try {
          const response = await axios({
            method: check.method,
            url: check.url,
            timeout: 5000,
            validateStatus: () => true, // Don't throw on any status
          });

          results.push({
            name: check.name,
            status: response.status,
            success: response.status < 500,
            message:
              response.status < 500 ? 'Available' : 'Service issues detected',
          });
        } catch (error) {
          results.push({
            name: check.name,
            success: false,
            error: error.message,
            message: 'Connection failed',
          });
        }
      }

      return {
        timestamp: new Date().toISOString(),
        checks: results,
        overallStatus: results.some((r) => r.success) ? 'partial' : 'down',
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
        overallStatus: 'unknown',
      };
    }
  }

  /**
   * Try to get usage via the HTTP headers returned by eBay API calls
   */
  async tryGetUsageViaHeaders(authToken) {
    console.log('📊 Attempting to get usage data from HTTP headers...');

    try {
      const response = await axios.get('https://api.ebay.com/ws/api.dll', {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
          'X-EBAY-API-CALL-NAME': 'GeteBayOfficialTime',
          'X-EBAY-API-SITEID': '0',
          'User-Agent': 'eBayUsageMonitor/1.0',
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 15000,
      });

      // Extract rate limit info from response headers
      const rateLimitHeaders = [
        'X-RateLimit-Daily-Limit',
        'X-RateLimit-Daily-Remaining',
        'X-RateLimit-Hourly-Limit',
        'X-RateLimit-Hourly-Remaining',
      ];

      const rateLimitData = {};

      rateLimitHeaders.forEach((header) => {
        const value = response.headers[header.toLowerCase()];
        if (value) {
          rateLimitData[header] = parseInt(value, 10);
        }
      });

      console.log(
        '✅ Successfully retrieved usage data from headers:',
        rateLimitData
      );

      return {
        timestamp: new Date().toISOString(),
        source: 'http_headers',
        dailyLimits: {
          GetItem: {
            used: rateLimitData['X-RateLimit-Daily-Used'] || 0,
            softLimit: rateLimitData['X-RateLimit-Daily-Limit'] || 0,
            hardLimit: rateLimitData['X-RateLimit-Daily-Limit'] || 0,
            percentUsed:
              rateLimitData['X-RateLimit-Daily-Limit'] > 0
                ? ((rateLimitData['X-RateLimit-Daily-Used'] || 0) /
                    rateLimitData['X-RateLimit-Daily-Limit']) *
                  100
                : 0,
          },
          ReviseInventoryStatus: {
            used: rateLimitData['X-RateLimit-Daily-Used'] || 0,
            softLimit: rateLimitData['X-RateLimit-Daily-Limit'] || 0,
            hardLimit: rateLimitData['X-RateLimit-Daily-Limit'] || 0,
            percentUsed:
              rateLimitData['X-RateLimit-Daily-Limit'] > 0
                ? ((rateLimitData['X-RateLimit-Daily-Used'] || 0) /
                    rateLimitData['X-RateLimit-Daily-Limit']) *
                  100
                : 0,
          },
        },
        hourlyLimits: {
          GetItem: {
            used: rateLimitData['X-RateLimit-Hourly-Used'] || 0,
            softLimit: rateLimitData['X-RateLimit-Hourly-Limit'] || 0,
            hardLimit: rateLimitData['X-RateLimit-Hourly-Limit'] || 0,
            percentUsed:
              rateLimitData['X-RateLimit-Hourly-Limit'] > 0
                ? ((rateLimitData['X-RateLimit-Hourly-Used'] || 0) /
                    rateLimitData['X-RateLimit-Hourly-Limit']) *
                  100
                : 0,
          },
          ReviseInventoryStatus: {
            used: rateLimitData['X-RateLimit-Hourly-Used'] || 0,
            softLimit: rateLimitData['X-RateLimit-Hourly-Limit'] || 0,
            hardLimit: rateLimitData['X-RateLimit-Hourly-Limit'] || 0,
            percentUsed:
              rateLimitData['X-RateLimit-Hourly-Limit'] > 0
                ? ((rateLimitData['X-RateLimit-Hourly-Used'] || 0) /
                    rateLimitData['X-RateLimit-Hourly-Limit']) *
                  100
                : 0,
          },
        },
        warnings: [],
      };
    } catch (error) {
      console.error(
        '❌ Failed to get usage data from HTTP headers:',
        error.message
      );
      throw error;
    }
  }

  /**
   * Record an API call for usage tracking
   */
  async recordAPICall(userId, apiCall) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours();

      // Record daily usage
      await this.EbayUsage.findOneAndUpdate(
        {
          userId: userId || 'system',
          apiCall,
          date: today,
        },
        {
          $inc: { count: 1 },
        },
        { upsert: true }
      );

      // Record hourly usage if hourly limits exist
      if (this.limits[apiCall]?.hourly) {
        await this.EbayUsage.findOneAndUpdate(
          {
            userId: userId || 'system',
            apiCall,
            date: today,
            hour: currentHour,
          },
          {
            $inc: { count: 1 },
          },
          { upsert: true }
        );
      }
    } catch (error) {
      console.error('Error recording API usage:', error);
    }
  }

  /**
   * Get usage statistics for a specific API call
   */
  async getUsageStats(userId, apiCall) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const dailyUsage = await this.EbayUsage.findOne({
        userId: userId || 'system',
        apiCall,
        date: today,
      });

      const limit = this.limits[apiCall];
      const usage = dailyUsage?.count || 0;

      return {
        daily: {
          used: usage,
          limit: limit?.daily || 0,
          remaining: Math.max(0, (limit?.daily || 0) - usage),
          percentUsed: limit?.daily
            ? ((usage / limit.daily) * 100).toFixed(1)
            : '0',
          reset: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: usage >= (limit?.daily || 0) ? 'exceeded' : 'ok',
        },
        hourly: limit?.hourly
          ? {
              // Add hourly stats if needed
            }
          : null,
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return null;
    }
  }
}

// Export singleton instance
const ebayUsageService = new EbayUsageService();
export default ebayUsageService;

// Named exports for individual functions
export const {
  getAPIUsage,
  canMakeAPICall,
  getUsageSummary,
  clearCache,
  clearAllCaches,
  testEbayConnectivity,
} = ebayUsageService;
