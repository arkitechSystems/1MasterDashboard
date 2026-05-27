// AES-256-GCM encryption for Plaid access_tokens at rest.
//
// Key comes from TOKEN_ENCRYPTION_KEY env var — must be 32 bytes (64 hex
// chars). On Render, set this as a Secret/Env var and rotate yearly.
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;        // GCM standard
const TAG_LEN = 16;       // GCM standard

const getKey = (): Buffer => {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    // Dev fallback — DO NOT use in production. Logged loudly to catch
    // accidental deploys without the env var set.
    console.warn(
      '[crypto] TOKEN_ENCRYPTION_KEY not set; using insecure dev key. ' +
      'Set this env var before going to production.',
    );
    return crypto.createHash('sha256').update('dev-only-insecure-key').digest();
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${buf.length}`);
  }
  return buf;
};

export const encryptToken = (plaintext: string): string => {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv || tag || ciphertext) — single string for DB storage
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decryptToken = (payload: string): string => {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
