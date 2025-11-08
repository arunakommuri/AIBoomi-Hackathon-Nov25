#!/usr/bin/env node

/**
 * Cron Manager for Order Reminders
 * 
 * This script:
 * 1. Sets up the cron job on startup based on ORDER_REMINDER_INTERVAL_MINUTES
 * 2. Removes the cron job on application exit
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WEB_DIR = path.join(__dirname, '..');
const ENV_FILE = path.join(WEB_DIR, '.env.local');
const DEFAULT_INTERVAL = 360; // 6 hours in minutes

let cronSetup = false;

/**
 * Read ORDER_REMINDER_INTERVAL_MINUTES from .env.local
 */
function getIntervalFromEnv() {
  try {
    if (fs.existsSync(ENV_FILE)) {
      const envContent = fs.readFileSync(ENV_FILE, 'utf8');
      const match = envContent.match(/^ORDER_REMINDER_INTERVAL_MINUTES=(\d+)/m);
      if (match && match[1]) {
        const interval = parseInt(match[1], 10);
        if (interval > 0) {
          return interval;
        }
      }
    }
  } catch (error) {
    console.error('Error reading .env.local:', error);
  }
  return DEFAULT_INTERVAL;
}

/**
 * Calculate cron schedule from minutes
 */
function calculateCronSchedule(minutes) {
  if (minutes < 60) {
    // Less than 1 hour: run every X minutes
    return `*/${minutes} * * * *`;
  } else if (minutes === 60) {
    // Exactly 1 hour: run at the top of every hour
    return `0 * * * *`;
  } else if (minutes % 60 === 0) {
    // Multiple of 60: run every X hours
    const hours = minutes / 60;
    return `0 */${hours} * * *`;
  } else {
    // Other values: run every X minutes
    return `*/${minutes} * * * *`;
  }
}

/**
 * Set up cron job
 */
function setupCron() {
  try {
    const interval = getIntervalFromEnv();
    const schedule = calculateCronSchedule(interval);
    const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const endpoint = `${apiUrl}/api/cron/order-reminders`;

    console.log(`📅 Setting up order reminder cron: ${interval} minutes (${schedule})`);

    // Get current crontab (excluding order-reminders entries)
    let currentCron = '';
    try {
      currentCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' })
        .split('\n')
        .filter(line => !line.includes('order-reminders'))
        .filter(line => line.trim() !== '')
        .join('\n');
    } catch (error) {
      // No existing crontab
      currentCron = '';
    }

    // Create new cron entry
    const cronEntry = `# Order Reminder Cron - runs every ${interval} minutes (from ORDER_REMINDER_INTERVAL_MINUTES)
${schedule} /usr/bin/curl -X GET '${endpoint}' -H 'Content-Type: application/json' >> /tmp/order-reminder.log 2>&1`;

    // Combine with existing crontab
    const newCron = currentCron 
      ? `${currentCron}\n\n${cronEntry}`
      : cronEntry;

    // Install new crontab
    execSync('crontab -', { input: newCron, encoding: 'utf8' });

    cronSetup = true;
    console.log('✅ Cron job installed successfully');
  } catch (error) {
    console.error('❌ Error setting up cron:', error.message);
  }
}

/**
 * Remove cron job
 */
function removeCron() {
  try {
    if (!cronSetup) {
      return;
    }

    console.log('🛑 Removing order reminder cron job...');

    // Get current crontab (excluding order-reminders entries)
    let currentCron = '';
    try {
      currentCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' })
        .split('\n')
        .filter(line => !line.includes('order-reminders'))
        .filter(line => line.trim() !== '')
        .join('\n');
    } catch (error) {
      // No existing crontab
      return;
    }

    // Install crontab without order-reminders entries
    if (currentCron.trim()) {
      execSync('crontab -', { input: currentCron, encoding: 'utf8' });
    } else {
      // Remove crontab completely if nothing left
      execSync('crontab -r 2>/dev/null || true');
    }

    console.log('✅ Cron job removed successfully');
  } catch (error) {
    console.error('❌ Error removing cron:', error.message);
  }
}

// Export functions for use in other scripts
if (require.main === module) {
  // If run directly, set up or remove cron
  const command = process.argv[2];
  
  if (command === 'setup') {
    setupCron();
    // Exit successfully - cleanup will be handled by wrapper script
    process.exit(0);
  } else if (command === 'remove') {
    // Always remove, don't check cronSetup flag when called directly
    try {
      console.log('🛑 Removing order reminder cron job...');
      
      // Get current crontab (excluding order-reminders entries)
      let currentCron = '';
      try {
        currentCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' })
          .split('\n')
          .filter(line => !line.includes('order-reminders'))
          .filter(line => line.trim() !== '')
          .join('\n');
      } catch (error) {
        // No existing crontab
        currentCron = '';
      }

      // Install crontab without order-reminders entries
      if (currentCron.trim()) {
        execSync('crontab -', { input: currentCron, encoding: 'utf8' });
      } else {
        // Remove crontab completely if nothing left
        execSync('crontab -r 2>/dev/null || true');
      }

      console.log('✅ Cron job removed successfully');
    } catch (error) {
      console.error('❌ Error removing cron:', error.message);
    }
    process.exit(0);
  } else {
    console.log('Usage: node cron-manager.js [setup|remove]');
    process.exit(1);
  }
} else {
  module.exports = { setupCron, removeCron, getIntervalFromEnv };
}

