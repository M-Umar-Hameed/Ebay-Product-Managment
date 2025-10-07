import User from '../models/Users.js';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
dotenv.config();

const authenticateUser = async (req, res, next) => {
  const bearerToken = req.headers?.authorization;
  const token = bearerToken?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * Programmatically generates an eBay authorization code by automating the OAuth flow
 * @param {Object} options Configuration options
 * @param {string} options.username eBay username/email
 * @param {string} options.password eBay password
 * @param {boolean} options.headless Run browser in headless mode (default: true)
 * @returns {Promise<string>} The authorization code
 */

export async function generateEbayAuthCode(options = {}) {
  const {
    username = process.env.EBAY_USERNAME,
    password = process.env.EBAY_PASSWORD,
    headless = false,
    timeout = 300000, // 5 minutes default
  } = options;

  if (!username || !password) {
    throw new Error('eBay username and password are required');
  }

  const clientId = process.env.CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.REDIRECT_URI);

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
    `&redirect_uri=${redirectUri}` +
    `&scope=${scopes}` +
    `&state=automated`;

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeout);

    await page.goto(authUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('#userid');
    await page.type('#userid', username);
    await page.click('#signin-continue-btn');

    await page.waitForSelector('#pass', { visible: true });
    await page.type('#pass', password);
    await page.click('#sgnBt');

    // Wait for either consent or final redirect page
    await page.waitForFunction(
      () => {
        return window.location.href.includes('code=');
      },
      { timeout }
    );

    const urlWithCode = await page.evaluate(() => window.location.href);

    const codeMatch = urlWithCode.match(/[?&]code=([^&]+)/);
    if (!codeMatch) {
      throw new Error('Authorization code not found in final URL');
    }

    const code = decodeURIComponent(codeMatch[1]);
    return code;
  } catch (error) {
    console.error('Error during eBay authorization:', error);
    if (error.message.includes('timeout')) {
      throw new Error(
        'eBay authorization timed out - possibly due to 2FA or user inaction'
      );
    }
    if (error.message.includes('Execution context was destroyed')) {
      throw new Error(
        'Page navigated too quickly before code could be extracted'
      );
    }
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Express middleware to handle automated auth code generation
 * Usage: app.get('/auth/generate-code', generateCodeMiddleware);
 */

export function generateCodeMiddleware(req, res) {
  const { username, password, headless } = req.query;

  generateEbayAuthCode({
    username,
    password,
    headless: headless !== 'false',
  })
    .then((code) => {
      res.json({
        success: true,
        code,
        message: 'Successfully generated authorization code',
      });
    })
    .catch((error) => {
      res.status(500).json({
        success: false,
        message: 'Failed to generate authorization code',
        error: error.message,
      });
    });
}

/**
 * Express route handler to generate code and immediately exchange it for tokens
 * Usage: app.get('/auth/direct-token', directTokenHandler);
 */
export async function directTokenHandler(req, res) {
  const { username, password, headless } = req.query;

  try {
    // Generate the auth code
    const code = await generateEbayAuthCode({
      username,
      password,
      headless: headless !== 'false',
    });

    // Exchange it for tokens using your existing function
    // This assumes your exchangeCodeForTokens function is accessible here
    // You may need to adjust this part based on your actual code structure
    const tokenResponse = await exchangeCodeForTokens(code);

    res.json({
      success: true,
      ...tokenResponse,
      message: 'Successfully generated token through automated flow',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed in automated token generation',
      error: error.message,
    });
  }
}
