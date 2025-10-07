// routes/authRoute.js
import express from 'express';
import Joi from 'joi';
import qs from 'qs';
import axios from 'axios';
import User from '../models/Users.js';
import sendResponse from '../helper/sendResponse.js'; // utility for consistent JSON replies
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Import our eBay‐OAuth helpers
import {
  exchangeCodeForToken,
  refreshUserAccessToken,
} from '../services/ebayAuthService.js';

import {
  generateEbayAuthCode,
  generateCodeMiddleware,
} from '../middleware/authenticateUser.js';

const router = express.Router();

// Validate eBay credentials at startup
if (
  !process.env.CLIENT_ID ||
  !process.env.CLIENT_SECRET ||
  !process.env.REDIRECT_URI
) {
  console.error('❌ Missing required eBay OAuth environment variables:');
  console.error('CLIENT_ID:', !!process.env.CLIENT_ID);
  console.error('CLIENT_SECRET:', !!process.env.CLIENT_SECRET);
  console.error('REDIRECT_URI:', !!process.env.REDIRECT_URI);
  throw new Error('Missing eBay OAuth environment variables');
}

console.log('✅ eBay OAuth environment variables loaded:', {
  CLIENT_ID: process.env.CLIENT_ID?.substring(0, 10) + '...',
  CLIENT_SECRET: process.env.CLIENT_SECRET?.substring(0, 10) + '...',
  REDIRECT_URI: process.env.REDIRECT_URI,
});

// ── Token Management ────────────────────────────────────────────────────────────

const tokenManager = {
  tokens: { accessToken: null, refreshToken: null, expiryTime: null },

  init(user) {
    this.tokens.accessToken = user?.ebay?.accessToken || null;
    this.tokens.refreshToken = user?.ebay?.refreshToken || null;
    this.tokens.expiryTime = user?.ebay?.expiresAt
      ? new Date(user.ebay.expiresAt)
      : null;
  },

  updateTokens(accessToken, refreshToken, expiresIn) {
    this.tokens.accessToken = accessToken;
    if (refreshToken) this.tokens.refreshToken = refreshToken;
    this.tokens.expiryTime = new Date(Date.now() + expiresIn * 1000);
  },

  isTokenValid() {
    if (!this.tokens.accessToken || !this.tokens.expiryTime) return false;
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
    return this.tokens.expiryTime > fiveMinutesLater;
  },
};

// ─── Health check or placeholder ───────────────────────────────────
router.get('/', (req, res) => {
  return res.status(200).json({
    success: true,
    message:
      'Auth service is live. Available endpoints: /register, /login, /exchange-code, /token, /refresh, /ebay-login',
  });
});

// ─── Validation schema for register/login ───────────────────────
const loginSchema = Joi.object({
  email: Joi.string()
    .email({ minDomainSegments: 2, tlds: ['com', 'net', 'org'] })
    .required(),
  password: Joi.string().min(6).required(),
});

// ─── POST /auth/register ─────────────────────────────────────────
// Create a new user (email + password). The `ebay` sub‐document remains null at first.
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return sendResponse(res, 400, false, error.details[0].message);
    }

    // Check for duplicate email
    const existing = await User.findOne({ email: value.email });
    if (existing) {
      return sendResponse(res, 400, false, 'User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 10);

    // Save new user (ebay.* fields will be null by default)
    const newUser = new User({
      email: value.email,
      password: hashedPassword,
    });
    await newUser.save();

    return sendResponse(res, 201, true, 'User registered successfully', {
      user: { id: newUser._id, email: newUser.email },
    });
  } catch (err) {
    console.error('POST /auth/register error:', err);
    return sendResponse(res, 500, false, 'Registration failed', {
      error: err.message,
    });
  }
});

