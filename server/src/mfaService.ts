import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * MFA (Multi-Factor Authentication) Service
 *
 * Uses TOTP (Time-based One-Time Password) algorithm
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, etc.
 */

export interface MFASetup {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
}

/**
 * Generate a new MFA secret for a user
 */
export const generateMFASecret = async (username: string, issuer: string = 'CchdDash'): Promise<MFASetup> => {
  // Generate a new secret
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${username})`,
    issuer: issuer,
    length: 32
  });

  // Generate QR code for easy scanning
  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url as string);

  return {
    secret: secret.base32,
    qrCode: qrCodeDataUrl,
    manualEntryKey: secret.base32
  };
};

/**
 * Verify a TOTP code against a secret
 */
export const verifyTOTP = (token: string, secret: string): boolean => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2 // Allow 2 time steps before/after (60 seconds total window)
  });
};

/**
 * Generate backup codes for account recovery
 * Returns 10 random 8-character codes
 */
export const generateBackupCodes = (count: number = 10): string[] => {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }

  return codes;
};

/**
 * Hash backup codes for storage
 */
export const hashBackupCodes = async (codes: string[]): Promise<string[]> => {
  const bcrypt = require('bcryptjs');
  const hashedCodes = await Promise.all(
    codes.map(code => bcrypt.hash(code, 10))
  );
  return hashedCodes;
};

/**
 * Verify a backup code against stored hashed codes
 */
export const verifyBackupCode = async (code: string, hashedCodes: string[]): Promise<{ valid: boolean; remainingCodes: string[] }> => {
  const bcrypt = require('bcryptjs');

  for (let i = 0; i < hashedCodes.length; i++) {
    const isValid = await bcrypt.compare(code, hashedCodes[i]);
    if (isValid) {
      // Remove the used backup code
      const remainingCodes = [...hashedCodes];
      remainingCodes.splice(i, 1);

      return {
        valid: true,
        remainingCodes
      };
    }
  }

  return {
    valid: false,
    remainingCodes: hashedCodes
  };
};

/**
 * Format backup codes for display (adds dashes for readability)
 */
export const formatBackupCode = (code: string): string => {
  return code.match(/.{1,4}/g)?.join('-') || code;
};

/**
 * Validate MFA token format
 */
export const isValidMFATokenFormat = (token: string): boolean => {
  // TOTP tokens are 6 digits
  return /^\d{6}$/.test(token);
};

/**
 * Validate backup code format
 */
export const isValidBackupCodeFormat = (code: string): boolean => {
  // Backup codes are 8 hex characters (optionally with dashes)
  const cleanCode = code.replace(/-/g, '');
  return /^[A-F0-9]{8}$/i.test(cleanCode);
};

export default {
  generateMFASecret,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  formatBackupCode,
  isValidMFATokenFormat,
  isValidBackupCodeFormat
};
