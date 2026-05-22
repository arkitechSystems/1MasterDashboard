import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { initDatabase, findUserByUsername, verifyPassword, createUser, enableMFA, disableMFA, saveBackupCodes, removeBackupCode, completeFirstLogin, updatePassword, clearPasswordResetRequired, updateUserRole } from './database';
import { logLogin, logUnauthorizedAccess, getClientIP, logAudit, AuditEventType, AuditCategory, AuditStatus } from './auditLogger';
import { generateMFASecret, verifyTOTP, generateBackupCodes, hashBackupCodes, verifyBackupCode, formatBackupCode, isValidMFATokenFormat, isValidBackupCodeFormat } from './mfaService';
import { sendSupportTicket } from './emailService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'https://connect301.arkitech-test.xyz',
  'https://cchddash-frontend.onrender.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Authentication middleware
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login endpoint
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password, mfaToken, backupCode } = req.body;

    if (!username || !password) {
      await logLogin(username || 'unknown', false, req, 'Missing credentials');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check master admin credentials first (bypasses database and MFA)
    const MASTER_ADMIN_USERNAME = process.env.MASTER_ADMIN_USERNAME;
    const MASTER_ADMIN_PASSWORD = process.env.MASTER_ADMIN_PASSWORD;

    if (MASTER_ADMIN_USERNAME && MASTER_ADMIN_PASSWORD &&
        username === MASTER_ADMIN_USERNAME && password === MASTER_ADMIN_PASSWORD) {
      // Master admin login successful
      const token = jwt.sign(
        {
          username: MASTER_ADMIN_USERNAME,
          role: 'admin',
          isMasterAdmin: true
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      await logAudit({
        userId: 0,
        username: MASTER_ADMIN_USERNAME,
        eventType: AuditEventType.LOGIN_SUCCESS,
        eventCategory: AuditCategory.SECURITY,
        description: 'Master admin login successful',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        status: AuditStatus.SUCCESS
      });

      return res.json({
        token,
        user: {
          username: MASTER_ADMIN_USERNAME,
          role: 'admin',
          isMasterAdmin: true
        }
      });
    }

    const user = await findUserByUsername(username);

    if (!user) {
      await logLogin(username, false, req, 'User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      await logLogin(username, false, req, 'Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if MFA is enabled for this user
    if (user.mfa_enabled === 1) {
      // If MFA token or backup code not provided, return status that MFA is required
      if (!mfaToken && !backupCode) {
        return res.json({
          mfaRequired: true,
          message: 'MFA verification required'
        });
      }

      // Verify MFA token or backup code
      let mfaValid = false;

      if (mfaToken) {
        // Verify TOTP token
        if (!isValidMFATokenFormat(mfaToken)) {
          await logLogin(username, false, req, 'Invalid MFA token format');
          return res.status(401).json({ error: 'Invalid MFA token format' });
        }

        mfaValid = verifyTOTP(mfaToken, user.mfa_secret!);

        if (!mfaValid) {
          await logLogin(username, false, req, 'Invalid MFA token');
          await logAudit({
            userId: user.id,
            username: user.username,
            eventType: AuditEventType.LOGIN_FAILURE,
            eventCategory: AuditCategory.SECURITY,
            description: 'Failed MFA verification',
            ipAddress: getClientIP(req),
            userAgent: req.headers['user-agent'],
            status: AuditStatus.WARNING
          });
          return res.status(401).json({ error: 'Invalid MFA token' });
        }
      } else if (backupCode) {
        // Verify backup code
        if (!isValidBackupCodeFormat(backupCode)) {
          await logLogin(username, false, req, 'Invalid backup code format');
          return res.status(401).json({ error: 'Invalid backup code format' });
        }

        const storedCodes = user.backup_codes ? JSON.parse(user.backup_codes) : [];
        const cleanBackupCode = backupCode.replace(/-/g, '');
        const result = await verifyBackupCode(cleanBackupCode, storedCodes);

        if (!result.valid) {
          await logLogin(username, false, req, 'Invalid backup code');
          await logAudit({
            userId: user.id,
            username: user.username,
            eventType: AuditEventType.LOGIN_FAILURE,
            eventCategory: AuditCategory.SECURITY,
            description: 'Failed backup code verification',
            ipAddress: getClientIP(req),
            userAgent: req.headers['user-agent'],
            status: AuditStatus.WARNING
          });
          return res.status(401).json({ error: 'Invalid backup code' });
        }

        // Remove used backup code
        await removeBackupCode(user.id, JSON.stringify(result.remainingCodes));

        // Log backup code usage
        await logAudit({
          userId: user.id,
          username: user.username,
          eventType: AuditEventType.LOGIN_SUCCESS,
          eventCategory: AuditCategory.AUTHENTICATION,
          description: 'Login with backup code (codes remaining: ' + result.remainingCodes.length + ')',
          ipAddress: getClientIP(req),
          userAgent: req.headers['user-agent'],
          status: AuditStatus.WARNING,
          metadata: { backupCodesRemaining: result.remainingCodes.length }
        });

        mfaValid = true;
      }

      if (!mfaValid) {
        return res.status(401).json({ error: 'MFA verification failed' });
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, mfaEnabled: user.mfa_enabled === 1 },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log successful login
    await logLogin(username, true, req);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mfa_enabled: user.mfa_enabled === 1,
        first_login: user.first_login === 1,
        password_reset_required: user.password_reset_required === 1
      },
      firstLogin: user.first_login === 1,
      passwordResetRequired: user.password_reset_required === 1
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unlock endpoint (for screensaver - bypasses MFA since user is already authenticated)
app.post('/api/auth/unlock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const decoded = (req as any).user;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = await findUserByUsername(decoded.username);

    if (!user) {
      await logUnauthorizedAccess(req, 'unlock', 'User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      await logAudit({
        userId: user.id,
        username: user.username,
        eventType: AuditEventType.LOGIN_FAILURE,
        eventCategory: AuditCategory.AUTHENTICATION,
        description: 'Failed screensaver unlock attempt',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        status: AuditStatus.FAILURE
      });
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate new JWT token (refresh the session)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, mfaEnabled: user.mfa_enabled === 1 },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log successful unlock
    await logAudit({
      userId: user.id,
      username: user.username,
      eventType: AuditEventType.LOGIN_SUCCESS,
      eventCategory: AuditCategory.AUTHENTICATION,
      description: 'Screensaver unlocked successfully',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.SUCCESS
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mfa_enabled: user.mfa_enabled === 1,
        first_login: user.first_login === 1,
        password_reset_required: user.password_reset_required === 1
      },
      firstLogin: user.first_login === 1,
      passwordResetRequired: user.password_reset_required === 1
    });
  } catch (error) {
    console.error('Unlock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint (optional - for creating new users)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password, email, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Validate role if provided
    if (role && !['dashboard', 'accountant', 'both', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "dashboard", "accountant", "both", or "admin"' });
    }

    // Check if user already exists
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const user = await createUser(username, password, email, role || 'both');

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request username endpoint (no authentication required)
app.post('/api/auth/request-username', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, address, phoneNumber, roleTitle } = req.body;

    if (!firstName || !lastName || !address || !roleTitle) {
      return res.status(400).json({ error: 'First name, last name, address, and role/title are required' });
    }

    // Generate a unique request number
    const requestNumber = `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Log the request in audit logs
    await logAudit({
      eventType: AuditEventType.USER_CREATED,
      eventCategory: AuditCategory.USER_MANAGEMENT,
      description: `Username request submitted: ${firstName} ${lastName}`,
      status: AuditStatus.SUCCESS,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'Unknown',
      metadata: {
        requestNumber,
        firstName,
        lastName,
        address,
        phoneNumber: phoneNumber || 'Not provided',
        roleTitle
      }
    });

    // In production, you would:
    // 1. Store this in a database table for pending requests
    // 2. Send an email notification to administrators
    // 3. Maybe send a confirmation email to the requester

    console.log('\n=== NEW USERNAME REQUEST ===');
    console.log(`Request Number: ${requestNumber}`);
    console.log(`Name: ${firstName} ${lastName}`);
    console.log(`Address: ${address}`);
    console.log(`Phone: ${phoneNumber || 'Not provided'}`);
    console.log(`Role/Title: ${roleTitle}`);
    console.log(`IP Address: ${getClientIP(req)}`);
    console.log('===========================\n');

    res.json({
      success: true,
      requestNumber,
      message: 'Your request has been submitted successfully. An administrator will contact you shortly.'
    });
  } catch (error) {
    console.error('Request username error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await logUnauthorizedAccess(req, '/api/auth/verify', 'No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

    res.json({
      valid: true,
      user: {
        id: decoded.id,
        username: decoded.username
      }
    });
  } catch (error) {
    await logUnauthorizedAccess(req, '/api/auth/verify', 'Invalid token');
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Verify password endpoint (for screensaver unlock)
app.post('/api/auth/verify-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      await logAudit({
        userId: user.id,
        username: user.username,
        eventType: AuditEventType.PASSWORD_VERIFY_FAILED,
        eventCategory: AuditCategory.AUTHENTICATION,
        description: 'Password verification failed for screensaver unlock',
        status: AuditStatus.FAILURE,
        metadata: { context: 'screensaver_unlock' },
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'Unknown'
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await logAudit({
      userId: user.id,
      username: user.username,
      eventType: AuditEventType.LOGIN,
      eventCategory: AuditCategory.AUTHENTICATION,
      description: 'Screensaver unlocked successfully',
      status: AuditStatus.SUCCESS,
      metadata: { context: 'screensaver_unlock' },
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'Unknown'
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MFA Setup - Generate QR code
app.post('/api/mfa/setup', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

    // Generate new MFA secret
    const mfaSetup = await generateMFASecret(decoded.username);

    // Store temporarily (user needs to verify before enabling)
    res.json({
      secret: mfaSetup.secret,
      qrCode: mfaSetup.qrCode,
      manualEntryKey: mfaSetup.manualEntryKey
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MFA Enable - Verify and enable MFA
app.post('/api/mfa/enable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

    const { secret, verificationCode } = req.body;

    if (!secret || !verificationCode) {
      return res.status(400).json({ error: 'Secret and verification code are required' });
    }

    // Verify the code works before enabling
    const isValid = verifyTOTP(verificationCode, secret);

    if (!isValid) {
      await logAudit({
        userId: decoded.id,
        username: decoded.username,
        eventType: AuditEventType.PASSWORD_CHANGE,
        eventCategory: AuditCategory.SECURITY,
        description: 'Failed MFA setup - invalid verification code',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        status: AuditStatus.FAILURE
      });
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate backup codes
    const backupCodesList = generateBackupCodes(10);
    const hashedCodes = await hashBackupCodes(backupCodesList);

    // Enable MFA and save backup codes
    await enableMFA(decoded.id, secret);
    await saveBackupCodes(decoded.id, JSON.stringify(hashedCodes));

    // Log MFA enablement
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.PASSWORD_CHANGE,
      eventCategory: AuditCategory.SECURITY,
      description: 'MFA enabled successfully',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.SUCCESS
    });

    res.json({
      success: true,
      backupCodes: backupCodesList.map(formatBackupCode),
      message: 'MFA enabled successfully. Save your backup codes in a secure location!'
    });
  } catch (error) {
    console.error('MFA enable error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MFA Disable - Turn off MFA
app.post('/api/mfa/disable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable MFA' });
    }

    // Verify password before disabling
    const user = await findUserByUsername(decoded.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Disable MFA
    await disableMFA(decoded.id);

    // Log MFA disablement
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.PASSWORD_CHANGE,
      eventCategory: AuditCategory.SECURITY,
      description: 'MFA disabled',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.WARNING
    });

    res.json({
      success: true,
      message: 'MFA disabled successfully'
    });
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MFA Status - Check if MFA is enabled
app.get('/api/mfa/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

    const user = await findUserByUsername(decoded.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const backupCodes = user.backup_codes ? JSON.parse(user.backup_codes) : [];

    res.json({
      mfaEnabled: user.mfa_enabled === 1,
      backupCodesRemaining: backupCodes.length
    });
  } catch (error) {
    console.error('MFA status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Force password reset endpoint (for first login)
app.post('/api/auth/reset-password-first-login', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const decoded = (req as any).user;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Both password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Update password
    await updatePassword(decoded.id, newPassword);

    // Log password change
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.PASSWORD_CHANGE,
      eventCategory: AuditCategory.AUTHENTICATION,
      description: 'User changed password on first login',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.SUCCESS
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete first login setup (after password reset and MFA setup)
app.post('/api/auth/complete-first-login', authMiddleware, async (req: Request, res: Response) => {
  try {
    const decoded = (req as any).user;

    await completeFirstLogin(decoded.id);

    // Log completion
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.FIRST_LOGIN_COMPLETE,
      eventCategory: AuditCategory.AUTHENTICATION,
      description: 'User completed first login setup',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      status: AuditStatus.SUCCESS
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Complete first login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role endpoint (protected)
app.put('/api/auth/update-role', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.body;
    const requestingUser = (req as any).user;

    if (!userId || !role) {
      return res.status(400).json({ error: 'User ID and role are required' });
    }

    // Validate role
    if (!['dashboard', 'accountant', 'both', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "dashboard", "accountant", "both", or "admin"' });
    }

    await logAudit({
      userId: requestingUser.id,
      username: requestingUser.username,
      eventType: AuditEventType.ROLE_CHANGE,
      eventCategory: AuditCategory.USER_MANAGEMENT,
      description: `Updated user ${userId} role to ${role}`,
      status: AuditStatus.SUCCESS,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      metadata: { targetUserId: userId, newRole: role }
    });

    await updateUserRole(userId, role);

    res.json({ message: 'User role updated successfully', role });
  } catch (error) {
    console.error('Update role error:', error);
    await logAudit({
      userId: (req as any).user?.id,
      username: (req as any).user?.username,
      eventType: AuditEventType.ROLE_CHANGE,
      eventCategory: AuditCategory.USER_MANAGEMENT,
      description: `Failed to update user role`,
      status: AuditStatus.FAILURE,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit support ticket endpoint
app.post('/api/tickets/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ticketNumber, subject, message } = req.body;
    const decoded = (req as any).user;

    if (!ticketNumber || !subject || !message) {
      return res.status(400).json({ error: 'Ticket number, subject, and message are required' });
    }

    // Get user details for the email
    const user = await findUserByUsername(decoded.username);

    // Send the ticket email
    const result = await sendSupportTicket(
      ticketNumber,
      subject,
      message,
      user?.email,
      decoded.username
    );

    if (!result.success) {
      await logAudit({
        userId: decoded.id,
        username: decoded.username,
        eventType: AuditEventType.SYSTEM_ERROR,
        eventCategory: AuditCategory.SYSTEM,
        description: `Failed to send support ticket #${ticketNumber}`,
        status: AuditStatus.FAILURE,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        metadata: { ticketNumber, subject }
      });

      return res.status(500).json({ error: result.message });
    }

    // Log successful ticket submission
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.SYSTEM_ERROR,
      eventCategory: AuditCategory.SYSTEM,
      description: `Submitted support ticket #${ticketNumber}: ${subject}`,
      status: AuditStatus.SUCCESS,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      metadata: { ticketNumber, subject }
    });

    res.json({ success: true, message: result.message, ticketNumber });
  } catch (error) {
    console.error('Ticket submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected GL Data endpoint - Requires authentication
app.get('/api/gl-data', authMiddleware, async (req: Request, res: Response) => {
  try {
    const decoded = (req as any).user;

    // Master admin has full access
    if (!decoded.isMasterAdmin) {
      // Check if user has appropriate role (dashboard, both, or admin)
      const user = await findUserByUsername(decoded.username);

      if (!user) {
        return res.status(403).json({ error: 'User not found' });
      }

      // Check role-based access
      const allowedRoles = ['dashboard', 'both', 'admin'];
      if (!allowedRoles.includes(user.role)) {
        await logAudit({
          userId: decoded.id,
          username: decoded.username,
          eventType: AuditEventType.UNAUTHORIZED_ACCESS,
          eventCategory: AuditCategory.SECURITY,
          description: 'Attempted to access GL data without proper role',
          status: AuditStatus.FAILURE,
          ipAddress: getClientIP(req),
          userAgent: req.headers['user-agent'],
          metadata: { userRole: user.role, requiredRoles: allowedRoles }
        });

        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      }
    }

    // Read GL data from server-side file
    const glDataPath = path.join(__dirname, '..', 'data', 'gldet.json');

    if (!fs.existsSync(glDataPath)) {
      console.error('GL data file not found at:', glDataPath);
      return res.status(500).json({ error: 'GL data file not found' });
    }

    const glData = JSON.parse(fs.readFileSync(glDataPath, 'utf-8'));

    // Log successful access
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.DATA_ACCESS,
      eventCategory: AuditCategory.SYSTEM,
      description: 'Accessed GL transaction data',
      status: AuditStatus.SUCCESS,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      metadata: { dataType: 'GL_TRANSACTIONS', recordCount: glData.length }
    });

    res.json(glData);
  } catch (error) {
    console.error('GL data access error:', error);
    const decoded = (req as any).user;

    await logAudit({
      userId: decoded?.id,
      username: decoded?.username,
      eventType: AuditEventType.SYSTEM_ERROR,
      eventCategory: AuditCategory.SYSTEM,
      description: 'Failed to access GL data',
      status: AuditStatus.FAILURE,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get GL data metadata endpoint (protected)
app.get('/api/gl-metadata', authMiddleware, async (req: Request, res: Response) => {
  try {
    const decoded = (req as any).user;

    // Master admin has full access
    if (!decoded.isMasterAdmin) {
      // Check if user has appropriate role (dashboard, both, or admin)
      const user = await findUserByUsername(decoded.username);

      if (!user) {
        return res.status(403).json({ error: 'User not found' });
      }

      // Check role-based access
      const allowedRoles = ['dashboard', 'both', 'admin'];
      if (!allowedRoles.includes(user.role)) {
        await logAudit({
          userId: decoded.id,
          username: decoded.username,
          eventType: AuditEventType.UNAUTHORIZED_ACCESS,
          eventCategory: AuditCategory.SECURITY,
          description: 'Attempted to access GL metadata without proper role',
          status: AuditStatus.FAILURE,
          ipAddress: getClientIP(req),
          userAgent: req.headers['user-agent'],
          metadata: { userRole: user.role, requiredRoles: allowedRoles }
        });

        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      }
    }

    // Get actual file stats from gldet.json
    const glDataPath = path.join(__dirname, '..', 'data', 'gldet.json');

    if (!fs.existsSync(glDataPath)) {
      console.error('GL data file not found at:', glDataPath);
      return res.status(404).json({ error: 'GL data file not found' });
    }

    // Get actual file modification time and size
    const stats = fs.statSync(glDataPath);
    const glMetadata = {
      lastModified: stats.mtime.toISOString(),
      fileSize: stats.size,
      updatedAt: new Date().toISOString()
    };

    // Log successful access
    await logAudit({
      userId: decoded.id,
      username: decoded.username,
      eventType: AuditEventType.DATA_ACCESS,
      eventCategory: AuditCategory.SYSTEM,
      description: 'Accessed GL metadata',
      status: AuditStatus.SUCCESS,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      metadata: { dataType: 'GL_METADATA' }
    });

    res.json(glMetadata);
  } catch (error) {
    console.error('GL metadata access error:', error);
    const decoded = (req as any).user;

    await logAudit({
      userId: decoded?.id,
      username: decoded?.username,
      eventType: AuditEventType.SYSTEM_ERROR,
      eventCategory: AuditCategory.SYSTEM,
      description: 'Failed to access GL metadata',
      status: AuditStatus.FAILURE,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent']
    });

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available months from GL data (protected)
app.get('/api/available-months', authMiddleware, async (req: Request, res: Response) => {
  try {
    const decoded = (req as any).user;

    // Master admin has full access
    if (!decoded.isMasterAdmin) {
      const user = await findUserByUsername(decoded.username);
      if (!user) {
        return res.status(403).json({ error: 'User not found' });
      }
      const userRole = (user as any).role;
      if (!['dashboard', 'both', 'admin'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const glDataPath = path.join(__dirname, '..', 'data', 'gldet.json');
    const rawData = fs.readFileSync(glDataPath, 'utf-8');
    const glData = JSON.parse(rawData);

    // Extract unique ME values, filter out empty/null
    const meValues: number[] = ([...new Set(
      glData.map((r: any) => r.ME).filter((v: any) => v && v !== '')
    )] as number[]).sort((a, b) => a - b);

    // Convert Excel serial date to month info
    const excelEpoch = new Date(1899, 11, 30).getTime();
    const monthNames = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    const shortMonthNames = ['Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'];

    const months = meValues.map((me: number) => {
      const date = new Date(excelEpoch + me * 86400000);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-based
      const value = `${year}-${String(month + 1).padStart(2, '0')}`;
      return {
        value,
        label: `${monthNames[month]} ${year}`,
        shortLabel: `${shortMonthNames[month]} ${year}`,
        meValue: me,
        fiscalYear: month >= 7 ? year + 1 : year // July=start of fiscal year
      };
    });

    res.json(months);
  } catch (error) {
    console.error('Available months error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize database and start server
const startServer = async () => {
  try {
    await initDatabase();
    console.log('Database initialized');

    if (USE_HTTPS) {
      // HTTPS server for local development
      const certPath = path.join(__dirname, '..', 'certs');
      const keyPath = path.join(certPath, 'key.pem');
      const certFilePath = path.join(certPath, 'cert.pem');

      if (!fs.existsSync(keyPath) || !fs.existsSync(certFilePath)) {
        console.error('\n⚠️  HTTPS is enabled but SSL certificates not found!');
        console.error('Run "npm run generate-certs" to create certificates.\n');
        process.exit(1);
      }

      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certFilePath)
      };

      https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`✓ HTTPS Server running on port ${PORT}`);
        console.log(`  Health check: https://localhost:${PORT}/api/health`);
        console.log(`  NOTE: Using self-signed certificate - browser will show security warning`);
      });
    } else {
      // HTTP server
      http.createServer(app).listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
