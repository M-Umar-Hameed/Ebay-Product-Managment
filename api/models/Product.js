// models/Product.js
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, unique: true },
    title: String,
    sku: String,

    // <-- one and only one strategy per product -->
    strategy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PricingStrategy',
      default: null,
    },

    minPrice: { type: Number, default: null },
    maxPrice: { type: Number, default: null },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ebayAccountId: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Product', ProductSchema);
