import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  "glj_date": number | string;
  "glj_memo": string;
  "glj_reference": string;
  "glj_journal": string;
  "Act Desc": string;
}

interface GroupedData {
  level1: string;
  level2: string;
  majGrpSrtOrdr: number;
  sortOrder: number;
  monthlyAmounts: { [key: string]: number };
}

interface DrillDownData {
  level1: string;
  level2: string;
  month: string;
  monthLabel: string;
  transactions: GLRecord[];
  total: number;
}

const BalanceSheetTrend: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const [financialData, setFinancialData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEndMonth, setSelectedEndMonth] = useState<string>(getDefaultMonth());
  const [rawGLData, setRawGLData] = useState<GLRecord[]>([]); // Store raw data for drill-down
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [showPdfDropdown, setShowPdfDropdown] = useState(false);
  const pdfDropdownRef = useRef<HTMLDivElement>(null);

  // Data cache to avoid recalculating processed data
  const [processedDataCache, setProcessedDataCache] = useState<Map<string, {
    groupedByMajor: { [key: string]: GroupedData[] };
    monthHeaders: { key: string; label: string; dateStr: string }[];
    rawGLData: GLRecord[];
  }>>(new Map());

  const { availableMonths } = useAvailableMonths();

  // Convert Excel serial date to JavaScript Date
  const excelSerialToDate = (serial: number): Date => {
    const epoch = new Date(1900, 0, 1);
    return new Date(epoch.getTime() + (serial - 2) * 24 * 60 * 60 * 1000);
  };

  // Format number with commas and parentheses for negatives
  const formatAmount = (amount: number): string => {
    if (amount === 0) return '-';

    const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });

    return amount < 0 ? `(${formattedNumber})` : formattedNumber;
  };

  const getAmountClass = (amount: number): string => {
    // Return just 'amount' class for all values (no color styling)
    return 'amount';
  };

  // Calculate the date range for the trailing 12 months ending with selected month
  const getDateRange = (endMonth: string) => {
    const selectedMonth = availableMonths.find(m => m.value === endMonth);
    if (!selectedMonth) return { startSerial: 0, endSerial: 0 };

    const endSerial = selectedMonth.meValue;
    const endIndex = availableMonths.findIndex(m => m.value === endMonth);
    const startIndex = Math.max(0, endIndex - 11); // Get 12 months (0-11 = 12 months)
    const startSerial = availableMonths[startIndex].meValue;

    return { startSerial, endSerial };
  };

  // Generate month headers for the selected 12-month period
  const generateMonthHeaders = (endMonth: string) => {
    const months = [];
    const endIndex = availableMonths.findIndex(m => m.value === endMonth);
    const startIndex = Math.max(0, endIndex - 11);

    for (let i = startIndex; i <= endIndex; i++) {
      const monthData = availableMonths[i];
      if (monthData) {
        const [year, month] = monthData.value.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const dayStr = new Date(parseInt(year), parseInt(month), 0).getDate();

        months.push({
          key: monthData.value,
          label: monthName,
          dateStr: `${month}/${dayStr}/${year.slice(-2)}`
        });
      }
    }
    return months;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pdfDropdownRef.current && !pdfDropdownRef.current.contains(event.target as Node)) {
        setShowPdfDropdown(false);
      }
    };

    if (showPdfDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPdfDropdown]);

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);

        // Check if we already have cached data for this month
        const cacheKey = selectedEndMonth;
        const cachedData = processedDataCache.get(cacheKey);

        if (cachedData) {
          // Use cached data
          console.log('Using cached data for month:', selectedEndMonth);
          const sortedData = Object.values(cachedData.groupedByMajor).flat().sort((a, b) => {
            if (a.majGrpSrtOrdr !== b.majGrpSrtOrdr) {
              return a.majGrpSrtOrdr - b.majGrpSrtOrdr;
            }
            return a.sortOrder - b.sortOrder;
          });
          setFinancialData(sortedData);
          setRawGLData(cachedData.rawGLData);
          setLoading(false);
          return;
        }

        console.log('Processing new data for month:', selectedEndMonth);

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
          throw new Error(`Failed to load data: ${response.status}`);
        }

        const rawData: GLRecord[] = await response.json();

        // Get the date range based on selected end month
        const { startSerial, endSerial } = getDateRange(selectedEndMonth);

        // Filter data according to SQL query criteria - FOR BALANCE SHEET TREND: Type IN (1, 2)
        // For balance sheet, we need ALL transactions up to the end date (cumulative)
        const filteredData = rawData.filter(record => {
          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const typeValue = record.Type;

          return (
            meValue <= endSerial && // Include all transactions up to the end month
            [1, 2].includes(typeValue) && // Type IN (1, 2) for Balance Sheet accounts
            record[" glj_amt "] !== "" &&
            record[" glj_amt "] !== null
          );
        });

        // Group and aggregate data - Calculate cumulative balances for each month
        const grouped: { [key: string]: GroupedData } = {};

        filteredData.forEach(record => {
          let amount = typeof record[" glj_amt "] === 'string' ?
            parseFloat(record[" glj_amt "]) : record[" glj_amt "];

          if (isNaN(amount)) return;

          const level1 = record["FS_Major_Group"];
          const level2 = record["FS_Sub_Group "];

          // Balance sheet accounts typically don't need sign reversal like income statement accounts
          // Keep original amounts for proper balance sheet presentation

          const key = `${level1}|${level2}`;

          // Convert ME to month string using availableMonths lookup
          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const transactionMonthData = availableMonths.find(m => m.meValue === meValue);
          if (!transactionMonthData) return;

          if (!grouped[key]) {
            grouped[key] = {
              level1,
              level2,
              majGrpSrtOrdr: record.MajGrpSrtOrdr,
              sortOrder: record.SortOrder,
              monthlyAmounts: {}
            };
          }

          // For each month in our display range, if this transaction is on or before that month,
          // include it in the cumulative total
          const monthHeadersForCalc = generateMonthHeaders(selectedEndMonth);
          monthHeadersForCalc.forEach(monthHeader => {
            const monthHeaderData = availableMonths.find(m => m.value === monthHeader.key);
            if (monthHeaderData && meValue <= monthHeaderData.meValue) {
              if (!grouped[key].monthlyAmounts[monthHeader.key]) {
                grouped[key].monthlyAmounts[monthHeader.key] = 0;
              }
              grouped[key].monthlyAmounts[monthHeader.key] += amount;
            }
          });
        });

        // Convert to array and sort
        const sortedData = Object.values(grouped).sort((a, b) => {
          if (a.majGrpSrtOrdr !== b.majGrpSrtOrdr) {
            return a.majGrpSrtOrdr - b.majGrpSrtOrdr;
          }
          return a.sortOrder - b.sortOrder;
        });

        // Group by major groups for caching
        const groupedByMajor: { [key: string]: GroupedData[] } = {};
        sortedData.forEach(item => {
          if (!groupedByMajor[item.level1]) {
            groupedByMajor[item.level1] = [];
          }
          groupedByMajor[item.level1].push(item);
        });

        // Generate month headers for caching
        const monthHeaders = generateMonthHeaders(selectedEndMonth);

        // Cache the processed data
        const newCache = new Map(processedDataCache);
        newCache.set(cacheKey, {
          groupedByMajor,
          monthHeaders,
          rawGLData: filteredData
        });

        // Limit cache size to prevent memory issues (keep last 6 months)
        if (newCache.size > 6) {
          const firstKey = newCache.keys().next().value;
          newCache.delete(firstKey);
        }

        setProcessedDataCache(newCache);
        setFinancialData(sortedData);
        setRawGLData(filteredData); // Store filtered raw data for drill-down
        setLoading(false);
      } catch (error) {
        console.error('Error loading financial data:', error);
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [selectedEndMonth]);

  // Use cached month headers and groupedByMajor if available, otherwise generate them
  const cachedData = processedDataCache.get(selectedEndMonth);
  const monthHeaders = cachedData?.monthHeaders || generateMonthHeaders(selectedEndMonth);

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

  // Use cached groupedByMajor if available, otherwise generate it
  const groupedByMajor: { [key: string]: GroupedData[] } = cachedData?.groupedByMajor || (() => {
    const grouped: { [key: string]: GroupedData[] } = {};
    financialData.forEach(item => {
      if (!grouped[item.level1]) {
        grouped[item.level1] = [];
      }
      grouped[item.level1].push(item);
    });
    return grouped;
  })();

  // Calculate totals for major groups
  const calculateGroupTotal = (items: GroupedData[], monthKey: string): number => {
    return items.reduce((sum, item) => sum + (item.monthlyAmounts[monthKey] || 0), 0);
  };

  // Calculate 12-month total for an item
  const calculate12MonthTotal = (monthlyAmounts: { [key: string]: number }): number => {
    return monthHeaders.reduce((sum, month) => sum + (monthlyAmounts[month.key] || 0), 0);
  };

  // Calculate 12-month total for a group
  const calculateGroup12MonthTotal = (items: GroupedData[]): number => {
    return items.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);
  };

  // Generate period description based on selected month headers
  const getPeriodDescription = () => {
    if (monthHeaders.length === 0) return '';
    const startMonth = monthHeaders[0].label;
    const endMonth = monthHeaders[monthHeaders.length - 1].label;
    return `Monthly Balance Sheet Trends from ${startMonth} to ${endMonth}`;
  };

  // Handle clicking on a specific GL account amount to drill down to transactions
  const handleGLAccountClick = (level1: string, level2: string, monthKey: string, glAccount: number) => {
    // Get the month label for display
    const monthData = availableMonths.find(m => m.value === monthKey);
    if (!monthData) return;

    // Filter transactions for this specific GL account
    const accountTransactions = rawGLData.filter(record => {
      const recordMonthData = availableMonths.find(m => m.meValue === (typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME));
      const matchesMonth = recordMonthData?.value === monthKey;
      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = record["FS_Sub_Group "] === level2;
      const matchesAccount = record.glm_acc === glAccount;

      return matchesMonth && matchesLevel1 && matchesLevel2 && matchesAccount;
    });

    // Calculate total (no sign reversal for balance sheet accounts)
    const total = accountTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Get GL account description
    const accountDescription = accountTransactions[0]?.glm_desc || '';

    // Set drill-down data and show modal
    setDrillDownData({
      level1,
      level2: `${level2} - Account ${glAccount} (${accountDescription})`,
      month: monthKey,
      monthLabel: monthData.label,
      transactions: accountTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Handle clicking on 12-month total to drill down to all transactions
  const handle12MonthTotalClick = (level1: string, level2: string) => {
    // Filter transactions for all months in the current period
    const totalTransactions = rawGLData.filter(record => {
      const recordMonthData = availableMonths.find(m => m.meValue === (typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME));
      const matchesLevel1 = record["FS_Major_Group"] === level1;

      // If level2 is empty, show all transactions for the major group
      // Otherwise, filter by specific sub group
      const matchesLevel2 = level2 === '' ? true : record["FS_Sub_Group "] === level2;

      // Check if the transaction is within our 12-month period
      const isInPeriod = monthHeaders.some(month => recordMonthData?.value === month.key);

      return matchesLevel1 && matchesLevel2 && isInPeriod;
    });

    // Calculate total (no sign reversal for balance sheet accounts)
    const total = totalTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Set drill-down data and show modal
    const periodDescription = `${monthHeaders[0]?.label} to ${monthHeaders[monthHeaders.length - 1]?.label}`;
    setDrillDownData({
      level1,
      level2: level2 || level1,
      month: 'all-months',
      monthLabel: `12-Month Period (${periodDescription})`,
      transactions: totalTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Handle clicking on an amount to drill down to transactions
  const handleAmountClick = (level1: string, level2: string, monthKey: string) => {
    // Get the month label for display
    const monthData = availableMonths.find(m => m.value === monthKey);
    if (!monthData) return;

    // Filter transactions for this specific cell
    const cellTransactions = rawGLData.filter(record => {
      const recordMonthData = availableMonths.find(m => m.meValue === (typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME));
      const matchesMonth = recordMonthData?.value === monthKey;
      const matchesLevel1 = record["FS_Major_Group"] === level1;

      // If level2 is empty, show all transactions for the major group
      // Otherwise, filter by specific sub group
      const matchesLevel2 = level2 === '' ? true : record["FS_Sub_Group "] === level2;

      return matchesMonth && matchesLevel1 && matchesLevel2;
    });

    // Calculate total (no sign reversal for balance sheet accounts)
    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Set drill-down data and show modal
    setDrillDownData({
      level1,
      level2,
      month: monthKey,
      monthLabel: monthData.label,
      transactions: cellTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Close drill-down modal
  const closeDrillDown = () => {
    setShowDrillDown(false);
    setDrillDownData(null);
  };

  // Format date for display
  const formatDate = (dateValue: number | string): string => {
    if (!dateValue || dateValue === '') return '-';

    try {
      const serial = typeof dateValue === 'string' ? parseFloat(dateValue) : dateValue;
      if (isNaN(serial)) return '-';

      const date = excelSerialToDate(serial);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return '-';
    }
  };

  // Handle column sorting in the modal
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort transactions based on column and direction
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
          // Convert Excel serial dates for proper chronological sorting
          aValue = typeof a.glj_date === 'string' ? parseFloat(a.glj_date) : a.glj_date;
          bValue = typeof b.glj_date === 'string' ? parseFloat(b.glj_date) : b.glj_date;
          // Handle empty/invalid dates
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
          // Convert amounts to numbers for proper numerical sorting
          aValue = typeof a[" glj_amt "] === 'string' ? parseFloat(a[" glj_amt "]) : a[" glj_amt "];
          bValue = typeof b[" glj_amt "] === 'string' ? parseFloat(b[" glj_amt "]) : b[" glj_amt "];
          if (isNaN(aValue)) aValue = 0;
          if (isNaN(bValue)) bValue = 0;
          break;
        default:
          return 0;
      }

      // Compare values
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Get sort indicator arrow
  const getSortIcon = (column: string): string => {
    if (sortColumn !== column) return ' ↕'; // Default sort icon
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Toggle expansion of line items
  const toggleExpansion = (itemKey: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey);
    } else {
      newExpanded.add(itemKey);
    }
    setExpandedItems(newExpanded);
  };

  // Toggle all GL accounts expand/collapse
  const toggleAllAccounts = () => {
    if (expandedItems.size === 0) {
      // Expand all
      const allKeys = new Set<string>();
      financialData.forEach(item => {
        const itemKey = `${item.level1}|${item.level2}`;
        allKeys.add(itemKey);
      });
      setExpandedItems(allKeys);
    } else {
      // Collapse all
      setExpandedItems(new Set());
    }
  };

  // Get GL account details for a specific subgroup
  const getGLAccountDetails = (level1: string, level2: string) => {
    const accountData: { [key: string]: { account: number; description: string; monthlyAmounts: { [key: string]: number } } } = {};

    rawGLData.forEach(record => {
      if (record["FS_Major_Group"] === level1 && record["FS_Sub_Group "] === level2) {
        const account = record.glm_acc;
        const description = record.glm_desc || '';
        let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

        if (isNaN(amount)) return;

        // No sign reversal for balance sheet accounts

        // Convert ME to month string using availableMonths lookup
        const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
        const transactionMonthData = availableMonths.find(m => m.meValue === meValue);
        if (!transactionMonthData) return;

        const accountKey = `${account}`;

        if (!accountData[accountKey]) {
          accountData[accountKey] = {
            account,
            description,
            monthlyAmounts: {}
          };
        }

        // For each month in our display range, if this transaction is on or before that month,
        // include it in the cumulative total
        monthHeaders.forEach(monthHeader => {
          const monthHeaderData = availableMonths.find(m => m.value === monthHeader.key);
          if (monthHeaderData && meValue <= monthHeaderData.meValue) {
            if (!accountData[accountKey].monthlyAmounts[monthHeader.key]) {
              accountData[accountKey].monthlyAmounts[monthHeader.key] = 0;
            }
            accountData[accountKey].monthlyAmounts[monthHeader.key] += amount;
          }
        });
      }
    });

    return Object.values(accountData).sort((a, b) => a.account - b.account);
  };

  // Export Trial Balance to Excel (GL accounts with balances by month)
  const exportTrialBalance = () => {
    // Generate filename based on the period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `Trial Balance - ${startMonth} to ${endMonth}`;

    // Prepare data for Excel export - one GL account per row
    const excelData: any[] = [];

    // Collect all unique GL accounts with their descriptions and monthly amounts
    const glAccountsMap: Map<number, { description: string; monthlyAmounts: { [key: string]: number } }> = new Map();

    rawGLData.forEach(record => {
      const account = record.glm_acc;
      const description = record.glm_desc || '';
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      if (isNaN(amount)) return;

      // Convert ME to month string using availableMonths lookup
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const transactionMonthData = availableMonths.find(m => m.meValue === meValue);
      if (!transactionMonthData) return;

      if (!glAccountsMap.has(account)) {
        glAccountsMap.set(account, {
          description,
          monthlyAmounts: {}
        });
      }

      const accountData = glAccountsMap.get(account)!;

      // For each month in our display range, if this transaction is on or before that month,
      // include it in the cumulative total (balance sheet cumulative logic)
      monthHeaders.forEach(monthHeader => {
        const monthHeaderData = availableMonths.find(m => m.value === monthHeader.key);
        if (monthHeaderData && meValue <= monthHeaderData.meValue) {
          if (!accountData.monthlyAmounts[monthHeader.key]) {
            accountData.monthlyAmounts[monthHeader.key] = 0;
          }
          accountData.monthlyAmounts[monthHeader.key] += amount;
        }
      });
    });

    // Convert map to array and sort by account number
    const sortedAccounts = Array.from(glAccountsMap.entries())
      .sort((a, b) => a[0] - b[0]);

    // Build Excel data rows
    sortedAccounts.forEach(([account, data]) => {
      const dataRow: any = {
        'GL Account': account,
        'Description': data.description
      };

      // Add monthly amounts
      monthHeaders.forEach(month => {
        const amount = data.monthlyAmounts[month.key] || 0;
        dataRow[month.label] = amount !== 0 ? amount : 0;
      });

      excelData.push(dataRow);
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 15 }, // GL Account
      { wch: 35 }  // Description
    ];
    monthHeaders.forEach(() => columnWidths.push({ wch: 15 })); // Month columns
    worksheet['!cols'] = columnWidths;

    // Apply accounting number format to all numeric cells (month columns)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = 2; col <= range.e.c; col++) { // Start from column 2 (first month column)
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellAddress];
        if (cell && typeof cell.v === 'number') {
          cell.z = '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)'; // Accounting format
        }
      }
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trial Balance');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export full balance sheet to Excel
  const exportFullBalanceSheet = () => {
    // Generate filename based on the period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `Trended Balance Sheet - ${startMonth} to ${endMonth}`;

    // Prepare data for Excel export
    const excelData: any[] = [];

    // Add data rows grouped by major groups
    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      // Add section header
      const sectionRow: any = { LineItem: majorGroup };
      monthHeaders.forEach(month => {
        sectionRow[month.label] = '';
      });
      excelData.push(sectionRow);

      // Add detail lines
      items.forEach(item => {
        const dataRow: any = { LineItem: `  ${item.level2}` }; // Indent sub-items
        monthHeaders.forEach(month => {
          const amount = item.monthlyAmounts[month.key] || 0;
          dataRow[month.label] = amount !== 0 ? amount : '';
        });
        excelData.push(dataRow);
      });

      // Add group total
      const totalRow: any = { LineItem: `Total ${majorGroup}` };
      monthHeaders.forEach(month => {
        const total = calculateGroupTotal(items, month.key);
        totalRow[month.label] = total !== 0 ? total : '';
      });
      excelData.push(totalRow);

      // Add empty row for spacing
      const emptyRow: any = { LineItem: '' };
      monthHeaders.forEach(month => {
        emptyRow[month.label] = '';
      });
      excelData.push(emptyRow);
    });

    // Track which rows are section headers (first of each group) and totals
    const sectionHeaderRows: number[] = [];
    const totalRows: number[] = [];
    let currentRow = 1; // Start at 1 because Excel rows are 1-indexed

    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      sectionHeaderRows.push(currentRow); // Section header
      currentRow++;
      currentRow += items.length; // Detail lines
      totalRows.push(currentRow); // Total row
      currentRow++;
      currentRow++; // Empty row
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [{ wch: 30 }]; // Line Item column
    monthHeaders.forEach(() => columnWidths.push({ wch: 15 })); // Month columns
    worksheet['!cols'] = columnWidths;

    // Apply accounting number format to all numeric cells
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = 1; col <= range.e.c; col++) { // Start from column 1 (skip LineItem column)
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellAddress];
        if (cell && typeof cell.v === 'number') {
          cell.z = '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)'; // Accounting format
        }
      }
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trended Balance Sheet');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export full balance sheet to PDF
  const exportFullBalanceSheetPDF = () => {
    // Generate filename based on the period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `Trended Balance Sheet - ${startMonth} to ${endMonth}`;
    const doc = new jsPDF('landscape');

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Balance Sheet Trend', 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${startMonth} to ${endMonth}`, 14, 22);

    const tableData: any[] = [];

    // Build table data
    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      // Add section header
      tableData.push([
        { content: majorGroup, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        ...monthHeaders.map(() => '')
      ]);

      // Add detail lines
      items.forEach(item => {
        const row = [
          `  ${item.level2}`,
          ...monthHeaders.map(month => {
            const amount = item.monthlyAmounts[month.key] || 0;
            return amount !== 0 ? formatAmount(amount) : '-';
          })
        ];
        tableData.push(row);
      });

      // Add group total
      const totalRow = [
        { content: `Total ${majorGroup}`, styles: { fontStyle: 'bold' } },
        ...monthHeaders.map(month => {
          const total = calculateGroupTotal(items, month.key);
          return { content: total !== 0 ? formatAmount(total) : '-', styles: { fontStyle: 'bold' } };
        })
      ];
      tableData.push(totalRow);

      // Add empty row for spacing
      tableData.push(['', ...monthHeaders.map(() => '')]);
    });

    // Create column headers
    const headers = [
      'Line Item',
      ...monthHeaders.map(month => month.label)
    ];

    // Calculate column widths dynamically
    const numMonths = monthHeaders.length;
    const lineItemWidth = 50;
    const monthColWidth = (297 - lineItemWidth - 30) / numMonths; // 297mm is landscape width, 30 for margins

    const columnStyles: any = { 0: { cellWidth: lineItemWidth } };
    for (let i = 1; i <= numMonths; i++) {
      columnStyles[i] = { cellWidth: monthColWidth, halign: 'right' };
    }

    // Generate table with custom styling
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 28,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 1.5
      },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7
      },
      columnStyles: columnStyles
    });

    doc.save(`${filename}.pdf`);
  };

  // Export full balance sheet to PDF with GL Detail
  const exportGLDetailBalanceSheetPDF = () => {
    // Generate filename based on the period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `Trended Balance Sheet - GL Detail - ${startMonth} to ${endMonth}`;
    const doc = new jsPDF('landscape');

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Balance Sheet Trend - GL Detail', 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${startMonth} to ${endMonth}`, 14, 22);

    const tableData: any[] = [];

    // Build table data with GL account details
    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      // Add section header
      tableData.push([
        { content: majorGroup, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        ...monthHeaders.map(() => '')
      ]);

      // Add detail lines with GL accounts
      items.forEach(item => {
        // Add subgroup row (bold)
        const row = [
          { content: `  ${item.level2}`, styles: { fontStyle: 'bold' } },
          ...monthHeaders.map(month => {
            const amount = item.monthlyAmounts[month.key] || 0;
            return {
              content: amount !== 0 ? formatAmount(amount) : '-',
              styles: { fontStyle: 'bold' }
            };
          })
        ];
        tableData.push(row);

        // Get GL account details for this subgroup
        const glAccounts = getGLAccountDetails(item.level1, item.level2);

        // Add GL account rows
        glAccounts.forEach(account => {
          const glRow = [
            { content: `    ${account.account} - ${account.description}`, styles: { fontSize: 6, textColor: [102, 102, 102] } },
            ...monthHeaders.map(month => {
              const amount = account.monthlyAmounts[month.key] || 0;
              return {
                content: amount !== 0 ? formatAmount(amount) : '-',
                styles: { fontSize: 6, textColor: [102, 102, 102] }
              };
            })
          ];
          tableData.push(glRow);
        });
      });

      // Add group total
      const totalRow = [
        { content: `Total ${majorGroup}`, styles: { fontStyle: 'bold' } },
        ...monthHeaders.map(month => {
          const total = calculateGroupTotal(items, month.key);
          return { content: total !== 0 ? formatAmount(total) : '-', styles: { fontStyle: 'bold' } };
        })
      ];
      tableData.push(totalRow);

      // Add empty row for spacing
      tableData.push(['', ...monthHeaders.map(() => '')]);
    });

    // Create column headers
    const headers = [
      'Line Item',
      ...monthHeaders.map(month => month.label)
    ];

    // Calculate column widths dynamically
    const numMonths = monthHeaders.length;
    const lineItemWidth = 50;
    const monthColWidth = (297 - lineItemWidth - 30) / numMonths; // 297mm is landscape width, 30 for margins

    const columnStyles: any = { 0: { cellWidth: lineItemWidth } };
    for (let i = 1; i <= numMonths; i++) {
      columnStyles[i] = { cellWidth: monthColWidth, halign: 'right' };
    }

    // Generate table with custom styling
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 28,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 1.5
      },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7
      },
      columnStyles: columnStyles
    });

    doc.save(`${filename}.pdf`);
  };

  // Export transactions to Excel
  const exportToExcel = () => {
    if (!drillDownData) return;

    // Generate filename based on the modal title
    const level2Part = drillDownData.level2 ? `-${drillDownData.level2}` : '';
    const filename = `${drillDownData.level1}${level2Part} for ${drillDownData.monthLabel}`;

    // Prepare data for Excel export
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

    // Add total row
    excelData.push({
      Account: null as any,
      Description: '',
      Date: '',
      Journal: '',
      Reference: '',
      Memo: 'TOTAL:',
      Amount: drillDownData.total
    });

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 12 }, // Account
      { wch: 30 }, // Description
      { wch: 12 }, // Date
      { wch: 15 }, // Journal
      { wch: 15 }, // Reference
      { wch: 25 }, // Memo
      { wch: 15 }  // Amount
    ];
    worksheet['!cols'] = columnWidths;

    // Style the total row (last row)
    const totalRowIndex = excelData.length;
    const totalMemoCell = `F${totalRowIndex}`;
    const totalAmountCell = `G${totalRowIndex}`;

    if (!worksheet[totalMemoCell]) worksheet[totalMemoCell] = {};
    if (!worksheet[totalAmountCell]) worksheet[totalAmountCell] = {};

    worksheet[totalMemoCell].s = { font: { bold: true } };
    worksheet[totalAmountCell].s = { font: { bold: true } };

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaction Details');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Sparkline component for showing mini trends
  const Sparkline: React.FC<{
    data: number[];
    width?: number;
    height?: number;
    color?: string;
  }> = ({ data, width = 40, height = 16, color = '#1abc9c' }) => {
    if (!data || data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);

    // If all values are the same or max is 0, don't render sparkline
    if (max === min || max === 0) return null;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} style={{ display: 'inline-block', marginLeft: '8px' }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          opacity="0.7"
        />
      </svg>
    );
  };

  // Get sparkline data for a row
  const getSparklineData = (monthlyAmounts: { [key: string]: number }): number[] => {
    return monthHeaders.map(month => monthlyAmounts[month.key] || 0);
  };

  return (
    <>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px'
      }}>
        <h1 style={{ margin: 0 }}>Balance Sheet Trend</h1>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            className="export-btn"
            onClick={exportTrialBalance}
            style={{
              background: '#e8e8e8',
              color: '#202020',
              border: '1.5px solid #b8b8b8',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
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
            <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>description</span>
            <span>Export Trial Balance</span>
          </button>
          <button
            className="export-btn"
            onClick={exportFullBalanceSheet}
            style={{
              background: '#e8e8e8',
              color: '#202020',
              border: '1.5px solid #b8b8b8',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
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
          <div ref={pdfDropdownRef} style={{ position: 'relative' }}>
            <button
              className="export-btn"
              onClick={() => setShowPdfDropdown(!showPdfDropdown)}
              style={{
                background: '#e8e8e8',
                color: '#202020',
                border: '1.5px solid #b8b8b8',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
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
              <span>Export to PDF ▼</span>
            </button>
            {showPdfDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '5px',
                  background: 'white',
                  border: '2px solid #1abc9c',
                  borderRadius: '8px',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                  zIndex: 1000,
                  minWidth: '200px'
                }}
              >
                <button
                  onClick={() => {
                    exportFullBalanceSheetPDF();
                    setShowPdfDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    background: 'white',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#2c5364',
                    borderRadius: '6px 6px 0 0',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f0f0f0';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'white';
                  }}
                >
                  Standard Report
                </button>
                <button
                  onClick={() => {
                    exportGLDetailBalanceSheetPDF();
                    setShowPdfDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    background: 'white',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#2c5364',
                    borderRadius: '0 0 6px 6px',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f0f0f0';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'white';
                  }}
                >
                  GL Detail Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <hr style={{ margin: '4px 0' }} />

      <div className="income-statement-container">
        <div className="statement-header">
          {/* Month Filter */}
          <div className="filter-container" style={{ margin: '5px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label htmlFor="month-filter" style={{ fontWeight: 'bold' }}>
                Select ending month for 12-month trend:
              </label>
              <select
                id="month-filter"
                value={selectedEndMonth}
                onChange={(e) => setSelectedEndMonth(e.target.value)}
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
              <button
                onClick={toggleAllAccounts}
                style={{
                  background: '#e8e8e8',
                  color: '#202020',
                  border: '1.5px solid #b8b8b8',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
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
                {expandedItems.size === 0 ? 'Expand GL Accounts' : 'Collapse GL Accounts'}
              </button>
            </div>
            <span className="period" style={{ marginRight: '0' }}>{getPeriodDescription()}</span>
          </div>
        </div>

        <div
          ref={tableWrapperRef}
          className="table-wrapper"
        >
          <table className="income-statement-table trend-table">
            <thead>
              <tr>
                <th className="line-item">Line Item</th>
                {monthHeaders.map(month => (
                  <th key={month.key} className={month.key === monthHeaders[monthHeaders.length - 1].key ? "month-col latest" : "month-col"}>
                    {month.label}<br /><small>{month.dateStr}</small>
                  </th>
                ))}
                <th className="sparkline-col">
                  Trend<br /><small>12 Month</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedByMajor).map(([majorGroup, items]) => (
                <React.Fragment key={majorGroup}>
                  {/* Section Header */}
                  <tr className="section-header">
                    <td><strong>{majorGroup}</strong></td>
                    {monthHeaders.map(month => (
                      <td key={month.key}></td>
                    ))}
                    <td></td>
                  </tr>

                  {/* Detail Lines */}
                  {items.map((item, index) => {
                    const itemKey = `${item.level1}|${item.level2}`;
                    const isExpanded = expandedItems.has(itemKey);
                    const glAccounts = isExpanded ? getGLAccountDetails(item.level1, item.level2) : [];

                    return (
                      <React.Fragment key={`${majorGroup}-${index}`}>
                        <tr>
                          <td className="indent" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => toggleExpansion(itemKey)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: '#1abc9c',
                                padding: '2px',
                                minWidth: '16px',
                                textAlign: 'center'
                              }}
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                            {item.level2}
                          </td>
                          {monthHeaders.map(month => {
                            const amount = item.monthlyAmounts[month.key] || 0;
                            return (
                              <td
                                key={month.key}
                                className={getAmountClass(amount)}
                              >
                                {amount !== 0 ? formatAmount(amount) : '-'}
                              </td>
                            );
                          })}
                          <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <Sparkline
                              data={getSparklineData(item.monthlyAmounts)}
                              color={getSparklineData(item.monthlyAmounts).some(v => v < 0) ? '#e74c3c' : '#1abc9c'}
                            />
                          </td>
                        </tr>

                        {/* Expanded GL Account Details */}
                        {isExpanded && glAccounts.map((account, accountIndex) => (
                          <tr key={`${itemKey}-account-${accountIndex}`} className="gl-account-detail" style={{ backgroundColor: '#f0f0f0' }}>
                            <td className="indent" style={{ paddingLeft: '60px', fontSize: '11px', color: '#666' }}>
                              {account.account} - {account.description}
                            </td>
                            {monthHeaders.map(month => {
                              const amount = account.monthlyAmounts[month.key] || 0;
                              return (
                                <td
                                  key={month.key}
                                  className={getAmountClass(amount)}
                                  style={{
                                    fontSize: '11px'
                                  }}
                                >
                                  {amount !== 0 ? formatAmount(amount) : '-'}
                                </td>
                              );
                            })}
                            <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                              <Sparkline
                                data={getSparklineData(account.monthlyAmounts)}
                                width={32}
                                height={12}
                                color={getSparklineData(account.monthlyAmounts).some(v => v < 0) ? '#e74c3c' : '#27ae60'}
                              />
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}

                  {/* Group Total */}
                  <tr className="subtotal">
                    <td><strong>Total {majorGroup}</strong></td>
                    {monthHeaders.map(month => {
                      const total = calculateGroupTotal(items, month.key);
                      return (
                        <td
                          key={month.key}
                          className={getAmountClass(total)}
                        >
                          <strong>{total !== 0 ? formatAmount(total) : '-'}</strong>
                        </td>
                      );
                    })}
                    <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <Sparkline
                        data={monthHeaders.map(month => calculateGroupTotal(items, month.key))}
                        color="#2c5364"
                        width={45}
                        height={18}
                      />
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="statement-footer">
          <p className="note">* The accompanying balance sheet statements are presented for management discussion and analysis purposes</p>
        </div>
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
                  className="export-btn"
                  onClick={exportToExcel}
                  style={{
                    background: '#e8e8e8',
                    color: '#202020',
                    border: '1.5px solid #b8b8b8',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
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
                    <th
                      onClick={() => handleSort('account')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'account' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
                      Account{getSortIcon('account')}
                    </th>
                    <th
                      onClick={() => handleSort('description')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'description' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
                      Description{getSortIcon('description')}
                    </th>
                    <th
                      onClick={() => handleSort('date')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'date' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
                      Date{getSortIcon('date')}
                    </th>
                    <th
                      onClick={() => handleSort('journal')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'journal' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
                      Journal{getSortIcon('journal')}
                    </th>
                    <th
                      onClick={() => handleSort('reference')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'reference' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
                      Reference{getSortIcon('reference')}
                    </th>
                    <th
                      onClick={() => handleSort('memo')}
                      style={{
                        padding: '10px',
                        textAlign: 'left',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'memo' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
                      Memo{getSortIcon('memo')}
                    </th>
                    <th
                      onClick={() => handleSort('amount')}
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: sortColumn === 'amount' ? '#e0e0e0' : '#f5f5f5'
                      }}
                    >
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
    </>
  );
};

export default BalanceSheetTrend;