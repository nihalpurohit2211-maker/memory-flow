const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_IMG_URL = 'https://lh3.googleusercontent.com/drive-storage/AJQWtBORBwtCmU3iRz3Z7ABk0yzWQ4dQwivKg1_CJ-9s9MrHf2QNB3Fkz76oPfTkhXMMSyYt1CpXrocHW8cBg9L_zRSftwFdopPXLCYB_HkM=s200';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  
  // Set html with no-referrer
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta name="referrer" content="no-referrer">
    </head>
    <body>
      <h1>Image Test</h1>
      <img id="testimg" referrerpolicy="no-referrer" src="${TEST_IMG_URL}">
    </body>
  </html>`;

  await page.setContent(html, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    const img = document.getElementById('testimg');
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    };
  });

  console.log('CHROME DECODED IMAGE RESULT:', result);
  await browser.close();
}

main().catch(console.error);
