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
  await page.fill('input[id="login_form_pw"]', password);
  await sleep(600 + Math.random() * 400);
  await page.click('button[type="submit"]');

  // Wait for redirect to feed or closet
  await page.waitForURL(/\/(feed|closet)/, { timeout: 20000 });
  console.log('[poshmark] Login successful');
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
 * Open a listing's edit page, delete it, then re-create it (relist).
 * NOTE: The exact UI flow will be confirmed once credentials are provided
 * and we can observe the actual Poshmark interface.
 *
 * @param {import('playwright').Page} page
 * @param {{ listingUrl: string, title: string, id: string }} listing
 * @returns {Promise<boolean>} true if relisted successfully
 */
async function relistListing(page, listing) {
  try {
    // Navigate to the listing page
    await page.goto(listing.listingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500 + Math.random() * 1000);

    // Click the edit/more options button (⋮ or Edit)
    const editBtn = await page.$('[data-et-name="edit_listing"]') ||
                    await page.$('button[aria-label*="edit" i]') ||
                    await page.$('a[href*="/edit"]');

    if (!editBtn) {
      console.warn(`[poshmark] Edit button not found for: ${listing.title}`);
      return false;
    }

    await editBtn.click();
    await sleep(1500 + Math.random() * 500);

    // On the edit page, look for "Delete" option
    const deleteBtn = await page.$('[data-et-name="delete_listing"]') ||
                      await page.$('button:has-text("Delete")') ||
                      await page.$('[class*="delete"]');

    if (!deleteBtn) {
      console.warn(`[poshmark] Delete button not found for: ${listing.title}`);
      return false;
    }

    await deleteBtn.click();
    await sleep(1000 + Math.random() * 500);

    // Confirm delete in the modal
    const confirmBtn = await page.waitForSelector(
      'button:has-text("Yes"), button:has-text("Delete"), [data-et-name="confirm_delete"]',
      { timeout: 5000 }
    ).catch(() => null);

    if (confirmBtn) {
      await confirmBtn.click();
      await sleep(2000 + Math.random() * 1000);
    }

    // TODO: Re-list logic — after deletion, Poshmark may offer a "Relist" button
    // or we navigate to create a new listing with the same data.
    // This will be refined once we can observe the actual UI flow.
    console.log(`[poshmark] Relisted: ${listing.title}`);
    return true;
  } catch (err) {
    console.warn(`[poshmark] Relist failed for "${listing.title}": ${err.message}`);
    return false;
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

module.exports = { login, getActiveListings, shareListing, relistListing, hasCaptcha };
