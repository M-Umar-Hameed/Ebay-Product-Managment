// helper/authEbay.js
import axios from 'axios';
import User from '../models/Users.js';
import { refreshUserAccessToken } from '../services/ebayAuthService.js';

/**
 * axios wrapper that automatically refreshes the user’s eBay OAuth token
 * and injects it into REST or XML calls.  Uses User.ebay.* instead of a separate UserTokens collection.
 */
export default async function ebayApi({
  userId,
  method,
  url,
  data,
  params,
  headers = {},
}) {
  // 1) Load the user's eBay tokens from the User document
  const user = await User.findById(userId).select(
    'ebay.accessToken ebay.refreshToken ebay.expiresAt'
  );
  if (!user) {
    throw new Error('User not found');
  }
  const tokenRecord = user.ebay;
  if (
    !tokenRecord.accessToken ||
    !tokenRecord.refreshToken ||
    !tokenRecord.expiresAt
  ) {
    throw new Error('No eBay tokens stored for this user');
  }

  // 2) If token is expiring (or expired), refresh it
  const now = Date.now();
  // (expiresAt is stored as a Date in the schema)
  if (
    !tokenRecord.expiresAt ||
    now >= tokenRecord.expiresAt.getTime() - 5 * 60 * 1000
  ) {
    // within 5 minutes of expiry → refresh
    // refreshUserAccessToken expects (userId) so that it can look up user.ebay.refreshToken
    const newTokens = await refreshUserAccessToken(userId);
    tokenRecord.accessToken = newTokens.access_token;
    tokenRecord.expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
    if (newTokens.refresh_token) {
      tokenRecord.refreshToken = newTokens.refresh_token;
    }
    // Save the updated tokens back onto user.ebay
    await user.save();
  }

  // 3) Handle any XML payload that contains TOKEN_PLACEHOLDER
  let finalData = data;
  if (typeof data === 'string' && data.includes('TOKEN_PLACEHOLDER')) {
    finalData = data.replace('TOKEN_PLACEHOLDER', tokenRecord.accessToken);
  }

  // 4) Issue the actual HTTP request (REST or XML)
  const response = await axios({
    method,
    url,
    data: finalData,
    params,
    headers: {
      ...headers,
      Authorization: `Bearer ${tokenRecord.accessToken}`,
    },
    timeout: 20000,
  });

  return response.data;
}
