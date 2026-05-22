import React, { useState, useEffect } from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import * as XLSX from 'xlsx';
import { useSettings } from '../contexts/SettingsContext';
import { useAvailableMonths } from '../hooks/useAvailableMonths';
import { API_ENDPOINTS } from '../config';

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

const ProForma: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const { availableMonths } = useAvailableMonths();
  const [financialData, setFinancialData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth());
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

  const formatAmount = (amount: number): string => {
    if (amount === 0) return '-';
    const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return amount < 0 ? `(${formattedNumber})` : formattedNumber;
  };

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('authToken');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await fetch(API_ENDPOINTS.GL_DATA, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
        }

        const rawData: GLRecord[] = await response.json();

        if (!Array.isArray(rawData) || rawData.length === 0) {
          throw new Error('Invalid or empty data received');
        }

        if (departments.length === 0) {
          const uniqueDepts = Array.from(new Set(rawData.map(r => r["Dept Desc"]).filter(d => d)));
          setDepartments(['All', ...uniqueDepts.sort()]);
        }

        let selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);

        // If selected month not found, default to the last available month
        if (selectedMonthIndex === -1) {
          selectedMonthIndex = availableMonths.length - 1;
          setSelectedMonth(availableMonths[selectedMonthIndex].value);
        }

        const priorMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;

        const currentMonthME = availableMonths[selectedMonthIndex].meValue;
        const priorMonthME = availableMonths[priorMonthIndex].meValue;

        const grouped: { [key: string]: GroupedData } = {};

        rawData.forEach(record => {
          const typeValue = record.Type;

          if (![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null) {
            const level1 = record["FS_Major_Group"];
            const level2 = record["FS_Sub_Group "];
            const key = `${level1}|${level2}`;

            if (!grouped[key]) {
              grouped[key] = {
                level1,
                level2,
                majGrpSrtOrdr: record.MajGrpSrtOrdr,
                sortOrder: record.SortOrder,
                currentMonth: 0,
                priorMonth: 0,
                budget: 0
              };
            }
          }
        });

        rawData.forEach(record => {
          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const typeValue = record.Type;

          if (selectedDepartment !== 'All' && record["Dept Desc"] !== selectedDepartment) {
            return;
          }

          if (![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null) {
            let amount = typeof record[" glj_amt "] === 'string' ?
              parseFloat(record[" glj_amt "]) : record[" glj_amt "];

            if (isNaN(amount)) return;

            const level1 = record["FS_Major_Group"];
            const level2 = record["FS_Sub_Group "];

            const majorGroupsToReverse = [
              "PATIENT REVENUE",
              "OTHER REVENUE",
              "NONOPERATING INCOME(LOSS)"
            ];

            if (majorGroupsToReverse.includes(level1)) {
              amount = -amount;
            }

            const key = `${level1}|${level2}`;

            if (meValue === currentMonthME) {
              grouped[key].currentMonth += amount;
            } else if (meValue === priorMonthME) {
              grouped[key].priorMonth += amount;
            }
          }
        });

        const sortedData = Object.values(grouped).sort((a, b) => {
          if (a.majGrpSrtOrdr !== b.majGrpSrtOrdr) {
            return a.majGrpSrtOrdr - b.majGrpSrtOrdr;
          }
          return a.sortOrder - b.sortOrder;
        });

        setFinancialData(sortedData);
        setRawGLData(rawData);
        setRetryCount(0);
        setLoading(false);
      } catch (error) {
        console.error('Error loading financial data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setError(`Failed to load Pro Forma data: ${errorMessage}`);
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [selectedMonth, selectedDepartment, retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
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
  let selectedIndexForLabel = availableMonths.findIndex(m => m.value === selectedMonth);
  if (selectedIndexForLabel === -1) selectedIndexForLabel = availableMonths.length - 1;
  const priorMonthIndex = selectedIndexForLabel > 0 ? selectedIndexForLabel - 1 : 0;
  const priorMonthLabel = availableMonths[priorMonthIndex]?.label || '';

  // Group data by major group and prepare rows with hierarchy
  const groupedByMajor: { [key: string]: GroupedData[] } = {};
  financialData.forEach(item => {
    if (!groupedByMajor[item.level1]) {
      groupedByMajor[item.level1] = [];
    }
    groupedByMajor[item.level1].push(item);
  });

  const toggleGroup = (majorGroup: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(majorGroup)) {
      newExpanded.delete(majorGroup);
    } else {
      newExpanded.add(majorGroup);
    }
    setExpandedGroups(newExpanded);
  };

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
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedTransactions = (transactions: GLRecord[]): GLRecord[] => {
    if (!sortColumn) return transactions;

    return [...transactions].sort((a, b) => {
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

  // Prepare rows with parent-child hierarchy
  const rows: any[] = [];
  let rowId = 0;

  Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
    // Calculate totals for the major group
    const totalCurrentMonth = items.reduce((sum, item) => sum + item.currentMonth, 0);
    const totalPriorMonth = items.reduce((sum, item) => sum + item.priorMonth, 0);
    const totalBudget = items.reduce((sum, item) => sum + item.budget, 0);
    const totalPriorVariance = totalCurrentMonth - totalPriorMonth;
    const totalPriorVariancePercent = totalPriorMonth !== 0
      ? ((totalCurrentMonth - totalPriorMonth) / Math.abs(totalPriorMonth)) * 100
      : 0;
    const totalBudgetVariance = totalCurrentMonth - totalBudget;
    const totalBudgetVariancePercent = totalBudget !== 0
      ? ((totalCurrentMonth - totalBudget) / Math.abs(totalBudget)) * 100
      : 0;

    const isExpanded = expandedGroups.has(majorGroup);

    // Add parent row (major group total)
    const parentId = `parent-${rowId++}`;
    rows.push({
      id: parentId,
      majorGroup: majorGroup,
      level2: '',
      lineItem: majorGroup,
      currentMonth: formatAmount(totalCurrentMonth),
      currentMonthRaw: totalCurrentMonth,
      priorMonth: formatAmount(totalPriorMonth),
      priorMonthVariance: formatAmount(totalPriorVariance),
      priorMonthVariancePercent: totalPriorVariancePercent !== 0 ? `${totalPriorVariancePercent.toFixed(1)}%` : '-',
      budget: formatAmount(totalBudget),
      budgetVariance: formatAmount(totalBudgetVariance),
      budgetVariancePercent: totalBudgetVariancePercent !== 0 ? `${totalBudgetVariancePercent.toFixed(1)}%` : '-',
      ytd: '-',
      priorYearYtd: '-',
      budgetYtd: '-',
      isGroup: true,
      isExpanded: isExpanded,
    });

    // Add child rows (line items) only if expanded
    if (isExpanded) {
      items.forEach((item) => {
        const priorMonthVariance = item.currentMonth - item.priorMonth;
        const priorMonthVariancePercent = item.priorMonth !== 0
          ? ((item.currentMonth - item.priorMonth) / Math.abs(item.priorMonth)) * 100
          : 0;
        const budgetVariance = item.currentMonth - item.budget;
        const budgetVariancePercent = item.budget !== 0
          ? ((item.currentMonth - item.budget) / Math.abs(item.budget)) * 100
          : 0;

        rows.push({
          id: `child-${rowId++}`,
          majorGroup: majorGroup,
          level2: item.level2,
          lineItem: `    ${item.level2}`,
          currentMonth: formatAmount(item.currentMonth),
          currentMonthRaw: item.currentMonth,
          priorMonth: formatAmount(item.priorMonth),
          priorMonthVariance: formatAmount(priorMonthVariance),
          priorMonthVariancePercent: priorMonthVariancePercent !== 0 ? `${priorMonthVariancePercent.toFixed(1)}%` : '-',
          budget: formatAmount(item.budget),
          budgetVariance: formatAmount(budgetVariance),
          budgetVariancePercent: budgetVariancePercent !== 0 ? `${budgetVariancePercent.toFixed(1)}%` : '-',
          ytd: '-',
          priorYearYtd: '-',
          budgetYtd: '-',
          isGroup: false,
          isExpanded: false,
        });
      });
    }
  });

  // Define columns for MUI DataGrid
  const columns: GridColDef[] = [
    {
      field: 'lineItem',
      headerName: 'Line Item',
      width: 300,
      renderCell: (params) => {
        if (params.row.isGroup) {
          return (
            <div
              onClick={() => toggleGroup(params.row.majorGroup)}
              style={{
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>{params.row.isExpanded ? '−' : '+'}</span>
              <span>{params.value}</span>
            </div>
          );
        }
        return params.value;
      }
    },
    {
      field: 'currentMonth',
      headerName: `Current Month (${selectedMonthLabel})`,
      width: 150,
      renderCell: (params) => {
        if (params.row.currentMonthRaw !== 0) {
          return (
            <div
              onClick={() => handleAmountClick(params.row.majorGroup, params.row.level2, params.row.isGroup)}
              style={{
                cursor: 'pointer',
                textDecoration: 'underline',
                color: '#1976d2'
              }}
            >
              {params.value}
            </div>
          );
        }
        return params.value;
      }
    },
    { field: 'priorMonth', headerName: `Prior Month (${priorMonthLabel})`, width: 150 },
    { field: 'priorMonthVariance', headerName: 'PM Variance', width: 120 },
    { field: 'priorMonthVariancePercent', headerName: 'PM Var %', width: 100 },
    { field: 'budget', headerName: `Budget (${selectedMonthLabel})`, width: 150 },
    { field: 'budgetVariance', headerName: 'Budget Variance', width: 130 },
    { field: 'budgetVariancePercent', headerName: 'Budget Var %', width: 120 },
    { field: 'ytd', headerName: 'YTD', width: 100 },
    { field: 'priorYearYtd', headerName: 'Prior Year YTD', width: 120 },
    { field: 'budgetYtd', headerName: 'Budget YTD', width: 120 },
  ];

  return (
    <div style={{
      padding: '10px 40px',
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
        <h1 style={{ margin: 0 }}>Pro Forma Statements</h1>
      </div>
      <hr />

      <div className="filter-container" style={{ margin: '20px 0', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div>
          <label htmlFor="month-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
            Select current month:
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
          <label htmlFor="department-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
            Department:
          </label>
          <select
            id="department-filter"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              minWidth: '250px'
            }}
          >
            {departments.map(dept => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

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
          getRowClassName={(params) =>
            params.row.isGroup ? 'group-row' : 'child-row'
          }
          sx={{
            '& .group-row': {
              backgroundColor: '#f5f5f5',
              fontWeight: 'bold',
            },
            '& .child-row': {
              backgroundColor: 'white',
            },
          }}
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
                </thead>
                <tbody>
                  {getSortedTransactions(drillDownData.transactions).map((transaction, index) => {
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

export default ProForma;
