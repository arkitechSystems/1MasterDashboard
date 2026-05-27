import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
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

interface GLAccountData {
  account: number;
  description: string;
  monthlyAmounts: { [key: string]: number };
}

interface DrillDownData {
  account: number;
  description: string;
  subgroup: string;
  month: string;
  monthLabel: string;
  transactions: GLRecord[];
  total: number;
}

const MVA: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const { availableMonths } = useAvailableMonths();
  const [loading, setLoading] = useState(true);
  const [selectedEndMonth, setSelectedEndMonth] = useState<string>(getDefaultMonth());
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>('');
  const [rawGLData, setRawGLData] = useState<GLRecord[]>([]);
  const [subgroups, setSubgroups] = useState<Array<{type: 'header' | 'option', value: string, majorGroup?: string}>>([]);
  const [glAccountData, setGLAccountData] = useState<GLAccountData[]>([]);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tableSortColumn, setTableSortColumn] = useState<string>('');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');

  // Get the date range based on selected end month
  const getDateRange = (endMonth: string) => {
    const selectedMonth = availableMonths.find(m => m.value === endMonth);
    if (!selectedMonth) return { startSerial: 0, endSerial: 0 };

    const endSerial = selectedMonth.meValue;
    const endIndex = availableMonths.findIndex(m => m.value === endMonth);
    const startIndex = Math.max(0, endIndex - 11); // Get 12 months
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

        months.push({
          key: monthData.value,
          label: monthName
        });
      }
    }
    return months;
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
    if (amount > 0) return 'amount positive';
    if (amount < 0) return 'amount negative';
    return 'amount';
  };

  // Calculate 12-month total for an account
  const calculate12MonthTotal = (monthlyAmounts: { [key: string]: number }): number => {
    const monthHeaders = generateMonthHeaders(selectedEndMonth);
    return monthHeaders.reduce((sum, month) => sum + (monthlyAmounts[month.key] || 0), 0);
  };

  // Calculate prior month variance (last month - second to last month)
  const calculatePriorMonthVariance = (monthlyAmounts: { [key: string]: number }): number => {
    const monthHeaders = generateMonthHeaders(selectedEndMonth);

    if (monthHeaders.length < 2) return 0;

    const lastMonth = monthHeaders[monthHeaders.length - 1];
    const secondToLastMonth = monthHeaders[monthHeaders.length - 2];

    const lastMonthAmount = monthlyAmounts[lastMonth.key] || 0;
    const secondToLastMonthAmount = monthlyAmounts[secondToLastMonth.key] || 0;

    return lastMonthAmount - secondToLastMonthAmount;
  };

  // Convert Excel serial date to JavaScript Date
  const excelSerialToDate = (serial: number): Date => {
    const epoch = new Date(1900, 0, 1);
    return new Date(epoch.getTime() + (serial - 2) * 24 * 60 * 60 * 1000);
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

  // Handle clicking on an amount to drill down to transactions
  const handleAmountClick = (account: number, description: string, monthKey: string) => {
    // Get the month label for display
    const monthData = availableMonths.find(m => m.value === monthKey);
    if (!monthData) return;

    // Filter transactions for this specific cell
    const cellTransactions = rawGLData.filter(record => {
      const recordMonthData = availableMonths.find(m => m.meValue === (typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME));
      const matchesMonth = recordMonthData?.value === monthKey;
      const matchesSubgroup = record["FS_Sub_Group "] === selectedSubgroup;
      const matchesAccount = record.glm_acc === account;
      const typeValue = record.Type;

      return matchesMonth && matchesSubgroup && matchesAccount &&
             ![1, 2].includes(typeValue) &&
             record[" glj_amt "] !== "" && record[" glj_amt "] !== null;
    });

    // Calculate total
    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      // Reverse signs for specific major groups
      const majorGroupsToReverse = [
        "PATIENT REVENUE",
        "OTHER REVENUE",
        "NONOPERATING INCOME(LOSS)"
      ];

      if (majorGroupsToReverse.includes(record["FS_Major_Group"])) {
        amount = -amount;
      }

      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Set drill-down data and show modal
    setDrillDownData({
      account,
      description,
      subgroup: selectedSubgroup,
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

  // Handle column sorting in the modal
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
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

  // Get sort indicator arrow
  const getSortIcon = (column: string): string => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Handle table column sorting
  const handleTableSort = (column: string) => {
    if (tableSortColumn === column) {
      setTableSortDirection(tableSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortColumn(column);
      setTableSortDirection('asc');
    }
  };

  // Get table sort indicator arrow
  const getTableSortIcon = (column: string): string => {
    if (tableSortColumn !== column) return ' ↕';
    return tableSortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Sort GL account data based on selected column and direction
  const getSortedGLAccountData = (): GLAccountData[] => {
    if (!tableSortColumn) return glAccountData;

    return [...glAccountData].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (tableSortColumn === 'account') {
        aValue = a.account;
        bValue = b.account;
      } else if (tableSortColumn === 'description') {
        aValue = a.description.toLowerCase();
        bValue = b.description.toLowerCase();
      } else if (tableSortColumn === 'total') {
        aValue = calculate12MonthTotal(a.monthlyAmounts);
        bValue = calculate12MonthTotal(b.monthlyAmounts);
      } else if (tableSortColumn === 'variance') {
        aValue = calculatePriorMonthVariance(a.monthlyAmounts);
        bValue = calculatePriorMonthVariance(b.monthlyAmounts);
      } else if (tableSortColumn.startsWith('month-')) {
        // Monthly column sorting
        const monthKey = tableSortColumn.replace('month-', '');
        aValue = a.monthlyAmounts[monthKey] || 0;
        bValue = b.monthlyAmounts[monthKey] || 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (aValue < bValue) return tableSortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return tableSortDirection === 'asc' ? 1 : -1;
        return 0;
      } else {
        // Numerical comparison
        if (aValue < bValue) return tableSortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return tableSortDirection === 'asc' ? 1 : -1;
        return 0;
      }
    });
  };

  // Export full MVA to Excel
  const exportFullMVA = () => {
    // Generate filename based on selected subgroup and period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `MVA - ${selectedSubgroup} - ${startMonth} to ${endMonth}`;

    // Prepare data for Excel export
    const excelData: any[] = [];

    // Add GL account rows
    getSortedGLAccountData().forEach(account => {
      const dataRow: any = {
        'GL Account': account.account,
        'Description': account.description
      };

      // Add monthly amounts
      monthHeaders.forEach(month => {
        const amount = account.monthlyAmounts[month.key] || 0;
        dataRow[month.label] = amount !== 0 ? amount : '';
      });

      // Add variance
      const variance = calculatePriorMonthVariance(account.monthlyAmounts);
      dataRow['Prior Month Variance'] = variance !== 0 ? variance : '';

      excelData.push(dataRow);
    });

    // Add total row if there are multiple accounts
    if (glAccountData.length > 1) {
      const totalRow: any = {
        'GL Account': '',
        'Description': `Total ${selectedSubgroup}`
      };

      monthHeaders.forEach(month => {
        const monthTotal = glAccountData.reduce((sum, account) => sum + (account.monthlyAmounts[month.key] || 0), 0);
        totalRow[month.label] = monthTotal !== 0 ? monthTotal : '';
      });

      const totalVariance = glAccountData.reduce((sum, account) => sum + calculatePriorMonthVariance(account.monthlyAmounts), 0);
      totalRow['Prior Month Variance'] = totalVariance !== 0 ? totalVariance : '';

      excelData.push(totalRow);
    }

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 12 }, // GL Account
      { wch: 35 }, // Description
    ];
    monthHeaders.forEach(() => columnWidths.push({ wch: 15 })); // Monthly columns
    columnWidths.push({ wch: 18 }); // Variance column
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Variance Analysis');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export full MVA to PDF
  const exportFullMVAPDF = () => {
    // Generate filename based on selected subgroup and period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `MVA - ${selectedSubgroup} - ${startMonth} to ${endMonth}`;
    const doc = new jsPDF('landscape');

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Variance Analysis', 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${selectedSubgroup}`, 14, 22);
    doc.text(`${startMonth} to ${endMonth}`, 14, 28);

    const tableData: any[] = [];

    // Add GL account rows
    getSortedGLAccountData().forEach(account => {
      const row = [
        account.account.toString(),
        account.description,
        ...monthHeaders.map(month => {
          const amount = account.monthlyAmounts[month.key] || 0;
          return amount !== 0 ? formatAmount(amount) : '-';
        }),
        formatAmount(calculatePriorMonthVariance(account.monthlyAmounts))
      ];
      tableData.push(row);
    });

    // Add total row if there are multiple accounts
    if (glAccountData.length > 1) {
      const totalRow = [
        { content: '', styles: { fontStyle: 'bold' } },
        { content: `Total ${selectedSubgroup}`, styles: { fontStyle: 'bold' } },
        ...monthHeaders.map(month => {
          const monthTotal = glAccountData.reduce((sum, account) => sum + (account.monthlyAmounts[month.key] || 0), 0);
          return { content: monthTotal !== 0 ? formatAmount(monthTotal) : '-', styles: { fontStyle: 'bold' } };
        }),
        {
          content: formatAmount(glAccountData.reduce((sum, account) => sum + calculatePriorMonthVariance(account.monthlyAmounts), 0)),
          styles: { fontStyle: 'bold' }
        }
      ];
      tableData.push(totalRow);
    }

    // Create column headers
    const headers = [
      'GL Account',
      'Description',
      ...monthHeaders.map(month => month.label),
      'Prior Month\nVariance'
    ];

    // Calculate column widths dynamically
    const numMonths = monthHeaders.length;
    const accountColWidth = 18;
    const descColWidth = 40;
    const varianceColWidth = 20;
    const monthColWidth = (297 - accountColWidth - descColWidth - varianceColWidth - 30) / numMonths;

    const columnStyles: any = {
      0: { cellWidth: accountColWidth },
      1: { cellWidth: descColWidth }
    };
    for (let i = 2; i < 2 + numMonths; i++) {
      columnStyles[i] = { cellWidth: monthColWidth, halign: 'right' };
    }
    columnStyles[2 + numMonths] = { cellWidth: varianceColWidth, halign: 'right' };

    // Generate table with custom styling
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 34,
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

    const filename = `${selectedSubgroup} - Account ${drillDownData.account} for ${drillDownData.monthLabel}`;

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

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);

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

        // Get unique subgroups for dropdown (exclude Type 1 and 2)
        const filteredRecords = rawData.filter(record => {
          const typeValue = record.Type;
          return ![1, 2].includes(typeValue) &&
                 record["FS_Sub_Group "] !== "" &&
                 record["FS_Sub_Group "] !== null &&
                 record[" glj_amt "] !== "" &&
                 record[" glj_amt "] !== null;
        });

        // Create a map to get the sort order and major group for each subgroup
        const subgroupDataMap = new Map();
        filteredRecords.forEach(record => {
          const subgroup = record["FS_Sub_Group "];
          if (!subgroupDataMap.has(subgroup)) {
            subgroupDataMap.set(subgroup, {
              majGrpSrtOrdr: record.MajGrpSrtOrdr,
              sortOrder: record.SortOrder,
              majorGroup: record["FS_Major_Group"]
            });
          }
        });

        // Get unique subgroups and sort them using the same logic as TestTrend
        const uniqueSubgroups = Array.from(new Set(filteredRecords.map(record => record["FS_Sub_Group "])))
          .filter(Boolean)
          .sort((a, b) => {
            const aSortData = subgroupDataMap.get(a);
            const bSortData = subgroupDataMap.get(b);

            if (aSortData.majGrpSrtOrdr !== bSortData.majGrpSrtOrdr) {
              return aSortData.majGrpSrtOrdr - bSortData.majGrpSrtOrdr;
            }
            return aSortData.sortOrder - bSortData.sortOrder;
          });

        // Group subgroups by major group and create dropdown structure with headers
        const groupedSubgroups: Array<{type: 'header' | 'option', value: string, majorGroup?: string}> = [];
        let currentMajorGroup = '';

        uniqueSubgroups.forEach(subgroup => {
          const subgroupData = subgroupDataMap.get(subgroup);
          if (subgroupData.majorGroup !== currentMajorGroup) {
            // Add major group header
            currentMajorGroup = subgroupData.majorGroup;
            groupedSubgroups.push({
              type: 'header',
              value: currentMajorGroup
            });
          }
          // Add subgroup option
          groupedSubgroups.push({
            type: 'option',
            value: subgroup,
            majorGroup: subgroupData.majorGroup
          });
        });

        setSubgroups(groupedSubgroups);

        // Set default subgroup if none selected
        if (!selectedSubgroup && uniqueSubgroups.length > 0) {
          setSelectedSubgroup(uniqueSubgroups[0]);
        }

        setRawGLData(rawData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading financial data:', error);
        setLoading(false);
      }
    };

    loadFinancialData();
  }, []);

  useEffect(() => {
    if (!selectedSubgroup || rawGLData.length === 0) return;

    // Get the date range based on selected end month
    const { startSerial, endSerial } = getDateRange(selectedEndMonth);

    // Filter data for selected subgroup and date range
    const filteredData = rawGLData.filter(record => {
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const typeValue = record.Type;

      return (
        meValue >= startSerial &&
        meValue <= endSerial &&
        ![1, 2].includes(typeValue) &&
        record["FS_Sub_Group "] === selectedSubgroup &&
        record[" glj_amt "] !== "" &&
        record[" glj_amt "] !== null
      );
    });

    // Process GL account data
    const accountData: { [key: string]: GLAccountData } = {};

    filteredData.forEach(record => {
      const account = record.glm_acc;
      const description = record.glm_desc || '';
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      if (isNaN(amount)) return;

      // Reverse signs for specific major groups
      const majorGroupsToReverse = [
        "PATIENT REVENUE",
        "OTHER REVENUE",
        "NONOPERATING INCOME(LOSS)"
      ];

      if (majorGroupsToReverse.includes(record["FS_Major_Group"])) {
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
    });

    // Convert to array and sort by account number
    const processedGLAccountData = Object.values(accountData).sort((a, b) => a.account - b.account);
    setGLAccountData(processedGLAccountData);

    // Reset table sorting when data changes
    setTableSortColumn('');
    setTableSortDirection('asc');
  }, [selectedSubgroup, selectedEndMonth, rawGLData]);

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

  const monthHeaders = generateMonthHeaders(selectedEndMonth);

  return (
    <div className="mva">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h1 style={{ margin: 0 }}>Monthly Variance Analysis</h1>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            className="export-btn"
            onClick={exportFullMVA}
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
            onClick={exportFullMVAPDF}
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

      <div className="mva-container">
        {/* Filter Controls */}
        <div className="filter-controls" style={{ display: 'flex', gap: '20px', margin: '20px 0' }}>
          <div className="filter-container">
            <label htmlFor="subgroup-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
              Line item from financial subgroup:
            </label>
            <select
              id="subgroup-filter"
              value={selectedSubgroup}
              onChange={(e) => {
                // Only set value if it's not a header
                const selectedItem = subgroups.find(item => item.value === e.target.value);
                if (selectedItem && selectedItem.type === 'option') {
                  setSelectedSubgroup(e.target.value);
                }
              }}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                minWidth: '200px'
              }}
            >
              {subgroups.map((item, index) => (
                item.type === 'header' ? (
                  <option
                    key={`header-${index}`}
                    value=""
                    disabled
                    style={{
                      fontWeight: 'bold',
                      backgroundColor: '#f5f5f5',
                      color: '#333',
                      fontSize: '13px'
                    }}
                  >
                    ── {item.value} ──
                  </option>
                ) : (
                  <option key={item.value} value={item.value}>
                    &nbsp;&nbsp;&nbsp;{item.value}
                  </option>
                )
              ))}
            </select>
          </div>

          <div className="filter-container">
            <label htmlFor="month-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
              Ending Month:
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
                backgroundColor: 'white',
                minWidth: '150px'
              }}
            >
              {availableMonths.map(month => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Monthly Data Table */}
        <div
          className="table-wrapper"
          style={{
            overflowX: 'auto',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          <table className="income-statement-table trend-table">
            <thead>
              {/* Column Headers */}
              <tr style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                <th
                  className="line-item"
                  onClick={() => handleTableSort('account')}
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: tableSortColumn === 'account' ? '#e0e0e0' : 'var(--header-bg, #f5f5f5)',
                    position: 'sticky',
                    top: 0,
                    left: 0,
                    zIndex: 31
                  }}
                >
                  GL Account{getTableSortIcon('account')}
                </th>
                <th
                  className="line-item"
                  onClick={() => handleTableSort('description')}
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: tableSortColumn === 'description' ? '#e0e0e0' : 'var(--header-bg, #f5f5f5)',
                    position: 'sticky',
                    top: 0,
                    left: '120px',
                    zIndex: 31
                  }}
                >
                  Description{getTableSortIcon('description')}
                </th>
                {monthHeaders.map(month => (
                  <th
                    key={month.key}
                    className="month-col"
                    onClick={() => handleTableSort(`month-${month.key}`)}
                    style={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: tableSortColumn === `month-${month.key}` ? '#e0e0e0' : 'var(--header-bg, #f5f5f5)',
                      position: 'sticky',
                      top: 0
                    }}
                  >
                    {month.label}{getTableSortIcon(`month-${month.key}`)}
                  </th>
                ))}
                <th
                  className="amount"
                  onClick={() => handleTableSort('variance')}
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: tableSortColumn === 'variance' ? '#e0e0e0' : 'var(--header-bg, #f5f5f5)',
                    position: 'sticky',
                    top: 0
                  }}
                >
                  Prior Month<br /><small>Variance</small>{getTableSortIcon('variance')}
                </th>
                <th className="amount" style={{ minWidth: '100px', position: 'sticky', top: 0, backgroundColor: 'var(--header-bg, #f5f5f5)' }}>
                  Trend
                </th>
              </tr>

              {/* Fixed Total Row at Top */}
              {glAccountData.length > 1 && (() => {
                const totalVariance = glAccountData.reduce((sum, account) => sum + calculatePriorMonthVariance(account.monthlyAmounts), 0);
                const totalSparklineData = monthHeaders.map(month => ({
                  value: glAccountData.reduce((sum, account) => sum + (account.monthlyAmounts[month.key] || 0), 0)
                }));
                return (
                  <tr className="subtotal" style={{
                    position: 'sticky',
                    top: '52px',
                    zIndex: 20,
                    backgroundColor: '#f0f8ff',
                    borderBottom: '2px solid var(--sidebar-accent)'
                  }}>
                    <td colSpan={2} style={{ backgroundColor: '#f0f8ff', position: 'sticky', left: 0, zIndex: 21 }}><strong>Total {selectedSubgroup}</strong></td>
                    {monthHeaders.map(month => {
                      const monthTotal = glAccountData.reduce((sum, account) => sum + (account.monthlyAmounts[month.key] || 0), 0);
                      return (
                        <td key={month.key} className={getAmountClass(monthTotal)} style={{ backgroundColor: '#f0f8ff' }}>
                          <strong>{monthTotal !== 0 ? formatAmount(monthTotal) : '-'}</strong>
                        </td>
                      );
                    })}
                    <td className={getAmountClass(totalVariance)} style={{ backgroundColor: '#f0f8ff' }}>
                      <strong>{totalVariance !== 0 ? formatAmount(totalVariance) : '-'}</strong>
                    </td>
                    <td style={{ padding: '4px', backgroundColor: '#f0f8ff' }}>
                      <ResponsiveContainer width="100%" height={30}>
                        <LineChart data={totalSparklineData}>
                          <Line type="monotone" dataKey="value" stroke="#1a7fa0" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </td>
                  </tr>
                );
              })()}
            </thead>
            <tbody>
              {getSortedGLAccountData().map((account, index) => {
                const sparklineData = monthHeaders.map(month => ({
                  value: account.monthlyAmounts[month.key] || 0
                }));
                return (
                  <tr key={account.account}>
                    <td className="indent" style={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 10 }}>{account.account}</td>
                    <td className="indent" style={{ position: 'sticky', left: '120px', backgroundColor: 'white', zIndex: 10 }}>{account.description}</td>
                    {monthHeaders.map(month => {
                      const amount = account.monthlyAmounts[month.key] || 0;
                      return (
                        <td
                          key={month.key}
                          className={`${getAmountClass(amount)} ${amount !== 0 ? 'clickable-amount' : ''}`}
                          onClick={() => amount !== 0 && handleAmountClick(account.account, account.description, month.key)}
                          style={{
                            cursor: amount !== 0 ? 'pointer' : 'default',
                            textDecoration: amount !== 0 ? 'underline' : 'none'
                          }}
                        >
                          {amount !== 0 ? formatAmount(amount) : '-'}
                        </td>
                      );
                    })}
                    <td className={getAmountClass(calculatePriorMonthVariance(account.monthlyAmounts))}>
                      <strong>{calculatePriorMonthVariance(account.monthlyAmounts) !== 0 ? formatAmount(calculatePriorMonthVariance(account.monthlyAmounts)) : '-'}</strong>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <ResponsiveContainer width="100%" height={30}>
                        <LineChart data={sparklineData}>
                          <Line type="monotone" dataKey="value" stroke="#1a7fa0" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </td>
                  </tr>
                );
              })}

            </tbody>
          </table>
        </div>

        <div className="statement-footer">
          <p className="note">* Monthly variance analysis for the selected financial subgroup over trailing 12 months</p>
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
                  {drillDownData.subgroup} - Account {drillDownData.account} ({drillDownData.description}) for {drillDownData.monthLabel}
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
                    margin: '0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.1s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    position: 'relative'
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
    </div>
  );
};

export default MVA;