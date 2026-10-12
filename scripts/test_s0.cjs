const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'memoryflow.db');
const db = new Database(dbPath);

const sample = db.prepare("SELECT drive_full_url, thumbnail_url FROM media_items WHERE original_name = 'IMG_2186.JPG'").get();
console.log('drive_full_url:', sample.drive_full_url);

async function test() {
  const res = await fetch(sample.drive_full_url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    }
  });
  console.log('s0 Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  console.log('Content-Length:', res.headers.get('content-length'));

  const s1600Url = sample.thumbnail_url.replace(/=s\d+/, '=s1600');
  const res1600 = await fetch(s1600Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    }
  });
  console.log('s1600 Status:', res1600.status);
  console.log('s1600 Content-Type:', res1600.headers.get('content-type'));
  console.log('s1600 Content-Length:', res1600.headers.get('content-length'));
}

test();
