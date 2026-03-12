/**
 * index.js — PoshPulse main entry point.
 *
 * Runs two parallel loops:
 *   1. Share loop  — shares every active listing every 60 min (95s between clicks)
 *   2. Relist loop — checks for listings 61+ days old every hour, relists them (90s apart)
 *
 * Email:
 *   - Daily digest of all relists sent at midnight PT
 *   - Immediate alert on captcha detection
 */

require('dotenv').config();

const config = require('./config');
const { getContext, closeBrowser } = require('./services/browser');
const { login, getActiveListings, shareListing, relistListing, hasCaptcha } = require('./services/poshmark');
const { sendDailyDigest, sendCaptchaAlert } = require('./services/mailer');

// ── State ──────────────────────────────────────────────────────────────────────

/** Log of relist actions accumulated today — flushed after daily digest. */
let relistLog = [];

/** Tracks whether we're mid-captcha pause. */
let captchaPaused = false;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowPT() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Get (or create) a Playwright page, log in, and return it.
 * Handles captcha detection at login.
 */
async function getLoggedInPage() {
  const context = await getContext();
  const page = await context.newPage();

  await login(page, config.poshmark.username, config.poshmark.password);

  if (await hasCaptcha(page)) {
    console.error('[poshpulse] CAPTCHA detected at login!');
    await sendCaptchaAlert('login').catch(console.error);
    captchaPaused = true;
    throw new Error('CAPTCHA at login — automation paused');
  }

  return page;
}

// ── Share loop ─────────────────────────────────────────────────────────────────

async function runShareCycle() {
  console.log(`\n[share] Starting share cycle at ${nowPT()}`);

  let page;
  try {
    page = await getLoggedInPage();
    const listings = await getActiveListings(page, config.poshmark.username);

    if (listings.length === 0) {
      console.log('[share] No active listings found.');
      return;
    }

    console.log(`[share] Sharing ${listings.length} listings...`);

    for (let i = 0; i < listings.length; i++) {
      if (captchaPaused) {
        console.warn('[share] Paused due to CAPTCHA — stopping share cycle');
        break;
      }

      const listing = listings[i];
      const success = await shareListing(page, listing);

      if (!success && await hasCaptcha(page)) {
        console.error('[share] CAPTCHA detected during sharing!');
        await sendCaptchaAlert(`sharing listing: "${listing.title}"`).catch(console.error);
        captchaPaused = true;
        break;
      }

      if (i < listings.length - 1) {
        console.log(`[share] Waiting ${config.timing.shareIntervalMs / 1000}s before next share...`);
        await sleep(config.timing.shareIntervalMs);
      }
    }

    console.log(`[share] Cycle complete at ${nowPT()}`);
  } catch (err) {
    if (!captchaPaused) {
      console.error('[share] Cycle error:', err.message);
    }
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ── Relist loop ────────────────────────────────────────────────────────────────

async function runRelistCheck() {
  console.log(`\n[relist] Checking for stale listings at ${nowPT()}`);

  let page;
  try {
    page = await getLoggedInPage();
    const listings = await getActiveListings(page, config.poshmark.username);

    // Filter to listings older than the configured threshold
    const stale = listings.filter((l) => daysSince(l.listedAt) >= config.timing.relistAgeDays);

    if (stale.length === 0) {
      console.log(`[relist] No listings older than ${config.timing.relistAgeDays} days.`);
      return;
    }

    console.log(`[relist] Found ${stale.length} stale listings to relist.`);

    for (let i = 0; i < stale.length; i++) {
      if (captchaPaused) {
        console.warn('[relist] Paused due to CAPTCHA — stopping relist cycle');
        break;
      }

      const listing = stale[i];
      const timestamp = nowPT();
      const success = await relistListing(page, listing);

      // Log for daily digest
      relistLog.push({ title: listing.title, timestamp, success });

      if (!success && await hasCaptcha(page)) {
        console.error('[relist] CAPTCHA detected during relisting!');
        await sendCaptchaAlert(`relisting: "${listing.title}"`).catch(console.error);
        captchaPaused = true;
        break;
      }

      if (i < stale.length - 1) {
        console.log(`[relist] Waiting ${config.timing.relistIntervalMs / 1000}s before next relist...`);
        await sleep(config.timing.relistIntervalMs);
      }
    }

    console.log(`[relist] Check complete at ${nowPT()}`);
  } catch (err) {
    if (!captchaPaused) {
      console.error('[relist] Check error:', err.message);
    }
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ── Daily digest scheduler ─────────────────────────────────────────────────────

/**
 * Schedule the daily digest to send at midnight PT.
 * Runs in a loop, checking every minute whether it's time.
 */
async function dailyDigestScheduler() {
  let lastSentDate = null;

  while (true) {
    await sleep(60000); // check every minute

    const now = new Date();
    const ptDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const today = ptDate.toDateString();

    // Send at midnight PT (hour 0, minute 0-2 window)
    if (ptDate.getHours() === 0 && ptDate.getMinutes() < 2 && lastSentDate !== today) {
      if (relistLog.length > 0) {
        console.log(`[digest] Sending daily digest — ${relistLog.length} relist entries`);
        await sendDailyDigest(relistLog).catch(console.error);
      } else {
        console.log('[digest] No relists today — skipping digest email');
      }
      relistLog = []; // reset for the new day
      lastSentDate = today;
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌟 PoshPulse starting up...');
  console.log(`  Username:       ${config.poshmark.username}`);
  console.log(`  Share interval: ${config.timing.shareIntervalMs / 1000}s between clicks`);
  console.log(`  Share cycle:    every ${config.timing.shareCycleMs / 60000} min`);
  console.log(`  Relist age:     ${config.timing.relistAgeDays} days`);
  console.log(`  Relist gap:     ${config.timing.relistIntervalMs / 1000}s between relists`);
  console.log(`  Notify email:   ${config.email.to}`);
  console.log('');

  if (!config.poshmark.username || !config.poshmark.password) {
    console.error('❌ POSHMARK_USERNAME and POSHMARK_PASSWORD must be set in environment variables.');
    process.exit(1);
  }

  // Start the daily digest scheduler in background
  dailyDigestScheduler().catch(console.error);

  // Run share cycle immediately on startup, then on interval
  const runShareLoop = async () => {
    while (true) {
      if (!captchaPaused) {
        await runShareCycle().catch(console.error);
      } else {
        console.log('[share] Captcha pause active — skipping cycle. Fix captcha and restart.');
      }
      console.log(`[share] Next cycle in ${config.timing.shareCycleMs / 60000} min`);
      await sleep(config.timing.shareCycleMs);
    }
  };

  // Run relist check immediately on startup, then on interval
  const runRelistLoop = async () => {
    while (true) {
      if (!captchaPaused) {
        await runRelistCheck().catch(console.error);
      }
      console.log(`[relist] Next check in ${config.timing.relistCheckIntervalMs / 60000} min`);
      await sleep(config.timing.relistCheckIntervalMs);
    }
  };

  // Run both loops concurrently
  await Promise.all([
    runShareLoop(),
    runRelistLoop(),
  ]);
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[poshpulse] SIGTERM received — shutting down gracefully...');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[poshpulse] SIGINT received — shutting down...');
  await closeBrowser();
  process.exit(0);
});

main().catch((err) => {
  console.error('[poshpulse] Fatal error:', err);
  process.exit(1);
});
