// controllers/competitorRuleController.js

import CompetitorRule from '../models/competitorSchema.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose'; // Add missing mongoose import

/**
 * Helper function to get all rules with filtering
 */
const getAllRules = async (options = {}) => {
  try {
    const { userId, isActive = null } = options;

    const query = {};

    if (userId) {
      query.createdBy = userId;
    }

    if (isActive !== null) {
      query.isActive = isActive;
    }

    const rules = await CompetitorRule.find(query).sort({ ruleName: 1 });
    return rules;
  } catch (error) {
    console.error('Error in getAllRules:', error);
    throw error;
  }
};

/**
 * Extract core logic for creating a competitor rule
 */
const createCompetitorRuleLogic = async (data, userId) => {
  const {
    ruleName,
    minPercentOfCurrentPrice = 0,
    maxPercentOfCurrentPrice = 1000,
    excludeCountries = [],
    excludeConditions = [],
    excludeProductTitleWords = [],
    excludeSellers = [],
    findCompetitorsBasedOnMPN = false,
    appliesTo = [],
  } = data;

  // Always use userId as creator
  const creator = userId;
  if (!ruleName) {
    throw new Error('Rule name is required');
  }
  if (!creator) {
    throw new Error('userId is required');
  }

  const existing = await CompetitorRule.findOne({ ruleName });
  if (existing) {
    throw new Error(`Rule with name "${ruleName}" already exists`);
  }

  const rule = new CompetitorRule({
    ruleName,
    minPercentOfCurrentPrice,
    maxPercentOfCurrentPrice,
    excludeCountries,
    excludeConditions,
    excludeProductTitleWords,
    excludeSellers,
    findCompetitorsBasedOnMPN,
    createdBy: creator,
    appliesTo,
    usageCount: appliesTo.length,
    lastUsed: appliesTo.length ? new Date() : null,
  });

  await rule.save();

  // Associate the rule with the product
  if (appliesTo.length > 0) {
    await Product.updateOne(
      { itemId: appliesTo[0].itemId },
      { $set: { competitorRule: rule._id } }
    );
  }

  return rule;
};

/**
 * Create a new competitor rule
 * POST /api/competitor-rules
 */
const createCompetitorRule = async (req, res) => {
  try {
    // Always get userId from req.body or req.user
    const userId = req.body.userId || req.user?.id || req.user?._id;
    const rule = await createCompetitorRuleLogic(req.body, userId);
    return res.status(201).json({
      success: true,
      message: 'Competitor rule created successfully',
      data: rule,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get all competitor rules
 * GET /api/competitor-rules
 */
const getAllCompetitorRules = async (req, res) => {
  try {
    const { userId, active } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    console.log(`📋 Fetching competitor rules for user: ${userId}`);

    // Convert active parameter to boolean if provided
    let isActive = null;
    if (active === 'true') {
      isActive = true;
    } else if (active === 'false') {
      isActive = false;
    }

    const rules = await getAllRules({ userId, isActive });

    console.log(`📋 Found ${rules.length} competitor rules`);

    // Only send response once
    return res.json({
      success: true,
      rules, // Use 'rules' for frontend compatibility
      data: rules, // Optionally include 'data' for other consumers
    });
  } catch (error) {
    console.error('Error fetching competitor rules:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching competitor rules',
        error: error.message,
      });
    }
  }
};

/**
 * Get a single competitor rule
 * GET /api/competitor-rules/:id
 */
const getCompetitorRule = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await CompetitorRule.findOne({
      $or: [{ _id: id }, { ruleId: id }],
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Competitor rule not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Error fetching competitor rule:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching competitor rule',
        error: error.message,
      });
    }
  }
};

/**
 * Update a competitor rule
 * PUT /api/competitor-rules/:id
 */
const updateCompetitorRule = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const rule = await CompetitorRule.findOne({
      $or: [{ _id: id }, { ruleId: id }],
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Competitor rule not found',
      });
    }

    // Check for duplicate name if changing
    if (updateData.ruleName && updateData.ruleName !== rule.ruleName) {
      const existingWithName = await CompetitorRule.findOne({
        ruleName: updateData.ruleName,
        _id: { $ne: rule._id },
      });
      if (existingWithName) {
        return res.status(409).json({
          success: false,
          message: `Rule with name "${updateData.ruleName}" already exists`,
        });
      }
    }

    // Fields that must be arrays:
    const arrayFields = [
      'excludeCountries',
      'excludeConditions',
      'excludeProductTitleWords',
      'excludeSellers',
    ];

    // Handle isDefault separately (if you ever use that flag)
    const isDefault = updateData.isDefault;
    delete updateData.isDefault;

    // Update each provided field
    for (const [key, value] of Object.entries(updateData)) {
      if (arrayFields.includes(key)) {
        if (Array.isArray(value)) {
          rule[key] = value;
        }
      } else {
        if (value !== undefined) {
          rule[key] = value;
        }
      }
    }

    if (isDefault === true) {
      await CompetitorRule.updateMany(
        { isDefault: true },
        { isDefault: false }
      );
      rule.isDefault = true;
    } else if (isDefault === false) {
      rule.isDefault = false;
    }

    await rule.save();
    return res.status(200).json({
      success: true,
      message: 'Competitor rule updated successfully',
      data: rule,
    });
  } catch (error) {
    console.error('Error updating competitor rule:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error updating competitor rule',
        error: error.message,
      });
    }
  }
};

