// services/ebayAuthService.js
import axios from 'axios';
import qs from 'qs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SCOPES =
  process.env.EBAY_OAUTH_SCOPES || 'https://api.ebay.com/oauth/api_scope';

import User from '../models/Users.js';

// Log environment variables on module load for debugging
console.log('🔧 eBay Auth Service - Environment variables loaded:', {
  CLIENT_ID: CLIENT_ID?.substring(0, 10) + '...',
  CLIENT_SECRET: CLIENT_SECRET?.substring(0, 10) + '...',
  REDIRECT_URI: REDIRECT_URI,
  hasClientId: !!CLIENT_ID,
  hasClientSecret: !!CLIENT_SECRET,
  hasRedirectUri: !!REDIRECT_URI,
});

/**
 * Build the URL you redirect your frontend user to, for them to consent on eBay.
 */
export function getEbayAuthUrl(stateJwt) {
  const base = 'https://auth.ebay.com/oauth2/authorize';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state: stateJwt,
  });
  return `${base}?${params.toString()}`;
}

/**
 * Exchange the authorization code that eBay gives us
 * for an access token + refresh token.
 * Returns { access_token, refresh_token, expires_in }.
 */
export async function exchangeCodeForToken(code, userId) {
  try {
    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';

    // Validate environment variables
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error('❌ Environment variables at exchange time:', {
        CLIENT_ID: !!CLIENT_ID,
        CLIENT_SECRET: !!CLIENT_SECRET,
        REDIRECT_URI: !!REDIRECT_URI,
        processEnvClientId: !!process.env.CLIENT_ID,
        processEnvClientSecret: !!process.env.CLIENT_SECRET,
        processEnvRedirectUri: !!process.env.REDIRECT_URI,
      });
      throw new Error(
        'Missing eBay OAuth environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)'
      );
    }

    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      'base64'
    );

    const data = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    };

    console.log('🔄 Making token exchange request:', {
      tokenUrl,
      grant_type: data.grant_type,
      redirect_uri: data.redirect_uri,
      codeLength: code?.length,
      userId,
      clientId: CLIENT_ID?.substring(0, 10) + '...',
      clientSecretLength: CLIENT_SECRET?.length,
      basicAuthLength: basicAuth?.length,
    });

    const response = await axios.post(tokenUrl, qs.stringify(data), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    });

    console.log('✅ eBay token response received:', {
      status: response.status,
      hasAccessToken: !!response.data.access_token,
      hasRefreshToken: !!response.data.refresh_token,
      expiresIn: response.data.expires_in,
    });

    // 1) Save tokens on the User model:
    const tokens = response.data; // { access_token, refresh_token, expires_in, … }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const updateResult = await User.findByIdAndUpdate(userId, {
      $set: {
        'ebay.accessToken': tokens.access_token,
        'ebay.refreshToken': tokens.refresh_token,
        'ebay.expiresAt': expiresAt,
      },
    });

    if (!updateResult) {
      throw new Error('Failed to update user with eBay tokens');
    }

    console.log('✅ Tokens saved to MongoDB for user:', userId);
    return tokens;
  } catch (err) {
    console.error('[exchangeCodeForToken] ERROR:', {
      message: err.message,
      response: err?.response?.data,
      status: err?.response?.status,
      config: {
        url: err?.config?.url,
        method: err?.config?.method,
        headers: err?.config?.headers ? 'present' : 'missing',
        data: err?.config?.data ? qs.parse(err.config.data) : 'missing',
      },
    });
    throw err;
  }
}

/**
 * Use a stored refresh token to get a new access token
 */
export async function refreshUserAccessToken(userId) {
  // 1) Load the user’s refreshToken from User.ebay
  const user = await User.findById(userId).select(
    'ebay.refreshToken ebay.expiresAt'
  );
  if (!user || !user.ebay.refreshToken) {
    throw new Error('No refresh token available for user');
  }
  const oldRefreshToken = user.ebay.refreshToken;

  // 2) Make the refresh request
  const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    'base64'
  );
  const data = {
    grant_type: 'refresh_token',
    refresh_token: oldRefreshToken,
    scope: SCOPES,
  };

  const response = await axios.post(tokenUrl, qs.stringify(data), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
  });

  const tokens = response.data; // { access_token, refresh_token?, expires_in, … }
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // 3) Save them back onto user.ebay
  const updateFields = {
    'ebay.accessToken': tokens.access_token,
    'ebay.expiresAt': expiresAt,
  };
  if (tokens.refresh_token) {
    updateFields['ebay.refreshToken'] = tokens.refresh_token;
  }
  await User.findByIdAndUpdate(userId, { $set: updateFields });

  return tokens;
}
