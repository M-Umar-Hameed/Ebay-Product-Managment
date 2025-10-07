// models/Users.js

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },

    // ← Add this "ebay" sub‐document:
    ebay: {
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true, // preserves createdAt/updatedAt, if you want them
  }
);

export default mongoose.model('User', userSchema);
