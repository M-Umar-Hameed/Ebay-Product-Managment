import ebayApi from '../helper/authEbay.js';
import axios from 'axios';
import xml2js from 'xml2js';
import dotenv from 'dotenv';
import User from '../models/Users.js';

dotenv.config();

// Example: Get all inventory items from your eBay store

const getInventoryItem = async (req, res) => {
  try {
    const itemId = req.params.id;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in query parameters',
      });
    }

    // Get user's eBay token
    const user = await User.findById(userId);
    if (!user || !user.ebay.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found for this user',
      });
    }

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
      <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${user.ebay.accessToken}</eBayAuthToken>
        </RequesterCredentials>
        <ItemID>${itemId}</ItemID>
        <DetailLevel>ReturnAll</DetailLevel>
        <WarningLevel>High</WarningLevel>
      </GetItemRequest>`;

    const { data: xmlResponse } = await axios.post(
      'https://api.ebay.com/ws/api.dll',
      xmlPayload,
      {
        headers: {
          'Content-Type': 'text/xml',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-DEV-NAME': process.env.DEV_ID,
          'X-EBAY-API-APP-NAME': process.env.CLIENT_ID,
          'X-EBAY-API-CERT-NAME': process.env.CLIENT_SECRET,
          'X-EBAY-API-CALL-NAME': 'GetItem',
          'X-EBAY-API-SITEID': '0',
        },
      }
    );

    // Convert XML to JS object
    const itemData = await xml2js.parseStringPromise(xmlResponse, {
      explicitArray: false,
    });

    return res.status(200).json({
      success: true,
      itemData,
    });
  } catch (error) {
    const errorMessage = error.response ? error.response.data : error.message;
    const statusCode = error.response ? error.response.status : 500;

    return res.status(statusCode).json({
      success: false,
      message: 'Error fetching product',
      error: errorMessage,
    });
  }
};

const getActiveListings = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in query parameters',
      });
    }

    // Get user's eBay token
    const user = await User.findById(userId);
    if (!user || !user.ebay.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No eBay credentials found for this user',
      });
    }

    const authToken = user.ebay.accessToken; // Make sure this is set

    // Simple XML request
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
      <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${authToken}</eBayAuthToken>
        </RequesterCredentials>
        <ActiveList>
          <Include>true</Include>
        </ActiveList>
      </GetMyeBaySellingRequest>`;

    // Make the API call
    const response = await axios({
      method: 'POST',
      url: 'https://api.ebay.com/ws/api.dll', // or sandbox URL
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1119',
        'X-EBAY-API-APP-NAME': process.env.CLIENT_ID,
      },
      data: xmlRequest,
    });

    // Parse the XML response
    const result = await new Promise((resolve, reject) => {
      const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: true,
      });

      parser.parseString(response.data, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching listings via Trading API',
      error: error.message,
    });
  }
};

const getActiveListingsViaFeed = async (req, res) => {
  try {
    // Create a feed request with the correct feedType
    const createFeedResponse = await ebayApi({
      method: 'POST',
      url: '/sell/feed/v1/task',
      data: {
        feedType: 'ACTIVE_INVENTORY_REPORT', // This is the correct value for active listings
        schemaVersion: '1.0',
      },
    });

    if (!createFeedResponse || !createFeedResponse.taskId) {
      throw new Error('Failed to create feed task - no taskId returned');
    }

    const taskId = createFeedResponse.taskId;

    // In a real-world scenario, you would implement polling here
    // since feed generation can take some time. For this example,
    // we'll just return the taskId and instruct the client to check later.

    return res.status(202).json({
      success: true,
      message: 'Feed generation initiated',
      taskId: taskId,
      instructions:
        'Check the feed status using the GET /sell/feed/v1/task/{taskId} endpoint, then download the report when ready.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching listing feed',
      error: error.response?.data || error.message,
    });
  }
};

export default {
  getInventoryItem,
  getActiveListings,
  getActiveListingsViaFeed,
};
