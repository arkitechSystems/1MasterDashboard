import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const username = process.argv[2];

if (!username) {
  console.error('Usage: npm run delete-user <username>');
  process.exit(1);
}

// Delete user from database
db.run('DELETE FROM users WHERE username = ?', [username], function(err) {
  if (err) {
    console.error('Error deleting user:', err);
    process.exit(1);
  }

  if (this.changes === 0) {
    console.log(`User '${username}' not found.`);
  } else {
    console.log(`User '${username}' deleted successfully.`);
  }

  db.close();
});
