// helper/ebayXMLapi.js
import axios from 'axios';
import xml2js from 'xml2js';
import { refreshUserAccessToken } from '../services/ebayAuthService.js';
import User from '../models/Users.js';

export default async function ebayTradingApi({
  userId,
  callname,
  params = {},
  production = process.env.NODE_ENV === 'production',
}) {
  // 1) Load & refresh token if needed (now from User.ebay sub‐document)
  const user = await User.findById(userId).select(
    'ebay.accessToken ebay.refreshToken ebay.expiresAt'
  );
  if (!user) throw new Error('User not found');
  const tokenRecord = user.ebay;
  if (
    !tokenRecord.accessToken ||
    !tokenRecord.refreshToken ||
    !tokenRecord.expiresAt
  ) {
    throw new Error('No eBay tokens stored for this user');
  }

  // If accessToken is expiring (within 5 minutes), refresh via ebayAuthService
  if (Date.now() >= tokenRecord.expiresAt.getTime() - 5 * 60 * 1000) {
    const newTokens = await refreshUserAccessToken(userId);
    tokenRecord.accessToken = newTokens.access_token;
    tokenRecord.expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
    if (newTokens.refresh_token) {
      tokenRecord.refreshToken = newTokens.refresh_token;
    }
    await user.save();
  }
  const token = tokenRecord.accessToken;

  // 2) Build XML envelope with the fresh token
  let xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<${callname}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>`;

  // If calling GetMyeBaySelling, include ActiveList params
  if (callname === 'GetMyeBaySelling' && params.ActiveList) {
    xmlRequest += `
  <ActiveList>
    <Include>${params.ActiveList.Include}</Include>
    <Pagination>
      <EntriesPerPage>${params.ActiveList.Pagination.EntriesPerPage}</EntriesPerPage>
      <PageNumber>${params.ActiveList.Pagination.PageNumber}</PageNumber>
    </Pagination>
  </ActiveList>`;
  }

  // If calling GetItem, include ItemID, DetailLevel, etc.
  if (callname === 'GetItem' && params.ItemID) {
    xmlRequest += `
  <ItemID>${params.ItemID}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>`;
  }

  // If calling ReviseInventoryStatus, include InventoryStatus fields
  if (callname === 'ReviseInventoryStatus' && params.InventoryStatus) {
    xmlRequest += `
  <InventoryStatus>
    <ItemID>${params.InventoryStatus.ItemID}</ItemID>
    ${
      params.InventoryStatus.SKU
        ? `<SKU>${params.InventoryStatus.SKU}</SKU>`
        : ''
    }
    ${
      params.InventoryStatus.StartPrice
        ? `<StartPrice>${params.InventoryStatus.StartPrice}</StartPrice>`
        : ''
    }
    ${
      params.InventoryStatus.Quantity !== undefined
        ? `<Quantity>${params.InventoryStatus.Quantity}</Quantity>`
        : ''
    }
  </InventoryStatus>`;
  }

  // Close the root element
  xmlRequest += `
</${callname}Request>`;

  // 3) Choose endpoint & headers
  const endpoint = production
    ? 'https://api.ebay.com/ws/api.dll'
    : 'https://api.sandbox.ebay.com/ws/api.dll';

  const headers = {
    'Content-Type': 'text/xml',
    'X-EBAY-API-CALL-NAME': callname,
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '1119',
    'X-EBAY-API-APP-NAME': process.env.CLIENT_ID,
  };

  // 4) Send request via axios
  const { data: rawXml } = await axios.post(endpoint, xmlRequest, {
    headers,
    timeout: 30000,
  });

  // 5) Parse XML → JS object
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const parsed = await parser.parseStringPromise(rawXml);
  const responseKey = Object.keys(parsed).find((k) => k.endsWith('Response'));
  const responseObj = parsed[responseKey];

  // 6) Check eBay Ack
  if (responseObj.Ack !== 'Success' && responseObj.Ack !== 'Warning') {
    const errs = Array.isArray(responseObj.Errors)
      ? responseObj.Errors
      : [responseObj.Errors];
    throw new Error(JSON.stringify(errs));
  }

  // 7) Special‐case “GetMyeBaySelling”
  if (responseKey === 'GetMyeBaySellingResponse' && responseObj.ActiveList) {
    const totalEntries = parseInt(
      responseObj.ActiveList.PaginationResult?.TotalNumberOfEntries || '0',
      10
    );
    let items = [];
    if (
      responseObj.ActiveList.ItemArray &&
      responseObj.ActiveList.ItemArray.Item
    ) {
      items = Array.isArray(responseObj.ActiveList.ItemArray.Item)
        ? responseObj.ActiveList.ItemArray.Item
        : [responseObj.ActiveList.ItemArray.Item];
    }
    return { total: totalEntries, entries: items };
  }

  // 8) All other calls return the raw response object
  return responseObj;
}
