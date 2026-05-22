import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

interface User {
  id: number;
  username: string;
  email?: string;
  mfa_enabled: number;
  mfa_method?: string;
  first_login: number;
  password_reset_required: number;
  created_at: string;
}

// Get all active users
db.all('SELECT id, username, email, mfa_enabled, mfa_method, first_login, password_reset_required, created_at FROM users ORDER BY created_at DESC', [], (err, rows: User[]) => {
  if (err) {
    console.error('Error fetching users:', err);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('\nNo active users found.\n');
  } else {
    console.log('\n==================== ACTIVE USERS ====================\n');
    console.log(`Total Active Users: ${rows.length}\n`);

    rows.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email || 'Not set'}`);
      console.log(`   MFA Enabled: ${user.mfa_enabled === 1 ? 'Yes' : 'No'}${user.mfa_enabled === 1 ? ` (${user.mfa_method})` : ''}`);
      console.log(`   First Login: ${user.first_login === 1 ? 'Pending' : 'Completed'}`);
      console.log(`   Password Reset Required: ${user.password_reset_required === 1 ? 'Yes' : 'No'}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
      console.log('');
    });
    console.log('======================================================\n');
  }

  db.close();
});
