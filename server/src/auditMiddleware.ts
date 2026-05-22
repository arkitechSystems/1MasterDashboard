import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logDataAccess, logDataExport, getClientIP, AuditEventType, AuditCategory, AuditStatus, logAudit } from './auditLogger';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';

// Helper to extract user from JWT token
const getUserFromToken = (req: Request): { id: number; username: string } | null => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };
    return decoded;
  } catch {
    return null;
  }
};

// Middleware to log financial data access
export const auditDataAccess = (dataType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUserFromToken(req);

    if (user) {
      // Log the access
      await logDataAccess(user.id, user.username, dataType, req, {
        method: req.method,
        path: req.path,
        query: req.query
      });
    }

    next();
  };
};

// Middleware to log data exports
export const auditExport = (exportType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUserFromToken(req);

    if (user) {
      const recordCount = req.body?.recordCount || req.query?.recordCount;
      await logDataExport(user.id, user.username, exportType, req, recordCount as number);
    }

    next();
  };
};

// Middleware to log all API access with sensitive data
export const auditSensitiveAccess = async (req: Request, res: Response, next: NextFunction) => {
  const user = getUserFromToken(req);

  // Only log if authenticated and accessing certain paths
  const sensitivePaths = ['/api/financial', '/api/reports', '/api/admin'];
  const isSensitive = sensitivePaths.some(path => req.path.startsWith(path));

  if (user && isSensitive) {
    await logAudit({
      userId: user.id,
      username: user.username,
      eventType: AuditEventType.FINANCIAL_DATA_VIEW,
      eventCategory: AuditCategory.DATA_ACCESS,
      description: `Accessed ${req.path}`,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.SUCCESS,
      metadata: {
        method: req.method,
        path: req.path,
        query: req.query
      }
    });
  }

  next();
};

// Middleware to log dashboard views
export const auditDashboardView = async (req: Request, res: Response, next: NextFunction) => {
  const user = getUserFromToken(req);

  if (user) {
    await logAudit({
      userId: user.id,
      username: user.username,
      eventType: AuditEventType.DASHBOARD_VIEW,
      eventCategory: AuditCategory.DATA_ACCESS,
      description: 'Viewed dashboard',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.SUCCESS,
      metadata: {
        dashboardType: req.query.type || 'main'
      }
    });
  }

  next();
};

export default {
  auditDataAccess,
  auditExport,
  auditSensitiveAccess,
  auditDashboardView
};
