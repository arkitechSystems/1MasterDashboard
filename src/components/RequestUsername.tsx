import React, { useState } from 'react';
import './RequestUsername.css';

interface RequestUsernameProps {
  onBack: () => void;
}

const RequestUsername: React.FC<RequestUsernameProps> = ({ onBack }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    address: '',
    phoneNumber: '',
    roleTitle: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [requestNumber, setRequestNumber] = useState('');

  const arkiTechLogo = '/ArkiTech.png';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.address || !formData.roleTitle) {
      setError('Please fill in all required fields');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/auth/request-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setRequestNumber(data.requestNumber);
        setFormData({
          firstName: '',
          lastName: '',
          address: '',
          phoneNumber: '',
          roleTitle: ''
        });
      } else {
        setError(data.error || 'Failed to submit request. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="request-username-container">
        <div className="request-username-background"></div>

        <div className="request-username-content">
          {/* Logo/Brand Section */}
          <div className="request-brand">
            <div className="logo-container">
              <img src={arkiTechLogo} alt="ArkiTech Systems" className="logo-image" />
            </div>
            <h1 className="brand-title">ArkiTech Systems</h1>
            <p className="brand-subtitle">Financial Dashboard for Healthcare Data Analytics</p>
          </div>

          {/* Success Card */}
          <div className="glass-card success-card">
            <div className="success-icon">✓</div>
            <h2 className="card-title">Request Submitted Successfully!</h2>

            <div className="success-message">
              <p>Your username request has been received.</p>
              <p className="request-number">Request Number: <strong>#{requestNumber}</strong></p>
              <p className="info-text">
                An administrator will review your request and contact you shortly with your login credentials.
                Please keep your request number for reference.
              </p>
            </div>

            <button
              onClick={onBack}
              className="btn-primary btn-back"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="request-username-container">
      <div className="request-username-background"></div>

      <div className="request-username-content">
        {/* Logo/Brand Section */}
        <div className="request-brand">
          <div className="logo-container">
            <img src={arkiTechLogo} alt="ArkiTech Systems" className="logo-image" />
          </div>
          <h1 className="brand-title">ArkiTech Systems</h1>
          <p className="brand-subtitle">Financial Dashboard for Healthcare Data Analytics</p>
        </div>

        {/* Request Form Card */}
        <div className="glass-card">
          <h2 className="card-title">Request Username</h2>
          <p className="card-description">
            Fill out the form below to request access to the system. An administrator will review your request and provide you with login credentials.
          </p>

          <form onSubmit={handleSubmit} className="request-form" noValidate>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">
                  First Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="form-input"
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName">
                  Last Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="form-input"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="address">
                Address <span className="required">*</span>
              </label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                className="form-textarea"
                rows={3}
                disabled={isLoading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber">
                Phone Number <span className="optional">(Optional)</span>
              </label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="form-input"
                placeholder="(555) 123-4567"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="roleTitle">
                Role/Title <span className="required">*</span>
              </label>
              <input
                type="text"
                id="roleTitle"
                name="roleTitle"
                value={formData.roleTitle}
                onChange={handleInputChange}
                className="form-input"
                placeholder="e.g., Financial Analyst, Accountant, etc."
                disabled={isLoading}
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button
                type="button"
                onClick={onBack}
                className="btn-secondary"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isLoading}
              >
                {isLoading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RequestUsername;
