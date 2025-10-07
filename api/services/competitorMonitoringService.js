import cron from 'node-cron';
import { executeStrategyForItem } from './strategyService.js';
import { refreshManualCompetitorPrices } from './inventoryService.js';

class CompetitorMonitoringService {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.minInterval = 10 * 60 * 1000; // Minimum 10 minutes between runs
    this.maxConcurrentChecks = 3; // Limit concurrent API calls
    this.checkQueue = [];
    this.activeChecks = 0;
  }

  async updateCompetitorPrices() {
    // Prevent multiple simultaneous runs
    if (this.isRunning) {
      console.log('⏸️ Competitor monitoring already running, skipping...');
      return {
        success: false,
        message: 'Monitoring already in progress',
        lastRunTime: this.lastRunTime,
      };
    }

    // Enforce minimum interval
    if (this.lastRunTime && Date.now() - this.lastRunTime < this.minInterval) {
      const timeLeft = Math.ceil(
        (this.minInterval - (Date.now() - this.lastRunTime)) / 1000
      );
      console.log(
        `⏸️ Too soon to run monitoring again. Wait ${timeLeft} seconds.`
      );
      return {
        success: false,
        message: `Please wait ${timeLeft} seconds before next run`,
        lastRunTime: this.lastRunTime,
      };
    }

    this.isRunning = true;
    this.lastRunTime = Date.now();

    try {
      console.log('🔄 Starting competitor price monitoring...');

      const { default: ManualCompetitor } = await import(
        '../models/ManualCompetitor.js'
      );

      // Get items with monitoring enabled and rate limit them
      const itemsToCheck = await ManualCompetitor.find({
        monitoringEnabled: true,
        competitors: { $exists: true, $not: { $size: 0 } },
      }).limit(20); // Limit to 20 items maximum per run

      if (itemsToCheck.length === 0) {
        console.log('📭 No items with competitor monitoring enabled');
        return {
          success: true,
          message: 'No items to monitor',
          checkedItems: 0,
        };
      }

      console.log(
        `📊 Found ${itemsToCheck.length} items to check (limited to prevent API overuse)`
      );

      let checkedItems = 0;
      let updatedItems = 0;
      let errors = 0;

      // Process items with rate limiting
      for (const item of itemsToCheck) {
        try {
          // Wait for available slot
          while (this.activeChecks >= this.maxConcurrentChecks) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          this.activeChecks++;

          const result = await this.checkItemCompetitors(item);

          if (result.success) {
            checkedItems++;
            if (result.priceChanged) {
              updatedItems++;
            }
          } else {
            errors++;
          }

          // Add delay between checks to prevent rate limiting
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(
            `❌ Error checking item ${item.itemId}:`,
            error.message
          );
          errors++;
        } finally {
          this.activeChecks--;
        }
      }

      console.log(
        `✅ Competitor monitoring completed: ${checkedItems} checked, ${updatedItems} updated, ${errors} errors`
      );

      return {
        success: true,
        message: 'Competitor monitoring completed',
        checkedItems,
        updatedItems,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Competitor monitoring failed:', error);
      return {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    } finally {
      this.isRunning = false;
    }
  }

  async checkItemCompetitors(item) {
    try {
      // Rate limit check - don't check same item too frequently
      const timeSinceLastCheck = item.lastMonitoringCheck
        ? Date.now() - new Date(item.lastMonitoringCheck).getTime()
        : Infinity;

      const minCheckInterval = item.monitoringFrequency * 60 * 1000; // Convert minutes to ms

      if (timeSinceLastCheck < minCheckInterval) {
        console.log(
          `⏭️ Skipping ${item.itemId} - checked ${Math.round(
            timeSinceLastCheck / 60000
          )} minutes ago`
        );
        return { success: true, priceChanged: false, reason: 'too_recent' };
      }

      console.log(`🔍 Checking competitors for item ${item.itemId}...`);

      // Update last check time BEFORE making API calls to prevent concurrent checks
      item.lastMonitoringCheck = new Date();
      await item.save();

      // Get current competitor prices (this may call eBay GetItem API)
      const { getCompetitorPrice } = await import(
        './competitorPriceService.js'
      );
      const currentLowestPrice = await getCompetitorPrice(
        item.itemId,
        null,
        item.userId
      );

      if (currentLowestPrice && currentLowestPrice !== item.lastLowestPrice) {
        console.log(
          `💰 Price change detected for ${item.itemId}: ${item.lastLowestPrice} → ${currentLowestPrice}`
        );

        item.lastLowestPrice = currentLowestPrice;
        await item.save();

        // Execute strategy if price changed
        const { executeStrategyForItem } = await import('./strategyService.js');
        await executeStrategyForItem(item.itemId, item.userId);

        return {
          success: true,
          priceChanged: true,
          newPrice: currentLowestPrice,
        };
      }

      return {
        success: true,
        priceChanged: false,
        currentPrice: currentLowestPrice,
      };
    } catch (error) {
      console.error(
        `❌ Error checking competitors for ${item.itemId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  // Add method to manually stop monitoring
  stopMonitoring() {
    this.isRunning = false;
    console.log('🛑 Competitor monitoring stopped manually');
  }

  // Get monitoring status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      activeChecks: this.activeChecks,
      queueLength: this.checkQueue.length,
      nextAllowedRun: this.lastRunTime
        ? new Date(this.lastRunTime + this.minInterval)
        : new Date(),
    };
  }
}

// Create a default instance
const defaultService = new CompetitorMonitoringService();

// Export the method from the default instance
export const updateCompetitorPrices = () =>
  defaultService.updateCompetitorPrices();

// Export other methods
export const checkItemCompetitors = (item) =>
  defaultService.checkItemCompetitors(item);
export const getMonitoringStatus = () => defaultService.getStatus();
export const stopMonitoring = () => defaultService.stopMonitoring();

// Export the class for direct instantiation if needed
export { CompetitorMonitoringService };

export function startCompetitorMonitoring() {
  // CHANGE: From every 20 seconds to every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('⏱ [monitor] running competitor price check (every 2 hours)…');
    const service = new CompetitorMonitoringService();
    await service.updateCompetitorPrices();
  });

  console.log('✅ Competitor monitoring scheduled to run every 2 hours');
}

// Add method to stop monitoring completely
export function stopCompetitorMonitoring() {
  // Stop all cron jobs
  const jobs = cron.getTasks();
  jobs.forEach((task, name) => {
    task.stop();
    console.log(`🛑 Stopped cron job: ${name}`);
  });
  console.log('🛑 All competitor monitoring stopped');
}

// Emergency stop function
export function emergencyStopMonitoring() {
  console.log('🚨 EMERGENCY STOP: Halting all competitor monitoring');
  const jobs = cron.getTasks();
  jobs.forEach((task) => {
    task.destroy();
  });

  // Also clear any running intervals
  if (global.competitorMonitoringInterval) {
    clearInterval(global.competitorMonitoringInterval);
    global.competitorMonitoringInterval = null;
  }

  console.log('🛑 Emergency stop completed');
}

// Add additional strategy execution functions
export const triggerStrategyForItem = async (itemId, userId) => {
  try {
    const { executeStrategyForItem } = await import('./strategyService.js');
    return await executeStrategyForItem(itemId, userId);
  } catch (error) {
    console.error(`❌ Error executing strategy for ${itemId}:`, error);
    return { success: false, error: error.message };
  }
};

export const executeStrategiesForAllItems = async () => {
  try {
    const { executeAllActiveStrategies } = await import('./strategyService.js');
    return await executeAllActiveStrategies();
  } catch (error) {
    console.error('❌ Error executing all strategies:', error);
    return { success: false, error: error.message };
  }
};
