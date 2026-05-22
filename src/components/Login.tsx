import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import RequestUsername from './RequestUsername';
import './Login.css';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showMFAInput, setShowMFAInput] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRequestUsername, setShowRequestUsername] = useState(false);
  const { login } = useAuth();

  const arkiTechLogo = '/ArkiTech.png';

  if (showRequestUsername) {
    return <RequestUsername onBack={() => setShowRequestUsername(false)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username || !password) {
      setError('Please enter both username and password');
      setIsLoading(false);
      return;
    }

    try {
      const result = await login(
        username,
        password,
        showMFAInput ? mfaToken : undefined,
        showMFAInput && useBackupCode ? mfaToken : undefined
      );

      if (result.mfaRequired) {
        // MFA is required, show MFA input
        setShowMFAInput(true);
        setIsLoading(false);
        return;
      }

      if (!result.success) {
        // Use the specific error message and type from the login result
        if (result.error) {
          setError(result.error);
        } else if (showMFAInput) {
          setError('Invalid MFA code. Please try again.');
          setMfaToken('');
        } else {
          setError('Invalid username or password');
          setPassword('');
        }

        // Only clear password for authentication errors, not server errors
        if (result.errorType === 'auth' && !showMFAInput) {
          setPassword('');
        }
      }
    } catch (error) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
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
          <h2 className="card-title">Login</h2>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder=""
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-input"
                autoFocus
                required
              />
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

            {showMFAInput && (
              <div className="form-group mfa-input-section">
                <label htmlFor="mfaToken" className="form-label">
                  {useBackupCode ? 'Backup Code' : 'MFA Code'}
                </label>
                <input
                  id="mfaToken"
                  type="text"
                  placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/[^0-9-]/g, ''))}
                  className="form-input"
                  maxLength={useBackupCode ? 9 : 6}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setMfaToken('');
                  }}
                  className="mfa-toggle-button"
                >
                  {useBackupCode ? 'Use MFA Code' : 'Use Backup Code'}
                </button>
              </div>
            )}

            <div className="remember-me-container">
              <label className="remember-me-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-me-checkbox"
                />
                <span>Remember me</span>
              </label>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="login-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="button-spinner"></span>
                  <span>Logging in...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <div className="login-links">
            <a href="#" onClick={(e) => { e.preventDefault(); alert('Please contact your administrator to reset your password.'); }}>
              Forgot your password?
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); setShowRequestUsername(true); }}>
              Request Username
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="login-footer">
          © {new Date().getFullYear()} ArkiTech Systems. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
