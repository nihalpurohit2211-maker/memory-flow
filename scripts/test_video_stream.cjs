const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'memoryflow.db');
const db = new Database(dbPath);

const video = db.prepare("SELECT * FROM media_items WHERE mime_type LIKE 'video/%' LIMIT 1").get();
console.log('Testing video:', video.original_name, video.drive_file_id);

async function testStream() {
  const url = `https://drive.usercontent.google.com/download?id=${video.drive_file_id}&export=download`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Range': 'bytes=0-1024',
      },
    });
    console.log('Final URL Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Range:', res.headers.get('content-range'));
    console.log('Content-Length:', res.headers.get('content-length'));
    console.log('Accept-Ranges:', res.headers.get('accept-ranges'));
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

testStream();
