import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';
import './Screensaver.css';

interface ScreensaverProps {
  onDismiss: () => void;
}

const Screensaver: React.FC<ScreensaverProps> = ({ onDismiss }) => {
  const { username, unlock, screensaverPasswordRequired, dismissScreensaver } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const arkiTechLogo = '/ArkiTech.png';

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!password) {
      setError('Please enter your password');
      setIsLoading(false);
      return;
    }

    try {
      const result = await unlock(password);

      if (result.success) {
        setPassword('');
        // Screen will automatically dismiss via AuthContext
      } else {
        // Use the specific error message and type from the unlock result
        if (result.error) {
          setError(result.error);
        } else {
          setError('Invalid password');
        }

        // Only clear password for authentication errors, not server errors
        if (result.errorType === 'auth') {
          setPassword('');
        }
      }
    } catch (error) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Unlock error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container screensaver-fullscreen">
      <div className="login-wrapper">
        {/* Logo/Brand Section */}
        <div className="login-brand">
          <div className="logo-container">
            <img src={arkiTechLogo} alt="ArkiTech Systems" className="logo-image" />
          </div>
          <h1 className="brand-title">ArkiTech Systems</h1>
          <p className="brand-subtitle">Financial Dashboard for Healthcare Data Analytics</p>
        </div>

        {/* Login Card */}
        <div className="glass-card">
          <h2 className="card-title">Screen Locked</h2>

          {screensaverPasswordRequired ? (
            // Password required after 15 minutes
            <form onSubmit={handleUnlock} className="login-form" noValidate>
              <div className="screensaver-info">
                <p className="logged-in-as">
                  Logged in as: <strong>{username}</strong>
                </p>
                <p className="unlock-instruction">
                  Enter your password to unlock
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder=""
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input password-input"
                    autoFocus
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                type="submit"
                className="login-button"
                disabled={isLoading || !password}
              >
                {isLoading ? (
                  <>
                    <span className="button-spinner"></span>
                    <span>Unlocking...</span>
                  </>
                ) : (
                  'Unlock'
                )}
              </button>
            </form>
          ) : (
            // Grace period (5-15 minutes) - can dismiss without password
            <div className="login-form">
              <div className="screensaver-info">
                <p className="logged-in-as">
                  Logged in as: <strong>{username}</strong>
                </p>
                <p className="unlock-instruction">
                  Click below to continue
                </p>
              </div>

              <button
                type="button"
                className="login-button"
                onClick={dismissScreensaver}
              >
                Continue
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="login-footer">
          © {new Date().getFullYear()} ArkiTech Systems. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Screensaver;
