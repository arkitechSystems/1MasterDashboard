import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config';

const SubmitTicket: React.FC = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateTicketNumber = () => {
    // Generate a random 6-digit ticket number
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim() || !message.trim()) {
      alert('Please fill in both subject and message fields.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const newTicketNumber = generateTicketNumber();

    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('token');

      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      // Send ticket to backend
      const response = await fetch(API_ENDPOINTS.SUBMIT_TICKET, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketNumber: newTicketNumber,
          subject,
          message
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit ticket');
      }

      // Success - show ticket number
      setTicketNumber(newTicketNumber);
    } catch (err: any) {
      console.error('Ticket submission error:', err);
      setError(err.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewTicket = () => {
    setTicketNumber(null);
    setSubject('');
    setMessage('');
    setError(null);
  };

  if (ticketNumber) {
    return (
      <div className="submit-ticket">
        <h1 style={{ margin: '0 0 4px 0' }}>Submit a Ticket</h1>
        <hr style={{ margin: '4px 0 20px 0' }} />

        <div style={{
          maxWidth: '600px',
          margin: '40px auto',
          padding: '40px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '48px',
            color: '#27ae60',
            marginBottom: '20px'
          }}>
            <span className="material-icons" style={{ fontSize: '64px' }}>check_circle</span>
          </div>
          <h2 style={{ color: '#2c5364', marginBottom: '16px' }}>Ticket Successfully Submitted!</h2>
          <div style={{
            padding: '20px',
            background: '#f0f8ff',
            borderRadius: '8px',
            border: '2px solid #1abc9c',
            marginBottom: '24px'
          }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>Your Ticket Number:</p>
            <p style={{
              margin: 0,
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#1abc9c',
              fontFamily: 'monospace'
            }}>
              #{ticketNumber}
            </p>
          </div>
          <p style={{ color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
            Your support ticket has been created and an email has been sent to our support team.
            Please save your ticket number for reference. We will respond to your inquiry as soon as possible.
          </p>
          <button
            onClick={handleNewTicket}
            style={{
              background: 'linear-gradient(145deg, #1abc9c, #16a085)',
              color: '#fff',
              border: 'none',
              padding: '12px 32px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(26, 188, 156, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            Submit Another Ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-ticket">
      <h1 style={{ margin: '0 0 4px 0' }}>Submit a Ticket</h1>
      <hr style={{ margin: '4px 0 20px 0' }} />

      <div style={{
        maxWidth: '700px',
        margin: '0 auto',
        padding: '30px',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        marginBottom: '40px'
      }}>
        <p style={{ color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
          Having issues with the dashboard? Need help with data updates or encountering errors?
          Submit a support ticket and our team will assist you as soon as possible.
        </p>

        {error && (
          <div style={{
            padding: '12px 16px',
            background: '#fee',
            border: '1px solid #e74c3c',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span className="material-icons" style={{ color: '#e74c3c', fontSize: '20px' }}>error</span>
            <span style={{ color: '#c0392b', fontSize: '14px' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="subject"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#2c5364',
                fontSize: '14px'
              }}
            >
              Subject <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input
              type="text"
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of the issue"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#2c5364',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1abc9c';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26, 188, 156, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e0e0e0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="message"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#2c5364',
                fontSize: '14px'
              }}
            >
              Message <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please provide detailed information about your issue, including any error messages or steps to reproduce the problem..."
              required
              rows={8}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#2c5364',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1abc9c';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26, 188, 156, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e0e0e0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setSubject('');
                setMessage('');
              }}
              style={{
                background: '#f0f0f0',
                color: '#666',
                border: '1px solid #e0e0e0',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#e6ecf5';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#f0f0f0';
              }}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: isSubmitting
                  ? '#ccc'
                  : 'linear-gradient(145deg, #1abc9c, #16a085)',
                color: '#fff',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(26, 188, 156, 0.3)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              }}
            >
              <span className="material-icons" style={{ fontSize: '20px' }}>send</span>
              {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubmitTicket;
