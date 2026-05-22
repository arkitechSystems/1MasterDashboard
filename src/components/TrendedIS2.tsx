import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  SNAPSHOT_MONTH_HEADERS,
  SNAPSHOT_GROUPED_DATA,
  SNAPSHOT_ACCOUNT_DATA,
  SNAPSHOT_NET_POSITION,
  SNAPSHOT_DEPARTMENTS,
  SNAPSHOT_RAW_RECORDS,
  SnapshotRecord
} from '../data/trendedIS2Snapshot';

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
  transactions: SnapshotRecord[];
  total: number;
}

const TrendedIS2: React.FC = () => {
  const [financialData] = useState<GroupedData[]>(SNAPSHOT_GROUPED_DATA as GroupedData[]);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [selectedEndMonth] = useState(SNAPSHOT_MONTH_HEADERS[SNAPSHOT_MONTH_HEADERS.length - 1].key);
  const [selectedDepartment] = useState('All');
  const [showCalculationModal, setShowCalculationModal] = useState(false);
  const [calculationDetails, setCalculationDetails] = useState<{
    title: string;
    calculation: string;
    numerator: string;
    denominator: string;
    result: string;
  } | null>(null);

  // Use snapshot month headers directly
  const monthHeaders = SNAPSHOT_MONTH_HEADERS;

  // Derive groupedByMajor from financialData
  const groupedByMajor: { [key: string]: GroupedData[] } = {};
  financialData.forEach(item => {
    if (!groupedByMajor[item.level1]) groupedByMajor[item.level1] = [];
    groupedByMajor[item.level1].push(item);
  });

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
    if (amount > 0) return 'amount positive';
    if (amount < 0) return 'amount negative';
    return 'amount';
  };

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

  // Calculate totals using original signs (before reversal) for Net Position calculation
  const calculateOriginalSignTotal = (monthKey: string): number => {
    return SNAPSHOT_NET_POSITION[monthKey] || 0;
  };

  // Calculate 12-month total using original signs
  const calculateOriginalSign12MonthTotal = (): number => {
    return monthHeaders.reduce((sum, month) => sum + (SNAPSHOT_NET_POSITION[month.key] || 0), 0);
  };

  // Calculate major group totals for ratio calculations
  const calculateMajorGroupTotal = (majorGroupName: string, monthKey: string): number => {
    const majorGroupItems = groupedByMajor[majorGroupName] || [];
    return calculateGroupTotal(majorGroupItems, monthKey);
  };

  const calculateMajorGroup12MonthTotal = (majorGroupName: string): number => {
    const majorGroupItems = groupedByMajor[majorGroupName] || [];
    return calculateGroup12MonthTotal(majorGroupItems);
  };

  // Financial ratio calculations
  const calculateRatios = (monthKey: string) => {
    const patientRevenue = Math.abs(calculateMajorGroupTotal("PATIENT REVENUE", monthKey));
    const otherRevenue = Math.abs(calculateMajorGroupTotal("OTHER REVENUE", monthKey));
    const totalRevenue = patientRevenue + otherRevenue;

    const operatingExpenses = Math.abs(calculateMajorGroupTotal("OPERATING EXPENSES", monthKey));
    const operatingIncome = totalRevenue - operatingExpenses;

    const nonOperatingIncome = calculateMajorGroupTotal("NONOPERATING INCOME(LOSS)", monthKey);
    const netIncome = operatingIncome + nonOperatingIncome;

    return {
      totalRevenue,
      operatingExpenses,
      operatingIncome,
      nonOperatingIncome,
      netIncome,
      operatingMargin: totalRevenue > 0 ? (operatingIncome / totalRevenue) * 100 : 0,
      profitMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
      expenseRatio: totalRevenue > 0 ? (operatingExpenses / totalRevenue) * 100 : 0
    };
  };

  const calculate12MonthRatios = () => {
    const patientRevenue = Math.abs(calculateMajorGroup12MonthTotal("PATIENT REVENUE"));
    const otherRevenue = Math.abs(calculateMajorGroup12MonthTotal("OTHER REVENUE"));
    const totalRevenue = patientRevenue + otherRevenue;

    const operatingExpenses = Math.abs(calculateMajorGroup12MonthTotal("OPERATING EXPENSES"));
    const operatingIncome = totalRevenue - operatingExpenses;

    const nonOperatingIncome = calculateMajorGroup12MonthTotal("NONOPERATING INCOME(LOSS)");
    const netIncome = operatingIncome + nonOperatingIncome;

    return {
      totalRevenue,
      operatingExpenses,
      operatingIncome,
      nonOperatingIncome,
      netIncome,
      operatingMargin: totalRevenue > 0 ? (operatingIncome / totalRevenue) * 100 : 0,
      profitMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
      expenseRatio: totalRevenue > 0 ? (operatingExpenses / totalRevenue) * 100 : 0
    };
  };

  // Generate period description based on selected month headers
  const getPeriodDescription = () => {
    const startMonth = monthHeaders[0].label;
    const endMonth = monthHeaders[monthHeaders.length - 1].label;
    return `Monthly Results from ${startMonth} to ${endMonth}`;
  };

  // Handle clicking on a specific GL account amount to drill down to transactions
  const handleGLAccountClick = (level1: string, level2: string, monthKey: string, glAccount: number) => {
    const monthData = monthHeaders.find(m => m.key === monthKey);
    if (!monthData) return;

    // Filter transactions for this specific GL account
    const accountTransactions = SNAPSHOT_RAW_RECORDS.filter((r: SnapshotRecord) => {
      return r.monthKey === monthKey && r.l1 === level1 && r.l2 === level2 && r.glm_acc === glAccount;
    });

    // Calculate total
    const majorGroupsToReverse = [
      "PATIENT REVENUE",
      "OTHER REVENUE",
      "NONOPERATING INCOME(LOSS)"
    ];

    const total = accountTransactions.reduce((sum: number, r: SnapshotRecord) => {
      let amount = r.amt;
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

  // Handle clicking on 12-month total to drill down to all transactions
  const handle12MonthTotalClick = (level1: string, level2: string) => {
    const monthKeySet = new Set(monthHeaders.map(m => m.key));

    // Filter transactions for all months in the current period
    const totalTransactions = SNAPSHOT_RAW_RECORDS.filter((r: SnapshotRecord) => {
      const matchesLevel1 = r.l1 === level1;
      const matchesLevel2 = level2 === '' ? true : r.l2 === level2;
      const isInPeriod = monthKeySet.has(r.monthKey);
      return matchesLevel1 && matchesLevel2 && isInPeriod;
    });

    // Calculate total
    const majorGroupsToReverse = [
      "PATIENT REVENUE",
      "OTHER REVENUE",
      "NONOPERATING INCOME(LOSS)"
    ];

    const total = totalTransactions.reduce((sum: number, r: SnapshotRecord) => {
      let amount = r.amt;
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

  // Handle clicking on Net Position month total
  const handleNetPositionClick = (monthKey: string) => {
    const monthData = monthHeaders.find(m => m.key === monthKey);
    if (!monthData) return;

    // Filter ALL transactions for this specific month (using original signs)
    const allTransactions = SNAPSHOT_RAW_RECORDS.filter((r: SnapshotRecord) => r.monthKey === monthKey);

    // Calculate total using original signs
    const total = allTransactions.reduce((sum: number, r: SnapshotRecord) => {
      return sum + (isNaN(r.amt) ? 0 : r.amt);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Set drill-down data and show modal
    setDrillDownData({
      level1: 'All Accounts',
      level2: 'Net Position Change',
      month: monthKey,
      monthLabel: monthData.label,
      transactions: allTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Handle clicking on Net Position 12-month total
  const handleNetPosition12MonthClick = () => {
    const monthKeySet = new Set(monthHeaders.map(m => m.key));

    // Filter ALL transactions for the entire 12-month period (using original signs)
    const allTransactions = SNAPSHOT_RAW_RECORDS.filter((r: SnapshotRecord) => monthKeySet.has(r.monthKey));

    // Calculate total using original signs
    const total = allTransactions.reduce((sum: number, r: SnapshotRecord) => {
      return sum + (isNaN(r.amt) ? 0 : r.amt);
    }, 0);

    // Reset sorting when opening new drill-down
    setSortColumn('');
    setSortDirection('asc');

    // Set drill-down data and show modal
    const periodDescription = `${monthHeaders[0]?.label} to ${monthHeaders[monthHeaders.length - 1]?.label}`;
    setDrillDownData({
      level1: 'All Accounts',
      level2: 'Net Position Change',
      month: 'all-months',
      monthLabel: `12-Month Period (${periodDescription})`,
      transactions: allTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Handle clicking on an amount to drill down to transactions
  const handleAmountClick = (level1: string, level2: string, monthKey: string) => {
    const monthData = monthHeaders.find(m => m.key === monthKey);
    if (!monthData) return;

    // Filter transactions for this specific cell
    const cellTransactions = SNAPSHOT_RAW_RECORDS.filter((r: SnapshotRecord) => {
      const matchesMonth = r.monthKey === monthKey;
      const matchesLevel1 = r.l1 === level1;
      const matchesLevel2 = level2 === '' ? true : r.l2 === level2;
      return matchesMonth && matchesLevel1 && matchesLevel2;
    });

    // Calculate total
    const majorGroupsToReverse = [
      "PATIENT REVENUE",
      "OTHER REVENUE",
      "NONOPERATING INCOME(LOSS)"
    ];

    const total = cellTransactions.reduce((sum: number, r: SnapshotRecord) => {
      let amount = r.amt;
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

  // Handle clicking on salary percentage to show calculation
  const handleSalaryPercentageClick = (monthKey: string, monthLabel: string) => {
    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
    const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, monthKey));

    const salariesData = financialData.filter(item => item.level2 === "Salaries");
    const salariesTotal = salariesData.reduce((sum, item) => sum + (item.monthlyAmounts[monthKey] || 0), 0);

    const percentage = patientRevenue > 0 ? (Math.abs(salariesTotal) / patientRevenue) * 100 : 0;

    setCalculationDetails({
      title: `Salaries as % of Patient Revenue - ${monthLabel}`,
      calculation: `${formatAmount(Math.abs(salariesTotal))} \u00f7 ${formatAmount(patientRevenue)} \u00d7 100`,
      numerator: `Salaries: ${formatAmount(Math.abs(salariesTotal))}`,
      denominator: `Patient Revenue: ${formatAmount(patientRevenue)}`,
      result: `${percentage.toFixed(1)}%`
    });
    setShowCalculationModal(true);
  };

  // Handle clicking on 12-month salary percentage
  const handleSalary12MonthPercentageClick = () => {
    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

    const salariesData = financialData.filter(item => item.level2 === "Salaries");
    const totalSalaries = salariesData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

    const avgPercentage = totalPatientRevenue > 0 ? (Math.abs(totalSalaries) / totalPatientRevenue) * 100 : 0;

    const periodDescription = `${monthHeaders[0]?.label} to ${monthHeaders[monthHeaders.length - 1]?.label}`;

    setCalculationDetails({
      title: `Salaries as % of Patient Revenue - 12-Month Average (${periodDescription})`,
      calculation: `${formatAmount(Math.abs(totalSalaries))} \u00f7 ${formatAmount(totalPatientRevenue)} \u00d7 100`,
      numerator: `Total Salaries: ${formatAmount(Math.abs(totalSalaries))}`,
      denominator: `Total Patient Revenue: ${formatAmount(totalPatientRevenue)}`,
      result: `${avgPercentage.toFixed(1)}%`
    });
    setShowCalculationModal(true);
  };

  // Handle clicking on contractual allowance percentage to show calculation
  const handleContractualAllowanceClick = (monthKey: string, monthLabel: string) => {
    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
    const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, monthKey));

    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
    const contractualAdjustments = calculateGroupTotal(deductionItems, monthKey); // Keep original sign

    const percentage = patientRevenue > 0 ? (contractualAdjustments / patientRevenue) * 100 : 0;

    setCalculationDetails({
      title: `Contractual Allowance % - ${monthLabel}`,
      calculation: `${formatAmount(contractualAdjustments)} \u00f7 ${formatAmount(patientRevenue)} \u00d7 100`,
      numerator: `Deductions: ${formatAmount(contractualAdjustments)}`,
      denominator: `Patient Revenue: ${formatAmount(patientRevenue)}`,
      result: `${percentage.toFixed(1)}%`
    });
    setShowCalculationModal(true);
  };

  // Handle clicking on 12-month contractual allowance percentage
  const handleContractualAllowance12MonthClick = () => {
    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
    const totalDeductions = calculateGroup12MonthTotal(deductionItems); // Keep original sign

    const avgPercentage = totalPatientRevenue > 0 ? (totalDeductions / totalPatientRevenue) * 100 : 0;

    const periodDescription = `${monthHeaders[0]?.label} to ${monthHeaders[monthHeaders.length - 1]?.label}`;

    setCalculationDetails({
      title: `Contractual Allowance % - 12-Month Average (${periodDescription})`,
      calculation: `${formatAmount(totalDeductions)} \u00f7 ${formatAmount(totalPatientRevenue)} \u00d7 100`,
      numerator: `Total Deductions: ${formatAmount(totalDeductions)}`,
      denominator: `Total Patient Revenue: ${formatAmount(totalPatientRevenue)}`,
      result: `${avgPercentage.toFixed(1)}%`
    });
    setShowCalculationModal(true);
  };

  // Handle clicking on benefits percentage to show calculation
  const handleBenefitsPercentageClick = (monthKey: string, monthLabel: string) => {
    const salariesData = financialData.filter(item => item.level2 === "Salaries");
    const salariesTotal = salariesData.reduce((sum, item) => sum + (item.monthlyAmounts[monthKey] || 0), 0);

    const benefitsData = financialData.filter(item => item.level2 === "Employee Benefits and Payroll Taxes");
    const benefitsTotal = benefitsData.reduce((sum, item) => sum + (item.monthlyAmounts[monthKey] || 0), 0);

    const percentage = Math.abs(salariesTotal) > 0 ? (Math.abs(benefitsTotal) / Math.abs(salariesTotal)) * 100 : 0;

    setCalculationDetails({
      title: `Benefits as % of Salaries - ${monthLabel}`,
      calculation: `${formatAmount(Math.abs(benefitsTotal))} \u00f7 ${formatAmount(Math.abs(salariesTotal))} \u00d7 100`,
      numerator: `Employee Benefits and Payroll Taxes: ${formatAmount(Math.abs(benefitsTotal))}`,
      denominator: `Salaries: ${formatAmount(Math.abs(salariesTotal))}`,
      result: `${percentage.toFixed(1)}%`
    });
    setShowCalculationModal(true);
  };

  // Handle clicking on 12-month benefits percentage
  const handleBenefits12MonthPercentageClick = () => {
    const salariesData = financialData.filter(item => item.level2 === "Salaries");
    const totalSalaries = salariesData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

    const benefitsData = financialData.filter(item => item.level2 === "Employee Benefits and Payroll Taxes");
    const totalBenefits = benefitsData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

    const avgPercentage = Math.abs(totalSalaries) > 0 ? (Math.abs(totalBenefits) / Math.abs(totalSalaries)) * 100 : 0;

    const periodDescription = `${monthHeaders[0]?.label} to ${monthHeaders[monthHeaders.length - 1]?.label}`;

    setCalculationDetails({
      title: `Benefits as % of Salaries - 12-Month Average (${periodDescription})`,
      calculation: `${formatAmount(Math.abs(totalBenefits))} \u00f7 ${formatAmount(Math.abs(totalSalaries))} \u00d7 100`,
      numerator: `Total Employee Benefits and Payroll Taxes: ${formatAmount(Math.abs(totalBenefits))}`,
      denominator: `Total Salaries: ${formatAmount(Math.abs(totalSalaries))}`,
      result: `${avgPercentage.toFixed(1)}%`
    });
    setShowCalculationModal(true);
  };

  // Close calculation modal
  const closeCalculationModal = () => {
    setShowCalculationModal(false);
    setCalculationDetails(null);
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
  const getSortedTransactions = (transactions: SnapshotRecord[]): SnapshotRecord[] => {
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
          aValue = a.amt;
          bValue = b.amt;
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
    if (sortColumn !== column) return ' \u2195'; // Default sort icon
    return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
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
    const groupKey = `${level1}|${level2}`;
    return SNAPSHOT_ACCOUNT_DATA
      .filter((a: any) => a.groupKey === groupKey)
      .sort((a: any, b: any) => a.account - b.account);
  };

  // Export full income statement to Excel
  const exportFullIncomeStatement = () => {
    // Generate filename based on the period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `Trended Income Statement - ${startMonth} to ${endMonth}`;

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

    // Add Net Patient Revenue row
    const netPatientRevenueRow: any = { LineItem: 'Net Patient Revenue' };
    monthHeaders.forEach(month => {
      const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
      const patientRevenue = calculateGroupTotal(patientRevenueItems, month.key);

      const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
      const deductions = calculateGroupTotal(deductionItems, month.key);

      const badDebtItems = groupedByMajor["BAD DEBT"] || [];
      const badDebt = calculateGroupTotal(badDebtItems, month.key);

      const netPatientRevenue = patientRevenue + deductions + badDebt;
      netPatientRevenueRow[month.label] = netPatientRevenue !== 0 ? netPatientRevenue : '';
    });
    excelData.push(netPatientRevenueRow);

    // Add empty row after Net Patient Revenue
    const emptyRow2: any = { LineItem: '' };
    monthHeaders.forEach(month => {
      emptyRow2[month.label] = '';
    });
    excelData.push(emptyRow2);

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [{ wch: 30 }]; // Line Item column
    monthHeaders.forEach(() => columnWidths.push({ wch: 15 })); // Month columns
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trended Income Statement');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export full income statement to PDF
  const exportFullIncomeStatementPDF = () => {
    // Generate filename based on the period
    const startMonth = monthHeaders[0]?.label || '';
    const endMonth = monthHeaders[monthHeaders.length - 1]?.label || '';
    const filename = `Trended Income Statement - ${startMonth} to ${endMonth}`;
    const doc = new jsPDF('landscape');

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Trended Income Statement', 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${startMonth} to ${endMonth}`, 14, 22);

    const tableData: any[] = [];

    // Build table data
    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      // Add section header
      tableData.push([
        { content: majorGroup, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        ...monthHeaders.map(() => ''),
        ''
      ]);

      // Add detail lines
      items.forEach(item => {
        const row = [
          `  ${item.level2}`,
          ...monthHeaders.map(month => {
            const amount = item.monthlyAmounts[month.key] || 0;
            return amount !== 0 ? formatAmount(amount) : '-';
          }),
          formatAmount(calculate12MonthTotal(item.monthlyAmounts))
        ];
        tableData.push(row);
      });

      // Add group total
      const totalRow = [
        { content: `Total ${majorGroup}`, styles: { fontStyle: 'bold' } },
        ...monthHeaders.map(month => {
          const total = calculateGroupTotal(items, month.key);
          return { content: total !== 0 ? formatAmount(total) : '-', styles: { fontStyle: 'bold' } };
        }),
        { content: formatAmount(calculateGroup12MonthTotal(items)), styles: { fontStyle: 'bold' } }
      ];
      tableData.push(totalRow);

      // Add empty row for spacing
      tableData.push(['', ...monthHeaders.map(() => ''), '']);
    });

    // Add Net Patient Revenue row
    const netPatientRevenueRow = [
      { content: 'Net Patient Revenue', styles: { fontStyle: 'bold', fillColor: [230, 243, 255] } },
      ...monthHeaders.map(month => {
        const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
        const patientRevenue = calculateGroupTotal(patientRevenueItems, month.key);

        const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
        const deductions = calculateGroupTotal(deductionItems, month.key);

        const badDebtItems = groupedByMajor["BAD DEBT"] || [];
        const badDebt = calculateGroupTotal(badDebtItems, month.key);

        const netPatientRevenue = patientRevenue + deductions + badDebt;
        return { content: formatAmount(netPatientRevenue), styles: { fontStyle: 'bold', fillColor: [230, 243, 255] } };
      }),
      {
        content: (() => {
          const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
          const totalPatientRevenue = calculateGroup12MonthTotal(patientRevenueItems);

          const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
          const totalDeductions = calculateGroup12MonthTotal(deductionItems);

          const badDebtItems = groupedByMajor["BAD DEBT"] || [];
          const totalBadDebt = calculateGroup12MonthTotal(badDebtItems);

          return formatAmount(totalPatientRevenue + totalDeductions + totalBadDebt);
        })(),
        styles: { fontStyle: 'bold', fillColor: [230, 243, 255] }
      }
    ];
    tableData.push(netPatientRevenueRow);

    // Add empty row for spacing
    tableData.push(['', ...monthHeaders.map(() => ''), '']);

    // Add Net Position row with special styling
    const netPositionRow = [
      { content: 'Increase (Decrease) in Net Position', styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } },
      ...monthHeaders.map(month => {
        const total = calculateOriginalSignTotal(month.key);
        return { content: formatAmount(total), styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } };
      }),
      { content: formatAmount(calculateOriginalSign12MonthTotal()), styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } }
    ];
    tableData.push(netPositionRow);

    // Create column headers
    const headers = [
      'Line Item',
      ...monthHeaders.map(month => month.label),
      '12-Month Total'
    ];

    // Calculate column widths dynamically
    const numMonths = monthHeaders.length;
    const lineItemWidth = 50;
    const monthColWidth = (297 - lineItemWidth - 30) / (numMonths + 1); // 297mm is landscape width, 30 for margins

    const columnStyles: any = { 0: { cellWidth: lineItemWidth } };
    for (let i = 1; i <= numMonths + 1; i++) {
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
    const excelData = drillDownData.transactions.map((transaction: SnapshotRecord) => {
      const amount = transaction.amt;

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

    const max = Math.max(...data.map(Math.abs));
    const min = Math.min(...data);

    if (max === 0) return null;

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

  // Suppress unused variable warnings for ratios (kept for potential future use)
  void calculateRatios;
  void calculate12MonthRatios;

  return (
    <div className="trended-income-statement munis-style" style={{ paddingTop: '0px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0px', marginBottom: '4px' }}>
        <h1 style={{ marginTop: '0px', paddingTop: '0px', marginBottom: '0px' }}>Trended Income Statement</h1>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            className="export-btn"
            onClick={exportFullIncomeStatement}
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
            onClick={exportFullIncomeStatementPDF}
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
        <div className="statement-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Filters - Left side */}
          <div className="filter-container" style={{ margin: '5px 0', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="month-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
                End Month:
              </label>
              <select
                id="month-filter"
                value={selectedEndMonth}
                disabled
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                {monthHeaders.map(month => (
                  <option key={month.key} value={month.key}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label htmlFor="department-filter" style={{ marginRight: '10px', fontWeight: 'bold' }}>
                Department:
              </label>
              <select
                id="department-filter"
                value={selectedDepartment}
                disabled
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  maxWidth: '250px'
                }}
              >
                <option value="All">All Departments</option>
                {SNAPSHOT_DEPARTMENTS.map((dept: string) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Period Description - Right side */}
          <span className="period">{getPeriodDescription()}</span>
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
                <th className="amount">
                  Total<br /><small>12 Month</small>
                </th>
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
                              {isExpanded ? '\u2212' : '+'}
                            </button>
                            {item.level2}
                          </td>
                          {monthHeaders.map(month => {
                            const amount = item.monthlyAmounts[month.key] || 0;
                            return (
                              <td
                                key={month.key}
                                className={`${getAmountClass(amount)} ${amount !== 0 ? 'clickable-amount' : ''}`}
                                onClick={() => amount !== 0 && handleAmountClick(item.level1, item.level2, month.key)}
                                style={{
                                  cursor: amount !== 0 ? 'pointer' : 'default',
                                  textDecoration: amount !== 0 ? 'underline' : 'none'
                                }}
                              >
                                {amount !== 0 ? formatAmount(amount) : '-'}
                              </td>
                            );
                          })}
                          <td
                            className={`${getAmountClass(calculate12MonthTotal(item.monthlyAmounts))} clickable-amount`}
                            onClick={() => handle12MonthTotalClick(item.level1, item.level2)}
                            style={{
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                          >
                            <strong>{formatAmount(calculate12MonthTotal(item.monthlyAmounts))}</strong>
                          </td>
                          <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <Sparkline
                              data={getSparklineData(item.monthlyAmounts)}
                              color={getSparklineData(item.monthlyAmounts).some(v => v < 0) ? '#e74c3c' : '#1abc9c'}
                            />
                          </td>
                        </tr>

                        {/* Expanded GL Account Details */}
                        {isExpanded && glAccounts.map((account: any, accountIndex: number) => (
                          <tr key={`${itemKey}-account-${accountIndex}`} className="gl-account-detail" style={{ backgroundColor: '#f0f0f0' }}>
                            <td className="indent" style={{ paddingLeft: '60px', fontSize: '11px', color: '#666' }}>
                              {account.account} - {account.description}
                            </td>
                            {monthHeaders.map(month => {
                              const amount = account.monthlyAmounts[month.key] || 0;
                              return (
                                <td
                                  key={month.key}
                                  className={`${getAmountClass(amount)} ${amount !== 0 ? 'clickable-amount' : ''}`}
                                  onClick={() => amount !== 0 && handleGLAccountClick(item.level1, item.level2, month.key, account.account)}
                                  style={{
                                    fontSize: '11px',
                                    cursor: amount !== 0 ? 'pointer' : 'default',
                                    textDecoration: amount !== 0 ? 'underline' : 'none'
                                  }}
                                >
                                  {amount !== 0 ? formatAmount(amount) : '-'}
                                </td>
                              );
                            })}
                            <td
                              className={`${getAmountClass(calculate12MonthTotal(account.monthlyAmounts))} clickable-amount`}
                              onClick={() => handle12MonthTotalClick(item.level1, item.level2)}
                              style={{
                                fontSize: '11px',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                              }}
                            >
                              <strong>{formatAmount(calculate12MonthTotal(account.monthlyAmounts))}</strong>
                            </td>
                            <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                              <Sparkline
                                data={getSparklineData(account.monthlyAmounts)}
                                width={32}
                                height={12}
                                color={getSparklineData(account.monthlyAmounts).some((v: number) => v < 0) ? '#e74c3c' : '#27ae60'}
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
                          className={`${getAmountClass(total)} ${total !== 0 ? 'clickable-amount' : ''}`}
                          onClick={() => total !== 0 && handleAmountClick(majorGroup, '', month.key)}
                          style={{
                            cursor: total !== 0 ? 'pointer' : 'default',
                            textDecoration: total !== 0 ? 'underline' : 'none'
                          }}
                        >
                          <strong>{total !== 0 ? formatAmount(total) : '-'}</strong>
                        </td>
                      );
                    })}
                    <td
                      className={`${getAmountClass(calculateGroup12MonthTotal(items))} clickable-amount`}
                      onClick={() => handle12MonthTotalClick(majorGroup, '')}
                      style={{
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      <strong>{formatAmount(calculateGroup12MonthTotal(items))}</strong>
                    </td>
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

              {/* Net Patient Revenue Row */}
              <tr className="subtotal net-patient-revenue">
                <td><strong>Net Patient Revenue</strong></td>
                {monthHeaders.map(month => {
                  const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                  const patientRevenue = calculateGroupTotal(patientRevenueItems, month.key);

                  const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                  const deductions = calculateGroupTotal(deductionItems, month.key);

                  const badDebtItems = groupedByMajor["BAD DEBT"] || [];
                  const badDebt = calculateGroupTotal(badDebtItems, month.key);

                  const netPatientRevenue = patientRevenue + deductions + badDebt;

                  return (
                    <td
                      key={month.key}
                      className={`${getAmountClass(netPatientRevenue)}`}
                    >
                      <strong>{netPatientRevenue !== 0 ? formatAmount(netPatientRevenue) : '-'}</strong>
                    </td>
                  );
                })}
                <td className={`${getAmountClass((() => {
                  const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                  const totalPatientRevenue = calculateGroup12MonthTotal(patientRevenueItems);

                  const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                  const totalDeductions = calculateGroup12MonthTotal(deductionItems);

                  const badDebtItems = groupedByMajor["BAD DEBT"] || [];
                  const totalBadDebt = calculateGroup12MonthTotal(badDebtItems);

                  return totalPatientRevenue + totalDeductions + totalBadDebt;
                })())}`}>
                  <strong>{formatAmount((() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = calculateGroup12MonthTotal(patientRevenueItems);

                    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                    const totalDeductions = calculateGroup12MonthTotal(deductionItems);

                    const badDebtItems = groupedByMajor["BAD DEBT"] || [];
                    const totalBadDebt = calculateGroup12MonthTotal(badDebtItems);

                    return totalPatientRevenue + totalDeductions + totalBadDebt;
                  })())}</strong>
                </td>
                <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <Sparkline
                    data={monthHeaders.map(month => {
                      const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                      const patientRevenue = calculateGroupTotal(patientRevenueItems, month.key);

                      const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                      const deductions = calculateGroupTotal(deductionItems, month.key);

                      const badDebtItems = groupedByMajor["BAD DEBT"] || [];
                      const badDebt = calculateGroupTotal(badDebtItems, month.key);

                      return patientRevenue + deductions + badDebt;
                    })}
                    color="#2c5364"
                    width={45}
                    height={18}
                  />
                </td>
              </tr>

              {/* Net Position Row - using original signs */}
              <tr className="net-income">
                <td><strong>Increase (Decrease) in Net Position</strong></td>
                {monthHeaders.map(month => {
                  const total = calculateOriginalSignTotal(month.key);
                  return (
                    <td
                      key={month.key}
                      className={`${getAmountClass(total)} ${total !== 0 ? 'clickable-amount' : ''}`}
                      onClick={() => total !== 0 && handleNetPositionClick(month.key)}
                      style={{
                        cursor: total !== 0 ? 'pointer' : 'default',
                        textDecoration: total !== 0 ? 'underline' : 'none'
                      }}
                    >
                      <strong>{total !== 0 ? formatAmount(total) : '-'}</strong>
                    </td>
                  );
                })}
                <td
                  className={`${getAmountClass(calculateOriginalSign12MonthTotal())} clickable-amount`}
                  onClick={() => handleNetPosition12MonthClick()}
                  style={{
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  <strong>{formatAmount(calculateOriginalSign12MonthTotal())}</strong>
                </td>
                <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <Sparkline
                    data={monthHeaders.map(month => calculateOriginalSignTotal(month.key))}
                    color={monthHeaders.map(month => calculateOriginalSignTotal(month.key)).some(v => v < 0) ? '#e74c3c' : '#27ae60'}
                    width={45}
                    height={18}
                  />
                </td>
              </tr>

              {/* Key Financial Ratios Section Header */}
              <tr className="section-header">
                <td colSpan={monthHeaders.length + 3}><strong>KEY FINANCIAL RATIOS</strong></td>
              </tr>

              {/* Contractual Allowance Percentage */}
              <tr>
                <td className="indent">Contractual Allowance %</td>
                {monthHeaders.map(month => {
                  const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                  const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, month.key));

                  const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                  const contractualAdjustments = calculateGroupTotal(deductionItems, month.key); // Keep original sign

                  const percentage = patientRevenue > 0 ? (contractualAdjustments / patientRevenue) * 100 : 0;

                  const tooltipText = `Calculation for ${month.label}:\nDeductions: ${formatAmount(contractualAdjustments)}\nPatient Revenue: ${formatAmount(patientRevenue)}\nFormula: ${formatAmount(contractualAdjustments)} \u00f7 ${formatAmount(patientRevenue)} \u00d7 100 = ${percentage.toFixed(1)}%`;

                  return (
                    <td
                      key={month.key}
                      className="amount"
                      title={tooltipText}
                      style={{ cursor: 'pointer' }}
                      onClick={() => percentage !== 0 && handleContractualAllowanceClick(month.key, month.label)}
                    >
                      {percentage !== 0 ? `${percentage.toFixed(1)}%` : '-'}
                    </td>
                  );
                })}
                <td
                  className="amount"
                  title={(() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

                    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                    const totalDeductions = calculateGroup12MonthTotal(deductionItems); // Keep original sign

                    const avgPercentage = totalPatientRevenue > 0 ? (totalDeductions / totalPatientRevenue) * 100 : 0;

                    return `12-Month Average Calculation:\nTotal Deductions: ${formatAmount(totalDeductions)}\nTotal Patient Revenue: ${formatAmount(totalPatientRevenue)}\nFormula: ${formatAmount(totalDeductions)} \u00f7 ${formatAmount(totalPatientRevenue)} \u00d7 100 = ${avgPercentage.toFixed(1)}%`;
                  })()}
                  style={{ cursor: 'pointer' }}
                  onClick={handleContractualAllowance12MonthClick}
                >
                  {(() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

                    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                    const totalDeductions = calculateGroup12MonthTotal(deductionItems); // Keep original sign

                    const avgPercentage = totalPatientRevenue > 0 ? (totalDeductions / totalPatientRevenue) * 100 : 0;

                    return avgPercentage !== 0 ? `${avgPercentage.toFixed(1)}%` : '-';
                  })()}
                </td>
                <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {/* Sparkline showing percentage trend */}
                  <Sparkline
                    data={monthHeaders.map(month => {
                      const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                      const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, month.key));

                      const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                      const contractualAdjustments = calculateGroupTotal(deductionItems, month.key); // Keep original sign

                      return patientRevenue > 0 ? (contractualAdjustments / patientRevenue) * 100 : 0;
                    })}
                    color="#e74c3c"
                    width={45}
                    height={18}
                  />
                </td>
              </tr>

              {/* Salaries as a % of Patient Revenue */}
              <tr>
                <td className="indent">Salaries as a % of Patient Revenue</td>
                {monthHeaders.map(month => {
                  const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                  const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, month.key));

                  const salariesData = financialData.filter(item => item.level2 === "Salaries");
                  const salariesTotal = salariesData.reduce((sum, item) => sum + (item.monthlyAmounts[month.key] || 0), 0);

                  const percentage = patientRevenue > 0 ? (Math.abs(salariesTotal) / patientRevenue) * 100 : 0;

                  const tooltipText = `Calculation for ${month.label}:\nSalaries: ${formatAmount(Math.abs(salariesTotal))}\nPatient Revenue: ${formatAmount(patientRevenue)}\nFormula: ${formatAmount(Math.abs(salariesTotal))} \u00f7 ${formatAmount(patientRevenue)} \u00d7 100 = ${percentage.toFixed(1)}%`;

                  return (
                    <td
                      key={month.key}
                      className="amount"
                      title={tooltipText}
                      style={{ cursor: 'pointer' }}
                      onClick={() => percentage !== 0 && handleSalaryPercentageClick(month.key, month.label)}
                    >
                      {percentage !== 0 ? `${percentage.toFixed(1)}%` : '-'}
                    </td>
                  );
                })}
                <td
                  className="amount"
                  title={(() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

                    const salariesData = financialData.filter(item => item.level2 === "Salaries");
                    const totalSalaries = salariesData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

                    const avgPercentage = totalPatientRevenue > 0 ? (Math.abs(totalSalaries) / totalPatientRevenue) * 100 : 0;

                    return `12-Month Average Calculation:\nTotal Salaries: ${formatAmount(Math.abs(totalSalaries))}\nTotal Patient Revenue: ${formatAmount(totalPatientRevenue)}\nFormula: ${formatAmount(Math.abs(totalSalaries))} \u00f7 ${formatAmount(totalPatientRevenue)} \u00d7 100 = ${avgPercentage.toFixed(1)}%`;
                  })()}
                  style={{ cursor: 'pointer' }}
                  onClick={handleSalary12MonthPercentageClick}
                >
                  {(() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

                    const salariesData = financialData.filter(item => item.level2 === "Salaries");
                    const totalSalaries = salariesData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

                    const avgPercentage = totalPatientRevenue > 0 ? (Math.abs(totalSalaries) / totalPatientRevenue) * 100 : 0;

                    return avgPercentage !== 0 ? `${avgPercentage.toFixed(1)}%` : '-';
                  })()}
                </td>
                <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {/* Sparkline showing percentage trend */}
                  <Sparkline
                    data={monthHeaders.map(month => {
                      const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                      const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, month.key));

                      const salariesData = financialData.filter(item => item.level2 === "Salaries");
                      const salariesTotal = salariesData.reduce((sum, item) => sum + (item.monthlyAmounts[month.key] || 0), 0);

                      return patientRevenue > 0 ? (Math.abs(salariesTotal) / patientRevenue) * 100 : 0;
                    })}
                    color="#3498db"
                    width={45}
                    height={18}
                  />
                </td>
              </tr>

              {/* Benefits as a % of Salaries */}
              <tr>
                <td className="indent">Benefits as a % of Salaries</td>
                {monthHeaders.map(month => {
                  const salariesData = financialData.filter(item => item.level2 === "Salaries");
                  const salariesTotal = salariesData.reduce((sum, item) => sum + (item.monthlyAmounts[month.key] || 0), 0);

                  const benefitsData = financialData.filter(item => item.level2 === "Employee Benefits and Payroll Taxes");
                  const benefitsTotal = benefitsData.reduce((sum, item) => sum + (item.monthlyAmounts[month.key] || 0), 0);

                  const percentage = Math.abs(salariesTotal) > 0 ? (Math.abs(benefitsTotal) / Math.abs(salariesTotal)) * 100 : 0;

                  const tooltipText = `Calculation for ${month.label}:\nEmployee Benefits and Payroll Taxes: ${formatAmount(Math.abs(benefitsTotal))}\nSalaries: ${formatAmount(Math.abs(salariesTotal))}\nFormula: ${formatAmount(Math.abs(benefitsTotal))} \u00f7 ${formatAmount(Math.abs(salariesTotal))} \u00d7 100 = ${percentage.toFixed(1)}%`;

                  return (
                    <td
                      key={month.key}
                      className="amount"
                      title={tooltipText}
                      style={{ cursor: 'pointer' }}
                      onClick={() => percentage !== 0 && handleBenefitsPercentageClick(month.key, month.label)}
                    >
                      {percentage !== 0 ? `${percentage.toFixed(1)}%` : '-'}
                    </td>
                  );
                })}
                <td
                  className="amount"
                  title={(() => {
                    const salariesData = financialData.filter(item => item.level2 === "Salaries");
                    const totalSalaries = salariesData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

                    const benefitsData = financialData.filter(item => item.level2 === "Employee Benefits and Payroll Taxes");
                    const totalBenefits = benefitsData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

                    const avgPercentage = Math.abs(totalSalaries) > 0 ? (Math.abs(totalBenefits) / Math.abs(totalSalaries)) * 100 : 0;

                    return `12-Month Average Calculation:\nTotal Employee Benefits and Payroll Taxes: ${formatAmount(Math.abs(totalBenefits))}\nTotal Salaries: ${formatAmount(Math.abs(totalSalaries))}\nFormula: ${formatAmount(Math.abs(totalBenefits))} \u00f7 ${formatAmount(Math.abs(totalSalaries))} \u00d7 100 = ${avgPercentage.toFixed(1)}%`;
                  })()}
                  style={{ cursor: 'pointer' }}
                  onClick={handleBenefits12MonthPercentageClick}
                >
                  {(() => {
                    const salariesData = financialData.filter(item => item.level2 === "Salaries");
                    const totalSalaries = salariesData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

                    const benefitsData = financialData.filter(item => item.level2 === "Employee Benefits and Payroll Taxes");
                    const totalBenefits = benefitsData.reduce((sum, item) => sum + calculate12MonthTotal(item.monthlyAmounts), 0);

                    const avgPercentage = Math.abs(totalSalaries) > 0 ? (Math.abs(totalBenefits) / Math.abs(totalSalaries)) * 100 : 0;

                    return avgPercentage !== 0 ? `${avgPercentage.toFixed(1)}%` : '-';
                  })()}
                </td>
                <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {/* Sparkline showing percentage trend */}
                  <Sparkline
                    data={monthHeaders.map(month => {
                      const salariesData = financialData.filter(item => item.level2 === "Salaries");
                      const salariesTotal = salariesData.reduce((sum, item) => sum + (item.monthlyAmounts[month.key] || 0), 0);

                      const benefitsData = financialData.filter(item => item.level2 === "Employee Benefits and Payroll Taxes");
                      const benefitsTotal = benefitsData.reduce((sum, item) => sum + (item.monthlyAmounts[month.key] || 0), 0);

                      return Math.abs(salariesTotal) > 0 ? (Math.abs(benefitsTotal) / Math.abs(salariesTotal)) * 100 : 0;
                    })}
                    color="#9b59b6"
                    width={45}
                    height={18}
                  />
                </td>
              </tr>

              {/* Supplies as a % of Patient Revenue */}
              <tr>
                <td className="indent">Supplies as a % of Patient Revenue</td>
                {monthHeaders.map(month => {
                  const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                  const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, month.key));

                  const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                  const contractualAdjustments = calculateGroupTotal(deductionItems, month.key); // Keep original sign

                  const percentage = patientRevenue > 0 ? (contractualAdjustments / patientRevenue) * 100 : 0;

                  const tooltipText = `Calculation for ${month.label}:\nDeductions: ${formatAmount(contractualAdjustments)}\nPatient Revenue: ${formatAmount(patientRevenue)}\nFormula: ${formatAmount(contractualAdjustments)} \u00f7 ${formatAmount(patientRevenue)} \u00d7 100 = ${percentage.toFixed(1)}%`;

                  return (
                    <td
                      key={month.key}
                      className="amount"
                      title={tooltipText}
                      style={{ cursor: 'pointer' }}
                      onClick={() => percentage !== 0 && handleContractualAllowanceClick(month.key, month.label)}
                    >
                      {percentage !== 0 ? `${percentage.toFixed(1)}%` : '-'}
                    </td>
                  );
                })}
                <td
                  className="amount"
                  title={(() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

                    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                    const totalDeductions = calculateGroup12MonthTotal(deductionItems); // Keep original sign

                    const avgPercentage = totalPatientRevenue > 0 ? (totalDeductions / totalPatientRevenue) * 100 : 0;

                    return `12-Month Average Calculation:\nTotal Deductions: ${formatAmount(totalDeductions)}\nTotal Patient Revenue: ${formatAmount(totalPatientRevenue)}\nFormula: ${formatAmount(totalDeductions)} \u00f7 ${formatAmount(totalPatientRevenue)} \u00d7 100 = ${avgPercentage.toFixed(1)}%`;
                  })()}
                  style={{ cursor: 'pointer' }}
                  onClick={handleContractualAllowance12MonthClick}
                >
                  {(() => {
                    const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                    const totalPatientRevenue = Math.abs(calculateGroup12MonthTotal(patientRevenueItems));

                    const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                    const totalDeductions = calculateGroup12MonthTotal(deductionItems); // Keep original sign

                    const avgPercentage = totalPatientRevenue > 0 ? (totalDeductions / totalPatientRevenue) * 100 : 0;

                    return avgPercentage !== 0 ? `${avgPercentage.toFixed(1)}%` : '-';
                  })()}
                </td>
                <td className="sparkline-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {/* Sparkline showing percentage trend */}
                  <Sparkline
                    data={monthHeaders.map(month => {
                      const patientRevenueItems = groupedByMajor["PATIENT REVENUE"] || [];
                      const patientRevenue = Math.abs(calculateGroupTotal(patientRevenueItems, month.key));

                      const deductionItems = groupedByMajor["DEDUCTIONS"] || [];
                      const contractualAdjustments = calculateGroupTotal(deductionItems, month.key); // Keep original sign

                      return patientRevenue > 0 ? (contractualAdjustments / patientRevenue) * 100 : 0;
                    })}
                    color="#e74c3c"
                    width={45}
                    height={18}
                  />
                </td>
              </tr>

            </tbody>
          </table>
        </div>

        <div className="statement-footer">
          <p className="note">* The accompanying financial statements are presented for management discussion and analysis purposes and remain subject to audit</p>
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
                    const amount = transaction.amt;

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

      {/* Calculation Modal */}
      {showCalculationModal && calculationDetails && (
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
          zIndex: 1001
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '25px',
              borderBottom: '2px solid #1abc9c',
              paddingBottom: '15px'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.4em',
                color: '#2c5364'
              }}>
                Calculation Details
              </h2>
              <button
                onClick={closeCalculationModal}
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

            {/* Calculation Content */}
            <div style={{ fontSize: '16px', lineHeight: '1.6' }}>
              <h3 style={{
                color: '#2c5364',
                marginBottom: '20px',
                fontSize: '1.2em'
              }}>
                {calculationDetails.title}
              </h3>

              <div style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#1abc9c' }}>Numerator:</strong>
                <div style={{ marginLeft: '20px', color: '#555' }}>
                  {calculationDetails.numerator}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#1abc9c' }}>Denominator:</strong>
                <div style={{ marginLeft: '20px', color: '#555' }}>
                  {calculationDetails.denominator}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <strong style={{ color: '#1abc9c' }}>Formula:</strong>
                <div style={{
                  marginLeft: '20px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  backgroundColor: '#f5f5f5',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}>
                  {calculationDetails.calculation}
                </div>
              </div>

              <div style={{
                textAlign: 'center',
                padding: '15px',
                backgroundColor: '#e8f8f5',
                borderRadius: '8px',
                border: '2px solid #1abc9c'
              }}>
                <strong style={{
                  fontSize: '1.3em',
                  color: '#2c5364'
                }}>
                  Result: {calculationDetails.result}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendedIS2;
