import sqlite3 from 'sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Wrapper functions for database operations
const dbRun = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export interface User {
  id: number;
  username: string;
  password: string;
  email?: string;
  role: string; // 'dashboard', 'accountant', 'both', 'admin'
  mfa_enabled: number;
  mfa_method?: string; // 'app' or 'email'
  mfa_secret?: string;
  backup_codes?: string;
  first_login: number; // 1 = needs password reset & MFA setup, 0 = completed
  password_reset_required: number; // 1 = must reset password, 0 = password ok
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  username?: string;
  event_type: string;
  event_category: string;
  description: string;
  ip_address?: string;
  user_agent?: string;
  status: string;
  metadata?: string;
  created_at: string;
}

// Initialize database
export const initDatabase = async () => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'both',
      mfa_enabled INTEGER DEFAULT 0,
      mfa_method TEXT DEFAULT 'app',
      mfa_secret TEXT,
      backup_codes TEXT,
      first_login INTEGER DEFAULT 1,
      password_reset_required INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns to existing table if they don't exist
  try {
    await dbRun('ALTER TABLE users ADD COLUMN first_login INTEGER DEFAULT 1');
  } catch (e) {
    // Column already exists
  }

  try {
    await dbRun('ALTER TABLE users ADD COLUMN password_reset_required INTEGER DEFAULT 1');
  } catch (e) {
    // Column already exists
  }

  try {
    await dbRun('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "both"');
  } catch (e) {
    // Column already exists
  }

  // Create audit_logs table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      event_type TEXT NOT NULL,
      event_category TEXT NOT NULL,
      description TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Create index for faster queries
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event_category ON audit_logs(event_category)
  `);

  // Check if default user exists
  const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', ['Concho1']);

  if (!existingUser) {
    // Create default user with hashed password
    const hashedPassword = await bcrypt.hash('password', 10);
    await dbRun(
      'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
      ['Concho1', hashedPassword, 'admin@cchddash.com']
    );
    console.log('Default user created: Concho1');
  }
};

export const findUserByUsername = async (username: string): Promise<User | undefined> => {
  return await dbGet('SELECT * FROM users WHERE username = ?', [username]) as User | undefined;
};

export const createUser = async (username: string, password: string, email?: string, role: string = 'both'): Promise<User> => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await dbRun(
    'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
    [username, hashedPassword, email, role]
  );

  const user = await dbGet('SELECT * FROM users WHERE id = ?', [(result as any).lastID]) as User;
  return user;
};

export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

// MFA-related functions
export const enableMFA = async (userId: number, secret: string, method: string = 'app'): Promise<void> => {
  await dbRun('UPDATE users SET mfa_enabled = 1, mfa_secret = ?, mfa_method = ? WHERE id = ?', [secret, method, userId]);
};

export const disableMFA = async (userId: number): Promise<void> => {
  await dbRun('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, backup_codes = NULL WHERE id = ?', [userId]);
};

export const saveBackupCodes = async (userId: number, codes: string): Promise<void> => {
  await dbRun('UPDATE users SET backup_codes = ? WHERE id = ?', [codes, userId]);
};

export const removeBackupCode = async (userId: number, remainingCodes: string): Promise<void> => {
  await dbRun('UPDATE users SET backup_codes = ? WHERE id = ?', [remainingCodes, userId]);
};

// First login related functions
export const completeFirstLogin = async (userId: number): Promise<void> => {
  await dbRun('UPDATE users SET first_login = 0 WHERE id = ?', [userId]);
};

export const clearPasswordResetRequired = async (userId: number): Promise<void> => {
  await dbRun('UPDATE users SET password_reset_required = 0 WHERE id = ?', [userId]);
};

export const updatePassword = async (userId: number, newPassword: string): Promise<void> => {
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await dbRun('UPDATE users SET password = ?, password_reset_required = 0 WHERE id = ?', [hashedPassword, userId]);
};

export const requirePasswordReset = async (userId: number): Promise<void> => {
  await dbRun('UPDATE users SET password_reset_required = 1 WHERE id = ?', [userId]);
};

export const updateUserRole = async (userId: number, role: string): Promise<void> => {
  if (!['dashboard', 'accountant', 'both', 'admin'].includes(role)) {
    throw new Error('Invalid role. Must be "dashboard", "accountant", "both", or "admin"');
  }
  await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
};

export default db;
