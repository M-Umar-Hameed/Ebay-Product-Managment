// Create a schema for manually added competitors
import mongoose from 'mongoose';

const competitorSchema = new mongoose.Schema({
  competitorItemId: {
    type: String,
    required: true,
  },
  itemId: {
    type: String,
    required: false, // Keep for backward compatibility
  },
  title: {
    type: String,
    required: false,
  },
  price: {
    type: Number,
    required: false,
  },
  currency: {
    type: String,
    default: 'USD',
  },
  imageUrl: {
    type: String,
    required: false,
  },
  productUrl: {
    type: String,
    required: false,
  },
  locale: {
    type: String,
    default: 'US',
  },
  condition: {
    type: String,
    required: false,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const manualCompetitorSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    itemId: {
      type: String,
      required: true,
      index: true,
    },
    competitors: [competitorSchema],
    monitoringEnabled: {
      type: Boolean,
      default: true,
    },
    monitoringFrequency: {
      type: Number,
      default: 20, // minutes
    },
    lastMonitoringCheck: {
      type: Date,
      default: null,
    },
    lastLowestPrice: {
      type: Number,
      default: null,
    },
    strategyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PricingStrategy',
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Update the updatedAt field on save
manualCompetitorSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Create compound index for efficient queries
manualCompetitorSchema.index({ userId: 1, itemId: 1 }, { unique: true });

const ManualCompetitor = mongoose.model(
  'ManualCompetitor',
  manualCompetitorSchema
);

export default ManualCompetitor;
