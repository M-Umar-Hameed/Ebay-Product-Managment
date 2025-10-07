// services/inventoryService.js
import axios from 'axios';
import xml2js from 'xml2js';
import User from '../models/Users.js';
import Product from '../models/Product.js';
import ManualCompetitor from '../models/ManualCompetitor.js';

/**
 * Fetch the live price of any eBay item using Trading API GetItem
 */
async function fetchEbayListingPrice(itemId, authToken) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
    <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${authToken}</eBayAuthToken>
      </RequesterCredentials>
      <ItemID>${itemId}</ItemID>
      <DetailLevel>ReturnAll</DetailLevel>
    </GetItemRequest>`;
  const endpoint =
    process.env.NODE_ENV === 'production'
      ? 'https://api.ebay.com/ws/api.dll'
      : 'https://api.sandbox.ebay.com/ws/api.dll';

  const res = await axios.post(endpoint, xml, {
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
    },
  });
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const { Item } =
    (await parser.parseStringPromise(res.data)).GetItemResponse || {};

  // try BuyItNowPrice, then StartPrice, then CurrentPrice
  const priceNode =
    Item?.BuyItNowPrice ||
    Item?.StartPrice ||
    Item?.SellingStatus?.CurrentPrice;

  if (!priceNode) throw new Error('No price found on eBay response');
  return parseFloat(priceNode.Value || priceNode);
}

/**
 * Refresh _all_ manual competitor prices for a given listing in Mongo _before_
 * you compute lowest or alarm your repricer.
 */
export async function refreshManualCompetitorPrices(itemId, userId) {
  console.log(`🔄 [refresh] called for ${itemId} / user ${userId}`);
  const doc = await ManualCompetitor.findOne({ userId, itemId });
  if (!doc) return;

  // 1) get fresh OAuth token
  const { access_token: token } = await getValidTokenForUser(userId);

  // 2) XML parser
  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: false,
  });

  let changed = false;

  for (let comp of doc.competitors) {
    try {
      // 3) ask eBay for that competitor item
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${token}</eBayAuthToken>
          </RequesterCredentials>
          <ItemID>${comp.competitorItemId}</ItemID>
          <DetailLevel>ReturnAll</DetailLevel>
        </GetItemRequest>`;

      const endpoint =
        process.env.NODE_ENV === 'production'
          ? 'https://api.ebay.com/ws/api.dll'
          : 'https://api.sandbox.ebay.com/ws/api.dll';

      const resp = await axios.post(endpoint, xml, {
        headers: {
          'Content-Type': 'text/xml',
          'X-EBAY-API-CALL-NAME': 'GetItem',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
        },
      });

      // 4) parse
      const result = await parser.parseStringPromise(resp.data);
      const item = result.GetItemResponse?.Item;
      if (!item) continue;

      // 5) drill into SellingStatus.CurrentPrice
      const cp = item.SellingStatus?.CurrentPrice;
      // sometimes price is in cp._ or cp.__value__ or cp._
      let newPrice = null;
      if (cp) {
        newPrice =
          parseFloat(cp._) ||
          parseFloat(cp.__value__) ||
          parseFloat(cp.Value) ||
          NaN;
      }

      // fallback to StartPrice or BuyItNowPrice
      if ((!newPrice || isNaN(newPrice)) && item.StartPrice) {
        newPrice = parseFloat(
          item.StartPrice._ ||
            item.StartPrice.__value__ ||
            item.StartPrice.Value
        );
      }
      if ((!newPrice || isNaN(newPrice)) && item.BuyItNowPrice) {
        newPrice = parseFloat(
          item.BuyItNowPrice._ ||
            item.BuyItNowPrice.__value__ ||
            item.BuyItNowPrice.Value
        );
      }

      // 6) if it’s a real number, and different than we've stored, overwrite
      if (!isNaN(newPrice) && newPrice > 0 && comp.price !== newPrice) {
        comp.price = newPrice;
        changed = true;
      }
    } catch (err) {
      console.warn(
        `Failed to refresh price for competitor ${comp.competitorItemId}:`,
        err.message
      );
    }
  }

  if (changed) {
    await doc.save();
    console.log(`🔄 Manual competitor prices updated for ${itemId}`);
  }
}

