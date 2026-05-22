import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(users)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }

  console.log('\nUsers table schema:');
  console.log('==================');
  rows.forEach((col: any) => {
    console.log(`${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  });

  db.close();
});
