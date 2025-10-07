// routes/auth.js

import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// ...existing auth routes...

// Add this temporary endpoint to update eBay token
router.post('/update-ebay-token', requireAuth, async (req, res) => {
  try {
    const { accessToken } = req.body;
    const userId = req.user._id;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'accessToken is required',
      });
    }

    // Update user's eBay token
    const User = (await import('../models/Users.js')).default;
    await User.findByIdAndUpdate(userId, {
      'ebay.accessToken': accessToken,
      'ebay.tokenExpires': new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
    });

    return res.json({
      success: true,
      message: 'eBay token updated successfully',
    });
  } catch (error) {
    console.error('Error updating eBay token:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating token',
      error: error.message,
    });
  }
});

export default router;
