import mongoose from 'mongoose';

const priceHistorySchema = new mongoose.Schema(
  {
    // Core Product Identification
    itemId: {
      type: String,
      required: [true, 'Item ID is required'],
      index: true,
      trim: true,
    },

    sku: {
      type: String,
      index: true,
      trim: true,
      default: null,
    },

    title: {
      type: String,
      trim: true,
      maxlength: [500, 'Title cannot exceed 500 characters'],
    },

    // Price Information
    oldPrice: {
      type: Number,
      min: [0, 'Old price cannot be negative'],
      default: null,
    },

    newPrice: {
      type: Number,
      required: [true, 'New price is required'],
      min: [0, 'New price cannot be negative'],
    },

    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      uppercase: true,
    },

    // Calculated Change Information
    changeAmount: {
      type: Number,
      default: null,
    },

    changePercentage: {
      type: Number,
      default: null,
    },

    changeDirection: {
      type: String,
      enum: ['increased', 'decreased', 'unchanged'],
      default: null,
    },

    // Competition & Strategy Information
    competitorLowestPrice: {
      type: Number,
      min: [0, 'Competitor price cannot be negative'],
      default: null,
    },

    competitorPrice: {
      type: Number,
      min: [0, 'Competitor price cannot be negative'],
      default: null,
    }, // Keep this as a real field

    strategyName: {
      type: String,
      trim: true,
      maxlength: [100, 'Strategy name cannot exceed 100 characters'],
      default: null,
    },

    repricingRule: {
      type: String,
      trim: true,
      maxlength: [100, 'Repricing rule cannot exceed 100 characters'],
      default: null,
    },

    minPrice: {
      type: Number,
      min: [0, 'Minimum price cannot be negative'],
      default: null,
    },

    maxPrice: {
      type: Number,
      min: [0, 'Maximum price cannot be negative'],
      default: null,
    },

    // Execution Information
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: ['pending', 'completed', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },

    source: {
      type: String,
      enum: [
        'manual',
        'strategy',
        'bulk_import',
        'api_sync',
        'competitor_update',
      ],
      default: 'manual',
    },

    success: {
      type: Boolean,
      required: [true, 'Success status is required'],
      default: false,
      index: true,
    },

    // User & System Information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Execution Details
    apiResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Timestamps
    executedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    date: {
      type: Date,
      default: Date.now,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    collection: 'pricehistories', // Explicit collection name
  }
);

// Compound indexes for efficient querying of 100+ records per product
priceHistorySchema.index({ itemId: 1, createdAt: -1 }); // Most recent first for a product
priceHistorySchema.index({ itemId: 1, sku: 1, createdAt: -1 }); // For variation products
priceHistorySchema.index({ userId: 1, createdAt: -1 }); // User's history
priceHistorySchema.index({ success: 1, createdAt: -1 }); // Successful changes only
priceHistorySchema.index({ strategyName: 1, createdAt: -1 }); // Strategy performance
priceHistorySchema.index({ source: 1, createdAt: -1 }); // Source-based queries

// TTL index to automatically delete old records (optional - remove if you want to keep all history)
// priceHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 }); // 1 year

// Virtual for formatted price display
priceHistorySchema.virtual('formattedNewPrice').get(function () {
  return `${this.currency} ${this.newPrice.toFixed(2)}`;
});

priceHistorySchema.virtual('formattedOldPrice').get(function () {
  if (this.oldPrice === null || this.oldPrice === undefined) return 'N/A';
  return `${this.currency} ${this.oldPrice.toFixed(2)}`;
});

priceHistorySchema.virtual('formattedChange').get(function () {
  if (this.changeAmount === null || this.changeAmount === undefined)
    return 'N/A';
  const sign = this.changeAmount >= 0 ? '+' : '';
  return `${sign}${this.currency} ${this.changeAmount.toFixed(2)}`;
});

// Static method to get paginated history for a product (handles 100+ records efficiently)
priceHistorySchema.statics.getProductHistory = function (
  itemId,
  sku = null,
  limit = 100,
  page = 1,
  sortBy = 'createdAt',
  sortOrder = -1
) {
  const query = { itemId };
  if (sku) query.sku = sku;

  const skip = (page - 1) * limit;
  const sort = {};
  sort[sortBy] = sortOrder;

  return this.find(query).sort(sort).skip(skip).limit(limit).lean(); // Use lean() for better performance when just reading data
};

// Static method to get statistics for a product
priceHistorySchema.statics.getProductStats = function (itemId, sku = null) {
  const query = { itemId, success: true };
  if (sku) query.sku = sku;

  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalRecords: { $sum: 1 },
        avgPrice: { $avg: '$newPrice' },
        minPrice: { $min: '$newPrice' },
        maxPrice: { $max: '$newPrice' },
        totalPriceChange: { $sum: '$changeAmount' },
        lastUpdate: { $max: '$createdAt' },
        firstRecord: { $min: '$createdAt' },
        strategiesUsed: { $addToSet: '$strategyName' },
      },
    },
  ]);
};

// Static method to get latest price for an item
priceHistorySchema.statics.getLatestPrice = function (itemId, sku = null) {
  const query = { itemId, success: true };
  if (sku) query.sku = sku;

  return this.findOne(query).sort({ createdAt: -1 });
};

// Static method to clean up old failed records (keep only successful ones for history)
priceHistorySchema.statics.cleanupFailedRecords = function (daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return this.deleteMany({
    success: false,
    createdAt: { $lt: cutoffDate },
  });
};

// Instance method to calculate change metrics
priceHistorySchema.methods.calculateChange = function () {
  if (this.oldPrice && this.newPrice) {
    this.changeAmount = Number((this.newPrice - this.oldPrice).toFixed(2));

    if (this.oldPrice > 0) {
      this.changePercentage = Number(
        (((this.newPrice - this.oldPrice) / this.oldPrice) * 100).toFixed(2)
      );
    }

    this.changeDirection =
      this.changeAmount > 0
        ? 'increased'
        : this.changeAmount < 0
        ? 'decreased'
        : 'unchanged';
  }
  return this;
};

// Pre-save middleware to automatically calculate changes
priceHistorySchema.pre('save', function (next) {
  // Only calculate if both prices are available and change hasn't been calculated
  if (this.oldPrice !== null && this.newPrice && !this.changeAmount) {
    this.calculateChange();
  }

  // Set executedAt if not provided
  if (!this.executedAt) {
    this.executedAt = new Date();
  }

  next();
});

// Post-save middleware for logging (optional)
priceHistorySchema.post('save', function (doc) {});

// Ensure virtual fields are serialized (if we add any in the future)
priceHistorySchema.set('toJSON', { virtuals: true });

const PriceHistory = mongoose.model('PriceHistory', priceHistorySchema);

export default PriceHistory;

