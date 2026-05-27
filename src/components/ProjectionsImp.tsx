import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DataGrid, GridColDef, GridRowsProp } from '@mui/x-data-grid';
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

const ProjectionsImp: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const { availableMonths } = useAvailableMonths();
  const [financialData, setFinancialData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEndMonth, setSelectedEndMonth] = useState<string>(getDefaultMonth());
  const [fiscalYearEnd, setFiscalYearEnd] = useState<string>('2026-09'); // Changed to 2026 to show more projection months
  const [rawGLData, setRawGLData] = useState<GLRecord[]>([]);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [showCalculationModal, setShowCalculationModal] = useState(false);
  const [calculationDetails, setCalculationDetails] = useState<{
    title: string;
    calculation: string;
    numerator: string;
    denominator: string;
    result: string;
  } | null>(null);

  const [processedDataCache, setProcessedDataCache] = useState<Map<string, {
    groupedByMajor: { [key: string]: GroupedData[] };
    monthHeaders: { key: string; label: string; dateStr: string }[];
    rawGLData: GLRecord[];
  }>>(new Map());

  // Generate fiscal year end options: all available months + 12 months after the last one
  const getFiscalYearEndOptions = () => {
    const options = [...availableMonths];

    // Get the last month from availableMonths
    const lastMonth = availableMonths[availableMonths.length - 1];
    const [year, month] = lastMonth.value.split('-').map(Number);

    // Generate 12 additional months
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    for (let i = 1; i <= 12; i++) {
      const newDate = new Date(year, month - 1 + i, 1);
      const newYear = newDate.getFullYear();
      const newMonth = newDate.getMonth() + 1;
      const monthStr = newMonth.toString().padStart(2, '0');
      const meValue = lastMonth.meValue + (i * 30); // Approximate ME value increment

      const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      options.push({
        value: `${newYear}-${monthStr}`,
        label: `${monthNames[newMonth - 1]} ${newYear}`,
        shortLabel: `${shortMonthNames[newMonth - 1]} ${newYear}`,
        meValue: meValue,
        fiscalYear: newMonth >= 7 ? newYear + 1 : newYear
      });
    }

    return options;
  };

  const excelSerialToDate = (serial: number): Date => {
    const epoch = new Date(1900, 0, 1);
    return new Date(epoch.getTime() + (serial - 2) * 24 * 60 * 60 * 1000);
  };

  const formatAmount = (amount: number): string => {
    if (amount === 0) return '-';

    const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });

    return amount < 0 ? `(${formattedNumber})` : formattedNumber;
  };

  const getAmountClass = (amount: number): string => {
    if (amount > 0) return 'amount positive';
    if (amount < 0) return 'amount negative';
    return 'amount';
  };

  const getDateRange = (endMonth: string) => {
    const selectedMonth = availableMonths.find(m => m.value === endMonth);
    if (!selectedMonth) return { startSerial: 0, endSerial: 0 };

    const endSerial = selectedMonth.meValue;
    const endIndex = availableMonths.findIndex(m => m.value === endMonth);
    const startIndex = Math.max(0, endIndex - 11);
    const startSerial = availableMonths[startIndex].meValue;

    return { startSerial, endSerial };
  };

  const generateMonthHeaders = (endMonth: string) => {
    const months = [];
    const fiscalYearOptions = getFiscalYearEndOptions();
    const endIndex = fiscalYearOptions.findIndex(m => m.value === endMonth);
    const startIndex = Math.max(0, endIndex - 11);

    for (let i = startIndex; i <= endIndex; i++) {
      const monthData = fiscalYearOptions[i];
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

  // Generate month headers for the fiscal year end
  const monthHeaders = useMemo(() => generateMonthHeaders(fiscalYearEnd), [fiscalYearEnd]);

  // Adjust selectedEndMonth when fiscalYearEnd changes to ensure it's within valid range
  useEffect(() => {
    const endingMonths = getAvailableEndingMonths();

    // If current selectedEndMonth is not in the available range, set it to the last available month
    if (!endingMonths.some(m => m.value === selectedEndMonth)) {
      if (endingMonths.length > 0) {
        setSelectedEndMonth(endingMonths[endingMonths.length - 1].value);
      }
    }
  }, [fiscalYearEnd]);

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);

        const cacheKey = selectedEndMonth;
        const cachedData = processedDataCache.get(cacheKey);

        if (cachedData) {
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

        const rawData = assignTxIds<GLRecord>(await response.json());

        // Get the date range - from first available month to selected end month
        const selectedMonthData = availableMonths.find(m => m.value === selectedEndMonth);
        if (!selectedMonthData) {
          setLoading(false);
          return;
        }

        const endSerial = selectedMonthData.meValue;
        const startSerial = availableMonths[0].meValue; // Start from the first available month

        const filteredData = rawData.filter(record => {
          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const typeValue = record.Type;

          return (
            meValue >= startSerial &&
            meValue <= endSerial &&
            ![1, 2].includes(typeValue) && // Type NOT IN (1, 2)
            record[" glj_amt "] !== "" &&
            record[" glj_amt "] !== null
          );
        });

        const grouped: { [key: string]: GroupedData } = {};

        filteredData.forEach(record => {
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

          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const monthData = availableMonths.find(m => m.meValue === meValue);
          if (!monthData) return;

          const monthKey = monthData.value;

          if (!grouped[key]) {
            grouped[key] = {
              level1,
              level2,
              majGrpSrtOrdr: record.MajGrpSrtOrdr,
              sortOrder: record.SortOrder,
              monthlyAmounts: {}
            };
          }

          if (!grouped[key].monthlyAmounts[monthKey]) {
            grouped[key].monthlyAmounts[monthKey] = 0;
          }

          grouped[key].monthlyAmounts[monthKey] += amount;
        });

        const sortedData = Object.values(grouped).sort((a, b) => {
          if (a.majGrpSrtOrdr !== b.majGrpSrtOrdr) {
            return a.majGrpSrtOrdr - b.majGrpSrtOrdr;
          }
          return a.sortOrder - b.sortOrder;
        });

        const groupedByMajor: { [key: string]: GroupedData[] } = {};
        sortedData.forEach(item => {
          if (!groupedByMajor[item.level1]) {
            groupedByMajor[item.level1] = [];
          }
          groupedByMajor[item.level1].push(item);
        });

        const monthHeaders = generateMonthHeaders(selectedEndMonth);

        const newCache = new Map(processedDataCache);
        newCache.set(cacheKey, {
          groupedByMajor,
          monthHeaders,
          rawGLData: filteredData
        });

        if (newCache.size > 6) {
          const firstKey = newCache.keys().next().value;
          newCache.delete(firstKey);
        }

        setProcessedDataCache(newCache);
        setFinancialData(sortedData);
        setRawGLData(filteredData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading financial data:', error);
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [selectedEndMonth]);

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

  // Handle clicking on an amount to drill down to transactions
  const handleAmountClick = (level1: string, level2: string, monthKey: string) => {
    // Get the month label for display
    const monthData = availableMonths.find(m => m.value === monthKey);
    if (!monthData) return;

    // Filter transactions for this specific line item and month
    const transactions = rawGLData.filter(record => {
      const recordMonthData = availableMonths.find(m => m.meValue === (typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME));
      const matchesMonth = recordMonthData?.value === monthKey;
      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = level2 === '' ? true : record["FS_Sub_Group "] === level2;

      return matchesMonth && matchesLevel1 && matchesLevel2;
    });

    // Calculate total
    const total = transactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      // Reverse signs for specific major groups to show correct accounting convention
      const majorGroupsToReverse = [
        "PATIENT REVENUE",
        "OTHER REVENUE",
        "NONOPERATING INCOME(LOSS)"
      ];

      if (majorGroupsToReverse.includes(level1)) {
        amount = -amount;
      }

      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Set drill-down data and show modal
    setDrillDownData({
      level1,
      level2: level2 || level1,
      month: monthKey,
      monthLabel: monthData.label,
      transactions,
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

    // Calculate total
    const total = totalTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      // Reverse signs for specific major groups to show correct accounting convention
      const majorGroupsToReverse = [
        "PATIENT REVENUE",
        "OTHER REVENUE",
        "NONOPERATING INCOME(LOSS)"
      ];

      if (majorGroupsToReverse.includes(level1)) {
        amount = -amount;
      }

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

  // Close drill-down modal
  const closeDrillDown = () => {
    setShowDrillDown(false);
    setDrillDownData(null);
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

  // Get GL account details for a specific subgroup
  const getGLAccountDetails = (level1: string, level2: string) => {
    const accountData: { [key: string]: { account: number; description: string; monthlyAmounts: { [key: string]: number } } } = {};

    rawGLData.forEach(record => {
      if (record["FS_Major_Group"] === level1 && record["FS_Sub_Group "] === level2) {
        const account = record.glm_acc;
        const description = record.glm_desc || '';
        let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

        if (isNaN(amount)) return;

        // Apply sign reversal for revenue accounts
        const majorGroupsToReverse = [
          "PATIENT REVENUE",
          "OTHER REVENUE",
          "NONOPERATING INCOME(LOSS)"
        ];

        if (majorGroupsToReverse.includes(level1)) {
          amount = -amount;
        }

        // Convert ME to month string using availableMonths lookup
        const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
        const monthData = availableMonths.find(m => m.meValue === meValue);
        if (!monthData) return;

        const monthKey = monthData.value;
        const accountKey = `${account}`;

        if (!accountData[accountKey]) {
          accountData[accountKey] = {
            account,
            description,
            monthlyAmounts: {}
          };
        }

        if (!accountData[accountKey].monthlyAmounts[monthKey]) {
          accountData[accountKey].monthlyAmounts[monthKey] = 0;
        }

        accountData[accountKey].monthlyAmounts[monthKey] += amount;
      }
    });

    return Object.values(accountData).sort((a, b) => a.account - b.account);
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

    // Calculate total
    const total = accountTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      // Reverse signs for specific major groups
      const majorGroupsToReverse = [
        "PATIENT REVENUE",
        "OTHER REVENUE",
        "NONOPERATING INCOME(LOSS)"
      ];

      if (majorGroupsToReverse.includes(level1)) {
        amount = -amount;
      }

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

  // Export full projections to Excel
  const exportFullProjections = () => {
    // Generate filename based on the fiscal year and period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `FYTD Projection - ${startMonth} to ${endMonth}`;

    // Prepare data for Excel export
    const excelData: any[] = [];

    // Add Type row (Actual or Projection)
    const typeRow: any = { 'Line Item': 'Type' };
    monthHeaders.forEach(month => {
      const isActual = availableMonths.some(am =>
        am.value === month.key &&
        availableMonths.findIndex(m => m.value === month.key) <= availableMonths.findIndex(m => m.value === selectedEndMonth)
      );
      typeRow[month.label] = isActual ? 'Actual' : 'Projection';
    });
    typeRow['Total FYTD'] = '';
    typeRow['Budget'] = '';
    typeRow['YTD Budget Variance'] = '';
    typeRow['Budget Variance %'] = '';
    excelData.push(typeRow);

    // Add empty row for spacing
    const spacerRow: any = { 'Line Item': '' };
    monthHeaders.forEach(month => {
      spacerRow[month.label] = '';
    });
    spacerRow['Total FYTD'] = '';
    spacerRow['Budget'] = '';
    spacerRow['YTD Budget Variance'] = '';
    spacerRow['Budget Variance %'] = '';
    excelData.push(spacerRow);

    // Add each section with line items
    incomeStatementStructure.forEach(section => {
      // Add section header
      const sectionRow: any = { 'Line Item': section.majorGroup };
      monthHeaders.forEach(month => {
        sectionRow[month.label] = '';
      });
      sectionRow['Total FYTD'] = '';
      sectionRow['Budget'] = '';
      sectionRow['YTD Budget Variance'] = '';
      sectionRow['Budget Variance %'] = '';
      excelData.push(sectionRow);

      // Add detail lines
      section.items.forEach(item => {
        const totalFYTD = monthHeaders.reduce((sum, month) => {
          return sum + calculateProjectedAmount(section.majorGroup, item.level2, month.key);
        }, 0);
        const budget = getBudgetAmount(section.majorGroup, item.level2);
        const variance = totalFYTD - budget;
        const variancePercentage = budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0;

        const dataRow: any = { 'Line Item': `  ${item.level2}` }; // Indent sub-items
        monthHeaders.forEach(month => {
          const amount = calculateProjectedAmount(section.majorGroup, item.level2, month.key);
          dataRow[month.label] = amount !== 0 ? amount : '';
        });
        dataRow['Total FYTD'] = totalFYTD !== 0 ? totalFYTD : '';
        dataRow['Budget'] = budget !== 0 ? budget : '';
        dataRow['YTD Budget Variance'] = variance !== 0 ? variance : '';
        dataRow['Budget Variance %'] = variancePercentage !== 0 ? `${variancePercentage.toFixed(1)}%` : '';
        excelData.push(dataRow);
      });

      // Add group total
      const groupFYTDTotal = monthHeaders.reduce((sum, month) => {
        return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
      }, 0);
      const groupBudgetTotal = calculateBudgetGroupTotal(section.majorGroup);
      const groupVariance = groupFYTDTotal - groupBudgetTotal;
      const groupVariancePercentage = groupBudgetTotal !== 0 ? (groupVariance / Math.abs(groupBudgetTotal)) * 100 : 0;

      const totalRow: any = { 'Line Item': `Total ${section.majorGroup}` };
      monthHeaders.forEach(month => {
        const total = calculateProjectedGroupTotal(section.majorGroup, month.key);
        totalRow[month.label] = total !== 0 ? total : '';
      });
      totalRow['Total FYTD'] = groupFYTDTotal !== 0 ? groupFYTDTotal : '';
      totalRow['Budget'] = groupBudgetTotal !== 0 ? groupBudgetTotal : '';
      totalRow['YTD Budget Variance'] = groupVariance !== 0 ? groupVariance : '';
      totalRow['Budget Variance %'] = groupVariancePercentage !== 0 ? `${groupVariancePercentage.toFixed(1)}%` : '';
      excelData.push(totalRow);

      // Add empty row for spacing
      const emptyRow: any = { 'Line Item': '' };
      monthHeaders.forEach(month => {
        emptyRow[month.label] = '';
      });
      emptyRow['Total FYTD'] = '';
      emptyRow['Budget'] = '';
      emptyRow['YTD Budget Variance'] = '';
      emptyRow['Budget Variance %'] = '';
      excelData.push(emptyRow);
    });

    // Add Net Position row
    const totalFYTD = incomeStatementStructure.reduce((sum, section) =>
      sum + calculateGroup12MonthTotal(section.majorGroup), 0);
    const totalBudget = incomeStatementStructure.reduce((sum, section) =>
      sum + calculateBudgetGroupTotal(section.majorGroup), 0);
    const totalVariance = totalFYTD - totalBudget;
    const totalVariancePercentage = totalBudget !== 0 ? (totalVariance / Math.abs(totalBudget)) * 100 : 0;

    const netPositionRow: any = { 'Line Item': 'Increase (Decrease) in Net Position' };
    monthHeaders.forEach(month => {
      const totalRevenue = calculateProjectedGroupTotal('PATIENT REVENUE', month.key) +
                          calculateProjectedGroupTotal('DEDUCTIONS', month.key) +
                          calculateProjectedGroupTotal('BAD DEBT', month.key) +
                          calculateProjectedGroupTotal('OTHER REVENUE', month.key);
      const totalExpenses = calculateProjectedGroupTotal('OPERATING EXPENSES', month.key);
      const nonOperating = calculateProjectedGroupTotal('NONOPERATING INCOME(LOSS)', month.key);
      const netPosition = totalRevenue + totalExpenses + nonOperating;
      netPositionRow[month.label] = netPosition !== 0 ? netPosition : '';
    });
    netPositionRow['Total FYTD'] = totalFYTD;
    netPositionRow['Budget'] = totalBudget;
    netPositionRow['YTD Budget Variance'] = totalVariance;
    netPositionRow['Budget Variance %'] = `${totalVariancePercentage.toFixed(1)}%`;
    excelData.push(netPositionRow);

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [{ wch: 40 }]; // Line Item column
    monthHeaders.forEach(() => columnWidths.push({ wch: 15 })); // Monthly columns
    columnWidths.push({ wch: 18 }); // Total FYTD
    columnWidths.push({ wch: 18 }); // Budget
    columnWidths.push({ wch: 20 }); // Variance
    columnWidths.push({ wch: 18 }); // Variance %
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FYTD Projection');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export full projections to PDF
  const exportFullProjectionsPDF = () => {
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `FYTD Projection - ${startMonth} to ${endMonth}`;
    const doc = new jsPDF('landscape');

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('FYTD Projection', 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${startMonth} to ${endMonth}`, 14, 22);

    // Build column headers
    const headers = [
      'Line Item',
      ...monthHeaders.map(m => m.label),
      'Total FYTD',
      'Budget',
      'YTD Budget Variance',
      'Budget Variance %'
    ];

    // Build table data
    const tableData: any[] = [];

    // Add Type row
    const typeRow = [
      'Type',
      ...monthHeaders.map(month => {
        const isActual = availableMonths.some(am =>
          am.value === month.key &&
          availableMonths.findIndex(m => m.value === month.key) <= availableMonths.findIndex(m => m.value === selectedEndMonth)
        );
        return isActual ? 'Actual' : 'Projection';
      }),
      '',
      '',
      '',
      ''
    ];
    tableData.push(typeRow);

    // Add blank row
    tableData.push(['', ...monthHeaders.map(() => ''), '', '', '', '']);

    // Add each section with line items
    incomeStatementStructure.forEach(section => {
      // Section header
      tableData.push([
        section.majorGroup,
        ...monthHeaders.map(() => ''),
        '',
        '',
        '',
        ''
      ]);

      // Detail lines
      section.items.forEach(item => {
        const totalFYTD = monthHeaders.reduce((sum, month) => {
          return sum + calculateProjectedAmount(section.majorGroup, item.level2, month.key);
        }, 0);
        const budget = getBudgetAmount(section.majorGroup, item.level2);
        const variance = totalFYTD - budget;
        const variancePercentage = budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0;

        const row = [
          `  ${item.level2}`,
          ...monthHeaders.map(month => {
            const amount = calculateProjectedAmount(section.majorGroup, item.level2, month.key);
            return amount !== 0 ? formatAmount(amount) : '-';
          }),
          totalFYTD !== 0 ? formatAmount(totalFYTD) : '-',
          budget !== 0 ? formatAmount(budget) : '-',
          variance !== 0 ? formatAmount(variance) : '-',
          variancePercentage !== 0 ? `${variancePercentage.toFixed(1)}%` : '-'
        ];
        tableData.push(row);
      });

      // Group total
      const groupFYTDTotal = monthHeaders.reduce((sum, month) => {
        return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
      }, 0);
      const groupBudgetTotal = calculateBudgetGroupTotal(section.majorGroup);
      const groupVariance = groupFYTDTotal - groupBudgetTotal;
      const groupVariancePercentage = groupBudgetTotal !== 0 ? (groupVariance / Math.abs(groupBudgetTotal)) * 100 : 0;

      const totalRow = [
        `Total ${section.majorGroup}`,
        ...monthHeaders.map(month => {
          const total = calculateProjectedGroupTotal(section.majorGroup, month.key);
          return total !== 0 ? formatAmount(total) : '-';
        }),
        formatAmount(groupFYTDTotal),
        formatAmount(groupBudgetTotal),
        formatAmount(groupVariance),
        groupVariancePercentage !== 0 ? `${groupVariancePercentage.toFixed(1)}%` : '-'
      ];
      tableData.push(totalRow);

      // Blank row
      tableData.push(['', ...monthHeaders.map(() => ''), '', '', '', '']);
    });

    // Net Position row
    const totalFYTD = incomeStatementStructure.reduce((sum, section) =>
      sum + calculateGroup12MonthTotal(section.majorGroup), 0);
    const totalBudget = incomeStatementStructure.reduce((sum, section) =>
      sum + calculateBudgetGroupTotal(section.majorGroup), 0);
    const totalVariance = totalFYTD - totalBudget;
    const totalVariancePercentage = totalBudget !== 0 ? (totalVariance / Math.abs(totalBudget)) * 100 : 0;

    const netPositionRow = [
      'Increase (Decrease) in Net Position',
      ...monthHeaders.map(month => {
        const totalRevenue = calculateProjectedGroupTotal('PATIENT REVENUE', month.key) +
                            calculateProjectedGroupTotal('DEDUCTIONS', month.key) +
                            calculateProjectedGroupTotal('BAD DEBT', month.key) +
                            calculateProjectedGroupTotal('OTHER REVENUE', month.key);
        const totalExpenses = calculateProjectedGroupTotal('OPERATING EXPENSES', month.key);
        const nonOperating = calculateProjectedGroupTotal('NONOPERATING INCOME(LOSS)', month.key);
        const netPosition = totalRevenue + totalExpenses + nonOperating;
        return netPosition !== 0 ? formatAmount(netPosition) : '-';
      }),
      formatAmount(totalFYTD),
      formatAmount(totalBudget),
      formatAmount(totalVariance),
      `${totalVariancePercentage.toFixed(1)}%`
    ];
    tableData.push(netPositionRow);

    // Calculate dynamic column widths
    const numMonths = monthHeaders.length;
    const lineItemColWidth = 45;
    const totalColWidth = 20;
    const budgetColWidth = 20;
    const varianceColWidth = 22;
    const variancePctColWidth = 18;
    const monthColWidth = (297 - lineItemColWidth - totalColWidth - budgetColWidth - varianceColWidth - variancePctColWidth - 30) / numMonths;

    const columnStyles: { [key: number]: any } = {
      0: { cellWidth: lineItemColWidth }
    };

    for (let i = 1; i <= numMonths; i++) {
      columnStyles[i] = { cellWidth: monthColWidth, halign: 'right' };
    }

    columnStyles[numMonths + 1] = { cellWidth: totalColWidth, halign: 'right' };
    columnStyles[numMonths + 2] = { cellWidth: budgetColWidth, halign: 'right' };
    columnStyles[numMonths + 3] = { cellWidth: varianceColWidth, halign: 'right' };
    columnStyles[numMonths + 4] = { cellWidth: variancePctColWidth, halign: 'right' };

    // Generate the table
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 28,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7
      },
      columnStyles: columnStyles,
      didParseCell: function(data) {
        // Style section headers
        if (data.section === 'body' && data.column.index === 0) {
          const cellText = data.cell.text[0];
          if (cellText && !cellText.startsWith('  ') && cellText !== 'Type' && cellText !== '' && !cellText.startsWith('Total ') && cellText !== 'Increase (Decrease) in Net Position') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
          // Style total rows
          if (cellText && (cellText.startsWith('Total ') || cellText === 'Increase (Decrease) in Net Position')) {
            data.cell.styles.fontStyle = 'bold';
          }
          // Style Type row
          if (cellText === 'Type') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [248, 249, 250];
          }
        }
        // Style Type row values
        if (data.section === 'body' && data.row.index === 0 && data.column.index > 0) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [248, 249, 250];
          data.cell.styles.halign = 'center';
        }
      }
    });

    // Save the PDF
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

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaction Details');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  const getPeriodDescription = () => {
    if (monthHeaders.length === 0) return '';
    const startMonth = monthHeaders[0].label;
    const endMonth = monthHeaders[monthHeaders.length - 1].label;
    return `Projected Results from ${startMonth} to ${endMonth}`;
  };

  // Get grouped data by major group
  const groupedByMajor: { [key: string]: GroupedData[] } = {};
  financialData.forEach(item => {
    if (!groupedByMajor[item.level1]) {
      groupedByMajor[item.level1] = [];
    }
    groupedByMajor[item.level1].push(item);
  });

  // Helper function to get amount for a specific line item and month
  const getAmount = (majorGroup: string, subGroup: string, monthKey: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    const item = items.find(i => i.level2 === subGroup);
    return item?.monthlyAmounts[monthKey] || 0;
  };

  // Helper function to calculate group total for a specific month
  const calculateGroupTotal = (majorGroup: string, monthKey: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    return items.reduce((sum, item) => sum + (item.monthlyAmounts[monthKey] || 0), 0);
  };

  // Helper function to calculate 12-month total for a line item
  const calculate12MonthTotal = (majorGroup: string, subGroup: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    const item = items.find(i => i.level2 === subGroup);
    if (!item) return 0;
    return monthHeaders.reduce((sum, month) => sum + (item.monthlyAmounts[month.key] || 0), 0);
  };

  // Helper function to calculate group 12-month total
  const calculateGroup12MonthTotal = (majorGroup: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    return items.reduce((sum, item) => {
      const itemTotal = monthHeaders.reduce((s, month) => s + (item.monthlyAmounts[month.key] || 0), 0);
      return sum + itemTotal;
    }, 0);
  };

  // Helper function to get number of days in a month
  const getDaysInMonth = (monthKey: string): number => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  // Helper function to check if a month is actual or projection
  const isActualMonth = (monthKey: string): boolean => {
    return availableMonths.some(am =>
      am.value === monthKey &&
      availableMonths.findIndex(m => m.value === monthKey) <= availableMonths.findIndex(m => m.value === selectedEndMonth)
    );
  };

  // Helper function to calculate daily average from actual months
  const calculateDailyAverage = (majorGroup: string, subGroup: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    const item = items.find(i => i.level2 === subGroup);
    if (!item) return 0;

    let totalAmount = 0;
    let totalDays = 0;

    monthHeaders.forEach(month => {
      if (isActualMonth(month.key)) {
        const amount = item.monthlyAmounts[month.key] || 0;
        const days = getDaysInMonth(month.key);
        totalAmount += amount;
        totalDays += days;
      }
    });

    return totalDays > 0 ? totalAmount / totalDays : 0;
  };

  // Helper function to calculate projected amount for a month
  const calculateProjectedAmount = (majorGroup: string, subGroup: string, monthKey: string): number => {
    if (isActualMonth(monthKey)) {
      // Return actual amount for actual months
      return getAmount(majorGroup, subGroup, monthKey);
    } else {
      // Calculate projection based on daily average
      const dailyAverage = calculateDailyAverage(majorGroup, subGroup);
      const daysInMonth = getDaysInMonth(monthKey);
      return dailyAverage * daysInMonth;
    }
  };

  // Helper function to calculate projected group total for a month
  const calculateProjectedGroupTotal = (majorGroup: string, monthKey: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    return items.reduce((sum, item) => {
      return sum + calculateProjectedAmount(majorGroup, item.level2, monthKey);
    }, 0);
  };

  // Helper function to get budget amount (hardcoded example data)
  const getBudgetAmount = (majorGroup: string, subGroup: string): number => {
    const budgetData: { [key: string]: { [key: string]: number } } = {
      'PATIENT REVENUE': {
        'Inpatient Revenue': 3125000,  // 2500000 * (1 + 2000000/6800000) = 2500000 * 1.294 = 3235000 (37% of original total)
        'Outpatient Revenue': 4000000,  // 3200000 * 1.294 = 4140800 (47% of original total)
        'Swing Bed Revenue': 562500,    // 450000 * 1.294 = 582300 (6.6% of original total)
        'Retail Pharmacy Revenue': 812500, // 650000 * 1.294 = 841100 (9.6% of original total)
      },
      'DEDUCTIONS': {
        'Contractual Adjustments': -1800000,
        'Charity Care': -250000,
        'Cost Report Settlements': -150000,
      },
      'BAD DEBT': {
        'Bad Debt': -180000,
      },
      'OTHER REVENUE': {
        'Other Revenue': 320000,
      },
      'OPERATING EXPENSES': {
        'Salaries': 3412500,           // 2200000 * (1 + 3000000/5095000) = 2200000 * 1.589 = 3495800 (43% of original total)
        'Employee Benefits and Payroll Taxes': 1162500,  // 750000 * 1.589 = 1191750 (15% of original total)
        'Professional Fees and Purchased Services': 744000, // 480000 * 1.589 = 762720 (9.4% of original total)
        'Supplies': 961000,            // 620000 * 1.589 = 985180 (12% of original total)
        'Other Operating': 542500,     // 350000 * 1.589 = 556150 (7% of original total)
        'Rent': 279000,                // 180000 * 1.589 = 286020 (3.5% of original total)
        'Utilities': 147250,           // 95000 * 1.589 = 150955 (1.9% of original total)
        'Depreciation & Amortization': 651250, // 420000 * 1.589 = 667380 (8.2% of original total)
      },
      'NONOPERATING INCOME(LOSS)': {
        'Property Tax Revenue': 125000,
        'Investment Income': 85000,
        'Interest Expense': -65000,
        'Other Non Operating Revenue': 45000,
      },
    };

    return budgetData[majorGroup]?.[subGroup] || 0;
  };

  // Helper function to calculate budget group total
  const calculateBudgetGroupTotal = (majorGroup: string): number => {
    const items = groupedByMajor[majorGroup] || [];
    return items.reduce((sum, item) => sum + getBudgetAmount(majorGroup, item.level2), 0);
  };

  // Get available ending months - only months with actual data (from availableMonths array)
  const getAvailableEndingMonths = () => {
    // Return all months that have actual data
    // The fiscal year end determines which months are shown in the table,
    // but the ending month dropdown should only show months with actual data
    return availableMonths;
  };

  // Define the income statement structure with exact major groups and subgroups from the data
  const incomeStatementStructure = [
    {
      majorGroup: 'PATIENT REVENUE',
      items: [
        { level2: 'Inpatient Revenue' },
        { level2: 'Outpatient Revenue' },
        { level2: 'Swing Bed Revenue' },
        { level2: 'Retail Pharmacy Revenue' },
      ]
    },
    {
      majorGroup: 'DEDUCTIONS',
      items: [
        { level2: 'Contractual Adjustments' },
        { level2: 'Charity Care' },
        { level2: 'Cost Report Settlements' },
      ]
    },
    {
      majorGroup: 'BAD DEBT',
      items: [
        { level2: 'Bad Debt' },
      ]
    },
    {
      majorGroup: 'OTHER REVENUE',
      items: [
        { level2: 'Other Revenue' },
      ]
    },
    {
      majorGroup: 'OPERATING EXPENSES',
      items: [
        { level2: 'Salaries' },
        { level2: 'Employee Benefits and Payroll Taxes' },
        { level2: 'Professional Fees and Purchased Services' },
        { level2: 'Supplies' },
        { level2: 'Other Operating' },
        { level2: 'Rent' },
        { level2: 'Utilities' },
        { level2: 'Depreciation & Amortization' },
      ]
    },
    {
      majorGroup: 'NONOPERATING INCOME(LOSS)',
      items: [
        { level2: 'Property Tax Revenue' },
        { level2: 'Investment Income' },
        { level2: 'Interest Expense' },
        { level2: 'Other Non Operating Revenue' },
      ]
    },
  ];

  return (
    <>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px'
      }}>
        <h1 style={{ margin: 0 }}>FYTD Projection</h1>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            className="export-btn"
            onClick={exportFullProjections}
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
            className="export-btn"
            onClick={exportFullProjectionsPDF}
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
            <span>Export to PDF</span>
          </button>
        </div>
      </div>
      <hr style={{ margin: '4px 0' }} />

      <div className="income-statement-container">
        <div className="statement-header">
          <div className="filter-container" style={{ margin: '5px 0', display: 'flex', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div>
                <label htmlFor="month-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
                  Select ending month:
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
                  {getAvailableEndingMonths().map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fiscal-year-end" style={{ marginRight: '10px', fontWeight: 'bold' }}>
                  Fiscal Year End:
                </label>
                <select
                  id="fiscal-year-end"
                  value={fiscalYearEnd}
                  onChange={(e) => setFiscalYearEnd(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: 'white'
                  }}
                >
                  {getFiscalYearEndOptions().map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
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
              <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <th className="line-item" style={{ position: 'sticky', top: 0, zIndex: 11, backgroundColor: '#2c3e50' }}>Line Item</th>
                {monthHeaders.map(month => (
                  <th key={month.key} className={month.key === monthHeaders[monthHeaders.length - 1].key ? "month-col latest" : "month-col"} style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#2c3e50' }}>
                    {month.label}<br /><small>{month.dateStr}</small>
                  </th>
                ))}
                <th className="amount" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#2c3e50' }}>
                  Total<br /><small style={{ fontSize: '1.15em' }}>FYTD</small><br /><small>(Annualized)</small>
                </th>
                <th className="amount" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#2c3e50' }}>
                  Budget
                </th>
                <th className="amount" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#2c3e50' }}>
                  YTD Budget<br />Variance
                </th>
                <th className="amount" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#2c3e50' }}>
                  Budget<br />Variance %
                </th>
              </tr>
              <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', fontSize: '11px', position: 'sticky', top: '52px', zIndex: 10 }}>
                <th className="line-item" style={{ textAlign: 'left', paddingLeft: '10px', position: 'sticky', top: '52px', zIndex: 11, backgroundColor: '#f8f9fa' }}>Type</th>
                {monthHeaders.map(month => {
                  // Compare month keys to determine if it's actual or projection
                  const isActual = availableMonths.some(am =>
                    am.value === month.key &&
                    availableMonths.findIndex(m => m.value === month.key) <= availableMonths.findIndex(m => m.value === selectedEndMonth)
                  );
                  return (
                    <th key={`type-${month.key}`} style={{
                      textAlign: 'center',
                      color: isActual ? '#28a745' : '#007bff',
                      fontWeight: 'bold',
                      position: 'sticky',
                      top: '52px',
                      zIndex: 10,
                      backgroundColor: '#f8f9fa'
                    }}>
                      {isActual ? 'Actual' : 'Projection'}
                    </th>
                  );
                })}
                <th className="amount" style={{ textAlign: 'center', position: 'sticky', top: '52px', zIndex: 10, backgroundColor: '#f8f9fa' }}></th>
                <th className="amount" style={{ textAlign: 'center', position: 'sticky', top: '52px', zIndex: 10, backgroundColor: '#f8f9fa' }}></th>
                <th className="amount" style={{ textAlign: 'center', position: 'sticky', top: '52px', zIndex: 10, backgroundColor: '#f8f9fa' }}></th>
                <th className="amount" style={{ textAlign: 'center', position: 'sticky', top: '52px', zIndex: 10, backgroundColor: '#f8f9fa' }}></th>
              </tr>
            </thead>
            <tbody>
              {incomeStatementStructure.map((section) => (
                <React.Fragment key={section.majorGroup}>
                  {/* Section Header */}
                  <tr className="section-header">
                    <td><strong>{section.majorGroup}</strong></td>
                    {monthHeaders.map(month => (
                      <td key={month.key}></td>
                    ))}
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>

                  {/* Detail Lines */}
                  {section.items.map((item, index) => {
                    // Calculate FYTD total including both actual and projected amounts
                    const totalFYTD = monthHeaders.reduce((sum, month) => {
                      return sum + calculateProjectedAmount(section.majorGroup, item.level2, month.key);
                    }, 0);
                    const budget = getBudgetAmount(section.majorGroup, item.level2);
                    const variance = totalFYTD - budget;
                    const variancePercentage = budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0;

                    const itemKey = `${section.majorGroup}|${item.level2}`;
                    const isExpanded = expandedItems.has(itemKey);
                    const glAccounts = isExpanded ? getGLAccountDetails(section.majorGroup, item.level2) : [];

                    return (
                      <React.Fragment key={`${section.majorGroup}-${index}`}>
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
                            const amount = calculateProjectedAmount(section.majorGroup, item.level2, month.key);
                            const isActual = isActualMonth(month.key);
                            return (
                              <td
                                key={month.key}
                                className={`${getAmountClass(amount)} ${amount !== 0 && isActual ? 'clickable-amount' : ''}`}
                                onClick={() => amount !== 0 && isActual && handleAmountClick(section.majorGroup, item.level2, month.key)}
                                style={{
                                  cursor: amount !== 0 && isActual ? 'pointer' : 'default',
                                  textDecoration: amount !== 0 && isActual ? 'underline' : 'none',
                                  fontStyle: isActual ? 'normal' : 'italic'
                                }}
                              >
                                {amount !== 0 ? formatAmount(amount) : '-'}
                              </td>
                            );
                          })}
                          <td
                            className={`${getAmountClass(totalFYTD)}`}
                            style={{
                              cursor: 'default'
                            }}
                          >
                            <strong>{totalFYTD !== 0 ? formatAmount(totalFYTD) : '-'}</strong>
                          </td>
                          <td className={getAmountClass(budget)}>
                            {budget !== 0 ? formatAmount(budget) : '-'}
                          </td>
                          <td className={getAmountClass(variance)}>
                            {variance !== 0 ? formatAmount(variance) : '-'}
                          </td>
                          <td className={getAmountClass(variance)}>
                            {variancePercentage !== 0 ? `${variancePercentage.toFixed(1)}%` : '-'}
                          </td>
                        </tr>

                        {/* Expanded GL Account Details */}
                        {isExpanded && glAccounts.map((account, accountIndex) => {
                          // Calculate projected amounts for each GL account
                          const accountTotalFYTD = monthHeaders.reduce((sum, month) => {
                            return sum + (account.monthlyAmounts[month.key] || 0);
                          }, 0);

                          return (
                            <tr key={`${itemKey}-account-${accountIndex}`} className="gl-account-detail" style={{ backgroundColor: '#f0f0f0' }}>
                              <td className="indent" style={{ paddingLeft: '60px', fontSize: '11px', color: '#666' }}>
                                {account.account} - {account.description}
                              </td>
                              {monthHeaders.map(month => {
                                const amount = account.monthlyAmounts[month.key] || 0;
                                const isActual = isActualMonth(month.key);
                                return (
                                  <td
                                    key={month.key}
                                    className={`${getAmountClass(amount)} ${amount !== 0 && isActual ? 'clickable-amount' : ''}`}
                                    onClick={() => amount !== 0 && isActual && handleGLAccountClick(section.majorGroup, item.level2, month.key, account.account)}
                                    style={{
                                      fontSize: '11px',
                                      cursor: amount !== 0 && isActual ? 'pointer' : 'default',
                                      textDecoration: amount !== 0 && isActual ? 'underline' : 'none',
                                      fontStyle: isActual ? 'normal' : 'italic'
                                    }}
                                  >
                                    {amount !== 0 ? formatAmount(amount) : '-'}
                                  </td>
                                );
                              })}
                              <td className={getAmountClass(accountTotalFYTD)} style={{ fontSize: '11px' }}>
                                <strong>{accountTotalFYTD !== 0 ? formatAmount(accountTotalFYTD) : '-'}</strong>
                              </td>
                              <td style={{ fontSize: '11px' }}></td>
                              <td style={{ fontSize: '11px' }}></td>
                              <td style={{ fontSize: '11px' }}></td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  {/* Group Total */}
                  <tr className="subtotal">
                    <td><strong>Total {section.majorGroup}</strong></td>
                    {monthHeaders.map(month => {
                      const total = calculateProjectedGroupTotal(section.majorGroup, month.key);
                      const isActual = isActualMonth(month.key);
                      return (
                        <td
                          key={month.key}
                          className={`${getAmountClass(total)} ${total !== 0 && isActual ? 'clickable-amount' : ''}`}
                          onClick={() => total !== 0 && isActual && handleAmountClick(section.majorGroup, '', month.key)}
                          style={{
                            cursor: total !== 0 && isActual ? 'pointer' : 'default',
                            textDecoration: total !== 0 && isActual ? 'underline' : 'none',
                            fontStyle: isActual ? 'normal' : 'italic'
                          }}
                        >
                          <strong>{total !== 0 ? formatAmount(total) : '-'}</strong>
                        </td>
                      );
                    })}
                    <td
                      className={`${getAmountClass((() => {
                        return monthHeaders.reduce((sum, month) => {
                          return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
                        }, 0);
                      })())}`}
                      style={{
                        cursor: 'default'
                      }}
                    >
                      <strong>{formatAmount((() => {
                        return monthHeaders.reduce((sum, month) => {
                          return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
                        }, 0);
                      })())}</strong>
                    </td>
                    <td className={getAmountClass(calculateBudgetGroupTotal(section.majorGroup))}>
                      <strong>{formatAmount(calculateBudgetGroupTotal(section.majorGroup))}</strong>
                    </td>
                    <td className={getAmountClass((() => {
                      const fytdTotal = monthHeaders.reduce((sum, month) => {
                        return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
                      }, 0);
                      const budgetTotal = calculateBudgetGroupTotal(section.majorGroup);
                      return fytdTotal - budgetTotal;
                    })())}>
                      <strong>{formatAmount((() => {
                        const fytdTotal = monthHeaders.reduce((sum, month) => {
                          return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
                        }, 0);
                        const budgetTotal = calculateBudgetGroupTotal(section.majorGroup);
                        return fytdTotal - budgetTotal;
                      })())}</strong>
                    </td>
                    <td className={getAmountClass((() => {
                      const fytdTotal = monthHeaders.reduce((sum, month) => {
                        return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
                      }, 0);
                      const budgetTotal = calculateBudgetGroupTotal(section.majorGroup);
                      return fytdTotal - budgetTotal;
                    })())}>
                      <strong>{(() => {
                        const fytdTotal = monthHeaders.reduce((sum, month) => {
                          return sum + calculateProjectedGroupTotal(section.majorGroup, month.key);
                        }, 0);
                        const budgetTotal = calculateBudgetGroupTotal(section.majorGroup);
                        const variance = fytdTotal - budgetTotal;
                        const variancePercentage = budgetTotal !== 0 ? (variance / Math.abs(budgetTotal)) * 100 : 0;
                        return variancePercentage !== 0 ? `${variancePercentage.toFixed(1)}%` : '-';
                      })()}</strong>
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Net Position Row */}
              <tr className="net-income">
                <td><strong>Increase (Decrease) in Net Position</strong></td>
                {monthHeaders.map(month => {
                  // Calculate net position by summing all groups for this month using projected calculations
                  const totalRevenue = calculateProjectedGroupTotal('PATIENT REVENUE', month.key) +
                                       calculateProjectedGroupTotal('DEDUCTIONS', month.key) +
                                       calculateProjectedGroupTotal('BAD DEBT', month.key) +
                                       calculateProjectedGroupTotal('OTHER REVENUE', month.key);
                  const totalExpenses = calculateProjectedGroupTotal('OPERATING EXPENSES', month.key);
                  const nonOperating = calculateProjectedGroupTotal('NONOPERATING INCOME(LOSS)', month.key);
                  const netPosition = totalRevenue + totalExpenses + nonOperating;
                  const isActual = isActualMonth(month.key);

                  return (
                    <td
                      key={month.key}
                      className={getAmountClass(netPosition)}
                      style={{ fontStyle: isActual ? 'normal' : 'italic' }}
                    >
                      <strong>{netPosition !== 0 ? formatAmount(netPosition) : '-'}</strong>
                    </td>
                  );
                })}
                <td className={(() => {
                  const total = incomeStatementStructure.reduce((sum, section) =>
                    sum + calculateGroup12MonthTotal(section.majorGroup), 0);
                  return getAmountClass(total);
                })()}>
                  <strong>{(() => {
                    const total = incomeStatementStructure.reduce((sum, section) =>
                      sum + calculateGroup12MonthTotal(section.majorGroup), 0);
                    return formatAmount(total);
                  })()}</strong>
                </td>
                <td className={(() => {
                  const totalBudget = incomeStatementStructure.reduce((sum, section) =>
                    sum + calculateBudgetGroupTotal(section.majorGroup), 0);
                  return getAmountClass(totalBudget);
                })()}>
                  <strong>{(() => {
                    const totalBudget = incomeStatementStructure.reduce((sum, section) =>
                      sum + calculateBudgetGroupTotal(section.majorGroup), 0);
                    return formatAmount(totalBudget);
                  })()}</strong>
                </td>
                <td className={(() => {
                  const totalFYTD = incomeStatementStructure.reduce((sum, section) =>
                    sum + calculateGroup12MonthTotal(section.majorGroup), 0);
                  const totalBudget = incomeStatementStructure.reduce((sum, section) =>
                    sum + calculateBudgetGroupTotal(section.majorGroup), 0);
                  return getAmountClass(totalFYTD - totalBudget);
                })()}>
                  <strong>{(() => {
                    const totalFYTD = incomeStatementStructure.reduce((sum, section) =>
                      sum + calculateGroup12MonthTotal(section.majorGroup), 0);
                    const totalBudget = incomeStatementStructure.reduce((sum, section) =>
                      sum + calculateBudgetGroupTotal(section.majorGroup), 0);
                    return formatAmount(totalFYTD - totalBudget);
                  })()}</strong>
                </td>
                <td className={(() => {
                  const totalFYTD = incomeStatementStructure.reduce((sum, section) =>
                    sum + calculateGroup12MonthTotal(section.majorGroup), 0);
                  const totalBudget = incomeStatementStructure.reduce((sum, section) =>
                    sum + calculateBudgetGroupTotal(section.majorGroup), 0);
                  return getAmountClass(totalFYTD - totalBudget);
                })()}>
                  <strong>{(() => {
                    const totalFYTD = incomeStatementStructure.reduce((sum, section) =>
                      sum + calculateGroup12MonthTotal(section.majorGroup), 0);
                    const totalBudget = incomeStatementStructure.reduce((sum, section) =>
                      sum + calculateBudgetGroupTotal(section.majorGroup), 0);
                    const variance = totalFYTD - totalBudget;
                    const variancePercentage = totalBudget !== 0 ? (variance / Math.abs(totalBudget)) * 100 : 0;
                    return variancePercentage !== 0 ? `${variancePercentage.toFixed(1)}%` : '-';
                  })()}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="statement-footer">
          <p className="note">* Projections are calculated based on daily averages from actual months</p>
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

export default ProjectionsImp;
