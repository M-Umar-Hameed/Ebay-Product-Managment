// models/CompetitorRule.js
import mongoose from 'mongoose';

const competitorRuleSchema = new mongoose.Schema(
  {
    // Basic Rule Information
    ruleId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
      index: true,
    },
    ruleName: {
      type: String,
      required: [true, 'Rule name is required'],
      trim: true,
      maxlength: [100, 'Rule name cannot exceed 100 characters'],
    },

    // Filtering criteria
    minPercentOfCurrentPrice: {
      type: Number,
      default: 0,
      min: [0, 'Minimum percent cannot be negative'],
    },
    maxPercentOfCurrentPrice: {
      type: Number,
      default: 1000,
      min: [0, 'Maximum percent cannot be negative'],
    },

    // Exclusion lists
    excludeCountries: {
      type: [String],
      default: [],
    },
    excludeConditions: {
      type: [String],
      default: [],
    },
    excludeProductTitleWords: {
      type: [String],
      default: [],
    },
    excludeSellers: {
      type: [String],
      default: [],
    },

    // Additional filtering options
    findCompetitorsBasedOnMPN: {
      type: Boolean,
      default: false,
    },
    minSellerFeedbackScore: {
      type: Number,
      default: 0,
    },
    minSellerFeedbackPercent: {
      type: Number,
      default: 0,
    },
    excludeTopRatedSellers: {
      type: Boolean,
      default: false,
    },
    excludeInternationalSellers: {
      type: Boolean,
      default: false,
    },
    excludeFreeShipping: {
      type: Boolean,
      default: false,
    },
    maxShippingCost: {
      type: Number,
      default: null,
    },

    // Status and metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },

    // Applied items tracking
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

    // Usage tracking
    createdBy: {
      type: String, // Changed from ObjectId to String for compatibility
      required: true,
    },
    lastUsed: {
      type: Date,
    },
    usageCount: {
      type: Number,
      default: 0,
    },

    // Execution statistics
    executionStats: {
      totalCompetitorsFound: {
        type: Number,
        default: 0,
      },
      competitorsExcluded: {
        type: Number,
        default: 0,
      },
      lastExecution: {
        type: Date,
      },
      executionHistory: {
        type: [
          {
            date: {
              type: Date,
              default: Date.now,
            },
            itemId: String,
            sku: String,
            competitorsFound: Number,
            competitorsExcluded: Number,
            finalCompetitorsUsed: Number,
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better performance
competitorRuleSchema.index({ isActive: 1 });
competitorRuleSchema.index({ isDefault: 1 });
competitorRuleSchema.index({ 'appliesTo.itemId': 1 });

// Update the updatedAt field on save
competitorRuleSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Validate min/max price percentages
competitorRuleSchema.pre('validate', function (next) {
  if (this.minPercentOfCurrentPrice > this.maxPercentOfCurrentPrice) {
    return next(
      new Error('Minimum percentage cannot be greater than maximum percentage')
    );
  }
  next();
});

// Instance method to apply rule to an item
competitorRuleSchema.methods.applyToItem = function (itemId, sku, title) {
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

// Static method to find rule by name
competitorRuleSchema.statics.findByName = function (ruleName) {
  return this.findOne({ ruleName: ruleName });
};

// Static method to get all active rules
competitorRuleSchema.statics.getAllActive = function () {
  return this.find({ isActive: true }).sort({ ruleName: 1 });
};

// Static method to get default rule
competitorRuleSchema.statics.getDefault = function () {
  return this.findOne({ isDefault: true });
};

// Static method to find rules for an item
competitorRuleSchema.statics.findForItem = function (itemId, sku) {
  const query = { 'appliesTo.itemId': itemId };
  if (sku) {
    query['appliesTo.sku'] = sku;
  }
  return this.find(query);
};

// Create model
const CompetitorRule = mongoose.model('CompetitorRule', competitorRuleSchema);

export default CompetitorRule;
