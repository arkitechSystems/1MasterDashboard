/**
 * AuthGate — wraps the entire app. Behavior depends on whether Auth0 is
 * configured:
 *   - Not configured (no REACT_APP_AUTH0_* vars): children render directly,
 *     unchanged. Preserves the legacy ungated UX for local dev and the
 *     static GitHub Pages deploy.
 *   - Configured + not authenticated: renders a sign-in screen that
 *     redirects to the Auth0 Universal Login.
 *   - Configured + authenticated + no memberships: renders a "waiting for
 *     access" screen so a brand-new user knows the app is up but they
 *     need an admin to grant them a tenant.
 *   - Configured + authenticated + has memberships: renders children.
 */

import React, { useEffect } from 'react';
import { useAuth } from './useAuth';
import './AuthGate.css';

interface AuthGateProps {
  children: React.ReactNode;
}

const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const {
    authConfigured,
    isAuthenticated,
    isLoading,
    login,
    user,
    memberships,
  } = useAuth();

  // If a query string ?login=true came in from arkitechsystems.com, kick off
  // the login flow immediately on first paint.
  useEffect(() => {
    if (!authConfigured) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'true' && !isAuthenticated && !isLoading) {
      login();
    }
  }, [authConfigured, isAuthenticated, isLoading, login]);

  if (!authConfigured) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <div className="spinner" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <h1>ArkiTech Systems</h1>
          <p>Sign in to access your dashboard.</p>
          <button className="auth-btn" onClick={login}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (user && memberships.length === 0 && !user.superAdmin) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <h1>Welcome, {user.name || user.email}</h1>
          <p>
            Your account is active, but you haven't been granted access to a
            client tenant yet. Contact your administrator to be added.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGate;
