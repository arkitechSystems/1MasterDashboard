import { initDatabase, findUserByUsername } from './database';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Wrapper function for database update
const dbRun = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// Get command line arguments
const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.log('Usage: npm run reset-password <username> <new-password>');
  console.log('Example: npm run reset-password john newpassword123');
  process.exit(1);
}

const main = async () => {
  try {
    await initDatabase();

    // Check if user exists
    const user = await findUserByUsername(username);

    if (!user) {
      console.error(`\n✗ User "${username}" not found!\n`);
      process.exit(1);
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password
    await dbRun(
      'UPDATE users SET password = ? WHERE username = ?',
      [hashedPassword, username]
    );

    console.log('\n✓ Password reset successfully!');
    console.log(`  Username: ${username}`);
    console.log(`  New password has been set\n`);

    db.close();
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Error resetting password:', error.message, '\n');
    db.close();
    process.exit(1);
  }
};

main();
