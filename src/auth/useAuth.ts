/**
 * Project-level useAuth hook. Wraps Auth0's useAuth0() and adds:
 *   - memberships list (loaded from /api/auth/me)
 *   - activeTenant + switchTenant()
 *   - super_admin flag
 *
 * Components should import from here, not directly from @auth0/auth0-react,
 * so we have one place to extend the auth surface as needs grow.
 */

import { useAuth0 } from '@auth0/auth0-react';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import {
  setAccessToken,
  setActiveTenantId,
  getActiveTenantId,
} from './session';

export type Role = 'tenant_admin' | 'dept_head' | 'viewer';

export interface Membership {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: Role;
  deptScope: string[];
}

export interface MeResponse {
  user: { id: string; email: string; name: string; superAdmin: boolean };
  memberships: Membership[];
  activeTenant: Membership | null;
}

const authConfigured = Boolean(
  process.env.REACT_APP_AUTH0_DOMAIN &&
    process.env.REACT_APP_AUTH0_CLIENT_ID,
);

export const useAuth = () => {
  const {
    user: auth0User,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout: auth0Logout,
    getAccessTokenSilently,
  } = useAuth0();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(false);

  const fetchMe = useCallback(async () => {
    if (!isAuthenticated || !authConfigured) return;
    setMeLoading(true);
    try {
      const token = await getAccessTokenSilently();
      setAccessToken(token);
      const tenantId = getActiveTenantId();
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: MeResponse = await res.json();
      setMe(json);
      if (json.activeTenant && !getActiveTenantId()) {
        setActiveTenantId(json.activeTenant.tenantId);
      }
      setMeError(null);
    } catch (e: any) {
      setMeError(e?.message || 'Failed to load user');
    } finally {
      setMeLoading(false);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Refresh the access token on a 50-minute cadence so it never goes
  // stale mid-session (default Auth0 access tokens last ~1 hour).
  useEffect(() => {
    if (!isAuthenticated || !authConfigured) return;
    const id = setInterval(async () => {
      try {
        const t = await getAccessTokenSilently();
        setAccessToken(t);
      } catch (e) {
        // Refresh failed — user will be re-prompted on the next 401.
      }
    }, 50 * 60 * 1000);
    return () => clearInterval(id);
  }, [isAuthenticated, getAccessTokenSilently]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      setActiveTenantId(tenantId);
      await fetchMe();
    },
    [fetchMe],
  );

  const login = useCallback(() => {
    loginWithRedirect();
  }, [loginWithRedirect]);

  const logout = useCallback(() => {
    setAccessToken(null);
    setActiveTenantId(null);
    auth0Logout({ logoutParams: { returnTo: window.location.origin } });
  }, [auth0Logout]);

  return {
    authConfigured,
    isAuthenticated,
    isLoading: isLoading || meLoading,
    auth0User,
    user: me?.user ?? null,
    memberships: me?.memberships ?? [],
    activeTenant: me?.activeTenant ?? null,
    isSuperAdmin: me?.user?.superAdmin ?? false,
    meError,
    login,
    logout,
    switchTenant,
    refreshMe: fetchMe,
  };
};
