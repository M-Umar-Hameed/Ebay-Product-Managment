// controllers/authController.js
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {
  getEbayAuthUrl,
  exchangeCodeForToken,
} from '../services/ebayAuthService.js';
import {
  generateJwtForUser,
  verifyStateJwt,
} from '../middleware/authMiddleware.js';

const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * { email, password }
 */
export async function registerUser(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: 'Email already in use' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = new User({ email, password: hashed });
    await user.save();

    // Issue a JWT right away (optional) or prompt frontend to login
    const token = generateJwtForUser(user);
    return res.status(201).json({
      success: true,
      message: 'User registered',
      token,
      user: { id: user._id, email: user.email },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Error registering user' });
  }
}

/**
 * POST /api/auth/login
 * { email, password }
 */
export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateJwtForUser(user);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user._id, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Error logging in' });
  }
}

/**
 * POST /api/auth/logout
 * (Since we use stateless JWT, logout is done client-side by deleting the token.
 *  You can optionally maintain a token blacklist, but here we simply respond with 200.)
 */
export async function logoutUser(req, res) {
  return res
    .status(200)
    .json({ success: true, message: 'Logged out (delete token on client)' });
}

/**
 * GET /api/auth/ebay/connect
 *   → Protected: user must send Authorization: Bearer <token>.
 *   → Responds with a JSON containing the eBay OAuth URL to which the frontend should redirect.
 */
export function connectEbay(req, res) {
  try {
    // req.user was populated by requireAuth middleware
    const stateJwt = generateJwtForUser({
      id: req.user.id,
      email: req.user.email,
    });
    const authUrl = getEbayAuthUrl(stateJwt);
    return res.status(200).json({ success: true, authUrl });
  } catch (error) {
    console.error('connectEbay error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Error generating eBay auth URL' });
  }
}

/**
 * GET /api/auth/ebay/callback
 *   Called by eBay with query params: code=<authCode>&state=<stateJwt>
 *   We verify stateJwt, find the user, exchange code for tokens, and save them.
 */
export async function ebayCallback(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing code or state' });
    }

    // 1. Verify the state JWT to identify which internal user
    let payload;
    try {
      payload = verifyStateJwt(state);
    } catch (err) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid state token' });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    // 2. Exchange eBay "code" for tokens
    const tokenData = await exchangeCodeForToken(code);
    // tokenData = { access_token, refresh_token, expires_in, ... }

    // 3. Save tokens to this user
    user.ebay.accessToken = tokenData.access_token;
    user.ebay.refreshToken = tokenData.refresh_token;
    user.ebay.expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    await user.save();

    // 4. Redirect back to your frontend (e.g., to a successful‐connection page)
    // You can encode a short message or just redirect to a fixed URL.
    return res.redirect(`${process.env.FRONTEND_URL}/ebay‐connected`);
  } catch (error) {
    console.error('ebayCallback error:', error.response || error);
    return res
      .status(500)
      .json({ success: false, message: 'Error in eBay callback' });
  }
}
