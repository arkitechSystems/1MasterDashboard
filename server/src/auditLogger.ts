import sqlite3 from 'sqlite3';
import path from 'path';
import { Request } from 'express';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Wrapper function for database insert
const dbRun = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// Event categories
export enum AuditCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  DATA_ACCESS = 'DATA_ACCESS',
  SYSTEM = 'SYSTEM',
  SECURITY = 'SECURITY',
  CONFIGURATION = 'CONFIGURATION'
}

// Event types
export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_VERIFY = 'TOKEN_VERIFY',
  FIRST_LOGIN_COMPLETE = 'FIRST_LOGIN_COMPLETE',
  PASSWORD_VERIFY_FAILED = 'PASSWORD_VERIFY_FAILED',

  // User management events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  ROLE_CHANGE = 'ROLE_CHANGE',

  // Data access events
  DATA_ACCESS = 'DATA_ACCESS',
  FINANCIAL_DATA_VIEW = 'FINANCIAL_DATA_VIEW',
  REPORT_GENERATED = 'REPORT_GENERATED',
  DATA_EXPORT = 'DATA_EXPORT',
  DASHBOARD_VIEW = 'DASHBOARD_VIEW',

  // Security events
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  INVALID_TOKEN = 'INVALID_TOKEN',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',

  // System events
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  CONFIG_CHANGE = 'CONFIG_CHANGE'
}

// Status types
export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

interface AuditLogEntry {
  userId?: number;
  username?: string;
  eventType: AuditEventType;
  eventCategory: AuditCategory;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  status: AuditStatus;
  metadata?: any;
}

// Helper function to extract IP address from request
export const getClientIP = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
  }
  return req.socket.remoteAddress || 'unknown';
};

// Main audit logging function
export const logAudit = async (entry: AuditLogEntry): Promise<void> => {
  try {
    const metadataString = entry.metadata ? JSON.stringify(entry.metadata) : null;

    await dbRun(
      `INSERT INTO audit_logs (
        user_id, username, event_type, event_category, description,
        ip_address, user_agent, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.userId || null,
        entry.username || null,
        entry.eventType,
        entry.eventCategory,
        entry.description,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.status,
        metadataString
      ]
    );

    // Also log to console for real-time monitoring
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT ${timestamp}] ${entry.eventCategory}:${entry.eventType} - ${entry.username || 'Anonymous'} - ${entry.status} - ${entry.description}`);
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Don't throw error to prevent audit logging from breaking the application
  }
};

// Convenience functions for common audit events

export const logLogin = async (
  username: string,
  success: boolean,
  req: Request,
  reason?: string
) => {
  await logAudit({
    username,
    eventType: success ? AuditEventType.LOGIN_SUCCESS : AuditEventType.LOGIN_FAILURE,
    eventCategory: AuditCategory.AUTHENTICATION,
    description: success
      ? `User logged in successfully`
      : `Failed login attempt${reason ? ': ' + reason : ''}`,
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
    status: success ? AuditStatus.SUCCESS : AuditStatus.FAILURE,
    metadata: { reason }
  });
};

export const logLogout = async (
  userId: number,
  username: string,
  req: Request
) => {
  await logAudit({
    userId,
    username,
    eventType: AuditEventType.LOGOUT,
    eventCategory: AuditCategory.AUTHENTICATION,
    description: 'User logged out',
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
    status: AuditStatus.SUCCESS
  });
};

export const logDataAccess = async (
  userId: number,
  username: string,
  dataType: string,
  req: Request,
  metadata?: any
) => {
  await logAudit({
    userId,
    username,
    eventType: AuditEventType.FINANCIAL_DATA_VIEW,
    eventCategory: AuditCategory.DATA_ACCESS,
    description: `Accessed ${dataType}`,
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
    status: AuditStatus.SUCCESS,
    metadata
  });
};

export const logUnauthorizedAccess = async (
  req: Request,
  resource: string,
  reason?: string
) => {
  await logAudit({
    eventType: AuditEventType.UNAUTHORIZED_ACCESS,
    eventCategory: AuditCategory.SECURITY,
    description: `Unauthorized access attempt to ${resource}${reason ? ': ' + reason : ''}`,
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
    status: AuditStatus.WARNING,
    metadata: { resource, reason }
  });
};

export const logUserCreation = async (
  adminUsername: string,
  newUsername: string,
  req?: Request
) => {
  await logAudit({
    username: adminUsername,
    eventType: AuditEventType.USER_CREATED,
    eventCategory: AuditCategory.USER_MANAGEMENT,
    description: `Created new user: ${newUsername}`,
    ipAddress: req ? getClientIP(req) : undefined,
    userAgent: req ? req.headers['user-agent'] : undefined,
    status: AuditStatus.SUCCESS,
    metadata: { newUsername }
  });
};

export const logPasswordReset = async (
  adminUsername: string,
  targetUsername: string,
  req?: Request
) => {
  await logAudit({
    username: adminUsername,
    eventType: AuditEventType.PASSWORD_RESET,
    eventCategory: AuditCategory.USER_MANAGEMENT,
    description: `Password reset for user: ${targetUsername}`,
    ipAddress: req ? getClientIP(req) : undefined,
    userAgent: req ? req.headers['user-agent'] : undefined,
    status: AuditStatus.SUCCESS,
    metadata: { targetUsername }
  });
};

export const logDataExport = async (
  userId: number,
  username: string,
  exportType: string,
  req: Request,
  recordCount?: number
) => {
  await logAudit({
    userId,
    username,
    eventType: AuditEventType.DATA_EXPORT,
    eventCategory: AuditCategory.DATA_ACCESS,
    description: `Exported ${exportType}${recordCount ? ` (${recordCount} records)` : ''}`,
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
    status: AuditStatus.SUCCESS,
    metadata: { exportType, recordCount }
  });
};

// Query audit logs
export const queryAuditLogs = async (filters: {
  userId?: number;
  username?: string;
  eventCategory?: AuditCategory;
  eventType?: AuditEventType;
  status?: AuditStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      sql += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.username) {
      sql += ' AND username = ?';
      params.push(filters.username);
    }

    if (filters.eventCategory) {
      sql += ' AND event_category = ?';
      params.push(filters.eventCategory);
    }

    if (filters.eventType) {
      sql += ' AND event_type = ?';
      params.push(filters.eventType);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.startDate) {
      sql += ' AND created_at >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export default {
  logAudit,
  logLogin,
  logLogout,
  logDataAccess,
  logUnauthorizedAccess,
  logUserCreation,
  logPasswordReset,
  logDataExport,
  queryAuditLogs,
  getClientIP,
  AuditCategory,
  AuditEventType,
  AuditStatus
};
