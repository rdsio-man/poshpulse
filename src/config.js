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
    to: process.env.NOTIFY_EMAIL || 'rdsioson@gmail.com',
    from: 'homer-oclw@agentmail.to',
    agentMailInboxId: 'homer-oclw@agentmail.to',
    agentMailApiKey: 'am_us_5f1ff6e8ff594a5efde51a287b29401e710a355136d8e1e6e55da3549ca9f9d4',
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
