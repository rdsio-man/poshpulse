/**
 * browser.js — Manages the shared Playwright browser instance.
 *
 * Uses system Chromium on Railway (via nixpacks), falls back to
 * Playwright's bundled browser in local dev.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Persist browser session to disk so login/2FA is only needed once
const SESSION_DIR = path.join(__dirname, '../../.session');

function getChromiumExecutable() {
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const { execSync } = require('child_process');
    const result = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    if (result) return result;
  } catch (_) {}
  return undefined; // Playwright uses its own bundled browser
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/122.0.0.0 Safari/537.36';

let _browser = null;
let _context = null;

/**
 * Launch (or reuse) the shared browser + context.
 * @returns {Promise<import('playwright').BrowserContext>}
 */
async function getContext() {
  if (_browser && _browser.isConnected() && _context) {
    return _context;
  }

  console.log('[browser] Launching Chromium...');
  _browser = await chromium.launch({
    headless: true,
    executablePath: getChromiumExecutable(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  // Use a persistent context so cookies/session are saved across restarts
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  _context = await _browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    storageState: fs.existsSync(path.join(SESSION_DIR, 'state.json'))
      ? path.join(SESSION_DIR, 'state.json')
      : undefined,
  });

  // Save session state after every page navigation
  _context.on('page', (page) => {
    page.on('load', () => {
      _context.storageState({ path: path.join(SESSION_DIR, 'state.json') }).catch(() => {});
    });
  });

  return _context;
}

/**
 * Close the browser entirely (call on shutdown).
 */
async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
    _context = null;
  }
}

module.exports = { getContext, closeBrowser };
