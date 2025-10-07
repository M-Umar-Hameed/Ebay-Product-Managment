// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/Users.js';

// Provide a fallback JWT secret if not set in environment
const JWT_SECRET =
  process.env.JWT_SECRET ||
  'fallback_jwt_secret_for_development_only_not_secure';

if (!process.env.JWT_SECRET) {
  console.warn(
    '⚠️  WARNING: JWT_SECRET not set in environment variables. Using fallback secret.'
  );
  console.warn('⚠️  WARNING: This is not secure for production use.');
}

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Check if token is about to expire (within 5 minutes)
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - currentTime;

      if (timeUntilExpiry < 300) {
        // Less than 5 minutes
        console.warn(
          `⚠️ JWT token expiring soon for user ${decoded.id} (${timeUntilExpiry}s remaining)`
        );
      }

      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. User not found.',
        });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please log in again.',
          expired: true,
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication',
    });
  }
};

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '24h' });
};

export default { requireAuth, generateToken };