/**
 * Delete a competitor rule
 * DELETE /api/competitor-rules/:id
 */
const deleteCompetitorRule = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await CompetitorRule.findOne({
      $or: [{ _id: id }, { ruleId: id }],
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Competitor rule not found',
      });
    }

    if (rule.appliesTo && rule.appliesTo.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete rule that is applied to items',
        appliedItemCount: rule.appliesTo.length,
      });
    }

    await rule.remove();
    return res.status(200).json({
      success: true,
      message: 'Competitor rule deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting competitor rule:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error deleting competitor rule',
        error: error.message,
      });
    }
  }
};

/**
 * Apply a rule to items
 * POST /api/competitor-rules/:id/apply
 */
const applyRuleToItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of items to apply rule to is required',
      });
    }

    const rule = await CompetitorRule.findOne({
      $or: [{ _id: id }, { ruleId: id }],
    });
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Competitor rule not found',
      });
    }

    const results = [];
    for (const item of items) {
      if (!item.itemId) {
        results.push({
          success: false,
          message: 'Item ID is required',
          item,
        });
        continue;
      }
      try {
        await rule.applyToItem(
          item.itemId,
          item.sku || null,
          item.title || null
        );
        results.push({
          success: true,
          itemId: item.itemId,
          sku: item.sku || null,
        });
      } catch (error) {
        results.push({
          success: false,
          message: error.message,
          itemId: item.itemId,
          sku: item.sku || null,
        });
      }
    }

    rule.usageCount += results.filter((r) => r.success).length;
    rule.lastUsed = new Date();
    await rule.save();

    return res.status(200).json({
      success: true,
      message: `Rule applied to ${
        results.filter((r) => r.success).length
      } items`,
      totalItems: items.length,
      results,
    });
  } catch (error) {
    console.error('Error applying competitor rule:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error applying competitor rule',
        error: error.message,
      });
    }
  }
};

/**
 * Get rules applied to an item
 * GET /api/competitor-rules/item/:itemId
 */
const getRulesForItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { sku } = req.query;
    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'Item ID is required',
      });
    }

    let query = { 'appliesTo.itemId': itemId };
    if (sku) query['appliesTo.sku'] = sku;

    const rules = await CompetitorRule.find(query);
    return res.status(200).json({
      success: true,
      count: rules.length,
      itemId,
      sku: sku || 'all',
      data: rules,
    });
  } catch (error) {
    console.error('Error fetching rules for item:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching rules for item',
        error: error.message,
      });
    }
  }
};

/**
 * Remove a rule from an item
 * DELETE /api/competitor-rules/:id/item/:itemId
 */
const removeRuleFromItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { sku } = req.query;

    const rule = await CompetitorRule.findOne({
      $or: [{ _id: id }, { ruleId: id }],
    });
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Competitor rule not found',
      });
    }

    const initialCount = rule.appliesTo.length;
    rule.appliesTo = rule.appliesTo.filter((entry) => {
      if (entry.itemId === itemId) {
        if (sku && entry.sku !== sku) return true;
        return false;
      }
      return true;
    });

    const removedCount = initialCount - rule.appliesTo.length;
    if (removedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found in rule's applied items",
      });
    }

    await rule.save();
    return res.status(200).json({
      success: true,
      message: `Rule removed from ${removedCount} item(s)`,
      itemId,
      sku: sku || 'all',
    });
  } catch (error) {
    console.error('Error removing rule from item:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error removing rule from item',
        error: error.message,
      });
    }
  }
};

/**
 * Update rule execution statistics
 * POST /api/competitor-rules/:id/execution-stats
 */
