import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config';
import './FirstLoginPasswordReset.css';

interface FirstLoginPasswordResetProps {
  onComplete: () => void;
}

const FirstLoginPasswordReset: React.FC<FirstLoginPasswordResetProps> = ({ onComplete }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return strength;
  };

  const handlePasswordChange = (password: string) => {
    setNewPassword(password);
    setPasswordStrength(calculatePasswordStrength(password));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordStrength < 3) {
      setError('Password is too weak. Include uppercase, lowercase, numbers, and special characters.');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/api/auth/reset-password-first-login`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newPassword,
          confirmPassword
        })
      });

      if (response.ok) {
        onComplete();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthLabel = () => {
    if (passwordStrength === 0) return '';
    if (passwordStrength <= 2) return 'Weak';
    if (passwordStrength === 3) return 'Medium';
    return 'Strong';
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 2) return 'weak';
    if (passwordStrength === 3) return 'medium';
    return 'strong';
  };

  return (
    <div className="first-login-container">
      <div className="first-login-card">
        <div className="first-login-header">
          <span className="material-icons lock-icon">lock_reset</span>
          <h2>Set Your Password</h2>
          <p>Welcome! Please create a secure password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="password-reset-form">
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              className="form-input"
              placeholder="Enter new password"
              autoComplete="new-password"
              required
            />
            {newPassword && (
              <div className="password-strength">
                <div className="strength-bars">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`strength-bar ${level <= passwordStrength ? `active ${getStrengthColor()}` : ''}`}
                    />
                  ))}
                </div>
                {passwordStrength > 0 && (
                  <span className={`strength-label ${getStrengthColor()}`}>
                    {getStrengthLabel()}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="Re-enter new password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="password-requirements">
            <p><strong>Password Requirements:</strong></p>
            <ul>
              <li className={newPassword.length >= 8 ? 'met' : ''}>
                At least 8 characters long
              </li>
              <li className={/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? 'met' : ''}>
                Include uppercase and lowercase letters
              </li>
              <li className={/\d/.test(newPassword) ? 'met' : ''}>
                Include at least one number
              </li>
              <li className={/[^a-zA-Z0-9]/.test(newPassword) ? 'met' : ''}>
                Include at least one special character
              </li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || passwordStrength < 3}
          >
            {loading ? 'Setting Password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default FirstLoginPasswordReset;
