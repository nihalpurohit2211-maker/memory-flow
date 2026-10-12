const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'memoryflow.db');
const db = new Database(dbPath);

const videos = db.prepare("SELECT id, original_name, mime_type, size, duration, drive_file_id, drive_full_url, thumbnail_url FROM media_items WHERE mime_type LIKE 'video/%'").all();
console.log('Videos found in database:', videos.length);
videos.forEach(v => {
  console.log(`- ${v.original_name} (${v.mime_type}, ${v.size} bytes, id=${v.id})`);
  console.log(`  drive_file_id: ${v.drive_file_id}`);
  console.log(`  drive_full_url: ${v.drive_full_url}`);
  console.log(`  thumbnail_url: ${v.thumbnail_url ? v.thumbnail_url.slice(0, 80) : null}`);
});
