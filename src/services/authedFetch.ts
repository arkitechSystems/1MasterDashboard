/**
 * Single fetch wrapper every service uses. Pulls the Auth0 access token
 * and active tenant id from the in-memory session store and stamps them
 * on every request as Authorization + x-tenant-id headers.
 *
 * Works whether Auth0 is configured or not — when no token is present
 * (e.g. local dev, static deploy), the headers are simply omitted and
 * the request goes through anonymously.
 */

import { getAccessToken, getActiveTenantId } from '../auth/session';

export const authedFetch = (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const token = getAccessToken();
  const tenantId = getActiveTenantId();

  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (tenantId && !headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', tenantId);
  }

  return fetch(input, { ...init, headers });
};