// ─── POST /auth/login ────────────────────────────────────────────
// Authenticate email/password, return a JWT for your own backend.
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return sendResponse(res, 400, false, error.details[0].message);
    }

    // Check fields exist
    if (!value.email || !value.password) {
      return sendResponse(res, 400, false, 'Email and password are required');
    }

    // Find user by email
    const user = await User.findOne({ email: value.email });
    if (!user) {
      return sendResponse(res, 400, false, 'Invalid email or password');
    }

    // Compare password
    const isValid = await bcrypt.compare(value.password, user.password);
    if (!isValid) {
      return sendResponse(res, 400, false, 'Invalid email or password');
    }

    // Remove password field before signing
    const payload = { id: user._id, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    return sendResponse(res, 200, true, 'Login successful', {
      user: { id: user._id, email: user.email },
      token,
    });
  } catch (err) {
    console.error('POST /auth/login error:', err);
    return sendResponse(res, 500, false, 'Login failed', {
      error: err.message,
    });
  }
});

// ── eBay OAuth Helper Routes ──────────────────────────────────────────────────

// Step 1 of user‐consent flow: Redirect to eBay's authorization page
router.get('/ebay-login', (req, res) => {
  const { userId } = req.query;

  const clientId = process.env.CLIENT_ID;
  const redirect = encodeURIComponent(process.env.REDIRECT_URI);

  const scopes = encodeURIComponent(
    [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    ].join(' ')
  );

  const authUrl =
    `https://auth.ebay.com/oauth2/authorize` +
    `?client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${redirect}` +
    `&scope=${scopes}` +
    `&state=${userId}`;

  res.redirect(authUrl);
});

// Step 2: Handle eBay OAuth callback (updated to match frontend route)
router.get('/popup-callback', (req, res) => {
  const { code, state: userId, error } = req.query;

  console.log('🔄 eBay popup callback received:', {
    hasCode: !!code,
    userId,
    error,
    fullUrl: req.url,
  });

  if (error) {
    console.error('eBay OAuth error:', error);
    return res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                error: '${error}',
                userId: '${userId}'
              }, 'https://17autoparts.com');
              window.close();
            } else {
              document.body.innerHTML = '<h2>Error: ${error}</h2><p>Please close this window and try again.</p>';
            }
          </script>
        </body>
      </html>
    `);
  }

  if (!code || !userId) {
    console.error('Missing code or userId:', { code: !!code, userId });
    return res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                error: 'Missing authorization code or user ID',
                userId: '${userId}'
              }, 'https://17autoparts.com');
              window.close();
            } else {
              document.body.innerHTML = '<h2>Error: Missing authorization code</h2><p>Please close this window and try again.</p>';
            }
          </script>
        </body>
      </html>
    `);
  }

  console.log('✅ Sending code to parent window for user:', userId);

  // Send the code back to the parent window
  res.send(`
    <html>
      <body>
        <script>
          console.log('📨 Sending message to parent with code');
          if (window.opener) {
            window.opener.postMessage({
              code: '${code}',
              state: '${userId}'
            }, 'https://17autoparts.com');
            console.log('✅ Message sent, closing popup');
            window.close();
          } else {
            document.body.innerHTML = '<h2>Authorization successful!</h2><p>Please close this window.</p>';
          }
        </script>
      </body>
    </html>
  `);
});

// Keep the old route for backwards compatibility
router.get('/ebay-callback', (req, res) => {
  // Redirect to the new route
  const queryString = new URLSearchParams(req.query).toString();
  res.redirect(`/auth/popup-callback?${queryString}`);
});

// (Optional) Step 2: "Generate a code automatically" for testing
router.get('/generate-code', generateCodeMiddleware);

// (Optional) Step 2 alternative: "Request an auth code programmatically"
//    and then exchange it for tokens
router.get('/automated-login', async (req, res) => {
  try {
    const code = await generateEbayAuthCode();
    // exchangeCodeForTokens() is defined below
    const tokens = await exchangeCodeForTokens(code);
    res.json({ success: true, ...tokens });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate tokens',
      error: error.message,
    });
  }
});

