const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'memoryflow.db');
const db = new Database(dbPath);

const sample = db.prepare("SELECT id, original_name, thumbnail_url, low_res_url, drive_full_url FROM media_items LIMIT 5").all();
sample.forEach(s => {
  console.log(s.original_name);
  console.log('  thumb:', s.thumbnail_url);
  console.log('  lowRes:', s.low_res_url);
  console.log('  full:', s.drive_full_url);
});
