import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAvailableMonths } from '../hooks/useAvailableMonths';

const Settings: React.FC = () => {
  const { defaultMonth: contextDefaultMonth, isDynamic: contextIsDynamic, dynamicDays: contextDynamicDays, saveSettings } = useSettings();

  const [defaultMonth, setDefaultMonth] = useState<string>(contextDefaultMonth);
  const [isDynamic, setIsDynamic] = useState<boolean>(contextIsDynamic);
  const [dynamicDays, setDynamicDays] = useState<number>(contextDynamicDays);
  const [showSaveSuccess, setShowSaveSuccess] = useState<boolean>(false);
  const { availableMonths } = useAvailableMonths();

  // Update local state when context changes
  useEffect(() => {
    setDefaultMonth(contextDefaultMonth);
    setIsDynamic(contextIsDynamic);
    setDynamicDays(contextDynamicDays);
  }, [contextDefaultMonth, contextIsDynamic, contextDynamicDays]);

  const handleSaveDefaultMonth = () => {
    saveSettings(defaultMonth, isDynamic, dynamicDays);
    console.log('Saved default month:', defaultMonth);
    console.log('Dynamic mode:', isDynamic);
    console.log('Dynamic days:', dynamicDays);

    // Show success message
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  return (
    <>
      <h1>Settings</h1>
      <hr />
      <p>Configure your dashboard preferences.</p>

      <div className="card" style={{ marginBottom: '30px' }}>
        <h2>Global Settings</h2>
        <div style={{ marginTop: '15px' }}>
          <label htmlFor="default-month" style={{ marginRight: '10px', fontWeight: 'bold' }}>
            Default reporting month:
          </label>
          <select
            id="default-month"
            value={defaultMonth}
            onChange={(e) => setDefaultMonth(e.target.value)}
            disabled={isDynamic}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: isDynamic ? '#f0f0f0' : 'white',
              cursor: isDynamic ? 'not-allowed' : 'pointer',
              opacity: isDynamic ? 0.6 : 1
            }}
          >
            {availableMonths.map(month => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <div style={{ marginTop: '15px', marginBottom: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isDynamic}
                  onChange={(e) => setIsDynamic(e.target.checked)}
                  style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '14px' }}>
                  Dynamic
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: isDynamic ? '#333' : '#999' }}>
                  Switch after
                </span>
                <select
                  value={dynamicDays}
                  onChange={(e) => setDynamicDays(Number(e.target.value))}
                  disabled={!isDynamic}
                  style={{
                    padding: '6px 10px',
                    fontSize: '14px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: !isDynamic ? '#f0f0f0' : 'white',
                    cursor: !isDynamic ? 'not-allowed' : 'pointer',
                    opacity: !isDynamic ? 0.6 : 1,
                    width: '60px'
                  }}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '14px', color: isDynamic ? '#333' : '#999' }}>
                  day{dynamicDays !== 1 ? 's' : ''} into the month
                </span>
              </div>
            </div>
            <p style={{ marginTop: '8px', marginBottom: '0', color: '#666', fontSize: '13px', fontStyle: 'italic' }}>
              {isDynamic
                ? `The default month will automatically switch to the previous month on day ${dynamicDays} of each month.`
                : 'Enable Dynamic to automatically adjust the default month based on the current date.'}
            </p>
          </div>
          <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              onClick={handleSaveDefaultMonth}
              style={{
                background: 'linear-gradient(90deg, #0f2027, #2c5364)',
                color: '#fff',
                border: '2px solid #1abc9c',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'linear-gradient(90deg, #1abc9c, #16a085)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'linear-gradient(90deg, #0f2027, #2c5364)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Save
            </button>
            {showSaveSuccess && (
              <div style={{
                padding: '8px 16px',
                backgroundColor: '#d4edda',
                color: '#155724',
                border: '1px solid #c3e6cb',
                borderRadius: '6px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '18px' }}>✓</span>
                Settings saved successfully!
              </div>
            )}
          </div>
          <p style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>
            This will be the month that initially loads on each page when you click on a new sidebar link.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '30px' }}>
        <h2>Home Page</h2>
        <p>Choose the page that loads on startup:</p>
        <ol>
          <li>Dashboard</li>
          <li>Income Statement</li>
          <li>Balance Sheet</li>
        </ol>
      </div>

      <div className="card" style={{ marginBottom: '30px' }}>
        <h2>Theme</h2>
        <p>Light / Dark mode toggle coming soon.</p>
      </div>

      <div className="card">
        <h2>Account</h2>
        <p>Manage your profile and login settings here.</p>
      </div>
    </>
  );
};

export default Settings;