const updateRuleExecutionStats = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      itemId,
      sku,
      competitorsFound,
      competitorsExcluded,
      finalCompetitorsUsed,
    } = req.body;

    if (!itemId || competitorsFound === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Item ID and competitors found count are required',
      });
    }

    const rule = await CompetitorRule.findOne({
      $or: [{ _id: id }, { ruleId: id }],
    });
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Competitor rule not found',
      });
    }

    if (!rule.executionStats) {
      rule.executionStats = {
        totalCompetitorsFound: 0,
        competitorsExcluded: 0,
        executionHistory: [],
      };
    }

    rule.executionStats.totalCompetitorsFound += competitorsFound;
    rule.executionStats.competitorsExcluded += competitorsExcluded || 0;
    rule.executionStats.lastExecution = new Date();
    rule.executionStats.executionHistory.push({
      date: new Date(),
      itemId,
      sku: sku || null,
      competitorsFound,
      competitorsExcluded: competitorsExcluded || 0,
      finalCompetitorsUsed:
        finalCompetitorsUsed || competitorsFound - (competitorsExcluded || 0),
    });

    if (rule.executionStats.executionHistory.length > 100) {
      rule.executionStats.executionHistory =
        rule.executionStats.executionHistory.slice(-100);
    }

    await rule.save();
    return res.status(200).json({
      success: true,
      message: 'Rule execution statistics updated',
      data: {
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        executionStats: rule.executionStats,
      },
    });
  } catch (error) {
    console.error('Error updating rule execution stats:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error updating rule execution statistics',
        error: error.message,
      });
    }
  }
};

/**
 * Get a competitor rule for a specific product
 * GET /api/competitor-rules/product/:itemId
 */
const getCompetitorRuleForProduct = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in query parameters',
      });
    }

    const rule = await CompetitorRule.findOne({
      'appliesTo.itemId': itemId,
      createdBy: userId, // Optional: filter by owner
    });

    if (!rule) {
      return res.status(200).json({
        success: true,
        hasCompetitorRule: false,
        competitorRule: null,
      });
    }

    return res.status(200).json({
      success: true,
      hasCompetitorRule: true,
      competitorRule: rule,
    });
  } catch (err) {
    console.error('Error fetching rule for product:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching rule for product',
        error: err.message,
      });
    }
  }
};

/**
 * Create and assign a competitor rule to a specific product
 * POST /api/competitor-rules/product/:itemId
 */
const createRuleForProduct = async (req, res) => {
  try {
    const { itemId } = req.params;
    const {
      ruleName,
      minPercentOfCurrentPrice,
      maxPercentOfCurrentPrice,
      excludeCountries,
      excludeConditions,
      excludeProductTitleWords,
      excludeSellers,
      findCompetitorsBasedOnMPN,
      assignToAll = false,
    } = req.body;

    // Always get userId from req.body or req.user
    const userId = req.body.userId || req.user?.id || req.user?._id;
    if (!ruleName) {
      return res.status(400).json({
        success: false,
        message: 'Rule name is required',
      });
    }
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in request body',
      });
    }

    // Check for existing rule with same name
    const existing = await CompetitorRule.findOne({ ruleName });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Rule with name "${ruleName}" already exists`,
      });
    }

    // Create new rule
    const newRule = new CompetitorRule({
      ruleName,
      minPercentOfCurrentPrice: minPercentOfCurrentPrice ?? 0,
      maxPercentOfCurrentPrice: maxPercentOfCurrentPrice ?? 1000,
      excludeCountries: excludeCountries || [],
      excludeConditions: excludeConditions || [],
      excludeProductTitleWords: excludeProductTitleWords || [],
      excludeSellers: excludeSellers || [],
      findCompetitorsBasedOnMPN: findCompetitorsBasedOnMPN || false,
      createdBy: userId,
      appliesTo: [
        {
          itemId,
          sku: req.body.sku || null,
          title: req.body.title || null,
          dateApplied: new Date(),
        },
      ],
      usageCount: 1,
      lastUsed: new Date(),
    });

    await newRule.save();

    // Associate with product
    await Product.updateOne(
      { itemId },
      { $set: { competitorRule: newRule._id } }
    );

    return res.status(201).json({
      success: true,
      message: 'Competitor rule created and applied to product',
      data: newRule,
    });
  } catch (err) {
    console.error('Error in createRuleForProduct:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
};

export {
  createCompetitorRule,
  createCompetitorRuleLogic,
  getAllCompetitorRules,
  getAllRules, // Export the helper function
  getCompetitorRule,
  updateCompetitorRule,
  deleteCompetitorRule,
  applyRuleToItems,
  getRulesForItem,
  removeRuleFromItem,
  updateRuleExecutionStats,
  getCompetitorRuleForProduct,
  createRuleForProduct,
};
