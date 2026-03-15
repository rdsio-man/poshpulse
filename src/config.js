/**
 * config.js — Central config pulled from environment variables.
 * All timing values are in milliseconds.
 */

require('dotenv').config();

module.exports = {
  poshmark: {
    username: process.env.POSHMARK_USERNAME || '',
    password: process.env.POSHMARK_PASSWORD || '',
  },

  email: {
    to: process.env.NOTIFY_EMAIL || '',
    from: process.env.AGENTMAIL_FROM || '',
    agentMailInboxId: process.env.AGENTMAIL_INBOX_ID || '',
    agentMailApiKey: process.env.AGENTMAIL_API_KEY || '',
  },

  timing: {
    // Delay between each individual relist action
    relistIntervalMs: parseInt(process.env.RELIST_INTERVAL_MS || '90000', 10),
    // Delay between each individual share click
    shareIntervalMs: parseInt(process.env.SHARE_INTERVAL_MS || '95000', 10),
    // How often to run a full share cycle
    shareCycleMs: parseInt(process.env.SHARE_CYCLE_MS || '3600000', 10),
    // Listings older than this get relisted
    relistAgeDays: parseInt(process.env.RELIST_AGE_DAYS || '61', 10),
    // How often to check for stale listings
    relistCheckIntervalMs: parseInt(process.env.RELIST_CHECK_INTERVAL_MS || '3600000', 10),
  },
};