/**
 * Get competitor prices for a specific item
 * (now with live refresh baked in)
 */
export async function getCompetitorPrice(itemId, userId = null) {
  const ManualCompetitor = (await import('../models/ManualCompetitor.js'))
    .default;

  // determine actual userId
  const uid = userId || process.env.DEFAULT_USER_ID;
  if (!uid) {
    throw new Error('No userId provided or defaulted');
  }

  // 1) Pull live prices for every manual competitor
  await refreshManualCompetitorPrices(itemId, uid);

  // 2) Re-fetch the doc (with updated prices)
  const doc = await ManualCompetitor.findOne({ itemId, userId: uid });
  if (doc?.competitors?.length) {
    const prices = doc.competitors
      .map((c) => parseFloat(c.price))
      .filter((p) => !isNaN(p) && p > 0);

    if (prices.length) {
      const lowest = Math.min(...prices);
      return {
        success: true,
        price: lowest.toFixed(2),
        count: prices.length,
        allPrices: prices,
        productInfo: doc.competitors,
        source: 'manual_competitors',
      };
    }
  }

  // fallback if no manual
  return {
    success: false,
    price: '0.00',
    count: 0,
    allPrices: [],
    productInfo: [],
    source: 'no_competitors',
    message: 'No manual competitors found',
  };
}

/**
 * Get updated price for an item if it exists - simplified version
 */
function getUpdatedPrice(itemId, sku) {
  // For now, just return null since we're updating eBay directly
  // The frontend should get the latest price from eBay API calls
  return null;
}

/**
 * Get active eBay listings using Trading API
 */
export async function getActiveListings(userId = null) {
  try {
    // Always require userId
    const targetUserId = userId || process.env.DEFAULT_USER_ID;
    if (!targetUserId) {
      throw new Error('User ID is required for fetching eBay listings');
    }

    console.log(`🔍 Fetching active listings for user: ${targetUserId}`);

    // Get eBay access token for the user
    const tokenData = await getValidTokenForUser(targetUserId);

    if (!tokenData || !tokenData.access_token) {
      throw new Error('No eBay access token available');
    }

    // Make request to eBay API
    const response = await ebayApiRequest('/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-IAF-TOKEN': tokenData.access_token,
        'Content-Type': 'text/xml',
      },
      data: `<?xml version="1.0" encoding="utf-8"?>
        <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${tokenData.access_token}</eBayAuthToken>
          </RequesterCredentials>
          <ActiveList>
            <Include>true</Include>
            <Pagination>
              <EntriesPerPage>200</EntriesPerPage>
              <PageNumber>1</PageNumber>
            </Pagination>
          </ActiveList>
          <OutputSelector>ActiveList.ItemArray.Item.ItemID</OutputSelector>
          <OutputSelector>ActiveList.ItemArray.Item.Title</OutputSelector>
          <OutputSelector>ActiveList.ItemArray.Item.BuyItNowPrice</OutputSelector>
          <OutputSelector>ActiveList.ItemArray.Item.Quantity</OutputSelector>
          <OutputSelector>ActiveList.ItemArray.Item.SKU</OutputSelector>
          <OutputSelector>ActiveList.ItemArray.Item.SellingStatus</OutputSelector>
          <OutputSelector>ActiveList.ItemArray.Item.ConditionDisplayName</OutputSelector>
        </GetMyeBaySellingRequest>`,
    });

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    console.error('❌ Error in getActiveListings:', error);
    return {
      success: false,
      error: `Failed to fetch eBay listings: ${error.message}`,
    };
  }
}

