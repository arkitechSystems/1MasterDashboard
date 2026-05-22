import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAvailableMonths } from '../hooks/useAvailableMonths';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MonthlyReportOptions: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const { availableMonths } = useAvailableMonths();
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth());
  const [reportOptions, setReportOptions] = useState({
    coverPage: true,
    executiveSummary: false,
    dashboard: true,
    incomeStatement: true,
    trendedIncomeStatement: true,
    balanceSheetTrend: true,
    balanceSheetActivity: true,
    departmentalStatements: false
  });

  const handleCheckboxChange = (option: keyof typeof reportOptions) => {
    setReportOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const handleExportToExcel = () => {
    console.log('Export to Excel - Coming soon');
    // Functionality to be implemented
  };

  const handleExportToPDF = () => {
    console.log('Export to PDF - Coming soon');
    // Functionality to be implemented
  };

  return (
    <>
      <h1 style={{ margin: 0, marginBottom: '10px' }}>Monthly Report Options (coming soon)</h1>
      <hr style={{ marginBottom: '20px' }} />

      <div className="monthly-report-content">
        <div className="report-options-list">
          <div className="month-selection-section">
            <label htmlFor="month-filter" style={{ marginRight: '10px', fontWeight: 'bold', fontSize: '16px' }}>
              Select current month:
            </label>
            <select
              id="month-filter"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: '10px 14px',
                fontSize: '15px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              {availableMonths.map(month => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>

          <h2 style={{ fontSize: '20px', marginBottom: '20px', marginTop: '30px', color: '#2c3e50' }}>
            Select Report Sections to Include:
          </h2>

          <div className="checkbox-group">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={reportOptions.coverPage}
                onChange={() => handleCheckboxChange('coverPage')}
              />
              <span>Cover Page</span>
            </label>

            <label className="checkbox-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              <input
                type="checkbox"
                checked={reportOptions.executiveSummary}
                onChange={() => handleCheckboxChange('executiveSummary')}
                disabled
                style={{ cursor: 'not-allowed' }}
              />
              <span>Executive Summary <span style={{ fontStyle: 'italic', color: '#999' }}>(Coming soon)</span></span>
            </label>

            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={reportOptions.dashboard}
                onChange={() => handleCheckboxChange('dashboard')}
              />
              <span>Dashboard</span>
            </label>

            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={reportOptions.incomeStatement}
                onChange={() => handleCheckboxChange('incomeStatement')}
              />
              <span>Income Statement</span>
            </label>

            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={reportOptions.trendedIncomeStatement}
                onChange={() => handleCheckboxChange('trendedIncomeStatement')}
              />
              <span>Trended Income Statement</span>
            </label>

            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={reportOptions.balanceSheetTrend}
                onChange={() => handleCheckboxChange('balanceSheetTrend')}
              />
              <span>Balance Sheet Trend</span>
            </label>

            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={reportOptions.balanceSheetActivity}
                onChange={() => handleCheckboxChange('balanceSheetActivity')}
              />
              <span>Balance Sheet Activity</span>
            </label>

            <label className="checkbox-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              <input
                type="checkbox"
                checked={reportOptions.departmentalStatements}
                onChange={() => handleCheckboxChange('departmentalStatements')}
                disabled
                style={{ cursor: 'not-allowed' }}
              />
              <span>Departmental Statements <span style={{ fontStyle: 'italic', color: '#999' }}>(Coming soon)</span></span>
            </label>
          </div>

          <div className="report-actions">
            <button
              onClick={handleExportToExcel}
              className="export-btn"
              style={{
                background: '#e8e8e8',
                color: '#202020',
                border: '1.5px solid #b8b8b8',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.1s ease',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#d8d8d8';
                e.currentTarget.style.borderColor = '#a8a8a8';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#e8e8e8';
                e.currentTarget.style.borderColor = '#b8b8b8';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.background = '#c8c8c8';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = '#d8d8d8';
              }}
            >
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>download</span>
              <span>Export to Excel</span>
            </button>
            <button
              onClick={handleExportToPDF}
              className="export-btn"
              style={{
                background: '#e8e8e8',
                color: '#202020',
                border: '1.5px solid #b8b8b8',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.1s ease',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#d8d8d8';
                e.currentTarget.style.borderColor = '#a8a8a8';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#e8e8e8';
                e.currentTarget.style.borderColor = '#b8b8b8';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.background = '#c8c8c8';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = '#d8d8d8';
              }}
            >
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>picture_as_pdf</span>
              <span>Export to PDF</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default MonthlyReportOptions;
