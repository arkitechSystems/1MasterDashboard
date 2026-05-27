// API Configuration
//
// Two deploy modes:
//   1. Backend API mode — set REACT_APP_API_URL at build time. Used by Render.
//   2. Static mode (GitHub Pages) — no API URL, fetches resolve to JSON files
//      bundled under {PUBLIC_URL}/data/. Auth-header writes still happen in
//      callers but are ignored by the static file host.

export const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const STATIC_MODE = !process.env.REACT_APP_API_URL;
const STATIC_BASE = `${process.env.PUBLIC_URL || ''}/data`;

const apiOrStatic = (apiPath: string, staticPath: string) =>
  STATIC_MODE ? `${STATIC_BASE}${staticPath}` : `${API_BASE_URL}${apiPath}`;

// API Endpoints
export const API_ENDPOINTS = {
  BASE_URL: API_BASE_URL,
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  UNLOCK: `${API_BASE_URL}/api/auth/unlock`,
  REGISTER: `${API_BASE_URL}/api/auth/register`,
  VERIFY: `${API_BASE_URL}/api/auth/verify`,
  HEALTH: `${API_BASE_URL}/api/health`,
  MFA_SETUP: `${API_BASE_URL}/api/mfa/setup`,
  MFA_ENABLE: `${API_BASE_URL}/api/mfa/enable`,
  MFA_DISABLE: `${API_BASE_URL}/api/mfa/disable`,
  MFA_STATUS: `${API_BASE_URL}/api/mfa/status`,
  RESET_PASSWORD_FIRST_LOGIN: `${API_BASE_URL}/api/auth/reset-password-first-login`,
  COMPLETE_FIRST_LOGIN: `${API_BASE_URL}/api/auth/complete-first-login`,
  SUBMIT_TICKET: `${API_BASE_URL}/api/tickets/submit`,
  GL_DATA: apiOrStatic('/api/gl-data', '/gldet.json'),
  GL_METADATA: apiOrStatic('/api/gl-metadata', '/gldet-metadata.json'),
  AVAILABLE_MONTHS: apiOrStatic('/api/available-months', '/available-months.json'),
};

// Helper function to build API endpoint URLs
export const getApiUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint}`;
};
