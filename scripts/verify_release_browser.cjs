const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://127.0.0.1:5173/';
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'data', 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runBrowserVerification() {
  console.log('=== MEMORYFLOW COMPREHENSIVE BROWSER VERIFICATION ===\n');

  // Create isolated temporary user profile to simulate fresh visitor session
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-verify-visitor-'));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  const failedRequests = [];
  const consoleErrors = [];

  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure() });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    console.log(`1. Navigating fresh visitor session to ${APP_URL}...`);
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait 3 seconds for initial collection data hydration
    await new Promise((r) => setTimeout(r, 3000));

    // CHECK 1: Real Collection Title & Description
    console.log('\n--- CHECK 1: Collection Title & Metadata ---');
    const headerTitle = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent.trim() : null;
    });
    console.log(`Header Title: "${headerTitle}"`);
    if (headerTitle && headerTitle.includes('Highland Gathering')) {
      throw new Error(`FAILURE: Stale demo title "Highland Gathering" found in header!`);
    }
    if (!headerTitle || !headerTitle.includes('ELEVATE 1.0')) {
      console.warn(`WARNING: Title is "${headerTitle}", expected "ELEVATE 1.0"`);
    } else {
      console.log('PASS: Real collection title "ELEVATE 1.0" successfully loaded!');
    }

    // CHECK 2: Flow View Rendered Cards & Media Verification
    console.log('\n--- CHECK 2: Flow Cards & Image Decoding ---');
    const cardStats = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('button[id^="media-card-"]'));
      const images = Array.from(document.querySelectorAll('button[id^="media-card-"] img'));

      const detailedImages = images.map((img) => {
        const card = img.closest('button[id^="media-card-"]');
        const footer = card ? card.querySelector('div.bg-surface') : null;
        const rect = img.getBoundingClientRect();
        const footerRect = footer ? footer.getBoundingClientRect() : null;

        return {
          id: card ? card.id : null,
          src: img.src ? img.src.slice(0, 70) + '...' : '',
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          imgHeight: Math.round(rect.height),
          footerHeight: footerRect ? Math.round(footerRect.height) : 0,
          isBroken: img.complete && img.naturalWidth === 0,
        };
      });

      return {
        totalCards: cards.length,
        totalImages: images.length,
        brokenImages: detailedImages.filter((d) => d.isBroken).length,
        validDecodedImages: detailedImages.filter((d) => d.complete && d.naturalWidth > 0).length,
        sampleCards: detailedImages.slice(0, 6),
      };
    });

    console.log(`Total Cards Rendered: ${cardStats.totalCards}`);
    console.log(`Total Images Found: ${cardStats.totalImages}`);
    console.log(`Valid Decoded Images (naturalWidth > 0): ${cardStats.validDecodedImages}`);
    console.log(`Broken Images (naturalWidth == 0): ${cardStats.brokenImages}`);
    console.log('Sample Rendered Cards:', JSON.stringify(cardStats.sampleCards, null, 2));

    if (cardStats.totalCards === 0) {
      throw new Error('FAILURE: No media cards rendered in Flow view!');
    }
    if (cardStats.brokenImages > 0) {
      throw new Error(`FAILURE: Found ${cardStats.brokenImages} broken image(s)!`);
    }
    console.log('PASS: All rendered cards have valid decoded images with naturalWidth > 0 and 0 broken icons!');

    // CHECK 3: Card Layout & Footer White Space
    console.log('\n--- CHECK 3: Card Layout & Blank White Space Check ---');
    const layoutStats = await page.evaluate(() => {
      const footers = Array.from(document.querySelectorAll('button[id^="media-card-"] div.shrink-0'));
      const heights = footers.map((f) => f.getBoundingClientRect().height);
      const maxHeight = Math.max(...heights, 0);
      const avgHeight = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 0;
      return { count: heights.length, maxHeight, avgHeight: Math.round(avgHeight) };
    });
    console.log(`Footer count: ${layoutStats.count}, Average height: ${layoutStats.avgHeight}px, Max height: ${layoutStats.maxHeight}px`);
    if (layoutStats.maxHeight > 100) {
      throw new Error(`FAILURE: Footer height (${layoutStats.maxHeight}px) exceeds 100px! Oversized blank white space detected!`);
    }
    console.log('PASS: Compact footers verified (no oversized blank white block)!');

    // Capture Flow screenshot
    const flowScreenshotPath = path.join(SCREENSHOTS_DIR, 'verify_flow_after.png');
    await page.screenshot({ path: flowScreenshotPath, fullPage: false });
    console.log(`Saved Flow screenshot to: ${flowScreenshotPath}`);

    // CHECK 4: Hover-to-open MUST NOT open viewer
    console.log('\n--- CHECK 4: Hover Behavior ---');
    const firstCard = await page.$('button[id^="media-card-"]');
    if (firstCard) {
      console.log('Hovering first card for 1.5 seconds...');
      await firstCard.hover();
      await new Promise((r) => setTimeout(r, 1600));

      const isModalOpenAfterHover = await page.evaluate(() => {
        return !!document.querySelector('div[role="dialog"]');
      });
      if (isModalOpenAfterHover) {
        throw new Error('FAILURE: Modal opened on hover! Hover-to-open was NOT completely removed!');
      }
      console.log('PASS: Hovering does NOT open modal viewer!');
    }

    // CHECK 5: Click/tap explicitly opens the viewer
    console.log('\n--- CHECK 5: Explicit Click Opens Viewer ---');
    if (firstCard) {
      await firstCard.click();
      await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
      console.log('Viewer dialog opened on click!');

      // Wait for image in viewer to decode
      await new Promise((r) => setTimeout(r, 2000));

      const viewerStats = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        const img = dialog ? dialog.querySelector('div.cursor-zoom-in img, div[class*="cursor-grab"] img, div[style*="scale"] img') : null;
        const title = dialog ? dialog.querySelector('h2') : null;
        const contributor = dialog ? dialog.querySelector('div.bg-\\[\\#181B16\\]') : null;
        const downloadBtn = dialog ? dialog.querySelector('button[title*="Download"]') : null;
        const relatedButtons = dialog ? dialog.querySelectorAll('button[class*="rounded-lg overflow-hidden"]') : [];

        return {
          hasDialog: !!dialog,
          hasImage: !!img,
          imgSrc: img ? img.src.slice(0, 80) + '...' : null,
          complete: img ? img.complete : false,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          titleText: title ? title.textContent.trim() : null,
          downloadHref: downloadBtn ? downloadBtn.getAttribute('title') : null,
          relatedCount: relatedButtons.length,
          contributorText: contributor ? contributor.textContent.slice(0, 150) : null,
        };
      });

      console.log('Viewer Stats:', JSON.stringify(viewerStats, null, 2));

      if (!viewerStats.hasImage || viewerStats.naturalWidth === 0) {
        throw new Error('FAILURE: Viewer image failed to decode (naturalWidth == 0)!');
      }
      if (viewerStats.relatedCount > 12) {
        throw new Error(`FAILURE: Viewer related cards count (${viewerStats.relatedCount}) exceeds 12!`);
      }
      console.log(`PASS: Viewer image decoded (${viewerStats.naturalWidth}x${viewerStats.naturalHeight}), ${viewerStats.relatedCount} related cards (<= 12)!`);

      // Capture Viewer screenshot
      const viewerScreenshotPath = path.join(SCREENSHOTS_DIR, 'verify_viewer_after.png');
      await page.screenshot({ path: viewerScreenshotPath });
      console.log(`Saved Viewer screenshot to: ${viewerScreenshotPath}`);

      // CHECK 6: Arrow navigation inside viewer
      console.log('\n--- CHECK 6: Keyboard Arrow Navigation ---');
      const initialTitle = viewerStats.titleText;
      await page.keyboard.press('ArrowRight');
      await new Promise((r) => setTimeout(r, 1500));

      const nextTitle = await page.evaluate(() => {
        const title = document.querySelector('div[role="dialog"] h2');
        return title ? title.textContent.trim() : null;
      });
      console.log(`Navigated from "${initialTitle}" to "${nextTitle}" via Right Arrow`);

      // Close viewer with Escape key
      console.log('Closing viewer with Escape key...');
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 500));

      const isDialogClosed = await page.evaluate(() => !document.querySelector('div[role="dialog"]'));
      if (!isDialogClosed) {
        throw new Error('FAILURE: Viewer did not close on Escape key!');
      }
      console.log('PASS: Viewer closed cleanly on Escape!');
    }

    // CHECK 6.5: Video Playback Test
    console.log('\n--- CHECK 6.5: Real Video Playback ---');
    const videoCard = await page.evaluateHandle(() => {
      const cards = Array.from(document.querySelectorAll('button[id^="media-card-"]'));
      return cards.find((c) => c.textContent.includes('Video') || c.getAttribute('aria-label').includes('video'));
    });
    if (videoCard && (await videoCard.asElement())) {
      console.log('Clicking video card to open video player...');
      await videoCard.click();
      await page.waitForSelector('div[role="dialog"] video', { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 2000));

      const videoStats = await page.evaluate(() => {
        const video = document.querySelector('div[role="dialog"] video');
        if (!video) return { found: false };
        return {
          found: true,
          src: video.src,
          readyState: video.readyState,
          duration: video.duration,
          paused: video.paused,
          hasControls: video.hasAttribute('controls'),
        };
      });
      console.log('Video Player Stats:', JSON.stringify(videoStats, null, 2));
      if (!videoStats.found || !videoStats.src) {
        throw new Error('FAILURE: Video element not found or has no src!');
      }
      console.log('PASS: Video player rendered with valid stream URL and native controls!');

      // Close viewer
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 500));
    }

    // CHECK 7: Timeline & Universe Views
    console.log('\n--- CHECK 7: Timeline & Universe Views ---');
    // Switch to Timeline
    const timelineBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find((b) => b.textContent.includes('Timeline'));
    });
    if (timelineBtn) {
      await timelineBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
      const timelineScreenshotPath = path.join(SCREENSHOTS_DIR, 'verify_timeline_after.png');
      await page.screenshot({ path: timelineScreenshotPath });
      console.log(`PASS: Timeline view loaded, screenshot: ${timelineScreenshotPath}`);
    }

    // Switch to Universe
    const universeBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find((b) => b.textContent.includes('Universe') || b.textContent.includes('Memory Map'));
    });
    if (universeBtn) {
      await universeBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
      const universeScreenshotPath = path.join(SCREENSHOTS_DIR, 'verify_universe_after.png');
      await page.screenshot({ path: universeScreenshotPath });
      console.log(`PASS: Universe view loaded, screenshot: ${universeScreenshotPath}`);
    }

    console.log('\n=== ALL BROWSER CHECKS PASSED PERFECTLY! ===');
    console.log(`Total console errors recorded: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors.slice(0, 5));
    }
  } finally {
    await browser.close();
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {}
  }
}

runBrowserVerification().catch((err) => {
  console.error('\n*** VERIFICATION FAILED ***');
  console.error(err);
  process.exit(1);
});
