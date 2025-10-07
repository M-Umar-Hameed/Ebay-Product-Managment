// models/PricingStrategy.js
import mongoose from 'mongoose';

const pricingStrategySchema = new mongoose.Schema({
  // Basic Strategy Information
  strategyId: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString(),
    index: true,
  },
  strategyName: {
    type: String,
    required: [true, 'Strategy name is required'],
    trim: true,
    maxlength: [100, 'Strategy name cannot exceed 100 characters'],
  },
  repricingRule: {
    type: String,
    required: [true, 'Repricing rule is required'],
    enum: {
      values: ['MATCH_LOWEST', 'BEAT_LOWEST', 'STAY_ABOVE', 'CUSTOM'],
      message: '{VALUE} is not a supported repricing rule',
    },
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },

  // Strategy Specific Fields
  // For BEAT_LOWEST
  beatBy: {
    type: String,
    enum: {
      values: ['AMOUNT', 'PERCENTAGE'],
      message: '{VALUE} is not a supported beat by type',
    },
    // Required only for BEAT_LOWEST and only if not null/empty
    validate: {
      validator: function (v) {
        if (this.repricingRule !== 'BEAT_LOWEST') return true;
        if (v === null || v === undefined) return false;
        if (typeof v === 'string' && v.trim() === '') return false;
        return true;
      },
      message: 'beatBy is required for BEAT_LOWEST strategy',
    },
  },
  // For STAY_ABOVE
  stayAboveBy: {
    type: String,
    enum: {
      values: ['AMOUNT', 'PERCENTAGE'],
      message: '{VALUE} is not a supported stay above type',
    },
    // Required only for STAY_ABOVE and only if not null/empty
    validate: {
      validator: function (v) {
        if (this.repricingRule !== 'STAY_ABOVE') return true;
        if (v === null || v === undefined) return false;
        if (typeof v === 'string' && v.trim() === '') return false;
        return true;
      },
      message: 'stayAboveBy is required for STAY_ABOVE strategy',
    },
  },
  // Value for BEAT_LOWEST and STAY_ABOVE
  value: {
    type: Number,
    validate: {
      validator: function (v) {
        // Required for BEAT_LOWEST and STAY_ABOVE
        if (
          this.repricingRule === 'BEAT_LOWEST' ||
          this.repricingRule === 'STAY_ABOVE'
        ) {
          return v !== undefined && v !== null;
        }
        return true;
      },
      message: 'value is required for BEAT_LOWEST and STAY_ABOVE strategies',
    },
    // Additional validation for percentage values
    validate: {
      validator: function (v) {
        if (
          (this.beatBy === 'PERCENTAGE' || this.stayAboveBy === 'PERCENTAGE') &&
          v > 1
        ) {
          return false;
        }
        return true;
      },
      message:
        'Percentage values should be in decimal format (e.g., 0.10 for 10%)',
    },
  },

  // Strategy Options
  noCompetitionAction: {
    type: String,
    enum: {
      values: ['USE_MAX_PRICE', 'KEEP_CURRENT', 'USE_MIN_PRICE'],
      message: '{VALUE} is not a supported no competition action',
    },
    default: 'USE_MAX_PRICE',
  },

  // Remove these fields from the main strategy document
  // maxPrice: {
  //   type: Number,
  //   min: [0, 'Maximum price cannot be negative'],
  // },
  // minPrice: {
  //   type: Number,
  //   min: [0, 'Minimum price cannot be negative'],
  //   validate: {
  //     validator: function (v) {
  //       return !this.maxPrice || v <= this.maxPrice;
  //     },
  //     message: 'Minimum price cannot be greater than maximum price',
  //   },
  // },

  // Advanced Options
  isActive: {
    type: Boolean,
    default: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  appliesTo: {
    type: [
      {
        itemId: {
          type: String,
          required: true,
        },
        sku: String,
        title: String,
        dateApplied: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    default: [],
  },
  customLogic: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  lastUsed: {
    type: Date,
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  executionHistory: {
    type: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        itemCount: Number,
        success: Boolean,
        details: mongoose.Schema.Types.Mixed,
      },
    ],
    default: [],
  },
});

// Create indexes for better performance
pricingStrategySchema.index({ strategyName: 1 });
pricingStrategySchema.index({ repricingRule: 1 });
pricingStrategySchema.index({ isActive: 1 });
pricingStrategySchema.index({ isDefault: 1 });
pricingStrategySchema.index({ 'appliesTo.itemId': 1 });

// Update the updatedAt field on save
pricingStrategySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Add validation that ensures correct fields are present based on strategy type
pricingStrategySchema.pre('validate', function (next) {
  // Clean up empty strings before validation
  if (this.beatBy === '') this.beatBy = null;
  if (this.stayAboveBy === '') this.stayAboveBy = null;

  if (
    this.repricingRule === 'BEAT_LOWEST' &&
    (!this.beatBy || this.value === undefined)
  ) {
    return next(
      new Error('BEAT_LOWEST strategy requires beatBy and value fields')
    );
  }

  if (
    this.repricingRule === 'STAY_ABOVE' &&
    (!this.stayAboveBy || this.value === undefined)
  ) {
    return next(
      new Error('STAY_ABOVE strategy requires stayAboveBy and value fields')
    );
  }

  next();
});

// Instance method to apply strategy to an item
pricingStrategySchema.methods.applyToItem = function (itemId, sku, title) {
  // Check if this item is already in the appliesTo array
  const existingIndex = this.appliesTo.findIndex(
    (item) =>
      item.itemId === itemId && ((!sku && !item.sku) || item.sku === sku)
  );

  if (existingIndex === -1) {
    this.appliesTo.push({
      itemId,
      sku,
      title,
      dateApplied: new Date(),
    });
  } else {
    // Update existing entry
    this.appliesTo[existingIndex].dateApplied = new Date();
    if (title) this.appliesTo[existingIndex].title = title;
  }

  return this.save();
};

// Static method to find strategy by name
pricingStrategySchema.statics.findByName = function (strategyName) {
  return this.findOne({ strategyName: strategyName });
};

// Static method to get all active strategies
pricingStrategySchema.statics.getAllActive = function () {
  return this.find({ isActive: true }).sort({ strategyName: 1 });
};

// Static method to get default strategy
pricingStrategySchema.statics.getDefault = function () {
  return this.findOne({ isDefault: true });
};

// Static method to find strategies for an item
pricingStrategySchema.statics.findForItem = function (itemId, sku) {
  const query = { 'appliesTo.itemId': itemId };
  if (sku) {
    query['appliesTo.sku'] = sku;
  }
  return this.find(query);
};

// Virtual for formatted value
pricingStrategySchema.virtual('formattedValue').get(function () {
  if (this.value === undefined || this.value === null) return '';

  if (this.beatBy === 'PERCENTAGE' || this.stayAboveBy === 'PERCENTAGE') {
    return `${(this.value * 100).toFixed(2)}%`;
  }
  return `$${this.value.toFixed(2)}`;
});

// Create model
const PricingStrategy = mongoose.model(
  'PricingStrategy',
  pricingStrategySchema
);

export default PricingStrategy;
