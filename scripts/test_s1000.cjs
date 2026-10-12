const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'memoryflow.db');
const db = new Database(dbPath);

const sample = db.prepare("SELECT thumbnail_url FROM media_items LIMIT 1").get();
const s1000Url = sample.thumbnail_url.replace(/=s\d+/, '=s1000');

async function test() {
  const res = await fetch(s1000Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    }
  });
  console.log('s1000 Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  console.log('Content-Length:', res.headers.get('content-length'));
}

test();
