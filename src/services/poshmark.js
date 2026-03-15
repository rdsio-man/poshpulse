/**
 * poshmark.js — All Poshmark browser automation lives here.
 *
 * Exported functions:
 *   login(page)
 *   getActiveListings(page)          → [{ id, title, listedAt, shareBtn, relistBtn }]
 *   shareListing(page, listing)
 *   relistListing(page, listing)
 */

const { getContext } = require('./browser');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random delay between min and max ms — humanizes timing. */
function jitter(base, spreadMs = 5000) {
  return sleep(base + Math.floor(Math.random() * spreadMs));
}

const fs = require('fs');
const path = require('path');

// File dropped by the one-time setup tool when user enters their 2FA code
const VERIFY_CODE_FILE = path.join(__dirname, '../../.session/verify-code.txt');

// ── Login ──────────────────────────────────────────────────────────────────────

/**
 * Log in to Poshmark. Reuses the existing session if already logged in.
 * @param {import('playwright').Page} page
 * @param {string} username
 * @param {string} password
 */
async function login(page, username, password) {
  await page.goto('https://poshmark.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Already logged in?
  if (page.url().includes('/feed') || page.url().includes('/closet')) {
    console.log('[poshmark] Already logged in');
    return;
  }

  console.log('[poshmark] Logging in as', username);

  await page.fill('input[id="login_form_username_email"]', username);
  await sleep(800 + Math.random() * 400);
  await page.fill('input[id="login_form_password"]', password);
  await sleep(600 + Math.random() * 400);
  await page.click('button[type="submit"]');
  await sleep(3000 + Math.random() * 1000);

  // Poshmark may require email verification on new devices
  const currentUrl = page.url();
  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  if (currentUrl.includes('/login') && bodyText.toLowerCase().includes('verification code')) {
    console.log('[poshmark] Email verification required — check your email for the code');
    const code = await waitForVerificationCode(page);
    if (!code) throw new Error('Email verification code not entered in time');
  }

  // Wait for redirect to feed or closet
  await page.waitForURL(/\/(feed|closet)/, { timeout: 30000 });
  console.log('[poshmark] Login successful');
}

/**
 * Wait up to 5 minutes for the user to drop a verification code into
 * .session/verify-code.txt, then type it into the page and submit.
 */
async function waitForVerificationCode(page) {
  console.log('[poshmark] Waiting for verification code in .session/verify-code.txt ...');
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    if (fs.existsSync(VERIFY_CODE_FILE)) {
      const code = fs.readFileSync(VERIFY_CODE_FILE, 'utf8').trim();
      if (code) {
        fs.unlinkSync(VERIFY_CODE_FILE); // consume it
        console.log('[poshmark] Code received, submitting...');
        const codeInput = await page.$('input[name="otp"]').catch(() => null);
        if (codeInput) {
          await codeInput.fill(code);
          await sleep(500);
          // Click the "Done" button in the OTP modal (data-et-name="submit")
          await page.click('button[data-et-name="submit"]');
          await sleep(2000);
        }
        return code;
      }
    }
    await sleep(3000);
  }
  return null;
}

// ── Get active listings ────────────────────────────────────────────────────────

/**
 * Navigate to the seller's closet and scrape all active listings.
 * Returns an array of listing objects.
 *
 * @param {import('playwright').Page} page
 * @param {string} username  Poshmark username
 * @returns {Promise<Array<{
 *   id: string,
 *   title: string,
 *   listedAt: Date|null,
 *   listingUrl: string,
 * }>>}
 */
async function getActiveListings(page, username) {
  console.log('[poshmark] Fetching listings for:', username);

  const listings = [];
  let pageNum = 1;
  const maxPages = 20; // safety cap

  while (pageNum <= maxPages) {
    const url = `https://poshmark.com/closet/${username}?availability=available&my_closet=true&max_id=${pageNum}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000 + Math.random() * 1500);

    // Extract listing cards
    const pageListings = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-et-name="listing"]'));
      return cards.map((card) => {
        const anchor = card.querySelector('a[href*="/listing/"]');
        const titleEl = card.querySelector('[class*="title"]') || card.querySelector('a[title]');
        const title = titleEl?.getAttribute('title') || titleEl?.textContent?.trim() || '';
        const href = anchor?.getAttribute('href') || '';
        const listingUrl = href.startsWith('http') ? href : `https://poshmark.com${href}`;

        // Try to extract listing ID from URL
        const idMatch = href.match(/\/listing\/([a-f0-9]+)/);
        const id = idMatch ? idMatch[1] : null;

        return { id, title, listingUrl };
      }).filter((l) => l.id);
    });

    if (pageListings.length === 0) break;

    listings.push(...pageListings);
    pageNum++;
  }

  console.log(`[poshmark] Found ${listings.length} active listings`);
  return listings;
}

// ── Share a listing ────────────────────────────────────────────────────────────

/**
 * Open a listing page and click the Share button, then share to followers.
 *
 * @param {import('playwright').Page} page
 * @param {{ listingUrl: string, title: string }} listing
 * @returns {Promise<boolean>} true if shared successfully
 */