// ─── POST /auth/exchange-code ─────────────────────────────────────
router.post('/exchange-code', async (req, res) => {
  try {
    const { code, userId } = req.body;

    console.log('🔄 Exchange code request received:', {
      hasCode: !!code,
      codeLength: code?.length,
      userId,
      timestamp: new Date().toISOString(),
    });

    if (!code || !userId) {
      console.error('❌ Missing required parameters:', {
        hasCode: !!code,
        hasUserId: !!userId,
      });
      return sendResponse(res, 400, false, 'Both code and userId are required');
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ User not found:', userId);
      return sendResponse(res, 404, false, 'User not found');
    }

    console.log('✅ User found, proceeding with token exchange...');
    console.log('🔧 Environment check before calling service:', {
      CLIENT_ID: !!process.env.CLIENT_ID,
      CLIENT_SECRET: !!process.env.CLIENT_SECRET,
      REDIRECT_URI: !!process.env.REDIRECT_URI,
    });

    // Call our helper to exchange code ↠ tokens and save them on user.ebay.*
    const tokens = await exchangeCodeForToken(code, userId);

    console.log('✅ Exchange successful, tokens saved for user:', userId);

    return sendResponse(res, 200, true, 'Tokens exchanged successfully', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user_id: userId,
    });
  } catch (err) {
    console.error('❌ POST /auth/exchange-code error:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      stack: err.stack,
    });

    return sendResponse(
      res,
      err.response?.status || 500,
      false,
      err.response?.data?.error_description ||
        err.message ||
        'Failed to exchange code'
    );
  }
});

// ── Token Management / "Get Token" Endpoints ────────────────────────────────────

// GET /auth/token → return user's stored token (refresh if needed)
router.get('/token', async (req, res) => {
  try {
    // Check if it's a user-specific request or system-wide token request
    const { userId } = req.query;

    if (userId) {
      // User-specific token logic (existing code)
      if (!userId) {
        return sendResponse(res, 400, false, 'Missing userId in query');
      }

      // Fetch user and check if an eBay refresh token exists
      const user = await User.findById(userId).select(
        'ebay.refreshToken ebay.expiresAt ebay.accessToken'
      );
      if (!user) {
        return sendResponse(res, 404, false, 'User not found');
      }
      if (!user.ebay.refreshToken) {
        return sendResponse(
          res,
          400,
          false,
          'No refresh token available—authorize first'
        );
      }

      // If token is still valid (5 min buffer)
      const now = Date.now();
      const expiresAt = user.ebay.expiresAt ? user.ebay.expiresAt.getTime() : 0;
      if (expiresAt > now + 5 * 60 * 1000) {
        // Still more than 5 minutes before expiry
        return sendResponse(res, 200, true, 'Token still valid', {
          access_token: user.ebay.accessToken,
          expires_in: Math.floor((expiresAt - now) / 1000),
          expires_at: user.ebay.expiresAt,
        });
      }

      // Otherwise, refresh it now
      const newTokens = await refreshUserAccessToken(userId);
      // refreshUserAccessToken() updates user.ebay.accessToken, refreshToken (if rotated), expiresAt

      return sendResponse(res, 200, true, 'Token refreshed successfully', {
        access_token: newTokens.access_token,
        expires_in: newTokens.expires_in,
        refresh_token: newTokens.refresh_token || user.ebay.refreshToken,
        expires_at: user.ebay.expiresAt,
      });
    } else {
      // System-wide token logic (from original app.js)
      if (tokenManager.isTokenValid()) {
        return res.json({
          success: true,
          auth_token: tokenManager.tokens.accessToken,
          expires_at: tokenManager.tokens.expiryTime,
          expires_in_seconds: Math.floor(
            (tokenManager.tokens.expiryTime - new Date()) / 1000
          ),
        });
      }

      if (tokenManager.tokens.refreshToken) {
        try {
          const auth = await refreshAccessToken();
          return res.json(auth);
        } catch (error) {
          console.error('Token refresh error:', error);
          // fall through to client‐credentials
        }
      }

      // Fall back to client‐credentials flow
      const auth = await getApplicationToken();
      return res.json(auth);
    }
  } catch (error) {
    console.error('GET /auth/token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch or refresh token',
      error: error.message,
    });
  }
});

// GET /auth/application_token → generate a client‐credentials token
router.get('/application_token', async (req, res) => {
  try {
    const auth = await getApplicationToken();
    return res.json(auth);
  } catch (error) {
    console.error('Application token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get application token',
      error: error.message || error,
    });
  }
});