/**
 * Update eBay listing price using Trading API directly
 * THIS IS ONLY CALLED BY STRATEGY SERVICE - NOT MANUAL EDITING
 */
export async function updateEbayPrice(itemId, sku, newPrice, userId = null) {
  try {
    console.log(
      `🔄 [INVENTORY] Attempting to update eBay price for ${itemId} to $${newPrice} (sku: ${sku}, userId: ${userId})`
    );

    // Get user with eBay credentials
    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }

    if (!user || !user.ebay?.accessToken) {
      user = await User.findOne({ 'ebay.accessToken': { $exists: true } });
    }

    if (!user || !user.ebay.accessToken) {
      console.error('❌ No eBay credentials found');
      return {
        success: false,
        itemId,
        newPrice,
        message: 'No eBay credentials available',
        error: 'No eBay token',
        requiresReauth: true,
      };
    }

    // Check if token is expired
    if (user.ebay.expiresAt && new Date() >= user.ebay.expiresAt) {
      console.warn('⚠️ eBay token expired, attempting refresh...');

      if (user.ebay.refreshToken) {
        try {
          const refreshResult = await refreshEbayToken(user.ebay.refreshToken);
          if (refreshResult.access_token) {
            user.ebay.accessToken = refreshResult.access_token;
            user.ebay.expiresAt = new Date(
              Date.now() + refreshResult.expires_in * 1000
            );
            await user.save();
            console.log('✅ eBay token refreshed successfully');
          } else {
            throw new Error('No access token in refresh response');
          }
        } catch (refreshError) {
          console.error('❌ Token refresh failed:', refreshError);
          return {
            success: false,
            itemId,
            newPrice,
            message: 'eBay token expired and refresh failed',
            error: 'Token refresh failed',
            requiresReauth: true,
          };
        }
      } else {
        return {
          success: false,
          itemId,
          newPrice,
          message: 'eBay token expired - please re-authenticate',
          error: 'Token expired',
          requiresReauth: true,
        };
      }
    }

    // --- Inventory API logic starts here ---
    const product = await Product.findOne({ itemId, userId: user._id });
    const offerId = product && product.offerId;
    if (!offerId) {
      console.warn(
        `[INVENTORY] No offerId for ${itemId}, falling back to Trading API`
      );
      // Fallback to Trading API ReviseFixedPriceItem
      const result = await reviseViaTradingAPI(
        itemId,
        newPrice,
        user.ebay.accessToken
      );
      if (result.success) {
        console.log(
          `✅ Trading API price update successful for item ${itemId}`
        );
      } else {
        console.error(
          `❌ Trading API price update failed for item ${itemId}:`,
          result.error
        );
      }
      return result;
    }

    const client = await getInventoryClient(user.ebay.accessToken);

    console.log(`🔄 Inventory API: updating offer ${offerId} → $${newPrice}`);
    const payload = {
      pricingSummary: {
        price: {
          value: newPrice.toFixed(2),
          currency: 'USD',
        },
      },
    };

    const resp = await client.patch(`/offer/${offerId}/update_price`, payload);

    if (resp.status === 204) {
      console.log(
        `✅ Inventory API price update successful for offer ${offerId}`
      );
      return { success: true, itemId, newPrice, method: 'InventoryAPI' };
    } else {
      console.error(`❌ Inventory API error: ${resp.status}`);
      throw new Error(`Inventory API error: ${resp.status}`);
    }
    // --- Inventory API logic ends here ---
  } catch (error) {
    console.error(`❌ Error updating eBay price for ${itemId}:`, error);

    // Check if it's a 401 or authentication error
    if (error.response?.status === 401 || error.message.includes('token')) {
      return {
        success: false,
        itemId,
        newPrice,
        message: 'eBay authentication failed - please re-authenticate',
        error: 'Authentication failed',
        requiresReauth: true,
      };
    }

    return {
      success: false,
      error: error.message,
      itemId,
      newPrice,
      message: 'Failed to update eBay price',
    };
  }
}