async function shareListing(page, listing) {
  try {
    await page.goto(listing.listingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500 + Math.random() * 1000);

    // Click the share button on the listing page
    const shareBtn = await page.$('[data-et-name="share"]') ||
                     await page.$('button[aria-label*="share" i]') ||
                     await page.$('[class*="share-btn"]');

    if (!shareBtn) {
      console.warn(`[poshmark] Share button not found for: ${listing.title}`);
      return false;
    }

    await shareBtn.click();
    await sleep(1000 + Math.random() * 500);

    // Click "Share to Followers" in the share modal
    const followersBtn = await page.waitForSelector(
      '[data-et-name="share_to_followers"], button:has-text("Followers"), [class*="followers"]',
      { timeout: 5000 }
    ).catch(() => null);

    if (followersBtn) {
      await followersBtn.click();
      await sleep(800 + Math.random() * 400);
    }

    console.log(`[poshmark] Shared: ${listing.title}`);
    return true;
  } catch (err) {
    console.warn(`[poshmark] Share failed for "${listing.title}": ${err.message}`);
    return false;
  }
}

// ── Relist a listing ───────────────────────────────────────────────────────────

/**
 * Relist a listing on Poshmark.
 *
 * Strategy (tried in order):
 *  1. Direct "Relist" button visible on the listing page (seller view).
 *  2. Open the ⋮ / more-actions dropdown, then click "Relist" inside it.
 *  3. Navigate to the edit page and look for a Relist option there.
 *
 * Each path handles a confirmation modal if one appears.
 *
 * @param {import('playwright').Page} page
 * @param {{ listingUrl: string, title: string, id: string }} listing
 * @returns {Promise<boolean>} true if relisted successfully
 */
async function relistListing(page, listing) {
  try {
    await page.goto(listing.listingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500 + Math.random() * 1000);

    // ── Strategy 1: direct Relist button on the listing page ──────────────────
    const directRelistBtn =
      await page.$('[data-et-name="relist_listing"]') ||
      await page.$('button:has-text("Relist")') ||
      await page.$('a:has-text("Relist")');

    if (directRelistBtn) {
      await directRelistBtn.click();
      await sleep(1000 + Math.random() * 500);
      await confirmRelistModal(page);
      console.log(`[poshmark] Relisted (direct): ${listing.title}`);
      return true;
    }

    // ── Strategy 2: ⋮ / more-actions dropdown ─────────────────────────────────
    const moreBtn =
      await page.$('[data-et-name="more_actions"]') ||
      await page.$('button[aria-label*="more" i]') ||
      await page.$('[class*="more-actions"]') ||
      await page.$('button[aria-label*="options" i]');

    if (moreBtn) {
      await moreBtn.click();
      await sleep(800 + Math.random() * 400);

      const dropdownRelist = await page.waitForSelector(
        'button:has-text("Relist"), [data-et-name="relist"], a:has-text("Relist")',
        { timeout: 3000 }
      ).catch(() => null);

      if (dropdownRelist) {
        await dropdownRelist.click();
        await sleep(1000 + Math.random() * 500);
        await confirmRelistModal(page);
        console.log(`[poshmark] Relisted (dropdown): ${listing.title}`);
        return true;
      }
    }

    // ── Strategy 3: edit page ──────────────────────────────────────────────────
    const editBtn =
      await page.$('[data-et-name="edit_listing"]') ||
      await page.$('button[aria-label*="edit" i]') ||
      await page.$('a[href*="/edit"]');

    if (editBtn) {
      await editBtn.click();
      await sleep(1500 + Math.random() * 500);

      const editPageRelist = await page.waitForSelector(
        'button:has-text("Relist"), [data-et-name="relist"]',
        { timeout: 3000 }
      ).catch(() => null);

      if (editPageRelist) {
        await editPageRelist.click();
        await sleep(1000 + Math.random() * 500);
        await confirmRelistModal(page);
        console.log(`[poshmark] Relisted (edit page): ${listing.title}`);
        return true;
      }
    }

    console.warn(`[poshmark] No Relist option found for: ${listing.title}`);
    return false;
  } catch (err) {
    console.warn(`[poshmark] Relist failed for "${listing.title}": ${err.message}`);
    return false;
  }
}

/**
 * Click the confirmation button in a Relist modal, if one appears.
 * @param {import('playwright').Page} page
 */
async function confirmRelistModal(page) {
  const confirmBtn = await page.waitForSelector(
    'button:has-text("Yes"), button:has-text("Relist"), button:has-text("Confirm"), [data-et-name="confirm_relist"]',
    { timeout: 5000 }
  ).catch(() => null);

  if (confirmBtn) {
    await confirmBtn.click();
    await sleep(2000 + Math.random() * 1000);
  }
}

// ── Check for CAPTCHA ──────────────────────────────────────────────────────────

/**
 * Returns true if the current page appears to have a CAPTCHA challenge.
 * @param {import('playwright').Page} page
 */
async function hasCaptcha(page) {
  const url = page.url();
  if (url.includes('captcha') || url.includes('challenge')) return true;

  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  return bodyText.toLowerCase().includes('captcha') ||
         bodyText.toLowerCase().includes("i'm not a robot");
}

module.exports = { login, getActiveListings, shareListing, relistListing, hasCaptcha, confirmRelistModal };
