// services/competitorPriceService.js

import axios from 'axios';
import User from '../models/Users.js';
import { refreshUserAccessToken } from './ebayAuthService.js';

/**
 * Ensure the user’s eBay accessToken is valid.
 * If missing or expired, refresh it using their refreshToken.
 * This confirms the user has connected eBay; Browse API itself uses CLIENT_ID.
 */
async function ensureValidEbayToken(userId) {
  const user = await User.findById(userId);
  if (!user || !user.ebay.refreshToken) {
    throw new Error('No eBay credentials found for this user');
  }
  if (!user.ebay.accessToken || new Date() >= new Date(user.ebay.expiresAt)) {
    const tokenResponse = await refreshUserAccessToken(user.ebay.refreshToken);
    user.ebay.accessToken = tokenResponse.access_token;
    user.ebay.refreshToken =
      tokenResponse.refresh_token || user.ebay.refreshToken;
    user.ebay.expiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000
    );
    await user.save();
  }
  return user.ebay.accessToken;
}

/**
 * Fetch competitor prices via eBay Browse API.
 *
 * @param {String} userId      – ID of logged‐in user (to confirm eBay is connected)
 * @param {String} itemId      – The eBay item being repriced
 * @param {String} title       – The item’s title (used as query)
 * @param {String} categoryId  – The item’s primary category ID
 *
 * @returns {Object} {
 *   allData: [ { id, title, price, shipping, imageurl, seller, condition, productUrl, locale } ],
 *   lowestPrice: Number,
 *   allPrices: [Number]
 * }
 */
export async function fetchCompetitorPrices(userId, itemId, title, categoryId) {
  // 1) Confirm user’s eBay connection (refresh if needed)
  await ensureValidEbayToken(userId);

  // 2) Build Browse API query
  const appId = process.env.CLIENT_ID;
  if (!appId) {
    throw new Error('Missing CLIENT_ID in environment');
  }

  const params = new URLSearchParams({
    q: title || '',
    category_ids: categoryId || '',
    limit: 20,
    sort: 'price',
  });

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`;

  // 3) Call Browse API
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${appId}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  const items = response.data.itemSummaries || [];

  // 4) Filter out the user’s own itemId, extract prices + data
  const competitorItems = items.filter((i) => i.itemId !== itemId);

  const allPrices = competitorItems
    .map((i) => {
      const priceValue = parseFloat(i.price?.value || '0');
      const shippingValue = parseFloat(
        i.shippingOptions?.[0]?.shippingCost?.value || '0'
      );
      return +(priceValue + shippingValue).toFixed(2);
    })
    .filter((p) => !isNaN(p) && p > 0);

  return {
    allData: competitorItems.map((i) => ({
      id: i.itemId,
      title: i.title,
      price: parseFloat(i.price?.value || '0'),
      shipping:
        parseFloat(i.shippingOptions?.[0]?.shippingCost?.value || '0') || 0,
      imageurl: i.thumbnailImages?.[0]?.imageUrl || '',
      seller: i.seller?.username || '',
      condition: i.condition || '',
      productUrl: i.itemWebUrl,
      locale: i.itemLocation?.country || '',
    })),
    lowestPrice: allPrices.length > 0 ? Math.min(...allPrices) : 0,
    allPrices,
  };
}
