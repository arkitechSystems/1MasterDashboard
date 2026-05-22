import React, { useState, useEffect } from 'react';
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
  "Dept Desc": string;
  "glj_date": number | string;
  "glj_memo": string;
  "glj_reference": string;
  "glj_journal": string;
  "FY": number | string;
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

const MDA: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const { availableMonths } = useAvailableMonths();
  const [financialData, setFinancialData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [departments, setDepartments] = useState<string[]>([]);
  const [rawGLData, setRawGLData] = useState<GLRecord[]>([]);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [comparisonMode, setComparisonMode] = useState<'prior-month' | 'prior-year'>('prior-month');
  const [periodType, setPeriodType] = useState<'MTD' | 'YTD'>('MTD');

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

  const getAmountClassNoColor = (): string => {
    return 'amount';
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

        const rawData: GLRecord[] = await response.json();

        // Extract unique departments only on first load
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

        const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);

        // Calculate comparison month based on mode
        let comparisonMonthIndex: number;
        if (comparisonMode === 'prior-month') {
          comparisonMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;
        } else {
          // Prior year - same month, one year earlier
          const [year, month] = selectedMonth.split('-').map(Number);
          const priorYear = year - 1;
          const priorYearMonthStr = `${priorYear}-${String(month).padStart(2, '0')}`;
          comparisonMonthIndex = availableMonths.findIndex(m => m.value === priorYearMonthStr);
          if (comparisonMonthIndex === -1) comparisonMonthIndex = 0; // Fallback if not found
        }

        const currentMonthME = availableMonths[selectedMonthIndex].meValue;
        const priorMonthME = availableMonths[comparisonMonthIndex].meValue;

        // Get fiscal year for the selected month
        const currentFY = rawData.find(r => {
          const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
          return meValue === currentMonthME;
        })?.FY;

        // Get prior fiscal year
        const priorFY = rawData.find(r => {
          const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
          return meValue === priorMonthME;
        })?.FY;

        const grouped: { [key: string]: GroupedData } = {};

        // First pass: build complete structure from all departments
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

        // Second pass: populate amounts for selected department
        rawData.forEach(record => {
          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const typeValue = record.Type;
          const recordFY = typeof record.FY === 'string' ? parseFloat(record.FY) : record.FY;
          const recordDate = typeof record.glj_date === 'string' ? parseFloat(record.glj_date) : record.glj_date;

          // Filter by department if selected
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

            // MTD mode: match exact month
            if (periodType === 'MTD') {
              if (meValue === currentMonthME) {
                grouped[key].currentMonth += amount;
              } else if (meValue === priorMonthME) {
                grouped[key].priorMonth += amount;
              }
            }
            // YTD mode: sum all transactions in fiscal year up to selected month end date
            else {
              // Current month: sum all in current FY up to selected month
              if (recordFY === currentFY && meValue <= currentMonthME) {
                grouped[key].currentMonth += amount;
              }

              // Prior month logic depends on comparison mode
              if (comparisonMode === 'prior-month') {
                // For prior month benchmark in YTD mode: sum all in current FY up to prior month
                if (recordFY === currentFY && meValue <= priorMonthME) {
                  grouped[key].priorMonth += amount;
                }
              } else {
                // For prior year benchmark in YTD mode: sum all in prior FY up to same month as current
                if (recordFY === priorFY && meValue <= priorMonthME) {
                  grouped[key].priorMonth += amount;
                }
              }
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
        setRawGLData(rawData); // Store raw data for drill-down
        setLoading(false);
      } catch (error) {
        console.error('Error loading financial data:', error);
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [selectedMonth, selectedDepartment, comparisonMode, periodType]);

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

  const groupedByMajor: { [key: string]: GroupedData[] } = {};
  financialData.forEach(item => {
    if (!groupedByMajor[item.level1]) {
      groupedByMajor[item.level1] = [];
    }
    groupedByMajor[item.level1].push(item);
  });

  const calculateGroupTotal = (items: GroupedData[], column: 'currentMonth' | 'priorMonth' | 'budget'): number => {
    return items.reduce((sum, item) => sum + item[column], 0);
  };

  const selectedMonthLabel = availableMonths.find(m => m.value === selectedMonth)?.label || '';

  // Calculate comparison month label based on mode
  let comparisonMonthLabel: string;
  const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);
  if (comparisonMode === 'prior-month') {
    const priorMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;
    comparisonMonthLabel = availableMonths[priorMonthIndex]?.label || '';
  } else {
    const [year, month] = selectedMonth.split('-').map(Number);
    const priorYear = year - 1;
    const priorYearMonthStr = `${priorYear}-${String(month).padStart(2, '0')}`;
    comparisonMonthLabel = availableMonths.find(m => m.value === priorYearMonthStr)?.label || '';
  }

  // Calculate prior year same month
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
  const priorYearMonthStr = `${selectedYear - 1}-${String(selectedMonthNum).padStart(2, '0')}`;
  const priorYearMonthLabel = availableMonths.find(m => m.value === priorYearMonthStr)?.label || '';

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

  // Handle clicking on Current Month amount to drill down to transactions
  const handleAmountClick = (level1: string, level2: string) => {
    const monthData = availableMonths.find(m => m.value === selectedMonth);
    if (!monthData) return;

    const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);
    const currentMonthME = availableMonths[selectedMonthIndex].meValue;

    // Get fiscal year for YTD mode
    const currentFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === currentMonthME;
    })?.FY;

    // Filter transactions for this specific cell
    const cellTransactions = rawGLData.filter(record => {
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const recordFY = typeof record.FY === 'string' ? parseFloat(record.FY) : record.FY;

      // MTD mode: match exact month; YTD mode: sum all transactions in fiscal year up to selected month
      const matchesMonth = periodType === 'MTD'
        ? meValue === currentMonthME
        : (recordFY === currentFY && meValue <= currentMonthME);

      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = level2 === '' ? true : record["FS_Sub_Group "] === level2;
      const matchesDept = selectedDepartment === 'All' || record["Dept Desc"] === selectedDepartment;
      const typeValue = record.Type;
      const validType = ![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null;

      return matchesMonth && matchesLevel1 && matchesLevel2 && matchesDept && validType;
    });

    // Calculate total
    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      const majorGroupsToReverse = ["PATIENT REVENUE", "OTHER REVENUE", "NONOPERATING INCOME(LOSS)"];
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
      month: selectedMonth,
      monthLabel: selectedMonthLabel,
      transactions: cellTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Handle clicking on Prior Month amount to drill down to transactions
  const handlePriorMonthClick = (level1: string, level2: string) => {
    const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);

    // Calculate comparison month based on mode
    let comparisonMonthIndex: number;
    let comparisonMonthData: typeof availableMonths[0] | undefined;

    if (comparisonMode === 'prior-month') {
      comparisonMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;
      comparisonMonthData = availableMonths[comparisonMonthIndex];
    } else {
      // Prior year - same month, one year earlier
      const [year, month] = selectedMonth.split('-').map(Number);
      const priorYear = year - 1;
      const priorYearMonthStr = `${priorYear}-${String(month).padStart(2, '0')}`;
      comparisonMonthData = availableMonths.find(m => m.value === priorYearMonthStr);
    }

    if (!comparisonMonthData) return;
    const priorMonthME = comparisonMonthData.meValue;

    // Get fiscal years for YTD mode
    const selectedMonthIndex2 = availableMonths.findIndex(m => m.value === selectedMonth);
    const currentMonthME2 = availableMonths[selectedMonthIndex2].meValue;

    const currentFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === currentMonthME2;
    })?.FY;

    const priorFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === priorMonthME;
    })?.FY;

    // Filter transactions for this specific cell
    const cellTransactions = rawGLData.filter(record => {
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const recordFY = typeof record.FY === 'string' ? parseFloat(record.FY) : record.FY;

      // MTD mode: match exact month
      let matchesMonth: boolean;
      if (periodType === 'MTD') {
        matchesMonth = meValue === priorMonthME;
      } else {
        // YTD mode: logic depends on comparison mode
        if (comparisonMode === 'prior-month') {
          // For prior month benchmark in YTD: sum all in current FY up to prior month
          matchesMonth = recordFY === currentFY && meValue <= priorMonthME;
        } else {
          // For prior year benchmark in YTD: sum all in prior FY up to same month
          matchesMonth = recordFY === priorFY && meValue <= priorMonthME;
        }
      }

      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = level2 === '' ? true : record["FS_Sub_Group "] === level2;
      const matchesDept = selectedDepartment === 'All' || record["Dept Desc"] === selectedDepartment;
      const typeValue = record.Type;
      const validType = ![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null;

      return matchesMonth && matchesLevel1 && matchesLevel2 && matchesDept && validType;
    });

    // Calculate total
    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      const majorGroupsToReverse = ["PATIENT REVENUE", "OTHER REVENUE", "NONOPERATING INCOME(LOSS)"];
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
      month: comparisonMonthData.value,
      monthLabel: comparisonMonthData.label,
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

  // Get department details for a specific subgroup
  const getDepartmentDetails = (level1: string, level2: string) => {
    interface DepartmentData {
      department: string;
      currentMonth: number;
      priorMonth: number;
      budget: number;
    }

    const departmentData: { [key: string]: DepartmentData } = {};

    const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);

    // Calculate comparison month based on mode
    let comparisonMonthIndex: number;
    if (comparisonMode === 'prior-month') {
      comparisonMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;
    } else {
      // Prior year - same month, one year earlier
      const [year, month] = selectedMonth.split('-').map(Number);
      const priorYear = year - 1;
      const priorYearMonthStr = `${priorYear}-${String(month).padStart(2, '0')}`;
      comparisonMonthIndex = availableMonths.findIndex(m => m.value === priorYearMonthStr);
      if (comparisonMonthIndex === -1) comparisonMonthIndex = 0; // Fallback if not found
    }

    const currentMonthME = availableMonths[selectedMonthIndex].meValue;
    const priorMonthME = availableMonths[comparisonMonthIndex].meValue;

    // Get fiscal years
    const currentFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === currentMonthME;
    })?.FY;

    const priorFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === priorMonthME;
    })?.FY;

    rawGLData.forEach(record => {
      if (record["FS_Major_Group"] === level1 && record["FS_Sub_Group "] === level2) {
        const department = record["Dept Desc"] || 'Unknown';
        const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
        const recordFY = typeof record.FY === 'string' ? parseFloat(record.FY) : record.FY;
        let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

        if (isNaN(amount)) return;

        const majorGroupsToReverse = ["PATIENT REVENUE", "OTHER REVENUE", "NONOPERATING INCOME(LOSS)"];
        if (majorGroupsToReverse.includes(level1)) {
          amount = -amount;
        }

        if (!departmentData[department]) {
          departmentData[department] = {
            department,
            currentMonth: 0,
            priorMonth: 0,
            budget: 0
          };
        }

        // MTD mode: match exact month
        if (periodType === 'MTD') {
          if (meValue === currentMonthME) {
            departmentData[department].currentMonth += amount;
          } else if (meValue === priorMonthME) {
            departmentData[department].priorMonth += amount;
          }
        }
        // YTD mode: sum all transactions in fiscal year up to selected month end date
        else {
          // Current month: sum all in current FY up to selected month
          if (recordFY === currentFY && meValue <= currentMonthME) {
            departmentData[department].currentMonth += amount;
          }

          // Prior month logic depends on comparison mode
          if (comparisonMode === 'prior-month') {
            // For prior month benchmark in YTD mode: sum all in current FY up to prior month
            if (recordFY === currentFY && meValue <= priorMonthME) {
              departmentData[department].priorMonth += amount;
            }
          } else {
            // For prior year benchmark in YTD mode: sum all in prior FY up to same month as current
            if (recordFY === priorFY && meValue <= priorMonthME) {
              departmentData[department].priorMonth += amount;
            }
          }
        }
      }
    });

    return Object.values(departmentData).sort((a, b) => a.department.localeCompare(b.department));
  };

  // Handle clicking on a department amount to drill down to transactions
  const handleDepartmentClick = (level1: string, level2: string, department: string) => {
    const monthData = availableMonths.find(m => m.value === selectedMonth);
    if (!monthData) return;

    const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);
    const currentMonthME = availableMonths[selectedMonthIndex].meValue;

    // Get fiscal year for YTD mode
    const currentFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === currentMonthME;
    })?.FY;

    // Filter transactions for this specific cell
    const cellTransactions = rawGLData.filter(record => {
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const recordFY = typeof record.FY === 'string' ? parseFloat(record.FY) : record.FY;

      // MTD mode: match exact month; YTD mode: sum all transactions in fiscal year up to selected month
      const matchesMonth = periodType === 'MTD'
        ? meValue === currentMonthME
        : (recordFY === currentFY && meValue <= currentMonthME);

      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = record["FS_Sub_Group "] === level2;
      const matchesDept = record["Dept Desc"] === department;
      const typeValue = record.Type;
      const validType = ![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null;

      return matchesMonth && matchesLevel1 && matchesLevel2 && matchesDept && validType;
    });

    // Calculate total
    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      const majorGroupsToReverse = ["PATIENT REVENUE", "OTHER REVENUE", "NONOPERATING INCOME(LOSS)"];
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
      level2: `${level2} - ${department}`,
      month: selectedMonth,
      monthLabel: selectedMonthLabel,
      transactions: cellTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Handle clicking on a department prior month amount to drill down to transactions
  const handleDepartmentPriorMonthClick = (level1: string, level2: string, department: string) => {
    const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);

    // Calculate comparison month based on mode
    let comparisonMonthIndex: number;
    let comparisonMonthData: typeof availableMonths[0] | undefined;

    if (comparisonMode === 'prior-month') {
      comparisonMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;
      comparisonMonthData = availableMonths[comparisonMonthIndex];
    } else {
      // Prior year - same month, one year earlier
      const [year, month] = selectedMonth.split('-').map(Number);
      const priorYear = year - 1;
      const priorYearMonthStr = `${priorYear}-${String(month).padStart(2, '0')}`;
      comparisonMonthData = availableMonths.find(m => m.value === priorYearMonthStr);
    }

    if (!comparisonMonthData) return;
    const priorMonthME = comparisonMonthData.meValue;

    // Get fiscal years for YTD mode
    const selectedMonthIndex2 = availableMonths.findIndex(m => m.value === selectedMonth);
    const currentMonthME2 = availableMonths[selectedMonthIndex2].meValue;

    const currentFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === currentMonthME2;
    })?.FY;

    const priorFY = rawGLData.find(r => {
      const meValue = typeof r.ME === 'string' ? parseFloat(r.ME) : r.ME;
      return meValue === priorMonthME;
    })?.FY;

    // Filter transactions for this specific cell
    const cellTransactions = rawGLData.filter(record => {
      const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
      const recordFY = typeof record.FY === 'string' ? parseFloat(record.FY) : record.FY;

      // MTD mode: match exact month
      let matchesMonth: boolean;
      if (periodType === 'MTD') {
        matchesMonth = meValue === priorMonthME;
      } else {
        // YTD mode: logic depends on comparison mode
        if (comparisonMode === 'prior-month') {
          // For prior month benchmark in YTD: sum all in current FY up to prior month
          matchesMonth = recordFY === currentFY && meValue <= priorMonthME;
        } else {
          // For prior year benchmark in YTD: sum all in prior FY up to same month
          matchesMonth = recordFY === priorFY && meValue <= priorMonthME;
        }
      }

      const matchesLevel1 = record["FS_Major_Group"] === level1;
      const matchesLevel2 = record["FS_Sub_Group "] === level2;
      const matchesDept = record["Dept Desc"] === department;
      const typeValue = record.Type;
      const validType = ![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null;

      return matchesMonth && matchesLevel1 && matchesLevel2 && matchesDept && validType;
    });

    // Calculate total
    const total = cellTransactions.reduce((sum, record) => {
      let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

      const majorGroupsToReverse = ["PATIENT REVENUE", "OTHER REVENUE", "NONOPERATING INCOME(LOSS)"];
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
      level2: `${level2} - ${department}`,
      month: comparisonMonthData.value,
      monthLabel: comparisonMonthData.label,
      transactions: cellTransactions,
      total
    });
    setShowDrillDown(true);
  };

  // Export full income statement to Excel
  const exportFullIncomeStatement = () => {
    // Generate filename based on selected month
    const filename = `MD&A - ${selectedMonthLabel}`;

    // Prepare data for Excel export
    const excelData: any[] = [];

    // Add data rows grouped by major groups
    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      // Add section header
      const sectionRow: any = { LineItem: majorGroup };
      sectionRow['Current Month'] = '';
      sectionRow[comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'] = '';
      sectionRow['Variance'] = '';
      sectionRow['Variance %'] = '';
      excelData.push(sectionRow);

      // Add detail lines
      items.forEach(item => {
        const priorMonthVariance = item.currentMonth - item.priorMonth;
        const priorMonthVariancePercent = item.priorMonth !== 0
          ? ((item.currentMonth - item.priorMonth) / Math.abs(item.priorMonth)) * 100
          : 0;

        const dataRow: any = { LineItem: `  ${item.level2}` }; // Indent sub-items
        dataRow['Current Month'] = item.currentMonth !== 0 ? item.currentMonth : '';
        dataRow[comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'] = item.priorMonth !== 0 ? item.priorMonth : '';
        dataRow['Variance'] = priorMonthVariance !== 0 ? priorMonthVariance : '';
        dataRow['Variance %'] = priorMonthVariancePercent !== 0 ? `${priorMonthVariancePercent.toFixed(1)}%` : '';
        excelData.push(dataRow);
      });

      // Add group total
      const totalRow: any = { LineItem: `Total ${majorGroup}` };
      const currentTotal = calculateGroupTotal(items, 'currentMonth');
      const priorTotal = calculateGroupTotal(items, 'priorMonth');
      const variance = currentTotal - priorTotal;
      const variancePercent = priorTotal !== 0 ? (variance / Math.abs(priorTotal)) * 100 : 0;

      totalRow['Current Month'] = currentTotal !== 0 ? currentTotal : '';
      totalRow[comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'] = priorTotal !== 0 ? priorTotal : '';
      totalRow['Variance'] = variance !== 0 ? variance : '';
      totalRow['Variance %'] = variancePercent !== 0 ? `${variancePercent.toFixed(1)}%` : '';
      excelData.push(totalRow);

      // Add empty row for spacing
      const emptyRow: any = { LineItem: '' };
      emptyRow['Current Month'] = '';
      emptyRow[comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'] = '';
      emptyRow['Variance'] = '';
      emptyRow['Variance %'] = '';
      excelData.push(emptyRow);
    });

    // Add Net Position row
    const currentNetPosition = financialData.reduce((sum, item) => sum + item.currentMonth, 0);
    const priorNetPosition = financialData.reduce((sum, item) => sum + item.priorMonth, 0);
    const netPositionVariance = currentNetPosition - priorNetPosition;
    const netPositionVariancePercent = priorNetPosition !== 0 ? (netPositionVariance / Math.abs(priorNetPosition)) * 100 : 0;

    const netPositionRow: any = { LineItem: 'Increase (Decrease) in Net Position' };
    netPositionRow['Current Month'] = currentNetPosition;
    netPositionRow[comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'] = priorNetPosition;
    netPositionRow['Variance'] = netPositionVariance;
    netPositionRow['Variance %'] = `${netPositionVariancePercent.toFixed(1)}%`;
    excelData.push(netPositionRow);

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 40 }, // Line Item column
      { wch: 18 }, // Current Month
      { wch: 18 }, // Prior Month/Year
      { wch: 18 }, // Variance
      { wch: 15 }  // Variance %
    ];
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MD&A');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export full income statement to PDF
  const exportFullIncomeStatementPDF = () => {
    const filename = `MD&A - ${selectedMonthLabel}`;
    const doc = new jsPDF('landscape');

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MD&A', 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${selectedMonthLabel}`, 14, 22);
    doc.text(`Department: ${selectedDepartment}`, 14, 28);

    // Prepare table data
    const tableData: any[] = [];

    // Add data rows grouped by major groups
    Object.entries(groupedByMajor).forEach(([majorGroup, items]) => {
      // Add section header
      tableData.push([
        { content: majorGroup, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        '', '', '', ''
      ]);

      // Add detail lines
      items.forEach(item => {
        const priorMonthVariance = item.currentMonth - item.priorMonth;
        const priorMonthVariancePercent = item.priorMonth !== 0
          ? ((item.currentMonth - item.priorMonth) / Math.abs(item.priorMonth)) * 100
          : 0;

        tableData.push([
          `  ${item.level2}`,
          item.currentMonth !== 0 ? formatAmount(item.currentMonth) : '-',
          item.priorMonth !== 0 ? formatAmount(item.priorMonth) : '-',
          priorMonthVariance !== 0 ? formatAmount(priorMonthVariance) : '-',
          priorMonthVariancePercent !== 0 ? `${priorMonthVariancePercent.toFixed(1)}%` : '-'
        ]);
      });

      // Add group total
      const currentTotal = calculateGroupTotal(items, 'currentMonth');
      const priorTotal = calculateGroupTotal(items, 'priorMonth');
      const variance = currentTotal - priorTotal;
      const variancePercent = priorTotal !== 0 ? (variance / Math.abs(priorTotal)) * 100 : 0;

      tableData.push([
        { content: `Total ${majorGroup}`, styles: { fontStyle: 'bold' } },
        { content: currentTotal !== 0 ? formatAmount(currentTotal) : '-', styles: { fontStyle: 'bold' } },
        { content: priorTotal !== 0 ? formatAmount(priorTotal) : '-', styles: { fontStyle: 'bold' } },
        { content: variance !== 0 ? formatAmount(variance) : '-', styles: { fontStyle: 'bold' } },
        { content: variancePercent !== 0 ? `${variancePercent.toFixed(1)}%` : '-', styles: { fontStyle: 'bold' } }
      ]);

      // Add empty row for spacing
      tableData.push(['', '', '', '', '']);
    });

    // Add Net Position row
    const currentNetPosition = financialData.reduce((sum, item) => sum + item.currentMonth, 0);
    const priorNetPosition = financialData.reduce((sum, item) => sum + item.priorMonth, 0);
    const netPositionVariance = currentNetPosition - priorNetPosition;
    const netPositionVariancePercent = priorNetPosition !== 0 ? (netPositionVariance / Math.abs(priorNetPosition)) * 100 : 0;

    tableData.push([
      { content: 'Increase (Decrease) in Net Position', styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } },
      { content: formatAmount(currentNetPosition), styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } },
      { content: formatAmount(priorNetPosition), styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } },
      { content: formatAmount(netPositionVariance), styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } },
      { content: `${netPositionVariancePercent.toFixed(1)}%`, styles: { fontStyle: 'bold', fillColor: [220, 240, 255] } }
    ]);

    // Generate table
    autoTable(doc, {
      head: [[
        'Line Item',
        `Current Month\n${selectedMonthLabel}`,
        `${comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'}\n${comparisonMonthLabel}`,
        'Variance',
        'Variance %'
      ]],
      body: tableData,
      startY: 35,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40, halign: 'right' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' }
      }
    });

    // Save PDF
    doc.save(`${filename}.pdf`);
  };

  // Export transactions to Excel
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

  return (
    <div className="income-statement">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h1 style={{ margin: 0 }}>MD&A</h1>
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
        <div className="statement-header">
          <div className="filter-container" style={{ margin: '5px 0', display: 'flex', gap: '20px', alignItems: 'center' }}>
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
              <label htmlFor="comparison-mode" style={{ marginRight: '10px', fontWeight: 'bold' }}>
                Benchmark:
              </label>
              <select
                id="comparison-mode"
                value={comparisonMode}
                onChange={(e) => setComparisonMode(e.target.value as 'prior-month' | 'prior-year')}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                <option value="prior-month">Prior Month</option>
                <option value="prior-year">Prior Year</option>
              </select>
            </div>

            <div>
              <label htmlFor="period-type" style={{ marginRight: '10px', fontWeight: 'bold' }}>
                MTD/YTD:
              </label>
              <select
                id="period-type"
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as 'MTD' | 'YTD')}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                <option value="MTD">MTD</option>
                <option value="YTD">YTD</option>
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
        </div>

        <div className="table-wrapper">
          <table className="income-statement-table">
            <thead>
              <tr>
                <th className="line-item">Line Item</th>
                <th className="amount">Current Month<br /><small>{selectedMonthLabel}</small></th>
                <th className="amount">{comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'}<br /><small>{comparisonMonthLabel}</small></th>
                <th className="amount" style={{ width: '100px' }}>{comparisonMode === 'prior-month' ? 'Prior Month' : 'Prior Year'}<br /><small>Variance</small></th>
                <th className="amount" style={{ width: '65px' }}>{comparisonMode === 'prior-month' ? 'PM' : 'PY'} Variance %</th>
                <th className="amount">CM Budget<br /><small>{selectedMonthLabel}</small></th>
                <th className="amount" style={{ width: '100px' }}>Budget<br /><small>Variance</small></th>
                <th className="amount" style={{ width: '65px' }}>Budget Variance %</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedByMajor).map(([majorGroup, items]) => (
                <React.Fragment key={majorGroup}>
                  <tr className="section-header">
                    <td><strong>{majorGroup}</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>

                  {items.map((item, index) => {
                    const priorMonthVariance = item.currentMonth - item.priorMonth;
                    const priorMonthVariancePercent = item.priorMonth !== 0
                      ? ((item.currentMonth - item.priorMonth) / Math.abs(item.priorMonth)) * 100
                      : 0;
                    const budgetVariance = item.currentMonth - item.budget;
                    const budgetVariancePercent = item.budget !== 0
                      ? ((item.currentMonth - item.budget) / Math.abs(item.budget)) * 100
                      : 0;

                    const itemKey = `${item.level1}|${item.level2}`;
                    const isExpanded = expandedItems.has(itemKey);
                    const departments = selectedDepartment === 'All' ? getDepartmentDetails(item.level1, item.level2) : [];

                    return (
                      <React.Fragment key={`${majorGroup}-${index}`}>
                        <tr>
                          <td className="indent" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {selectedDepartment === 'All' && (
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
                            )}
                            {item.level2}
                          </td>
                          <td
                            className={`${getAmountClassNoColor()} ${item.currentMonth !== 0 ? 'clickable-amount' : ''}`}
                            onClick={() => item.currentMonth !== 0 && handleAmountClick(item.level1, item.level2)}
                            style={{
                              cursor: item.currentMonth !== 0 ? 'pointer' : 'default',
                              textDecoration: item.currentMonth !== 0 ? 'underline' : 'none'
                            }}
                          >
                            {formatAmount(item.currentMonth)}
                          </td>
                          <td
                            className={`${getAmountClassNoColor()} ${item.priorMonth !== 0 ? 'clickable-amount' : ''}`}
                            onClick={() => item.priorMonth !== 0 && handlePriorMonthClick(item.level1, item.level2)}
                            style={{
                              cursor: item.priorMonth !== 0 ? 'pointer' : 'default',
                              textDecoration: item.priorMonth !== 0 ? 'underline' : 'none'
                            }}
                          >
                            {formatAmount(item.priorMonth)}
                          </td>
                          <td className={getAmountClass(priorMonthVariance)}>
                            {formatAmount(priorMonthVariance)}
                          </td>
                          <td className={getAmountClass(priorMonthVariance)}>
                            {priorMonthVariancePercent !== 0 ? `${priorMonthVariancePercent.toFixed(1)}%` : '-'}
                          </td>
                          <td className={getAmountClassNoColor()}>
                            {formatAmount(item.budget)}
                          </td>
                          <td className={getAmountClass(budgetVariance)}>
                            {formatAmount(budgetVariance)}
                          </td>
                          <td className={getAmountClass(budgetVariance)}>
                            {budgetVariancePercent !== 0 ? `${budgetVariancePercent.toFixed(1)}%` : '-'}
                          </td>
                        </tr>

                        {/* Expanded Department Details */}
                        {isExpanded && departments.map((dept, deptIndex) => {
                          const deptPriorVariance = dept.currentMonth - dept.priorMonth;
                          const deptPriorVariancePercent = dept.priorMonth !== 0
                            ? ((dept.currentMonth - dept.priorMonth) / Math.abs(dept.priorMonth)) * 100
                            : 0;
                          const deptBudgetVariance = dept.currentMonth - dept.budget;
                          const deptBudgetVariancePercent = dept.budget !== 0
                            ? ((dept.currentMonth - dept.budget) / Math.abs(dept.budget)) * 100
                            : 0;

                          return (
                            <tr key={`${itemKey}-dept-${deptIndex}`} className="department-detail" style={{ backgroundColor: '#f0f0f0' }}>
                              <td className="indent" style={{ paddingLeft: '60px', fontSize: '11px', color: '#666' }}>
                                {dept.department}
                              </td>
                              <td
                                className={`${getAmountClassNoColor()} ${dept.currentMonth !== 0 ? 'clickable-amount' : ''}`}
                                onClick={() => dept.currentMonth !== 0 && handleDepartmentClick(item.level1, item.level2, dept.department)}
                                style={{
                                  fontSize: '11px',
                                  cursor: dept.currentMonth !== 0 ? 'pointer' : 'default',
                                  textDecoration: dept.currentMonth !== 0 ? 'underline' : 'none'
                                }}
                              >
                                {dept.currentMonth !== 0 ? formatAmount(dept.currentMonth) : '-'}
                              </td>
                              <td
                                className={`${getAmountClassNoColor()} ${dept.priorMonth !== 0 ? 'clickable-amount' : ''}`}
                                onClick={() => dept.priorMonth !== 0 && handleDepartmentPriorMonthClick(item.level1, item.level2, dept.department)}
                                style={{
                                  fontSize: '11px',
                                  cursor: dept.priorMonth !== 0 ? 'pointer' : 'default',
                                  textDecoration: dept.priorMonth !== 0 ? 'underline' : 'none'
                                }}
                              >
                                {dept.priorMonth !== 0 ? formatAmount(dept.priorMonth) : '-'}
                              </td>
                              <td className={getAmountClass(deptPriorVariance)} style={{ fontSize: '11px' }}>
                                {deptPriorVariance !== 0 ? formatAmount(deptPriorVariance) : '-'}
                              </td>
                              <td className={getAmountClass(deptPriorVariance)} style={{ fontSize: '11px' }}>
                                {deptPriorVariancePercent !== 0 ? `${deptPriorVariancePercent.toFixed(1)}%` : '-'}
                              </td>
                              <td className={getAmountClassNoColor()} style={{ fontSize: '11px' }}>
                                {dept.budget !== 0 ? formatAmount(dept.budget) : '-'}
                              </td>
                              <td className={getAmountClass(deptBudgetVariance)} style={{ fontSize: '11px' }}>
                                {deptBudgetVariance !== 0 ? formatAmount(deptBudgetVariance) : '-'}
                              </td>
                              <td className={getAmountClass(deptBudgetVariance)} style={{ fontSize: '11px' }}>
                                {deptBudgetVariancePercent !== 0 ? `${deptBudgetVariancePercent.toFixed(1)}%` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <tr className="subtotal">
                    <td><strong>Total {majorGroup}</strong></td>
                    <td
                      className={`${getAmountClassNoColor()} ${calculateGroupTotal(items, 'currentMonth') !== 0 ? 'clickable-amount' : ''}`}
                      onClick={() => calculateGroupTotal(items, 'currentMonth') !== 0 && handleAmountClick(majorGroup, '')}
                      style={{
                        cursor: calculateGroupTotal(items, 'currentMonth') !== 0 ? 'pointer' : 'default',
                        textDecoration: calculateGroupTotal(items, 'currentMonth') !== 0 ? 'underline' : 'none'
                      }}
                    >
                      <strong>{formatAmount(calculateGroupTotal(items, 'currentMonth'))}</strong>
                    </td>
                    <td
                      className={`${getAmountClassNoColor()} ${calculateGroupTotal(items, 'priorMonth') !== 0 ? 'clickable-amount' : ''}`}
                      onClick={() => calculateGroupTotal(items, 'priorMonth') !== 0 && handlePriorMonthClick(majorGroup, '')}
                      style={{
                        cursor: calculateGroupTotal(items, 'priorMonth') !== 0 ? 'pointer' : 'default',
                        textDecoration: calculateGroupTotal(items, 'priorMonth') !== 0 ? 'underline' : 'none'
                      }}
                    >
                      <strong>{formatAmount(calculateGroupTotal(items, 'priorMonth'))}</strong>
                    </td>
                    <td className={getAmountClass(calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'priorMonth'))}>
                      <strong>{formatAmount(calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'priorMonth'))}</strong>
                    </td>
                    <td className={getAmountClass(calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'priorMonth'))}>
                      <strong>
                        {(() => {
                          const variance = calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'priorMonth');
                          const priorTotal = calculateGroupTotal(items, 'priorMonth');
                          const variancePercent = priorTotal !== 0 ? (variance / Math.abs(priorTotal)) * 100 : 0;
                          return variancePercent !== 0 ? `${variancePercent.toFixed(1)}%` : '-';
                        })()}
                      </strong>
                    </td>
                    <td className={getAmountClassNoColor()}>
                      <strong>{formatAmount(calculateGroupTotal(items, 'budget'))}</strong>
                    </td>
                    <td className={getAmountClass(calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'budget'))}>
                      <strong>{formatAmount(calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'budget'))}</strong>
                    </td>
                    <td className={getAmountClass(calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'budget'))}>
                      <strong>
                        {(() => {
                          const variance = calculateGroupTotal(items, 'currentMonth') - calculateGroupTotal(items, 'budget');
                          const budgetTotal = calculateGroupTotal(items, 'budget');
                          const variancePercent = budgetTotal !== 0 ? (variance / Math.abs(budgetTotal)) * 100 : 0;
                          return variancePercent !== 0 ? `${variancePercent.toFixed(1)}%` : '-';
                        })()}
                      </strong>
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              <tr className="net-income">
                <td><strong>Increase (Decrease) in Net Position</strong></td>
                <td
                  className={`${getAmountClassNoColor()} clickable-amount`}
                  onClick={() => handleAmountClick('All Accounts', 'Net Position Change')}
                  style={{
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  <strong>{formatAmount(financialData.reduce((sum, item) => sum + item.currentMonth, 0))}</strong>
                </td>
                <td
                  className={`${getAmountClassNoColor()} clickable-amount`}
                  onClick={() => handlePriorMonthClick('All Accounts', 'Net Position Change')}
                  style={{
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  <strong>{formatAmount(financialData.reduce((sum, item) => sum + item.priorMonth, 0))}</strong>
                </td>
                <td className={getAmountClass(financialData.reduce((sum, item) => sum + item.currentMonth, 0) - financialData.reduce((sum, item) => sum + item.priorMonth, 0))}>
                  <strong>{formatAmount(financialData.reduce((sum, item) => sum + item.currentMonth, 0) - financialData.reduce((sum, item) => sum + item.priorMonth, 0))}</strong>
                </td>
                <td className={getAmountClass(financialData.reduce((sum, item) => sum + item.currentMonth, 0) - financialData.reduce((sum, item) => sum + item.priorMonth, 0))}>
                  <strong>
                    {(() => {
                      const currentTotal = financialData.reduce((sum, item) => sum + item.currentMonth, 0);
                      const priorTotal = financialData.reduce((sum, item) => sum + item.priorMonth, 0);
                      const variance = currentTotal - priorTotal;
                      const variancePercent = priorTotal !== 0 ? (variance / Math.abs(priorTotal)) * 100 : 0;
                      return variancePercent !== 0 ? `${variancePercent.toFixed(1)}%` : '-';
                    })()}
                  </strong>
                </td>
                <td className={getAmountClassNoColor()}>
                  <strong>{formatAmount(financialData.reduce((sum, item) => sum + item.budget, 0))}</strong>
                </td>
                <td className={getAmountClass(financialData.reduce((sum, item) => sum + item.currentMonth, 0) - financialData.reduce((sum, item) => sum + item.budget, 0))}>
                  <strong>{formatAmount(financialData.reduce((sum, item) => sum + item.currentMonth, 0) - financialData.reduce((sum, item) => sum + item.budget, 0))}</strong>
                </td>
                <td className={getAmountClass(financialData.reduce((sum, item) => sum + item.currentMonth, 0) - financialData.reduce((sum, item) => sum + item.budget, 0))}>
                  <strong>
                    {(() => {
                      const currentTotal = financialData.reduce((sum, item) => sum + item.currentMonth, 0);
                      const budgetTotal = financialData.reduce((sum, item) => sum + item.budget, 0);
                      const variance = currentTotal - budgetTotal;
                      const variancePercent = budgetTotal !== 0 ? (variance / Math.abs(budgetTotal)) * 100 : 0;
                      return variancePercent !== 0 ? `${variancePercent.toFixed(1)}%` : '-';
                    })()}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="statement-footer" style={{ marginTop: '30px' }}>
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

export default MDA;