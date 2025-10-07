import cron from 'node-cron';

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
    this.maxConcurrentJobs = 1; // Reduce to 1 concurrent job
    this.runningJobs = 0;
    this.emergencyStop = false; // Add emergency stop flag
    this.autoStartDisabled = true; // Disable auto-start by default
  }

  async start() {
    if (this.isInitialized) {
      console.log('⚠️ Scheduler already initialized');
      return { started: false, reason: 'Already initialized' };
    }

    // CHECK API LIMITS BEFORE STARTING
    try {
      const ebayUsageService = await import('./ebayUsageService.js');
      const getItemStatus = await ebayUsageService.default.canMakeAPICall(
        'system',
        'GetItem'
      );

      if (!getItemStatus.allowed) {
        console.log('🚨 SCHEDULER NOT STARTED - API limits exceeded');
        console.log(
          `📊 Current usage: ${getItemStatus.usage}/${getItemStatus.limit}`
        );
        console.log(`⏰ Reset time: ${getItemStatus.resetTime}`);
        return {
          started: false,
          reason: 'API limits exceeded',
          usage: getItemStatus.usage,
          limit: getItemStatus.limit,
          resetTime: getItemStatus.resetTime,
        };
      }

      if (getItemStatus.usage / getItemStatus.limit > 0.8) {
        console.log('⚠️ SCHEDULER STARTING IN SAFE MODE - Usage > 80%');
        // Increase intervals dramatically when usage is high
        this.scheduleJob(
          'competitor-monitoring',
          () => this.safeRunJob('competitor-monitoring'),
          12 * 60 * 60 * 1000 // 12 hours instead of 4
        );

        this.scheduleJob(
          'strategy-execution',
          () => this.safeRunJob('strategy-execution'),
          24 * 60 * 60 * 1000 // 24 hours instead of 6
        );
      } else {
        console.log('✅ Starting scheduler with normal intervals');
        this.scheduleJob(
          'competitor-monitoring',
          () => this.safeRunJob('competitor-monitoring'),
          4 * 60 * 60 * 1000 // 4 hours
        );

        this.scheduleJob(
          'strategy-execution',
          () => this.safeRunJob('strategy-execution'),
          6 * 60 * 60 * 1000 // 6 hours
        );
      }
    } catch (error) {
      console.error(
        '❌ Error checking API limits, scheduler not started:',
        error
      );
      return {
        started: false,
        reason: 'Error checking API limits',
        error: error.message,
      };
    }

    this.isInitialized = true;
    console.log('✅ Scheduler service started with API limit checking');
    return { started: true };
  }

  scheduleJob(name, fn, interval) {
    if (this.jobs.has(name)) {
      clearInterval(this.jobs.get(name));
    }

    const intervalId = setInterval(fn, interval);
    this.jobs.set(name, intervalId);

    console.log(
      `📅 Scheduled job '${name}' with ${Math.round(
        interval / 1000 / 60
      )} minute interval`
    );
  }

  async safeRunJob(jobName) {
    // Check emergency stop flag
    if (this.emergencyStop) {
      console.log(`🚨 Emergency stop active - skipping ${jobName}`);
      return;
    }

    // Prevent too many concurrent jobs
    if (this.runningJobs >= this.maxConcurrentJobs) {
      console.log(`⏸️ Skipping ${jobName} - max concurrent jobs reached (${this.runningJobs}/${this.maxConcurrentJobs})`);
      return;
    }

    this.runningJobs++;
    console.log(`🔄 Starting job: ${jobName} (${this.runningJobs}/${this.maxConcurrentJobs} running)`);

    try {
      if (jobName === 'competitor-monitoring') {
        try {
          // FIX: Import and call the function correctly
          const competitorMonitoringService = await import('./competitorMonitoringService.js');
          const result = await competitorMonitoringService.updateCompetitorPrices();
          console.log(`✅ Competitor monitoring result:`, result);
        } catch (importError) {
          console.error(`❌ Failed to import/execute competitor monitoring service:`, importError.message);
        }
      } else if (jobName === 'strategy-execution') {
        try {
          const { executeAllActiveStrategies } = await import('./strategyService.js');
          const result = await executeAllActiveStrategies();
          console.log(`✅ Strategy execution result:`, result);
        } catch (importError) {
          console.error(`❌ Failed to import strategy service:`, importError.message);
        }
      }
    } catch (error) {
      console.error(`❌ Job ${jobName} failed:`, error.message);
    } finally {
      this.runningJobs--;
      console.log(`✅ Job ${jobName} completed (${this.runningJobs}/${this.maxConcurrentJobs} running)`);
    }
  }

  // Add method to check if should start automatically
  shouldAutoStart() {
    return !this.autoStartDisabled && process.env.ENABLE_SCHEDULER !== 'false';
  }

  // Add emergency stop method
  emergencyStopAll() {
    console.log('🚨 EMERGENCY STOP: Halting all scheduled jobs');
    this.emergencyStop = true;

    // Clear all intervals
    this.jobs.forEach((intervalId, jobName) => {
      clearInterval(intervalId);
      console.log(`🛑 Stopped job: ${jobName}`);
    });

    this.jobs.clear();
    this.isInitialized = false;
    console.log('🛑 All scheduled jobs stopped');
  }

  stop() {
    this.emergencyStopAll();
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      runningJobs: this.runningJobs,
      maxConcurrentJobs: this.maxConcurrentJobs,
      emergencyStop: this.emergencyStop,
      activeJobs: Array.from(this.jobs.keys()),
      jobCount: this.jobs.size,
    };
  }
}

// Create singleton instance
let schedulerInstance = null;

export function startSchedulerService() {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService();

    // Only start if explicitly enabled
    if (
      process.env.ENABLE_SCHEDULER === 'true' ||
      process.env.NODE_ENV === 'production'
    ) {
      return schedulerInstance.start();
    } else {
      console.log(
        '📴 Scheduler disabled - set ENABLE_SCHEDULER=true to enable'
      );
      return { started: false, reason: 'Disabled by environment variable' };
    }
  }
  return { started: false, reason: 'Already running' };
}

export function stopSchedulerService() {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
    return { stopped: true };
  }
  return { stopped: false, reason: 'Not running' };
}

export function getSchedulerStatus() {
  return schedulerInstance
    ? schedulerInstance.getStatus()
    : { isInitialized: false };
}

export default {
  startSchedulerService,
  stopSchedulerService,
  getSchedulerStatus,
  emergencyStopAll: () => schedulerInstance?.emergencyStopAll(),
};
    return { stopped: true };
  }
  return { stopped: false, reason: 'Not running' };
}

export function getSchedulerStatus() {
  return schedulerInstance
    ? schedulerInstance.getStatus()
    : { isInitialized: false };
}

export default {
  startSchedulerService,
  stopSchedulerService,
  getSchedulerStatus,
  emergencyStopAll: () => schedulerInstance?.emergencyStopAll(),
};