/**
 * Fallback: Revise price via Trading API if no offerId exists
 */
async function reviseViaTradingAPI(itemId, newPrice, authToken) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
    <ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials><eBayAuthToken>${authToken}</eBayAuthToken></RequesterCredentials>
      <Item><ItemID>${itemId}</ItemID><StartPrice>${newPrice}</StartPrice></Item>
    </ReviseFixedPriceItemRequest>`;
  const url =
    process.env.NODE_ENV === 'production'
      ? 'https://api.ebay.com/ws/api.dll'
      : 'https://api.sandbox.ebay.com/ws/api.dll';
  const res = await axios.post(url, xml, {
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-APP-NAME': process.env.CLIENT_ID,
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1119',
    },
  });
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result = await parser.parseStringPromise(res.data);
  const ack = result.ReviseFixedPriceItemResponse.Ack;
  if (ack === 'Success' || ack === 'Warning') {
    return {
      success: true,
      method: 'ReviseFixedPriceItem',
      ebayResponse: result.ReviseFixedPriceItemResponse,
    };
  } else {
    throw new Error(
      result.ReviseFixedPriceItemResponse.Errors?.LongMessage || 'Unknown error'
    );
  }
}

/**
 * Monitor and sync price changes based on strategies
 * @param {String} itemId - The item to monitor
 * @param {String} userId - User ID for eBay credentials
 */
export async function syncPriceWithStrategy(itemId, userId = null) {
  try {
    // Import strategy service to execute pricing logic
    const { executeStrategyForItem } = await import('./strategyService.js');

    const result = await executeStrategyForItem(itemId);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      itemId,
    };
  }
}

/**
 * Get current price of an item from eBay
 * @param {String} itemId - The eBay item ID
 * @param {String} sku - The item SKU
 * @param {String} userId - User ID for eBay credentials
 */
export async function getCurrentEbayPrice(itemId, sku = null, userId = null) {
  try {
    // Always require userId
    if (!userId) {
      return {
        success: false,
        error: 'User ID is required for fetching current eBay price',
        itemId,
        sku,
      };
    }
    const listings = await getActiveListings(userId);

    if (listings.success && listings.data.GetMyeBaySellingResponse) {
      const itemArray =
        listings.data.GetMyeBaySellingResponse.ActiveList?.ItemArray;
      let items = [];

      if (Array.isArray(itemArray?.Item)) {
        items = itemArray.Item;
      } else if (itemArray?.Item) {
        items = [itemArray.Item];
      }

      const item = items.find((i) => i.ItemID === itemId);

      if (item && item.BuyItNowPrice) {
        const currentPrice = parseFloat(item.BuyItNowPrice);
        return {
          success: true,
          price: currentPrice,
          itemId,
          sku: item.SKU || sku,
        };
      }
    }

    return {
      success: false,
      error: 'Item not found or no price available',
      itemId,
      sku,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      itemId,
      sku,
    };
  }
}

/**
 * Get valid eBay token for a user
 * @param {String} userId - The user ID
 */
async function getValidTokenForUser(userId) {
  try {
    const user = await User.findById(userId);

    if (!user || !user.ebay || !user.ebay.accessToken) {
      throw new Error('No eBay access token found for user');
    }

    // Check if token is expired
    if (user.ebay.expiresAt && new Date() >= user.ebay.expiresAt) {
      // Try to refresh the token
      if (user.ebay.refreshToken) {
        try {
          const refreshResult = await refreshEbayToken(user.ebay.refreshToken);
          if (refreshResult.access_token) {
            // Update user with new token
            user.ebay.accessToken = refreshResult.access_token;
            user.ebay.expiresAt = new Date(
              Date.now() + refreshResult.expires_in * 1000
            );
            await user.save();

            return {
              access_token: refreshResult.access_token,
              expires_in: refreshResult.expires_in,
            };
          }
        } catch (refreshError) {
          console.error('Failed to refresh eBay token:', refreshError);
          throw new Error('eBay token expired and refresh failed');
        }
      }
      throw new Error('eBay token expired');
    }

    return {
      access_token: user.ebay.accessToken,
      expires_in: user.ebay.expiresAt
        ? Math.floor((user.ebay.expiresAt - new Date()) / 1000)
        : 7200,
    };
  } catch (error) {
    console.error('Error getting valid token for user:', error);
    throw error;
  }
}

/**
 * Refresh eBay token using refresh token
 * @param {String} refreshToken
 */
async function refreshEbayToken(refreshToken) {
  try {
    const response = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      `grant_type=refresh_token&refresh_token=${refreshToken}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error refreshing eBay token:', error);
    throw error;
  }
}