// GET /auth/refresh → manually refresh user's token
router.get('/refresh', async (req, res) => {
  const { userId } = req.query;

  if (userId) {
    // User-specific refresh
    try {
      if (!userId) {
        return sendResponse(res, 400, false, 'Missing userId in query');
      }

      // Check if user has a refresh token
      const user = await User.findById(userId).select('ebay.refreshToken');
      if (!user || !user.ebay.refreshToken) {
        return sendResponse(
          res,
          400,
          false,
          'No refresh token available—authorize first'
        );
      }

      const newTokens = await refreshUserAccessToken(userId);
      return sendResponse(res, 200, true, 'Token refreshed successfully', {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || user.ebay.refreshToken,
        expires_at: user.ebay.expiresAt,
        expires_in_seconds: newTokens.expires_in,
      });
    } catch (err) {
      console.error('GET /auth/refresh error:', err);
      return sendResponse(res, 500, false, 'Failed to refresh token', {
        error: err.message,
      });
    }
  } else {
    // System-wide refresh
    if (!tokenManager.tokens.refreshToken) {
      return res.status(400).json({
        success: false,
        message:
          'No refresh token available. Please complete the authorization flow first.',
        auth_url: '/auth/ebay-login',
      });
    }
    try {
      const auth = await refreshAccessToken();
      return res.json(auth);
    } catch (error) {
      console.error('Token refresh error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to refresh token',
        error: error.message || error,
        auth_url: '/auth/ebay-login',
      });
    }
  }
});

// ─── POST /auth/ebay-logout ─────────────────────────────────────────
// Clear eBay tokens from user's account in MongoDB
router.post('/ebay-logout', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return sendResponse(res, 400, false, 'userId is required');
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    // Clear eBay tokens from the user document
    await User.findByIdAndUpdate(userId, {
      $unset: {
        'ebay.accessToken': 1,
        'ebay.refreshToken': 1,
        'ebay.expiresAt': 1,
      },
    });

    return sendResponse(
      res,
      200,
      true,
      'eBay account disconnected successfully'
    );
  } catch (err) {
    console.error('POST /auth/ebay-logout error:', err);
    return sendResponse(res, 500, false, 'Failed to disconnect eBay account', {
      error: err.message,
    });
  }
});

// ── Helper functions for the above endpoints ──────────────────────────────────

/**
 * Exchange authorization code for tokens,
 * then store them in tokenManager + ENV.
 */
async function exchangeCodeForTokens(code) {
  const creds = Buffer.from(
    `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
  ).toString('base64');

  const body = qs.stringify({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.REDIRECT_URI,
  });

  const { data } = await axios.post(
    `https://api.ebay.com/identity/v1/oauth2/token`,
    body,
    {
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, refresh_token, expires_in } = data;
  tokenManager.updateTokens(access_token, refresh_token, expires_in);

  return {
    success: true,
    auth_token: access_token,
    refresh_token,
    expires_at: tokenManager.tokens.expiryTime,
    expires_in_seconds: expires_in,
    token_type: 'user_token',
  };
}

/**
 * Refresh the user's existing token using refresh_token, and update tokenManager.
 */
async function refreshAccessToken() {
  const creds = Buffer.from(
    `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
  ).toString('base64');

  const body = qs.stringify({
    grant_type: 'refresh_token',
    refresh_token: tokenManager.tokens.refreshToken,
    scope: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    ].join(' '),
  });

  const { data } = await axios.post(
    `https://api.ebay.com/identity/v1/oauth2/token`,
    body,
    {
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, refresh_token, expires_in } = data;
  tokenManager.updateTokens(access_token, refresh_token, expires_in);

  return {
    success: true,
    auth_token: access_token,
    expires_at: tokenManager.tokens.expiryTime,
    expires_in_seconds: expires_in,
    token_type: 'user_token',
  };
}

/**
 * Client‐credentials flow for application tokens (no user context).
 */
async function getApplicationToken() {
  const creds = Buffer.from(
    `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
  ).toString('base64');

  const body = qs.stringify({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });

  const { data } = await axios.post(
    `https://api.ebay.com/identity/v1/oauth2/token`,
    body,
    {
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, expires_in } = data;
  tokenManager.updateTokens(access_token, null, expires_in);

  return {
    success: true,
    auth_token: access_token,
    expires_at: tokenManager.tokens.expiryTime,
    expires_in_seconds: expires_in,
    token_type: 'application_token',
    note: 'This token can only be used for APIs that do not require user consent.',
  };
}

export default router;
