import React, { useState, useEffect } from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import * as XLSX from 'xlsx';
import { useSettings } from '../contexts/SettingsContext';
import { useAvailableMonths } from '../hooks/useAvailableMonths';
import { API_ENDPOINTS } from '../config';
import { assignTxIds } from '../services/glTransactions';

interface GLRecord {
  " glj_amt ": number | string;
  "ME": number | string;
  "Type": number;
  "FS_Major_Group": string;
  "FS_Sub_Group ": string;
  "MajGrpSrtOrdr": number;
  "SortOrder": number;
  "detail_month": number;
  "detail_year": number;
  "glm_acc": number;
  "glm_desc": string;
  "Dept Desc": string;
  "glj_date": number | string;
  "glj_memo": string;
  "glj_reference": string;
  "glj_journal": string;
  "glj_csnum": string;
  "glj_batch": string;
  "FY": number;
}

interface GroupedData {
  level1: string;
  level2: string;
  majGrpSrtOrdr: number;
  sortOrder: number;
  currentMonth: number;
  priorMonth: number;
  budget: number;
}

interface DrillDownData {
  level1: string;
  level2: string;
  month: string;
  monthLabel: string;
  transactions: GLRecord[];
  total: number;
}

const GLTransactions: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const [financialData, setFinancialData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth());
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('2025');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [departments, setDepartments] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [rawGLData, setRawGLData] = useState<GLRecord[]>([]);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [searchFilters, setSearchFilters] = useState({
    account: '',
    description: '',
    date: '',
    journal: '',
    reference: '',
    memo: ''
  });

  const availableFiscalYears = [
    { value: '2023', label: 'FY 2023' },
    { value: '2024', label: 'FY 2024' },
    { value: '2025', label: 'FY 2025' },
    { value: '2026', label: 'FY 2026' }
  ];

  const { availableMonths: allMonths } = useAvailableMonths();

  // Filter months based on selected fiscal year and add "All Months" option
  const availableMonths = [
    { value: 'all', label: 'All Months', meValue: 0, shortLabel: 'All', fiscalYear: parseInt(selectedFiscalYear) },
    ...allMonths.filter(month => month.fiscalYear === parseInt(selectedFiscalYear))
  ];

  const formatAmount = (amount: number): string => {
    if (amount === 0) return '-';
    const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return amount < 0 ? `(${formattedNumber})` : formattedNumber;
  };

  const loadGLData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('authToken');

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const response = await fetch(API_ENDPOINTS.GL_DATA, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        throw new Error('Session expired. Please log in again.');
      }

      if (response.status === 403) {
        throw new Error('Access denied. You do not have permission to view GL data.');
      }

      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
      }

      const rawData = assignTxIds<GLRecord>(await response.json());

      if (!Array.isArray(rawData) || rawData.length === 0) {
        throw new Error('Invalid or empty data received');
      }

      const fiscalYearNum = parseInt(selectedFiscalYear);

      const filteredData = rawData.filter(record => {
        const matchesFY = record.FY === fiscalYearNum;

        if (selectedMonth === 'all') {
          return matchesFY;
        }

        const selectedMonthData = allMonths.find(m => m.value === selectedMonth);
        const selectedMonthME = selectedMonthData?.meValue;
        const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
        const matchesME = meValue === selectedMonthME;

        return matchesFY && matchesME;
      });

      setRawGLData(filteredData);
      setRetryCount(0);
      setLoading(false);
      setHasSearched(true);
    } catch (error) {
      console.error('Error loading GL data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to load GL Transactions data: ${errorMessage}`);
      setLoading(false);
    }
  };

  const handleRetry = () => {
    loadGLData();
  };

  // Handle fiscal year change - set to "All Months" by default
  const handleFiscalYearChange = (newFiscalYear: string) => {
    setSelectedFiscalYear(newFiscalYear);
    setSelectedMonth('all');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading financial data...</div>
        <div className="loading-spinner">
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
      </div>
    );
  }

  const selectedMonthLabel = availableMonths.find(m => m.value === selectedMonth)?.label || '';

  // Format date for display
  const formatDate = (dateValue: number | string): string => {
    if (!dateValue || dateValue === '') return '-';
    try {
      const serial = typeof dateValue === 'string' ? parseFloat(dateValue) : dateValue;
      if (isNaN(serial)) return '-';
      const epoch = new Date(1900, 0, 1);
      const date = new Date(epoch.getTime() + (serial - 2) * 24 * 60 * 60 * 1000);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return '-';
    }
  };


  // Handle clicking on Current Month amount
  const handleAmountClick = (level1: string, level2: string, isGroup: boolean) => {
    const monthData = availableMonths.find(m => m.value === selectedMonth);
    if (!monthData) return;

    const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);
    const currentMonthME = availableMonths[selectedMonthIndex].meValue;

    // Clean up level2 by trimming whitespace
    const cleanLevel2 = level2.trim();

    const cellTransactions = rawGLData.filter(record => {
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const matchesMonth = meValue === currentMonthME;
      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = isGroup ? true : record["FS_Sub_Group "].trim() === cleanLevel2;
      const matchesDept = selectedDepartment === 'All' || record["Dept Desc"] === selectedDepartment;
      const typeValue = record.Type;
      const validType = ![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null;

      return matchesMonth && matchesLevel1 && matchesLevel2 && matchesDept && validType;
    });

    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      const majorGroupsToReverse = ["PATIENT REVENUE", "OTHER REVENUE", "NONOPERATING INCOME(LOSS)"];
      if (majorGroupsToReverse.includes(level1)) {
        amount = -amount;
      }

      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    setSortColumn('');
    setSortDirection('asc');

    setDrillDownData({
      level1,
      level2: cleanLevel2 || level1,
      month: selectedMonth,
      monthLabel: selectedMonthLabel,
      transactions: cellTransactions,
      total
    });
    setShowDrillDown(true);
  };

  const closeDrillDown = () => {
    setShowDrillDown(false);
    setDrillDownData(null);
    clearSearchFilters();
    setSortColumn('');
    setSortDirection('asc');
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleSearchFilterChange = (field: string, value: string) => {
    setSearchFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearSearchFilters = () => {
    setSearchFilters({
      account: '',
      description: '',
      date: '',
      journal: '',
      reference: '',
      memo: ''
    });
  };

  const getFilteredAndSortedTransactions = (transactions: GLRecord[]): GLRecord[] => {
    // First, filter the transactions
    let filtered = transactions.filter(transaction => {
      const accountMatch = !searchFilters.account ||
        String(transaction.glm_acc).toLowerCase().includes(searchFilters.account.toLowerCase());

      const descriptionMatch = !searchFilters.description ||
        (transaction.glm_desc?.toLowerCase() || '').includes(searchFilters.description.toLowerCase());

      const dateMatch = !searchFilters.date ||
        formatDate(transaction.glj_date).toLowerCase().includes(searchFilters.date.toLowerCase());

      const journalMatch = !searchFilters.journal ||
        (transaction.glj_journal?.toLowerCase() || '').includes(searchFilters.journal.toLowerCase());

      const referenceMatch = !searchFilters.reference ||
        (transaction.glj_reference?.toLowerCase() || '').includes(searchFilters.reference.toLowerCase());

      const memoMatch = !searchFilters.memo ||
        (transaction.glj_memo?.toLowerCase() || '').includes(searchFilters.memo.toLowerCase());

      return accountMatch && descriptionMatch && dateMatch && journalMatch && referenceMatch && memoMatch;
    });

    // Then, sort if a sort column is selected
    if (!sortColumn) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'account':
          aValue = a.glm_acc;
          bValue = b.glm_acc;
          break;
        case 'description':
          aValue = a.glm_desc?.toLowerCase() || '';
          bValue = b.glm_desc?.toLowerCase() || '';
          break;
        case 'date':
          aValue = typeof a.glj_date === 'string' ? parseFloat(a.glj_date) : a.glj_date;
          bValue = typeof b.glj_date === 'string' ? parseFloat(b.glj_date) : b.glj_date;
          if (isNaN(aValue)) aValue = 0;
          if (isNaN(bValue)) bValue = 0;
          break;
        case 'journal':
          aValue = a.glj_journal?.toLowerCase() || '';
          bValue = b.glj_journal?.toLowerCase() || '';
          break;
        case 'reference':
          aValue = a.glj_reference?.toLowerCase() || '';
          bValue = b.glj_reference?.toLowerCase() || '';
          break;
        case 'memo':
          aValue = a.glj_memo?.toLowerCase() || '';
          bValue = b.glj_memo?.toLowerCase() || '';
          break;
        case 'amount':
          aValue = typeof a[" glj_amt "] === 'string' ? parseFloat(a[" glj_amt "]) : a[" glj_amt "];
          bValue = typeof b[" glj_amt "] === 'string' ? parseFloat(b[" glj_amt "]) : b[" glj_amt "];
          if (isNaN(aValue)) aValue = 0;
          if (isNaN(bValue)) bValue = 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getSortIcon = (column: string): string => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const exportToExcel = () => {
    if (!drillDownData) return;

    const level2Part = drillDownData.level2 ? `-${drillDownData.level2}` : '';
    const filename = `${drillDownData.level1}${level2Part} for ${drillDownData.monthLabel}`;

    const excelData = drillDownData.transactions.map(transaction => {
      const amount = typeof transaction[" glj_amt "] === 'string'
        ? parseFloat(transaction[" glj_amt "])
        : transaction[" glj_amt "];

      return {
        Account: transaction.glm_acc,
        Description: transaction.glm_desc || '',
        Date: formatDate(transaction.glj_date),
        Journal: transaction.glj_journal || '',
        Reference: transaction.glj_reference || '',
        Memo: transaction.glj_memo || '',
        Amount: isNaN(amount) ? 0 : amount
      };
    });

    excelData.push({
      Account: null as any,
      Description: '',
      Date: '',
      Journal: '',
      Reference: '',
      Memo: 'TOTAL:',
      Amount: drillDownData.total
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const columnWidths = [
      { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
      { wch: 15 }, { wch: 25 }, { wch: 15 }
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaction Details');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Format date for display
  const formatDateDisplay = (dateValue: number | string): string => {
    if (!dateValue || dateValue === '') return '-';
    try {
      const serial = typeof dateValue === 'string' ? parseFloat(dateValue) : dateValue;
      if (isNaN(serial)) return '-';
      const epoch = new Date(1900, 0, 1);
      const date = new Date(epoch.getTime() + (serial - 2) * 24 * 60 * 60 * 1000);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return '-';
    }
  };

  // Prepare rows from filtered GL data
  const rows: any[] = rawGLData.map((record, index) => {
    const amount = typeof record[" glj_amt "] === 'string'
      ? parseFloat(record[" glj_amt "])
      : record[" glj_amt "];

    const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;

    return {
      id: index,
      glm_acc: record.glm_acc || '-',
      glm_desc: record.glm_desc || '-',
      glj_date: formatDateDisplay(record.glj_date),
      glj_memo: record.glj_memo || '-',
      glj_reference: record.glj_reference || '-',
      glj_journal: record.glj_journal || '-',
      glj_csnum: record.glj_csnum || '-',
      glj_batch: record.glj_batch || '-',
      glj_amt: isNaN(amount) ? '-' : formatAmount(amount),
      FY: record.FY || '-',
      ME: meValue ? formatDate(meValue) : '-',
      Act_Type: record.Type || '-',
      FS_Sub_Group: record["FS_Sub_Group "] || '-',
    };
  });

  const exportGridToExcel = () => {
    if (rows.length === 0) return;

    const monthLabel = selectedMonth === 'all' ? 'All Months' : (availableMonths.find(m => m.value === selectedMonth)?.label || selectedMonth);
    const ws = XLSX.utils.json_to_sheet(rows.map(({ id, ...rest }) => rest));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GL Transactions');
    XLSX.writeFile(wb, `GL_Transactions_FY${selectedFiscalYear}_${monthLabel.replace(/ /g, '_')}.xlsx`);
  };

  // Define columns for MUI DataGrid
  const columns: GridColDef[] = [
    { field: 'glm_acc', headerName: 'glm_acc', width: 120 },
    { field: 'glm_desc', headerName: 'glm_desc', width: 200 },
    { field: 'glj_date', headerName: 'glj_date', width: 120 },
    { field: 'glj_memo', headerName: 'glj_memo', width: 200 },
    { field: 'glj_reference', headerName: 'glj_reference', width: 150 },
    { field: 'glj_journal', headerName: 'glj_journal', width: 130 },
    { field: 'glj_csnum', headerName: 'glj_csnum', width: 120 },
    { field: 'glj_batch', headerName: 'glj_batch', width: 120 },
    { field: 'glj_amt', headerName: 'glj_amt', width: 120 },
    { field: 'FY', headerName: 'FY', width: 80 },
    { field: 'ME', headerName: 'ME', width: 100 },
    { field: 'Act_Type', headerName: 'Act Type', width: 100 },
    { field: 'FS_Sub_Group', headerName: 'FS_Sub_Group', width: 180 },
  ];

  return (
    <div style={{
      padding: '5px 40px',
      maxWidth: '100%',
      margin: '0 auto'
    }}>
      {/* Error Banner */}
      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <span className="material-icons" style={{ color: '#ef4444', fontSize: '24px' }}>
              error_outline
            </span>
            <div>
              <p style={{ margin: 0, color: '#991b1b', fontWeight: 600, fontSize: '14px' }}>
                Data Loading Error
              </p>
              <p style={{ margin: '4px 0 0 0', color: '#7f1d1d', fontSize: '13px' }}>
                {error}
              </p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            disabled={loading}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#dc2626';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ef4444';
            }}
          >
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '5px'
      }}>
        <h1 style={{ margin: 0 }}>GL Transactions</h1>
      </div>
      <hr />

      <div className="filter-container" style={{ margin: '20px 0', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div>
          <label htmlFor="fiscal-year-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
            Fiscal Year:
          </label>
          <select
            id="fiscal-year-filter"
            value={selectedFiscalYear}
            onChange={(e) => handleFiscalYearChange(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white'
            }}
          >
            {availableFiscalYears.map(year => (
              <option key={year.value} value={year.value}>
                {year.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="month-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
            Current Month:
          </label>
          <select
            id="month-filter"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white'
            }}
          >
            {availableMonths.map(month => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            onClick={loadGLData}
            className="export-btn"
            style={{
              background: '#e8e8e8',
              color: '#202020',
              border: '1.5px solid #b8b8b8',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.1s ease',
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
            <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>search</span>
            <span>Search</span>
          </button>
          {loading && (
            <span
              className="material-icons"
              style={{
                fontSize: '22px',
                color: '#1a7fa0',
                animation: 'spin 1s linear infinite',
                marginLeft: '10px'
              }}
            >
              sync
            </span>
          )}
          {!loading && hasSearched && (
            <span
              className="material-icons"
              style={{
                fontSize: '22px',
                color: '#2ecc71',
                marginLeft: '10px'
              }}
            >
              check_circle
            </span>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {hasSearched && rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <button
            onClick={exportToExcel}
            className="export-btn"
            style={{
              background: '#e8e8e8',
              color: '#202020',
              border: '1.5px solid #b8b8b8',
              padding: '8px 16px',
              margin: '0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.1s ease',
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
        </div>
      )}

      <div style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25 },
            },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          disableRowSelectionOnClick
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
          * The accompanying financial statements are presented for management discussion and analysis purposes and remain subject to audit
        </p>
      </div>

      {/* Drill-Down Modal */}
      {showDrillDown && drillDownData && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '1px solid #eee',
              paddingBottom: '10px'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5em' }}>Transaction Details</h2>
                <p style={{ margin: '5px 0 0 0', color: '#666' }}>
                  {drillDownData.level1} {drillDownData.level2 && `- ${drillDownData.level2}`} for {drillDownData.monthLabel}
                </p>
                <p style={{ margin: '5px 0 0 0', fontWeight: 'bold' }}>
                  Total: {formatAmount(drillDownData.total)}
                </p>
                {(() => {
                  const filteredTransactions = getFilteredAndSortedTransactions(drillDownData.transactions);
                  const hasFilters = Object.values(searchFilters).some(filter => filter !== '');
                  if (hasFilters && filteredTransactions.length !== drillDownData.transactions.length) {
                    const filteredTotal = filteredTransactions.reduce((sum, t) => {
                      const amt = typeof t[" glj_amt "] === 'string' ? parseFloat(t[" glj_amt "]) : t[" glj_amt "];
                      return sum + (isNaN(amt) ? 0 : amt);
                    }, 0);
                    return (
                      <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: '#0066cc' }}>
                        Filtered: {filteredTransactions.length} transactions, Total: {formatAmount(filteredTotal)}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={exportToExcel}
                  className="export-btn"
                  style={{
                    background: '#e8e8e8',
                    color: '#202020',
                    border: '1.5px solid #b8b8b8',
                    padding: '8px 16px',
                    margin: '0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.1s ease',
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
                  onClick={closeDrillDown}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#999'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Transaction Table */}
            <div className="transaction-table-wrapper" style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th onClick={() => handleSort('account')} style={{
                      padding: '10px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'account' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Account{getSortIcon('account')}
                    </th>
                    <th onClick={() => handleSort('description')} style={{
                      padding: '10px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'description' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Description{getSortIcon('description')}
                    </th>
                    <th onClick={() => handleSort('date')} style={{
                      padding: '10px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'date' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Date{getSortIcon('date')}
                    </th>
                    <th onClick={() => handleSort('journal')} style={{
                      padding: '10px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'journal' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Journal{getSortIcon('journal')}
                    </th>
                    <th onClick={() => handleSort('reference')} style={{
                      padding: '10px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'reference' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Reference{getSortIcon('reference')}
                    </th>
                    <th onClick={() => handleSort('memo')} style={{
                      padding: '10px',
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'memo' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Memo{getSortIcon('memo')}
                    </th>
                    <th onClick={() => handleSort('amount')} style={{
                      padding: '10px',
                      textAlign: 'right',
                      border: '1px solid #ddd',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: sortColumn === 'amount' ? '#e0e0e0' : '#f5f5f5'
                    }}>
                      Amount{getSortIcon('amount')}
                    </th>
                  </tr>
                  {/* Search Filter Row */}
                  <tr style={{ backgroundColor: '#fff' }}>
                    <th style={{ padding: '5px', border: '1px solid #ddd' }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchFilters.account}
                        onChange={(e) => handleSearchFilterChange('account', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}
                      />
                    </th>
                    <th style={{ padding: '5px', border: '1px solid #ddd' }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchFilters.description}
                        onChange={(e) => handleSearchFilterChange('description', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}
                      />
                    </th>
                    <th style={{ padding: '5px', border: '1px solid #ddd' }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchFilters.date}
                        onChange={(e) => handleSearchFilterChange('date', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}
                      />
                    </th>
                    <th style={{ padding: '5px', border: '1px solid #ddd' }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchFilters.journal}
                        onChange={(e) => handleSearchFilterChange('journal', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}
                      />
                    </th>
                    <th style={{ padding: '5px', border: '1px solid #ddd' }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchFilters.reference}
                        onChange={(e) => handleSearchFilterChange('reference', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}
                      />
                    </th>
                    <th style={{ padding: '5px', border: '1px solid #ddd' }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchFilters.memo}
                        onChange={(e) => handleSearchFilterChange('memo', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}
                      />
                    </th>
                    <th style={{ padding: '5px', border: '1px solid #ddd', textAlign: 'center' }}>
                      <button
                        onClick={clearSearchFilters}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          backgroundColor: '#f0f0f0'
                        }}
                      >
                        Clear
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredAndSortedTransactions(drillDownData.transactions).map((transaction, index) => {
                    const amount = typeof transaction[" glj_amt "] === 'string'
                      ? parseFloat(transaction[" glj_amt "])
                      : transaction[" glj_amt "];

                    return (
                      <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9' }}>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{transaction.glm_acc}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{transaction.glm_desc}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{formatDate(transaction.glj_date)}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{transaction.glj_journal}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{transaction.glj_reference}</td>
                        <td style={{ padding: '8px', border: '1px solid #ddd' }}>{transaction.glj_memo}</td>
                        <td style={{
                          padding: '8px',
                          border: '1px solid #ddd',
                          textAlign: 'right',
                          color: amount < 0 ? 'red' : 'black'
                        }}>
                          {isNaN(amount) ? '-' : formatAmount(amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
                    <td colSpan={6} style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>
                      Total:
                    </td>
                    <td style={{
                      padding: '10px',
                      border: '1px solid #ddd',
                      textAlign: 'right',
                      color: drillDownData.total < 0 ? 'red' : 'black',
                      fontWeight: 'bold'
                    }}>
                      {formatAmount(drillDownData.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* No transactions message */}
            {drillDownData.transactions.length === 0 && (
              <p style={{ textAlign: 'center', color: '#666', marginTop: '20px' }}>
                No transactions found for this selection.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GLTransactions;