/**
 * Make eBay API request with proper error handling
 * @param {String} endpoint
 * @param {Object} options
 */
// async function ebayApiRequest(endpoint, options) {
//   try {
//     const ebayUrl =
//       process.env.NODE_ENV === 'production'
//         ? `https://api.ebay.com${endpoint}`
//         : `https://api.sandbox.ebay.com${endpoint}`;

//     const response = await axios({
//       url: ebayUrl,
//       ...options,
//     });

//     // Parse XML response
//     const parser = new xml2js.Parser({
//       explicitArray: false,
//       ignoreAttrs: true,
//     });

//     return new Promise((resolve, reject) => {
//       parser.parseString(response.data, (err, result) => {
//         if (err) {
//           reject(err);
//         } else {
//           resolve(result);
//         }
//       });
//     });
//   } catch (error) {
//     console.error('eBay API request failed:', error);
//     throw error;
//   }
// }
/**
 * Make eBay API request with proper error handling
 * @param {String} endpoint
 * @param {Object} options
 */
async function ebayApiRequest(endpoint, options) {
  try {
    const ebayUrl =
      process.env.NODE_ENV === 'production'
        ? `https://api.ebay.com${endpoint}`
        : `https://api.sandbox.ebay.com${endpoint}`;

    const response = await axios({
      url: ebayUrl,
      ...options,
    });

    // Parse XML response
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: true,
    });

    return new Promise((resolve, reject) => {
      parser.parseString(response.data, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  } catch (error) {
    console.error('eBay API request failed:', error);
    throw error;
  }
}

/**
 * Upsert eBay listings for an account
 * @param {Array} listings - The list of listings to upsert
 * @param {String} userId - The user ID
 * @param {String} ebayAccountId - The eBay account ID
 */
async function upsertEbayListingsForAccount(listings, userId, ebayAccountId) {
  const tokenData = await getValidTokenForUser(userId);
  const token = tokenData.access_token;
  const skus = [];

  for (const item of listings) {
    skus.push(item.SKU);
    await Product.findOneAndUpdate(
      { itemId: item.ItemID, ebayAccountId },
      {
        $set: {
          userId,
          ebayAccountId,
          title: item.Title,
          sku: item.SKU,
          // offerId will be hydrated below
          lastFetched: new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }

  // after saving all Products, fetch & store their offerIds
  await hydrateOfferIdsForSkus(
    skus.filter((s) => s),
    token
  );
}

/**
 * Given an array of SKUs, fetch their offerIds and write to Product.offerId
 */
async function hydrateOfferIdsForSkus(skus, userToken) {
  if (!skus || skus.length === 0) return;
  const client = await getInventoryClient(userToken);
  const resp = await client.get('/offer', {
    params: { sku: skus.join(',') },
  });
  if (resp.data && Array.isArray(resp.data.offers)) {
    for (let offer of resp.data.offers) {
      await Product.updateMany(
        { sku: offer.sku },
        { $set: { offerId: offer.offerId } }
      );
    }
  }
}

/**
 * Get Inventory API client
 * @param {String} token - eBay access token
 */
async function getInventoryClient(token) {
  return axios.create({
    baseURL: 'https://api.ebay.com/sell/inventory/v1',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}
