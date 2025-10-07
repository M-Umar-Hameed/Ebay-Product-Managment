// services/itemService.js

import axios from 'axios';
import xml2js from 'xml2js';
import { refreshUserAccessToken } from './ebayAuthService.js';
import User from '../models/Users.js';

/**
 * Helper: ensure the user’s eBay accessToken is fresh.
 * If missing or expired, calls refreshUserAccessToken() and saves to Mongo.
 */
async function ensureValidEbayToken(userId) {
  const user = await User.findById(userId);
  if (!user || !user.ebay.refreshToken) {
    throw new Error('No eBay credentials found for this user');
  }
  if (!user.ebay.accessToken || new Date() >= new Date(user.ebay.expiresAt)) {
    const tokenResponse = await refreshUserAccessToken(userId);
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
 * Fetch detailed information about a single eBay item.
 * Returns an object containing Title, PrimaryCategory.CategoryID, StartPrice, etc.
 *
 * @param {String} userId   – ID of the logged‐in user (to get their accessToken)
 * @param {String} itemId   – eBay ItemID to look up
 * @returns {Object}        – Parsed item details from GetItemResponse
 */
export async function getItemDetails(userId, itemId) {
  const accessToken = await ensureValidEbayToken(userId);

  const xmlRequest = `
    <?xml version="1.0" encoding="utf-8"?>
    <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${accessToken}</eBayAuthToken>
      </RequesterCredentials>
      <ItemID>${itemId}</ItemID>
      <DetailLevel>ReturnAll</DetailLevel>
      <IncludeItemSpecifics>true</IncludeItemSpecifics>
    </GetItemRequest>
  `;

  const response = await axios.post(
    'https://api.ebay.com/ws/api.dll',
    xmlRequest,
    {
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-SITEID': '0',
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 20000,
    }
  );

  const parsed = await new xml2js.Parser({
    explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix],
  }).parseStringPromise(response.data);

  const item = parsed.GetItemResponse?.Item;
  if (!item) {
    throw new Error(`Item ${itemId} not found`);
  }

  // Return the raw item object—caller can read item.Title, item.PrimaryCategory.CategoryID, etc.
  return {
    itemId: item.ItemID,
    title: item.Title,
    categoryId: item.PrimaryCategory?.CategoryID || null,
    startPrice: parseFloat(
      item.StartPrice?.__value__ || item.StartPrice?.Value || 0
    ),
    currency: item.StartPrice?.__attributes__?.currencyID || 'USD',
    listingType: item.ListingType,
    listingStatus: item.ListingStatus,
    quantity: parseInt(item.Quantity || 0, 10),
    quantitySold: parseInt(item.QuantitySold || 0, 10),
    startTime: item.StartTime,
    endTime: item.EndTime,
    specifics: (() => {
      const specs = item.ItemSpecifics?.NameValueList;
      if (!specs) return {};
      const arr = Array.isArray(specs) ? specs : [specs];
      return arr.reduce((acc, s) => {
        const value =
          s.Value ||
          (Array.isArray(s.ValueList?.Value)
            ? s.ValueList.Value
            : [s.ValueList?.Value]);
        acc[s.Name] = value;
        return acc;
      }, {});
    })(),
    images: item.PictureDetails?.PictureURL
      ? Array.isArray(item.PictureDetails.PictureURL)
        ? item.PictureDetails.PictureURL
        : [item.PictureDetails.PictureURL]
      : [],
  };
}
