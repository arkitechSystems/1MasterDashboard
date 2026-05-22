import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config';
import './MandatoryMFASetup.css';

interface MandatoryMFASetupProps {
  onComplete: () => void;
}

const MandatoryMFASetup: React.FC<MandatoryMFASetupProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<'app' | 'email'>('email');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [manualEntryKey, setManualEntryKey] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleMethodSelect = async (selectedMethod: 'app' | 'email') => {
    setMethod(selectedMethod);
    setLoading(true);
    setError('');

    try {
      if (selectedMethod === 'app') {
        const token = localStorage.getItem('authToken');
        const response = await fetch(API_ENDPOINTS.MFA_SETUP, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to setup MFA');
        }

        const data = await response.json();
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setManualEntryKey(data.manualEntryKey);
      }

      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to setup MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(API_ENDPOINTS.MFA_ENABLE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          secret,
          verificationCode,
          method
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enable MFA');
      }

      const data = await response.json();
      setBackupCodes(data.backupCodes);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBackupCodes = () => {
    const codesText = `CchdDash Backup Codes\n\nSave these codes in a secure location!\nEach code can only be used once.\n\n${backupCodes.join('\n')}\n\nGenerated: ${new Date().toLocaleString()}`;
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cchddash-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <div className="mandatory-mfa-container">
      <div className="mandatory-mfa-card">
        <div className="mandatory-mfa-header">
          <span className="material-icons security-icon">security</span>
          <h2>Secure Your Account</h2>
          <p>Multi-factor authentication is required for all accounts</p>
        </div>

        {error && (
          <div className="mfa-error">
            <span className="material-icons">error</span>
            {error}
          </div>
        )}

        {/* Step 1: Choose method */}
        {step === 1 && (
          <div className="mfa-step">
            <h3>Choose Your Verification Method</h3>
            <p>Select how you'd like to receive verification codes:</p>

            <div className="mfa-methods">
              <button
                className="mfa-method-card"
                onClick={() => handleMethodSelect('email')}
                disabled={loading}
              >
                <span className="material-icons">email</span>
                <h4>Email Verification</h4>
                <p>Receive codes via email when you log in</p>
                <span className="recommended-badge">Recommended</span>
              </button>

              <button
                className="mfa-method-card"
                onClick={() => handleMethodSelect('app')}
                disabled={loading}
              >
                <span className="material-icons">phone_android</span>
                <h4>Authenticator App</h4>
                <p>Use Google Authenticator or any TOTP app</p>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Setup and verify - App method */}
        {step === 2 && method === 'app' && (
          <div className="mfa-step">
            <h3>Scan QR Code</h3>
            <p>Open your authenticator app and scan this QR code:</p>

            <div className="authenticator-help">
              <span className="material-icons">info</span>
              <div>
                <p><strong>Don't have an authenticator app?</strong></p>
                <p>Download Google Authenticator:</p>
                <div className="app-links">
                  <a
                    href="https://apps.apple.com/us/app/google-authenticator/id388497605"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app-link ios"
                  >
                    <span className="material-icons">apple</span>
                    iOS (App Store)
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app-link android"
                  >
                    <span className="material-icons">android</span>
                    Android (Play Store)
                  </a>
                </div>
              </div>
            </div>

            <div className="qr-code-container">
              <img src={qrCode} alt="QR Code" className="qr-code" />
            </div>

            <div className="manual-entry">
              <p className="manual-entry-label">Can't scan? Enter this key manually:</p>
              <div className="manual-entry-key">
                <code>{manualEntryKey}</code>
                <button
                  className="copy-button"
                  onClick={() => {
                    navigator.clipboard.writeText(manualEntryKey);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <span className="material-icons">{copied ? 'check' : 'content_copy'}</span>
                </button>
              </div>
            </div>

            <div className="verification-input">
              <label htmlFor="verification-code">Enter the 6-digit code from your app:</label>
              <input
                id="verification-code"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="code-input"
              />
            </div>

            <div className="mfa-actions">
              <button
                className="btn-primary full-width"
                onClick={handleVerifyAndEnable}
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Email method */}
        {step === 2 && method === 'email' && (
          <div className="mfa-step">
            <h3>Email Verification Setup</h3>
            <p>When you log in, we'll send a 6-digit code to your email address.</p>

            <div className="email-info">
              <span className="material-icons">info</span>
              <p>
                You'll receive verification codes at the email address associated with your account.
                Contact your administrator to change or verify your email address.
              </p>
            </div>

            <div className="verification-input">
              <label htmlFor="verification-code">Enter test code to verify (check your email):</label>
              <input
                id="verification-code"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="code-input"
              />
            </div>

            <div className="mfa-actions">
              <button
                className="btn-primary full-width"
                onClick={handleVerifyAndEnable}
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Backup codes */}
        {step === 3 && (
          <div className="mfa-step">
            <div className="success-header">
              <span className="material-icons success-icon">check_circle</span>
              <h3>MFA Enabled Successfully!</h3>
            </div>

            <div className="backup-codes-warning">
              <span className="material-icons">warning</span>
              <div>
                <h4>Save Your Backup Codes</h4>
                <p>Store these codes in a secure location. You'll need them if you lose access to your {method === 'app' ? 'authenticator app' : 'email'}.</p>
              </div>
            </div>

            <div className="backup-codes-container">
              <div className="backup-codes-header">
                <h4>Backup Codes</h4>
                <div className="backup-codes-actions">
                  <button className="icon-button" onClick={copyBackupCodes} title="Copy codes">
                    <span className="material-icons">{copied ? 'check' : 'content_copy'}</span>
                  </button>
                  <button className="icon-button" onClick={downloadBackupCodes} title="Download codes">
                    <span className="material-icons">download</span>
                  </button>
                </div>
              </div>

              <div className="backup-codes-grid">
                {backupCodes.map((code, index) => (
                  <div key={index} className="backup-code">
                    <span className="code-number">{index + 1}.</span>
                    <code>{code}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="backup-codes-info">
              <p><strong>Important:</strong></p>
              <ul>
                <li>Each code can only be used once</li>
                <li>Keep them in a safe place (password manager, safe, etc.)</li>
                <li>Don't share them with anyone</li>
                <li>You won't be able to see them again</li>
              </ul>
            </div>

            <div className="mfa-actions">
              <button className="btn-primary full-width" onClick={handleComplete}>
                I've Saved My Backup Codes - Continue to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MandatoryMFASetup;
