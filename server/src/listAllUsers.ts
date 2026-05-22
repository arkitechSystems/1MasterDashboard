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

interface AuditLog {
  username: string;
  created_at: string;
  description: string;
}

interface UserWithStatus {
  username: string;
  status: 'Active' | 'Deleted';
  email?: string;
  mfa_enabled?: string;
  first_login?: string;
  password_reset_required?: string;
  created_at: string;
  deleted_at?: string;
}

const getActiveUsers = (): Promise<User[]> => {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, username, email, mfa_enabled, mfa_method, first_login, password_reset_required, created_at FROM users ORDER BY created_at DESC', [], (err, rows: User[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const getDeletedUsers = (): Promise<AuditLog[]> => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DISTINCT username, created_at, description
       FROM audit_logs
       WHERE event_type = 'USER_DELETED'
       ORDER BY created_at DESC`,
      [],
      (err, rows: AuditLog[]) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const getUserCreationDates = (): Promise<{ [username: string]: string }> => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT username, MIN(created_at) as created_at
       FROM audit_logs
       WHERE event_type = 'USER_CREATED'
       GROUP BY username`,
      [],
      (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const dates: { [username: string]: string } = {};
          rows.forEach(row => {
            dates[row.username] = row.created_at;
          });
          resolve(dates);
        }
      }
    );
  });
};

(async () => {
  try {
    const activeUsers = await getActiveUsers();
    const deletedUsers = await getDeletedUsers();
    const creationDates = await getUserCreationDates();

    const allUsers: UserWithStatus[] = [];

    // Add active users
    activeUsers.forEach(user => {
      allUsers.push({
        username: user.username,
        status: 'Active',
        email: user.email,
        mfa_enabled: user.mfa_enabled === 1 ? `Yes (${user.mfa_method})` : 'No',
        first_login: user.first_login === 1 ? 'Pending' : 'Completed',
        password_reset_required: user.password_reset_required === 1 ? 'Yes' : 'No',
        created_at: user.created_at
      });
    });

    // Add deleted users (that aren't currently active)
    deletedUsers.forEach(log => {
      // Only add if not in active users
      if (!activeUsers.find(u => u.username === log.username)) {
        allUsers.push({
          username: log.username,
          status: 'Deleted',
          created_at: creationDates[log.username] || log.created_at,
          deleted_at: log.created_at
        });
      }
    });

    // Sort by creation date (newest first)
    allUsers.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    if (allUsers.length === 0) {
      console.log('\nNo users found.\n');
    } else {
      console.log('\n==================== ALL USERS (ACTIVE & DELETED) ====================\n');
      console.log(`Total Users: ${allUsers.length}`);
      console.log(`Active: ${allUsers.filter(u => u.status === 'Active').length}`);
      console.log(`Deleted: ${allUsers.filter(u => u.status === 'Deleted').length}\n`);

      allUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username} [${user.status}]`);

        if (user.status === 'Active') {
          console.log(`   Email: ${user.email || 'Not set'}`);
          console.log(`   MFA Enabled: ${user.mfa_enabled}`);
          console.log(`   First Login: ${user.first_login}`);
          console.log(`   Password Reset Required: ${user.password_reset_required}`);
          console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
        } else {
          console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
          console.log(`   Deleted: ${new Date(user.deleted_at!).toLocaleString()}`);
        }
        console.log('');
      });
      console.log('======================================================================\n');
    }

    db.close();
  } catch (error) {
    console.error('Error fetching users:', error);
    db.close();
    process.exit(1);
  }
})();
