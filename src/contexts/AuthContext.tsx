import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';
// Updated: removed auto-logout, added password unlock for screensaver

interface LoginResult {
  success: boolean;
  mfaRequired?: boolean;
  mfaEnabled?: boolean;
  firstLogin?: boolean;
  passwordResetRequired?: boolean;
  error?: string;
  errorType?: 'auth' | 'server' | 'network';
}

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string, mfaToken?: string, backupCode?: string) => Promise<LoginResult>;
  logout: () => void;
  unlock: (password: string) => Promise<LoginResult>;
  username: string | null;
  role: string | null; // 'dashboard', 'accountant', 'both', 'admin'
  isLoading: boolean;
  mfaEnabled: boolean;
  firstLogin: boolean;
  passwordResetRequired: boolean;
  completeFirstLogin: () => void;
  hasRole: (requiredRole: 'dashboard' | 'accountant' | 'admin') => boolean;
  isAdmin: () => boolean;
  showScreensaver: boolean;
  screensaverPasswordRequired: boolean;
  dismissScreensaver: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
  const [firstLogin, setFirstLogin] = useState<boolean>(false);
  const [passwordResetRequired, setPasswordResetRequired] = useState<boolean>(false);
  const [showScreensaver, setShowScreensaver] = useState<boolean>(false);
  const [screensaverPasswordRequired, setScreensaverPasswordRequired] = useState<boolean>(false);
  const [lastActivity, setLastActivity] = useState<number>(0);

  // Inactivity tracking
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleActivity = () => {
      // Only reset activity if screensaver is not showing (don't dismiss on activity)
      if (!showScreensaver) {
        setLastActivity(Date.now());
      }
    };

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Check inactivity every second
    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;
      const inactiveSeconds = Math.floor(inactiveTime / 1000);

      // Show screensaver after 5 minutes (300 seconds)
      if (inactiveSeconds >= 300) {
        setShowScreensaver(true);
      }

      // Require password after 15 minutes (900 seconds)
      if (inactiveSeconds >= 900) {
        setScreensaverPasswordRequired(true);
      }
    }, 1000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(interval);
    };
  }, [isAuthenticated, lastActivity, showScreensaver]);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('authToken');
      const savedUsername = localStorage.getItem('username');
      const savedRole = localStorage.getItem('userRole');

      if (token && savedUsername) {
        try {
          const response = await fetch(API_ENDPOINTS.VERIFY, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setIsAuthenticated(true);
            setUsername(savedUsername);
            setRole(savedRole || 'both');
            setMfaEnabled(data.user?.mfa_enabled || false);
            setLastActivity(Date.now()); // Start inactivity timer on token verification
          } else {
            // Token is invalid, clear it
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            localStorage.removeItem('userRole');
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('username');
          localStorage.removeItem('userRole');
        }
      }
      setIsLoading(false);
    };

    verifyToken();
  }, []);

  const login = async (
    inputUsername: string,
    inputPassword: string,
    mfaToken?: string,
    backupCode?: string
  ): Promise<LoginResult> => {
    try {
      const response = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: inputUsername,
          password: inputPassword,
          mfaToken,
          backupCode,
        }),
      });

      // Check for server errors (404, 500, etc.)
      if (response.status === 404) {
        return {
          success: false,
          error: 'Server Error: Backend service not found. Please check server configuration.',
          errorType: 'server'
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: 'Server Error: Backend service is experiencing issues. Please try again later.',
          errorType: 'server'
        };
      }

      const data = await response.json();

      if (response.ok) {
        // Check if MFA is required
        if (data.mfaRequired) {
          return {
            success: false,
            mfaRequired: true,
            mfaEnabled: data.mfaEnabled || false
          };
        }

        // Login successful
        setIsAuthenticated(true);
        setUsername(data.user.username);
        setRole(data.user.role || 'both');
        setMfaEnabled(data.user.mfa_enabled || false);
        setFirstLogin(data.firstLogin || false);
        setPasswordResetRequired(data.passwordResetRequired || false);
        setLastActivity(Date.now()); // Start inactivity timer on login
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('username', data.user.username);
        localStorage.setItem('userRole', data.user.role || 'both');
        return {
          success: true,
          mfaEnabled: data.user.mfa_enabled || false,
          firstLogin: data.firstLogin || false,
          passwordResetRequired: data.passwordResetRequired || false
        };
      } else {
        // Authentication failure (401, 403, etc.)
        return {
          success: false,
          error: 'Invalid username or password',
          errorType: 'auth'
        };
      }
    } catch (error) {
      console.error('Login error:', error);

      // Network error (server not running, no internet, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          success: false,
          error: 'Server error: cannot connect to the server. Please ensure the server is running.',
          errorType: 'network'
        };
      }

      return {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        errorType: 'network'
      };
    }
  };

  const unlock = async (password: string): Promise<LoginResult> => {
    // Use dedicated unlock endpoint that bypasses MFA
    if (!username) {
      return {
        success: false,
        error: 'No user session found',
        errorType: 'auth'
      };
    }

    try {
      const token = localStorage.getItem('authToken');

      if (!token) {
        return {
          success: false,
          error: 'No active session',
          errorType: 'auth'
        };
      }

      const response = await fetch(API_ENDPOINTS.UNLOCK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      // Check for server errors
      if (response.status === 404) {
        return {
          success: false,
          error: 'Server Error: Backend service not found. Please check server configuration.',
          errorType: 'server'
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: 'Server Error: Backend service is experiencing issues. Please try again later.',
          errorType: 'server'
        };
      }

      const data = await response.json();

      if (response.ok) {
        // Update token
        localStorage.setItem('authToken', data.token);

        // Dismiss screensaver on successful unlock
        setShowScreensaver(false);
        setScreensaverPasswordRequired(false);
        setLastActivity(Date.now());

        return {
          success: true
        };
      } else {
        // Authentication failure
        return {
          success: false,
          error: data.error || 'Invalid password',
          errorType: 'auth'
        };
      }
    } catch (error) {
      console.error('Unlock error:', error);

      // Network error
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          success: false,
          error: 'Server error: cannot connect to the server. Please ensure the server is running.',
          errorType: 'network'
        };
      }

      return {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        errorType: 'network'
      };
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUsername(null);
    setRole(null);
    setFirstLogin(false);
    setPasswordResetRequired(false);
    setShowScreensaver(false);
    setLastActivity(Date.now());
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
  };

  const dismissScreensaver = () => {
    // Allow dismissing without password if within grace period (before 15 minutes)
    if (!screensaverPasswordRequired) {
      setShowScreensaver(false);
      setLastActivity(Date.now());
    }
    // If password is required, this does nothing - user must unlock with password
  };

  const completeFirstLogin = () => {
    setFirstLogin(false);
    setPasswordResetRequired(false);
  };

  const hasRole = (requiredRole: 'dashboard' | 'accountant' | 'admin'): boolean => {
    if (!role) return false;
    // Admin has access to everything
    if (role === 'admin') return true;
    // 'both' has access to dashboard and accountant views
    if (role === 'both' && requiredRole !== 'admin') return true;
    // Specific role match
    return role === requiredRole;
  };

  const isAdmin = (): boolean => {
    return role === 'admin';
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      login,
      logout,
      unlock,
      username,
      role,
      isLoading,
      mfaEnabled,
      firstLogin,
      passwordResetRequired,
      completeFirstLogin,
      hasRole,
      isAdmin,
      showScreensaver,
      screensaverPasswordRequired,
      dismissScreensaver
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
