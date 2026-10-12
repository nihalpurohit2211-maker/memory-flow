const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../data/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching Chrome from:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const failedRequests = [];
  const networkResponses = [];
  const consoleMessages = [];

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    consoleMessages.push({ type: 'error', text: err.toString() });
  });

  page.on('requestfailed', req => {
    failedRequests.push({
      url: req.url(),
      failure: req.failure() ? req.failure().errorText : 'unknown'
    });
  });

  page.on('response', res => {
    if (res.url().includes('googleusercontent') || res.url().includes('/api/')) {
      networkResponses.push({
        url: res.url(),
        status: res.status(),
        contentType: res.headers()['content-type']
      });
    }
  });

  console.log('Navigating to http://127.0.0.1:5173/c/elevate ...');
  await page.goto('http://127.0.0.1:5173/c/elevate', { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait extra 3 seconds for image rendering
  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot before repairs
  const beforeScreenshotPath = path.join(SCREENSHOT_DIR, 'reproduce_before.png');
  await page.screenshot({ path: beforeScreenshotPath, fullPage: true });
  console.log('Captured screenshot to:', beforeScreenshotPath);

  // Evaluate DOM
  const domInfo = await page.evaluate(() => {
    const titleEl = document.querySelector('header h1, h1, [data-testid="event-title"]');
    const headerTitle = titleEl ? titleEl.textContent.trim() : 'NO_H1_FOUND';

    const cards = Array.from(document.querySelectorAll('[id^="media-card-"]'));
    const cardData = cards.slice(0, 15).map(card => {
      const img = card.querySelector('img');
      const text = card.querySelector('p');
      const footer = card.querySelector('.bg-surface.border-t');
      return {
        id: card.id,
        caption: text ? text.textContent.trim() : '',
        cardWidth: card.offsetWidth,
        cardHeight: card.offsetHeight,
        footerHeight: footer ? footer.offsetHeight : 0,
        imgSrc: img ? img.src : null,
        imgNaturalWidth: img ? img.naturalWidth : 0,
        imgNaturalHeight: img ? img.naturalHeight : 0,
        imgComplete: img ? img.complete : false,
      };
    });

    return {
      headerTitle,
      totalCards: cards.length,
      sampleCards: cardData
    };
  });

  console.log('\n--- DOM EVALUATION ---');
  console.log('Header Title:', domInfo.headerTitle);
  console.log('Total Media Cards:', domInfo.totalCards);
  console.log('\nFirst 8 cards:');
  console.log(JSON.stringify(domInfo.sampleCards.slice(0, 8), null, 2));

  console.log('\n--- CONSOLE ERRORS ---');
  const errors = consoleMessages.filter(m => m.type === 'error');
  console.log('Error count:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('Console error:', e.text));

  console.log('\n--- FAILED REQUESTS ---');
  console.log('Failed request count:', failedRequests.length);
  failedRequests.slice(0, 10).forEach(f => console.log(f.url, f.failure));

  console.log('\n--- NETWORK RESPONSES (SAMPLE) ---');
  networkResponses.slice(0, 10).forEach(r => console.log(r.status, r.contentType, r.url.substring(0, 100)));

  await browser.close();
}

run().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
