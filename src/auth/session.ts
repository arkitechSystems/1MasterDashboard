/**
 * Tiny module-level store for the current Auth0 access token and active
 * tenant id. The API services need to read these synchronously from inside
 * fetch wrappers — they can't all become hooks. The AuthGate component is
 * the single writer; everyone else reads.
 */

let accessToken: string | null = null;
let activeTenantId: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

export const setActiveTenantId = (tenantId: string | null) => {
  activeTenantId = tenantId;
  if (typeof localStorage !== 'undefined') {
    if (tenantId) localStorage.setItem('activeTenantId', tenantId);
    else localStorage.removeItem('activeTenantId');
  }
};

export const getActiveTenantId = (): string | null => {
  if (activeTenantId) return activeTenantId;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('activeTenantId');
  }
  return null;
};
