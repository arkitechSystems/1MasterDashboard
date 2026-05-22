import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MFASetup from './MFASetup';
import { API_ENDPOINTS } from '../config';

const MyAccount: React.FC = () => {
  const { mfaEnabled: authMfaEnabled } = useAuth();
  const [formData, setFormData] = useState({
    firstName: 'Current',
    lastName: 'User',
    email: 'current.user@hospital.com',
    username: 'cuser',
    userId: 'USR001',
    role: 'CFO',
    department: 'Finance',
    phoneNumber: '(555) 123-4567',
    organizationName: 'Memorial Healthcare',
    facilityCode: 'MHC-001',
    defaultReportingUnit: 'Main Campus',
    emailNotifications: true,
    smsNotifications: false,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<any>(null);
  const [loadingMFA, setLoadingMFA] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Fetch MFA status on load
  useEffect(() => {
    const fetchMFAStatus = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const response = await fetch(`${API_ENDPOINTS.BASE_URL}/mfa/status`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setMfaStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch MFA status:', error);
      }
    };

    fetchMFAStatus();
  }, []);

  const handleEnableMFA = () => {
    setShowMFASetup(true);
  };

  const handleDisableMFA = async () => {
    if (!window.confirm('Are you sure you want to disable MFA? This will make your account less secure.')) {
      return;
    }

    const password = window.prompt('Please enter your password to confirm:');
    if (!password) return;

    setLoadingMFA(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/mfa/disable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        setMfaStatus(null);
        alert('MFA has been disabled successfully.');
        window.location.reload();
      } else {
        const error = await response.json();
        alert(`Failed to disable MFA: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to disable MFA:', error);
      alert('An error occurred while disabling MFA.');
    } finally {
      setLoadingMFA(false);
    }
  };

  const handleMFASetupComplete = () => {
    setShowMFASetup(false);
    // Refresh MFA status
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_ENDPOINTS.BASE_URL}/mfa/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setMfaStatus(data);
        }
      } catch (error) {
        console.error('Failed to refresh MFA status:', error);
      }
    };
    fetchStatus();
  };

  const handleToggleEmailNotifications = () => {
    setFormData(prev => ({
      ...prev,
      emailNotifications: !prev.emailNotifications
    }));
  };

  const handleToggleSMSNotifications = () => {
    setFormData(prev => ({
      ...prev,
      smsNotifications: !prev.smsNotifications
    }));
  };

  const handleSave = () => {
    console.log('Saving account data:', formData);
    setIsEditing(false);
    // Add save logic here
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form data to original values
  };

  return (
    <div className="my-account-container">
      <div className="account-header">
        <h1>My Account</h1>
        <div className="account-actions">
          {!isEditing ? (
            <button className="btn-edit" onClick={() => setIsEditing(true)}>
              <span className="material-icons">edit</span>
              Edit Profile
            </button>
          ) : (
            <div className="edit-actions">
              <button className="btn-cancel" onClick={handleCancel}>Cancel</button>
              <button className="btn-save" onClick={handleSave}>
                <span className="material-icons">save</span>
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="account-content">
        {/* Personal Information Section */}
        <section className="account-section">
          <h2 className="section-title">
            <span className="material-icons">person</span>
            Personal Information
          </h2>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
                placeholder="(Optional)"
              />
            </div>
          </div>
        </section>

        {/* Account Details Section */}
        <section className="account-section">
          <h2 className="section-title">
            <span className="material-icons">badge</span>
            Account Details
          </h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                disabled={true}
                className="form-input disabled"
              />
              <small className="field-hint">Username cannot be changed</small>
            </div>
            <div className="form-group">
              <label>User ID</label>
              <input
                type="text"
                name="userId"
                value={formData.userId}
                disabled={true}
                className="form-input disabled"
              />
              <small className="field-hint">System generated ID</small>
            </div>
            <div className="form-group">
              <label>Role / Title</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              >
                <option value="CFO">CFO</option>
                <option value="CEO">CEO</option>
                <option value="Accountant">Accountant</option>
                <option value="Revenue Analyst">Revenue Analyst</option>
                <option value="Finance Manager">Finance Manager</option>
                <option value="Controller">Controller</option>
              </select>
            </div>
            <div className="form-group">
              <label>Department</label>
              <select
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              >
                <option value="Finance">Finance</option>
                <option value="Administration">Administration</option>
                <option value="Revenue Cycle">Revenue Cycle</option>
                <option value="Accounting">Accounting</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
          </div>
        </section>

        {/* Organization Information Section */}
        <section className="account-section">
          <h2 className="section-title">
            <span className="material-icons">business</span>
            Organization Information
          </h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Organization / Hospital Name</label>
              <input
                type="text"
                name="organizationName"
                value={formData.organizationName}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Facility Code / Cost Center</label>
              <input
                type="text"
                name="facilityCode"
                value={formData.facilityCode}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group full-width">
              <label>Default Reporting Unit</label>
              <input
                type="text"
                name="defaultReportingUnit"
                value={formData.defaultReportingUnit}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
          </div>
        </section>

        {/* Notification Preferences Section */}
        <section className="account-section">
          <h2 className="section-title">
            <span className="material-icons">notifications</span>
            Notification Preferences
          </h2>
          <div className="security-options">
            <div className="security-item">
              <div className="security-info">
                <h3>Email Notifications</h3>
                <p>Receive notifications via email about reports, alerts, and updates</p>
              </div>
              <div className="toggle-container">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.emailNotifications}
                    onChange={handleToggleEmailNotifications}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className={`toggle-status ${formData.emailNotifications ? 'enabled' : 'disabled'}`}>
                  {formData.emailNotifications ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            <div className="security-item">
              <div className="security-info">
                <h3>SMS/Text Message Notifications</h3>
                <p>Receive urgent notifications and alerts via text message</p>
              </div>
              <div className="toggle-container">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.smsNotifications}
                    onChange={handleToggleSMSNotifications}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className={`toggle-status ${formData.smsNotifications ? 'enabled' : 'disabled'}`}>
                  {formData.smsNotifications ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Security Settings Section */}
        <section className="account-section">
          <h2 className="section-title">
            <span className="material-icons">security</span>
            Security Settings
          </h2>
          <div className="security-options">
            <div className="security-item">
              <div className="security-info">
                <h3>Password</h3>
                <p>Change your password to keep your account secure</p>
              </div>
              <button
                className="btn-secondary"
                onClick={() => setShowPasswordModal(true)}
              >
                <span className="material-icons">lock</span>
                Change Password
              </button>
            </div>
            <div className="security-item">
              <div className="security-info">
                <h3>Multi-Factor Authentication (MFA)</h3>
                <p>Add an extra layer of security to your account with authenticator app or email codes</p>
                {mfaStatus?.enabled && (
                  <div className="mfa-status-details">
                    <p style={{ fontSize: '0.9em', marginTop: '8px', color: '#27ae60' }}>
                      <strong>Status:</strong> Enabled ({mfaStatus.method === 'app' ? 'Authenticator App' : 'Email'})
                    </p>
                    {mfaStatus.backupCodesRemaining !== undefined && (
                      <p style={{ fontSize: '0.9em', color: '#7f8c8d' }}>
                        <strong>Backup Codes:</strong> {mfaStatus.backupCodesRemaining} remaining
                      </p>
                    )}
                  </div>
                )}
              </div>
              {!mfaStatus?.enabled ? (
                <button
                  className="btn-primary"
                  onClick={handleEnableMFA}
                  disabled={loadingMFA}
                >
                  <span className="material-icons">security</span>
                  Enable MFA
                </button>
              ) : (
                <button
                  className="btn-secondary"
                  onClick={handleDisableMFA}
                  disabled={loadingMFA}
                >
                  <span className="material-icons">lock_open</span>
                  Disable MFA
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Password</h2>
              <button
                className="modal-close"
                onClick={() => setShowPasswordModal(false)}
              >
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" className="form-input" />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" className="form-input" />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" className="form-input" />
              </div>
              <div className="password-requirements">
                <p><strong>Password Requirements:</strong></p>
                <ul>
                  <li>At least 8 characters long</li>
                  <li>Include uppercase and lowercase letters</li>
                  <li>Include at least one number</li>
                  <li>Include at least one special character</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowPasswordModal(false)}>
                Cancel
              </button>
              <button className="btn-primary">
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MFA Setup Modal */}
      {showMFASetup && (
        <MFASetup
          onComplete={handleMFASetupComplete}
          onCancel={() => setShowMFASetup(false)}
        />
      )}
    </div>
  );
};

export default MyAccount;
