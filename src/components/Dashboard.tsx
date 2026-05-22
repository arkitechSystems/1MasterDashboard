import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { API_ENDPOINTS } from '../config';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { useSettings } from '../contexts/SettingsContext';
import { useAvailableMonths } from '../hooks/useAvailableMonths';

interface GLRecord {
  " glj_amt ": number | string;
  "ME": number | string;
  "Type": number;
  "FS_Major_Group": string;
  "FS_Sub_Group ": string;
}

interface MonthlyTrendData {
  month: string;
  revenue: number;
  expenses: number;
  netPosition: number;
}

// Custom hook for animated numbers
const useAnimatedNumber = (endValue: number, duration: number = 2000, startDelay: number = 0) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const frameRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const startAnimation = () => {
      setIsAnimating(true);
      const animate = (currentTime: number) => {
        if (!startTimeRef.current) {
          startTimeRef.current = currentTime;
        }

        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth animation
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(endValue * easeOutCubic);

        setDisplayValue(currentValue);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    };

    const timer = setTimeout(startAnimation, startDelay);

    return () => {
      clearTimeout(timer);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [endValue, duration, startDelay]);

  return { displayValue, isAnimating };
};

const Dashboard: React.FC = () => {
  const { getDefaultMonth } = useSettings();
  const { availableMonths, loading: monthsLoading } = useAvailableMonths();
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [lastMonthExpenses, setLastMonthExpenses] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [monthlyTrendData, setMonthlyTrendData] = useState<MonthlyTrendData[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth());
  const [error, setError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isAdmissionsExpanded, setIsAdmissionsExpanded] = useState<boolean>(false);
  const [isPatientDaysExpanded, setIsPatientDaysExpanded] = useState<boolean>(false);
  const [isSurgeriesExpanded, setIsSurgeriesExpanded] = useState<boolean>(false);
  const [isERVisitsExpanded, setIsERVisitsExpanded] = useState<boolean>(false);
  const [fullScreenChart, setFullScreenChart] = useState<string | null>(null);
  const [revenueByType, setRevenueByType] = useState<Array<{name: string, value: number, percentage: number, color: string}>>([
    { name: 'Inpatient', value: 0, percentage: 0, color: '#1abc9c' },
    { name: 'Outpatient', value: 0, percentage: 0, color: '#3498db' },
    { name: 'Swing Bed', value: 0, percentage: 0, color: '#e74c3c' },
    { name: 'Retail Pharmacy', value: 0, percentage: 0, color: '#f39c12' }
  ]);
  const [expenseByType, setExpenseByType] = useState<Array<{name: string, value: number, percentage: number, color: string}>>([]);

  // Calculate revenue change percentage
  const revenueChange = ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
  const revenueIncreased = revenueChange > 0;

  // Calculate expenses change percentage
  const expensesChange = ((totalExpenses - lastMonthExpenses) / lastMonthExpenses) * 100;
  const expensesIncreased = expensesChange > 0;

  // Calculate net income change percentage
  const lastMonthNetIncome = lastMonthRevenue - lastMonthExpenses;
  const currentNetIncome = totalRevenue - totalExpenses;
  const netIncomeChange = ((currentNetIncome - lastMonthNetIncome) / Math.abs(lastMonthNetIncome)) * 100;
  const netIncomeIncreased = netIncomeChange > 0;

  // Calculate changes for first row metrics (vs last month)
  const admissionsChange = 3.2; // 3.2% increase
  const patientDaysChange = 2.8; // 2.8% increase
  const surgeriesChange = -1.5; // 1.5% decrease
  const erVisitsChange = 4.7; // 4.7% increase

  // Calculate prior year comparisons for first row metrics
  const admissionsPriorYearChange = 8.5; // 8.5% increase vs prior year
  const patientDaysPriorYearChange = 6.3; // 6.3% increase vs prior year
  const surgeriesPriorYearChange = -3.2; // 3.2% decrease vs prior year
  const erVisitsPriorYearChange = 12.4; // 12.4% increase vs prior year

  // Calculate days in selected month
  const getDaysInMonth = (monthValue: string): number => {
    const [year, month] = monthValue.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };
  const daysInMonth = getDaysInMonth(selectedMonth);

  // Animated counters for main metrics (custom timing)
  const animatedRevenue = useAnimatedNumber(totalRevenue, 775, 50);        // 50ms delay, 775ms duration = completes at 825ms
  const animatedExpenses = useAnimatedNumber(totalExpenses, 750, 125);     // 125ms delay, 750ms duration = completes at 875ms
  const animatedNetIncome = useAnimatedNumber(totalRevenue - totalExpenses, 650, 250); // 250ms delay, 650ms duration = completes at 900ms

  // Animated counters for KPI metrics (custom timing)
  const animatedAdmissions = useAnimatedNumber(192, 750, 0);    // 0ms delay, 750ms duration = completes at 750ms
  const animatedPatientDays = useAnimatedNumber(671, 750, 50);  // 50ms delay, 750ms duration = completes at 800ms
  const animatedSurgeries = useAnimatedNumber(216, 750, 100);    // 100ms delay, 750ms duration = completes at 850ms
  const animatedERVisits = useAnimatedNumber(608, 750, 150);     // 150ms delay, 750ms duration = completes at 900ms


  // Removed initial lastUpdated useEffect - will be set when data loads

  // When availableMonths loads, ensure selectedMonth is valid
  useEffect(() => {
    if (availableMonths.length === 0) return;
    const found = availableMonths.some(m => m.value === selectedMonth);
    if (!found) {
      setSelectedMonth(availableMonths[availableMonths.length - 1].value);
    }
  }, [availableMonths.length]);

  // Load revenue and expenses data based on selected month
  useEffect(() => {
    if (availableMonths.length === 0) return;
    if (!availableMonths.some(m => m.value === selectedMonth)) return;

    const loadFinancialData = async () => {
      setIsLoadingData(true);
      setError(null);

      try {
        const token = localStorage.getItem('authToken');

        if (!token) {
          throw new Error('No authentication token found');
        }

        // Fetch metadata to get the actual last modified date
        try {
          const metadataResponse = await fetch(API_ENDPOINTS.GL_METADATA, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            const lastModifiedDate = new Date(metadata.lastModified);
            setLastUpdated(`(v1.1) Last Updated: ${lastModifiedDate.toLocaleString()}`);
          }
        } catch (metadataError) {
          console.log('Could not fetch metadata, will use fallback date');
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

        const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);
        if (selectedMonthIndex === -1) return;

        const priorMonthIndex = selectedMonthIndex > 0 ? selectedMonthIndex - 1 : 0;

        const currentMonthME = availableMonths[selectedMonthIndex].meValue;
        const priorMonthME = availableMonths[priorMonthIndex].meValue;

        let currentRevenue = 0;
        let priorRevenue = 0;
        let currentExpenses = 0;
        let priorExpenses = 0;
        let inpatientRev = 0;
        let outpatientRev = 0;
        let swingBedRev = 0;
        let pharmacyRev = 0;
        const expensesBySubGroup: { [key: string]: number } = {};

        rawData.forEach(record => {
          const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
          const typeValue = record.Type;

          if (![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null) {
            let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

            if (isNaN(amount)) return;

            const majorGroup = record["FS_Major_Group"];
            const subGroup = record["FS_Sub_Group "];

            // Only include PATIENT REVENUE (exclude OTHER REVENUE)
            if (majorGroup === "PATIENT REVENUE") {
              if (meValue === currentMonthME) {
                currentRevenue += -amount;

                // Track revenue by type
                if (subGroup === "Inpatient Revenue") {
                  inpatientRev += -amount;
                } else if (subGroup === "Outpatient Revenue") {
                  outpatientRev += -amount;
                } else if (subGroup === "Swing Bed Revenue") {
                  swingBedRev += -amount;
                } else if (subGroup === "Retail Pharmacy Revenue") {
                  pharmacyRev += -amount;
                }
              } else if (meValue === priorMonthME) {
                priorRevenue += -amount;
              }
            }
            // Include OPERATING EXPENSES
            else if (majorGroup === "OPERATING EXPENSES") {
              if (meValue === currentMonthME) {
                currentExpenses += amount;

                // Track expenses by sub-group
                if (subGroup) {
                  if (!expensesBySubGroup[subGroup]) {
                    expensesBySubGroup[subGroup] = 0;
                  }
                  expensesBySubGroup[subGroup] += amount;
                }
              } else if (meValue === priorMonthME) {
                priorExpenses += amount;
              }
            }
          }
        });

        setTotalRevenue(currentRevenue);
        setLastMonthRevenue(priorRevenue);
        setTotalExpenses(currentExpenses);
        setLastMonthExpenses(priorExpenses);

        // Update revenue by type with percentages
        const totalPatientRev = inpatientRev + outpatientRev + swingBedRev + pharmacyRev;
        setRevenueByType([
          {
            name: 'Inpatient',
            value: inpatientRev,
            percentage: totalPatientRev > 0 ? (inpatientRev / totalPatientRev) * 100 : 0,
            color: '#1abc9c'
          },
          {
            name: 'Outpatient',
            value: outpatientRev,
            percentage: totalPatientRev > 0 ? (outpatientRev / totalPatientRev) * 100 : 0,
            color: '#3498db'
          },
          {
            name: 'Swing Bed',
            value: swingBedRev,
            percentage: totalPatientRev > 0 ? (swingBedRev / totalPatientRev) * 100 : 0,
            color: '#e74c3c'
          },
          {
            name: 'Retail Pharmacy',
            value: pharmacyRev,
            percentage: totalPatientRev > 0 ? (pharmacyRev / totalPatientRev) * 100 : 0,
            color: '#f39c12'
          }
        ]);

        // Update expense by type with percentages
        const expenseColors = ['#f39c12', '#9b59b6', '#95a5a6', '#e74c3c', '#3498db', '#1abc9c', '#34495e', '#e67e22'];
        const expenseArray = Object.entries(expensesBySubGroup)
          .map(([name, value], index) => ({
            name,
            value,
            percentage: currentExpenses > 0 ? (value / currentExpenses) * 100 : 0,
            color: expenseColors[index % expenseColors.length]
          }))
          .sort((a, b) => b.value - a.value); // Sort by value descending
        setExpenseByType(expenseArray);
        setRetryCount(0);
        setIsLoadingData(false);
      } catch (error) {
        console.error('Error loading financial data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setError(`Failed to load financial data: ${errorMessage}`);
        setIsLoadingData(false);
      }
    };

    loadFinancialData();
  }, [selectedMonth, retryCount, availableMonths.length]);

  useEffect(() => {
    if (availableMonths.length === 0) return;
    if (!availableMonths.some(m => m.value === selectedMonth)) return;

    const loadTrendData = async () => {
      try {
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
          throw new Error(`Failed to load trend data: ${response.status} ${response.statusText}`);
        }

        const rawData: GLRecord[] = await response.json();

        if (!Array.isArray(rawData) || rawData.length === 0) {
          throw new Error('Invalid or empty trend data received');
        }

        // Get trailing 12 months ending with selected month
        const selectedMonthIndex = availableMonths.findIndex(m => m.value === selectedMonth);
        if (selectedMonthIndex === -1) return;

        const startIndex = Math.max(0, selectedMonthIndex - 11); // Start 11 months before selected
        const endIndex = selectedMonthIndex + 1; // Include selected month
        const trailing12Months = availableMonths.slice(startIndex, endIndex);

        const monthlyData: MonthlyTrendData[] = trailing12Months.map(month => {
          let revenue = 0;
          let expenses = 0;

          rawData.forEach(record => {
            const meValue = typeof record.ME === 'string' ? parseFloat(record.ME) : record.ME;
            const typeValue = record.Type;

            if (meValue === month.meValue && ![1, 2].includes(typeValue) && record[" glj_amt "] !== "" && record[" glj_amt "] !== null) {
              let amount = typeof record[" glj_amt "] === 'string' ? parseFloat(record[" glj_amt "]) : record[" glj_amt "];

              if (isNaN(amount)) return;

              const majorGroup = record["FS_Major_Group"];

              // Only PATIENT REVENUE (exclude OTHER REVENUE)
              if (majorGroup === "PATIENT REVENUE") {
                revenue += -amount;
              }
              // Expense groups (keep positive)
              else if (majorGroup === "OPERATING EXPENSES") {
                expenses += amount;
              }
            }
          });

          return {
            month: month.label,
            revenue,
            expenses,
            netPosition: revenue - expenses
          };
        });

        setMonthlyTrendData(monthlyData);
      } catch (error) {
        console.error('Error loading trend data:', error);
        // Don't set main error state for trend data, as main metrics are more critical
        // Trend data failure is less severe and dashboard can still show KPIs
      }
    };

    loadTrendData();
  }, [selectedMonth, availableMonths.length]);

  // Scroll to top when fullscreen chart is opened
  useEffect(() => {
    if (fullScreenChart) {
      // Find the .content container and scroll it to top
      const contentElement = document.querySelector('.content');
      if (contentElement) {
        contentElement.scrollTo({ top: 0, behavior: 'smooth' });
      }
      // Also scroll window as fallback
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [fullScreenChart]);

  // Revenue and expense data now comes from state (revenueByType and expenseByType)

  // Department admissions data for the current month
  const departmentAdmissionsData = [
    { department: 'Medical', admissions: 48, color: '#3498db' },
    { department: 'Surgical', admissions: 42, color: '#e74c3c' },
    { department: 'Cardiology', admissions: 35, color: '#9b59b6' },
    { department: 'Orthopedics', admissions: 28, color: '#f39c12' },
    { department: 'Pediatrics', admissions: 22, color: '#1abc9c' },
    { department: 'Emergency', admissions: 17, color: '#e67e22' }
  ];

  // Patient days by department (using same departments as admissions)
  const departmentPatientDaysData = [
    { department: 'Medical', patientDays: 168, color: '#3498db' },
    { department: 'Surgical', patientDays: 147, color: '#e74c3c' },
    { department: 'Cardiology', patientDays: 123, color: '#9b59b6' },
    { department: 'Orthopedics', patientDays: 98, color: '#f39c12' },
    { department: 'Pediatrics', patientDays: 77, color: '#1abc9c' },
    { department: 'Emergency', patientDays: 58, color: '#e67e22' }
  ];

  // Surgeries by physician specialty
  const surgeriesBySpecialtyData = [
    { specialty: 'Cardiovascular', surgeries: 52, color: '#3498db' },
    { specialty: 'General Surgery', surgeries: 48, color: '#e74c3c' },
    { specialty: 'Orthopedic Surgery', surgeries: 42, color: '#9b59b6' },
    { specialty: 'Otolaryngology', surgeries: 28, color: '#f39c12' },
    { specialty: 'Plastic Surgery', surgeries: 24, color: '#1abc9c' },
    { specialty: 'Urology', surgeries: 22, color: '#e67e22' }
  ];

  // ER visits by financial class
  const erVisitsByFinancialClassData = [
    { financialClass: 'Medicare', visits: 182, color: '#3498db' },
    { financialClass: 'Medicaid', visits: 158, color: '#e74c3c' },
    { financialClass: 'Blue Cross', visits: 127, color: '#9b59b6' },
    { financialClass: 'Commercial', visits: 89, color: '#f39c12' },
    { financialClass: 'Self-pay', visits: 52, color: '#1abc9c' }
  ];

  const formatCurrency = (amount: number): string => {
    return `$${amount.toLocaleString()}`;
  };

  const formatAnimatedNumber = (value: number): string => {
    return value.toLocaleString();
  };

  const formatCurrencyM = (value: number): string => {
    return `$${(value / 1000000).toFixed(1)}M`;
  };

  const formatTooltip = (value: number, name: string) => {
    return [`$${(value / 1000000).toFixed(1)}M`, name];
  };

  const formatTooltipThousands = (value: number, name: string) => {
    return [`$${(value / 1000).toFixed(0)}K`, name];
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  // Export dashboard to Excel
  const exportToExcel = () => {
    const selectedMonthLabel = availableMonths.find(m => m.value === selectedMonth)?.shortLabel || selectedMonth;
    const filename = `Dashboard - ${selectedMonthLabel}`;

    // Prepare data for Excel export
    const excelData: any[] = [];

    // Add title
    excelData.push({ Section: `Key Financial Indicators - ${selectedMonthLabel}`, Value: '', Change: '' });
    excelData.push({ Section: '', Value: '', Change: '' }); // Empty row

    // Add KPI metrics
    excelData.push({ Section: 'Key Performance Indicators', Value: '', Change: '' });
    excelData.push({ Section: 'Total Admissions', Value: 192, Change: `${admissionsChange > 0 ? '+' : ''}${admissionsChange.toFixed(1)}%` });
    excelData.push({ Section: 'Total Patient Days', Value: 671, Change: `${patientDaysChange > 0 ? '+' : ''}${patientDaysChange.toFixed(1)}%` });
    excelData.push({ Section: 'Total Surgeries', Value: 216, Change: `${surgeriesChange > 0 ? '+' : ''}${surgeriesChange.toFixed(1)}%` });
    excelData.push({ Section: 'Total ER Visits', Value: 608, Change: `${erVisitsChange > 0 ? '+' : ''}${erVisitsChange.toFixed(1)}%` });
    excelData.push({ Section: '', Value: '', Change: '' }); // Empty row

    // Add financial metrics
    excelData.push({ Section: 'Financial Metrics', Value: '', Change: '' });
    excelData.push({ Section: 'Total Patient Revenue', Value: totalRevenue, Change: `${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%` });
    excelData.push({ Section: 'Total Expenses', Value: totalExpenses, Change: `${expensesChange > 0 ? '+' : ''}${expensesChange.toFixed(1)}%` });
    excelData.push({ Section: 'Net Income', Value: totalRevenue - totalExpenses, Change: `${netIncomeChange > 0 ? '+' : ''}${netIncomeChange.toFixed(1)}%` });
    excelData.push({ Section: '', Value: '', Change: '' }); // Empty row

    // Add Patient Revenue Overview with months as columns
    excelData.push({ Section: 'Patient Revenue Overview', Value: '', Change: '' });

    // Create header row with months
    const revenueOverviewHeader: any = { Section: '' };
    monthlyTrendData.forEach(item => {
      revenueOverviewHeader[item.month] = item.month;
    });
    excelData.push(revenueOverviewHeader);

    // Create revenue row
    const revenueRow: any = { Section: 'Patient Revenue' };
    monthlyTrendData.forEach(item => {
      revenueRow[item.month] = item.revenue;
    });
    excelData.push(revenueRow);

    // Create expenses row
    const expensesRow: any = { Section: 'Operating Expenses' };
    monthlyTrendData.forEach(item => {
      expensesRow[item.month] = item.expenses;
    });
    excelData.push(expensesRow);

    excelData.push({ Section: '', Value: '', Change: '' }); // Empty row

    // Add revenue breakdown
    excelData.push({ Section: 'Revenue by Type', Value: '', Change: '' });
    revenueByType.forEach(item => {
      excelData.push({ Section: item.name, Value: item.value, Change: `${item.percentage.toFixed(1)}%` });
    });
    excelData.push({ Section: '', Value: '', Change: '' }); // Empty row

    // Add expense breakdown
    excelData.push({ Section: 'Operating Expenses by Type', Value: '', Change: '' });
    expenseByType.forEach(item => {
      excelData.push({ Section: item.name, Value: item.value, Change: `${item.percentage.toFixed(1)}%` });
    });
    excelData.push({ Section: '', Value: '', Change: '' }); // Empty row

    // Add monthly trend data (vertical format for reference)
    excelData.push({ Section: 'Monthly Trend Data (Detail)', Value: '', Change: '' });
    excelData.push({ Section: 'Month', Value: 'Revenue', Change: 'Expenses', NetPosition: 'Net Position' });
    monthlyTrendData.forEach(item => {
      excelData.push({
        Section: item.month,
        Value: item.revenue,
        Change: item.expenses,
        NetPosition: item.netPosition
      });
    });

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths - need to accommodate the months as columns
    const columnWidths = [{ wch: 30 }]; // Section column
    // Add widths for each month column (if monthlyTrendData has items)
    if (monthlyTrendData.length > 0) {
      monthlyTrendData.forEach(() => columnWidths.push({ wch: 15 }));
    } else {
      // Default columns if no trend data
      columnWidths.push({ wch: 15 }, { wch: 15 }, { wch: 15 });
    }
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard');

    // Save file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  // Export dashboard to PDF
  const exportToPDF = () => {
    const selectedMonthLabel = availableMonths.find(m => m.value === selectedMonth)?.shortLabel || selectedMonth;
    const filename = `Dashboard - ${selectedMonthLabel}`;
    const doc = new jsPDF();

    // Add title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Financial Indicators', 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${selectedMonthLabel}`, 14, 22);

    let currentY = 28;

    // Add KPI metrics
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Performance Indicators', 14, currentY);
    currentY += 5;

    const kpiData = [
      ['Total Admissions', '192', `${admissionsChange > 0 ? '+' : ''}${admissionsChange.toFixed(1)}%`],
      ['Total Patient Days', '671', `${patientDaysChange > 0 ? '+' : ''}${patientDaysChange.toFixed(1)}%`],
      ['Total Surgeries', '216', `${surgeriesChange > 0 ? '+' : ''}${surgeriesChange.toFixed(1)}%`],
      ['Total ER Visits', '608', `${erVisitsChange > 0 ? '+' : ''}${erVisitsChange.toFixed(1)}%`]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Metric', 'Value', 'Change']],
      body: kpiData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold'
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // Add financial metrics
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Metrics', 14, currentY);
    currentY += 5;

    const financialData = [
      ['Total Patient Revenue', `$${totalRevenue.toLocaleString()}`, `${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%`],
      ['Total Expenses', `$${totalExpenses.toLocaleString()}`, `${expensesChange > 0 ? '+' : ''}${expensesChange.toFixed(1)}%`],
      ['Net Income', `$${(totalRevenue - totalExpenses).toLocaleString()}`, `${netIncomeChange > 0 ? '+' : ''}${netIncomeChange.toFixed(1)}%`]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Metric', 'Value', 'Change']],
      body: financialData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold'
      }
    });

    // Add page break before monthly trend data
    doc.addPage();
    currentY = 20;

    // Add monthly trend data
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Financial Performance', 14, currentY);
    currentY += 5;

    const trendData = monthlyTrendData.map(item => [
      item.month,
      `$${(item.revenue / 1000000).toFixed(1)}M`,
      `$${(item.expenses / 1000000).toFixed(1)}M`,
      `$${(item.netPosition / 1000000).toFixed(1)}M`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Month', 'Revenue', 'Expenses', 'Net Position']],
      body: trendData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold'
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // Add revenue breakdown
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Revenue by Type', 14, currentY);
    currentY += 5;

    const revenueBreakdownData = revenueByType.map(item => [
      item.name,
      `$${item.value.toLocaleString()}`,
      `${item.percentage.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Type', 'Value', 'Percentage']],
      body: revenueBreakdownData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold'
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // Add expense breakdown
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Operating Expenses by Type', 14, currentY);
    currentY += 5;

    const expenseBreakdownData = expenseByType.map(item => [
      item.name,
      `$${item.value.toLocaleString()}`,
      `${item.percentage.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Type', 'Value', 'Percentage']],
      body: expenseBreakdownData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: {
        fillColor: [44, 83, 100],
        textColor: 255,
        fontStyle: 'bold'
      }
    });

    doc.save(`${filename}.pdf`);
  };

  return (
    <main className="dashboard" role="main" aria-label="Financial Dashboard">
      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={{
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
            disabled={isLoadingData}
            aria-label={isLoadingData ? 'Retrying to load financial data' : 'Retry loading financial data'}
            aria-live="polite"
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: isLoadingData ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              opacity: isLoadingData ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              if (!isLoadingData) {
                e.currentTarget.style.background = '#dc2626';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ef4444';
            }}
          >
            {isLoadingData ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      <div className="dashboard-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0 }}>Key Financial Indicators</h1>
        <div className="dashboard-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={exportToExcel}
            className="export-btn"
            aria-label="Export dashboard data to Excel spreadsheet"
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
            onClick={exportToPDF}
            className="export-btn"
            aria-label="Export dashboard data to PDF document"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label htmlFor="dashboard-month-filter" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              Select month:
            </label>
            <select
              id="dashboard-month-filter"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                minWidth: '140px'
              }}
            >
              {availableMonths.map(month => (
                <option key={month.value} value={month.value}>
                  {month.shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <hr />

      <div className="cards-container first-row">
        <div
          className="card"
          role="button"
          tabIndex={0}
          aria-expanded={isAdmissionsExpanded}
          aria-label={`Total Admissions: ${animatedAdmissions.displayValue}. ${isAdmissionsExpanded ? 'Press Enter or Space to collapse details' : 'Press Enter or Space to view department breakdown'}`}
          style={{
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            gridColumn: isAdmissionsExpanded ? 'span 2' : 'span 1',
            overflow: 'hidden'
          }}
          onClick={() => setIsAdmissionsExpanded(!isAdmissionsExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsAdmissionsExpanded(!isAdmissionsExpanded);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Collapsed View */}
          {!isAdmissionsExpanded && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: '21px',
                  fontWeight: '500',
                  color: '#666',
                  marginBottom: '8px',
                  marginTop: '0'
                }}>
                  Total Admissions
                </p>
                <h3 style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: '#2c5364',
                  marginBottom: '12px',
                  marginTop: '0'
                }}>
                  {formatAnimatedNumber(animatedAdmissions.displayValue)}
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Month over Month Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: admissionsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {admissionsChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: admissionsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {admissionsChange > 0 ? '+' : ''}{admissionsChange.toFixed(1)}%
                      </span>
                      <span style={{
                        fontSize: '12px',
                        color: '#999'
                      }}>
                        vs last month
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        borderRadius: '4px',
                        cursor: 'help'
                      }}
                      role="status"
                      aria-label={`Average Admissions Per Day: ${(animatedAdmissions.displayValue / daysInMonth).toFixed(2)}`}
                      title="Average Admissions Per Day"
                    >
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#666'
                      }} aria-hidden="true">
                        AAPD:
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#3b82f6'
                      }} aria-hidden="true">
                        {(animatedAdmissions.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Prior Year Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span className="material-icons" style={{
                      fontSize: '16px',
                      color: admissionsPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {admissionsPriorYearChange > 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: admissionsPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {admissionsPriorYearChange > 0 ? '+' : ''}{admissionsPriorYearChange.toFixed(1)}%
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#999'
                    }}>
                      vs prior year
                    </span>
                  </div>
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-icons" style={{
                  fontSize: '24px',
                  color: '#3b82f6'
                }}>
                  local_hospital
                </span>
              </div>
            </div>
          )}

          {/* Expanded View */}
          {isAdmissionsExpanded && (
            <div style={{
              width: '100%',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              {/* Top Row - Summary Info */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '2px solid #e6ecf5'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#2c5364',
                      margin: '0'
                    }}>
                      Total Admissions: {formatAnimatedNumber(animatedAdmissions.displayValue)}
                    </h3>
                    <span className="material-icons" style={{
                      fontSize: '20px',
                      color: '#3b82f6',
                      cursor: 'pointer'
                    }}>
                      close
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: admissionsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {admissionsChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: admissionsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {admissionsChange > 0 ? '+' : ''}{admissionsChange.toFixed(1)}% vs last month
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '4px'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#666' }}>
                        AAPD:
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#3b82f6' }}>
                        {(animatedAdmissions.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div style={{ width: '100%' }}>
                <h4 style={{
                  margin: '0 0 16px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#666'
                }}>
                  Admissions by Department
                </h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentAdmissionsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} admissions`, 'Count']}
                      contentStyle={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                      }}
                    />
                    <Bar
                      dataKey="admissions"
                      fill="#3b82f6"
                      radius={[8, 8, 0, 0]}
                      animationDuration={1200}
                    >
                      {departmentAdmissionsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p style={{
                  textAlign: 'center',
                  marginTop: '12px',
                  fontSize: '13px',
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  Click anywhere to collapse
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          className="card"
          role="button"
          tabIndex={0}
          aria-expanded={isPatientDaysExpanded}
          aria-label={`Total Patient Days: ${animatedPatientDays.displayValue}. ${isPatientDaysExpanded ? 'Press Enter or Space to collapse details' : 'Press Enter or Space to view department breakdown'}`}
          style={{
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            gridColumn: isPatientDaysExpanded ? 'span 2' : 'span 1',
            overflow: 'hidden'
          }}
          onClick={() => setIsPatientDaysExpanded(!isPatientDaysExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsPatientDaysExpanded(!isPatientDaysExpanded);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Collapsed View */}
          {!isPatientDaysExpanded && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: '21px',
                  fontWeight: '500',
                  color: '#666',
                  marginBottom: '8px',
                  marginTop: '0'
                }}>
                  Total Patient Days
                </p>
                <h3 style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: '#2c5364',
                  marginBottom: '12px',
                  marginTop: '0'
                }}>
                  {formatAnimatedNumber(animatedPatientDays.displayValue)}
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Month over Month Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: patientDaysChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {patientDaysChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: patientDaysChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {patientDaysChange > 0 ? '+' : ''}{patientDaysChange.toFixed(1)}%
                      </span>
                      <span style={{
                        fontSize: '12px',
                        color: '#999'
                      }}>
                        vs last month
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        background: 'rgba(168, 85, 247, 0.1)',
                        borderRadius: '4px',
                        cursor: 'help'
                      }}
                      role="status"
                      aria-label={`Average Length of Stay: ${(animatedPatientDays.displayValue / animatedAdmissions.displayValue).toFixed(2)}`}
                      title="Average Length of Stay"
                    >
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#666'
                      }} aria-hidden="true">
                        ALOS:
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#a855f7'
                      }} aria-hidden="true">
                        {(animatedPatientDays.displayValue / animatedAdmissions.displayValue).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Prior Year Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span className="material-icons" style={{
                      fontSize: '16px',
                      color: patientDaysPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {patientDaysPriorYearChange > 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: patientDaysPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {patientDaysPriorYearChange > 0 ? '+' : ''}{patientDaysPriorYearChange.toFixed(1)}%
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#999'
                    }}>
                      vs prior year
                    </span>
                  </div>
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(168, 85, 247, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-icons" style={{
                  fontSize: '24px',
                  color: '#a855f7'
                }}>
                  hotel
                </span>
              </div>
            </div>
          )}

          {/* Expanded View */}
          {isPatientDaysExpanded && (
            <div style={{
              width: '100%',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              {/* Top Row - Summary Info */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '2px solid #e6ecf5'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#2c5364',
                      margin: '0'
                    }}>
                      Total Patient Days: {formatAnimatedNumber(animatedPatientDays.displayValue)}
                    </h3>
                    <span className="material-icons" style={{
                      fontSize: '20px',
                      color: '#a855f7',
                      cursor: 'pointer'
                    }}>
                      close
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: patientDaysChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {patientDaysChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: patientDaysChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {patientDaysChange > 0 ? '+' : ''}{patientDaysChange.toFixed(1)}% vs last month
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      background: 'rgba(168, 85, 247, 0.1)',
                      borderRadius: '4px'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#666' }}>
                        ADC:
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#a855f7' }}>
                        {(animatedPatientDays.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div style={{ width: '100%' }}>
                <h4 style={{
                  margin: '0 0 16px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#666'
                }}>
                  Patient Days by Department
                </h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentPatientDaysData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} patient days`, 'Count']}
                      contentStyle={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                      }}
                    />
                    <Bar
                      dataKey="patientDays"
                      fill="#a855f7"
                      radius={[8, 8, 0, 0]}
                      animationDuration={1200}
                    >
                      {departmentPatientDaysData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p style={{
                  textAlign: 'center',
                  marginTop: '12px',
                  fontSize: '13px',
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  Click anywhere to collapse
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          className="card"
          role="button"
          tabIndex={0}
          aria-expanded={isSurgeriesExpanded}
          aria-label={`Total Surgeries: ${animatedSurgeries.displayValue}. ${isSurgeriesExpanded ? 'Press Enter or Space to collapse details' : 'Press Enter or Space to view specialty breakdown'}`}
          style={{
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            gridColumn: isSurgeriesExpanded ? 'span 2' : 'span 1',
            overflow: 'hidden'
          }}
          onClick={() => setIsSurgeriesExpanded(!isSurgeriesExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsSurgeriesExpanded(!isSurgeriesExpanded);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Collapsed View */}
          {!isSurgeriesExpanded && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: '21px',
                  fontWeight: '500',
                  color: '#666',
                  marginBottom: '8px',
                  marginTop: '0'
                }}>
                  Total Surgeries
                </p>
                <h3 style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: '#2c5364',
                  marginBottom: '12px',
                  marginTop: '0'
                }}>
                  {formatAnimatedNumber(animatedSurgeries.displayValue)}
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Month over Month Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: surgeriesChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {surgeriesChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: surgeriesChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {surgeriesChange > 0 ? '+' : ''}{surgeriesChange.toFixed(1)}%
                      </span>
                      <span style={{
                        fontSize: '12px',
                        color: '#999'
                      }}>
                        vs last month
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        background: 'rgba(236, 72, 153, 0.1)',
                        borderRadius: '4px',
                        cursor: 'help'
                      }}
                      role="status"
                      aria-label={`Average Surgeries Per Day: ${(animatedSurgeries.displayValue / daysInMonth).toFixed(2)}`}
                      title="Average Surgeries Per Day"
                    >
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#666'
                      }} aria-hidden="true">
                        ASPD:
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#ec4899'
                      }} aria-hidden="true">
                        {(animatedSurgeries.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Prior Year Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span className="material-icons" style={{
                      fontSize: '16px',
                      color: surgeriesPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {surgeriesPriorYearChange > 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: surgeriesPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {surgeriesPriorYearChange > 0 ? '+' : ''}{surgeriesPriorYearChange.toFixed(1)}%
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#999'
                    }}>
                      vs prior year
                    </span>
                  </div>
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(236, 72, 153, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-icons" style={{
                  fontSize: '24px',
                  color: '#ec4899'
                }}>
                  medical_services
                </span>
              </div>
            </div>
          )}

          {/* Expanded View */}
          {isSurgeriesExpanded && (
            <div style={{
              width: '100%',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              {/* Top Row - Summary Info */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '2px solid #e6ecf5'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#2c5364',
                      margin: '0'
                    }}>
                      Total Surgeries: {formatAnimatedNumber(animatedSurgeries.displayValue)}
                    </h3>
                    <span className="material-icons" style={{
                      fontSize: '20px',
                      color: '#ec4899',
                      cursor: 'pointer'
                    }}>
                      close
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: surgeriesChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {surgeriesChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: surgeriesChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {surgeriesChange > 0 ? '+' : ''}{surgeriesChange.toFixed(1)}% vs last month
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      background: 'rgba(236, 72, 153, 0.1)',
                      borderRadius: '4px'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#666' }}>
                        ASPD:
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#ec4899' }}>
                        {(animatedSurgeries.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div style={{ width: '100%' }}>
                <h4 style={{
                  margin: '0 0 16px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#666'
                }}>
                  Surgeries by Physician Specialty
                </h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={surgeriesBySpecialtyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="specialty"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} surgeries`, 'Count']}
                      contentStyle={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                      }}
                    />
                    <Bar
                      dataKey="surgeries"
                      fill="#ec4899"
                      radius={[8, 8, 0, 0]}
                      animationDuration={1200}
                    >
                      {surgeriesBySpecialtyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p style={{
                  textAlign: 'center',
                  marginTop: '12px',
                  fontSize: '13px',
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  Click anywhere to collapse
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          className="card"
          role="button"
          tabIndex={0}
          aria-expanded={isERVisitsExpanded}
          aria-label={`Total ER Visits: ${animatedERVisits.displayValue}. ${isERVisitsExpanded ? 'Press Enter or Space to collapse details' : 'Press Enter or Space to view financial class breakdown'}`}
          style={{
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            gridColumn: isERVisitsExpanded ? 'span 2' : 'span 1',
            overflow: 'hidden'
          }}
          onClick={() => setIsERVisitsExpanded(!isERVisitsExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsERVisitsExpanded(!isERVisitsExpanded);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Collapsed View */}
          {!isERVisitsExpanded && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: '21px',
                  fontWeight: '500',
                  color: '#666',
                  marginBottom: '8px',
                  marginTop: '0'
                }}>
                  Total ER Visits
                </p>
                <h3 style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: '#2c5364',
                  marginBottom: '12px',
                  marginTop: '0'
                }}>
                  {formatAnimatedNumber(animatedERVisits.displayValue)}
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Month over Month Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: erVisitsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {erVisitsChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: erVisitsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {erVisitsChange > 0 ? '+' : ''}{erVisitsChange.toFixed(1)}%
                      </span>
                      <span style={{
                        fontSize: '12px',
                        color: '#999'
                      }}>
                        vs last month
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        background: 'rgba(234, 88, 12, 0.1)',
                        borderRadius: '4px',
                        cursor: 'help'
                      }}
                      role="status"
                      aria-label={`Average ER Visits Per Day: ${(animatedERVisits.displayValue / daysInMonth).toFixed(2)}`}
                      title="Average ER Visits Per Day"
                    >
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#666'
                      }} aria-hidden="true">
                        AEPD:
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#ea580c'
                      }} aria-hidden="true">
                        {(animatedERVisits.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Prior Year Comparison */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span className="material-icons" style={{
                      fontSize: '16px',
                      color: erVisitsPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {erVisitsPriorYearChange > 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: erVisitsPriorYearChange > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {erVisitsPriorYearChange > 0 ? '+' : ''}{erVisitsPriorYearChange.toFixed(1)}%
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#999'
                    }}>
                      vs prior year
                    </span>
                  </div>
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(234, 88, 12, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-icons" style={{
                  fontSize: '24px',
                  color: '#ea580c'
                }}>
                  emergency
                </span>
              </div>
            </div>
          )}

          {/* Expanded View */}
          {isERVisitsExpanded && (
            <div style={{
              width: '100%',
              animation: 'fadeIn 0.4s ease-in-out'
            }}>
              {/* Top Row - Summary Info */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '2px solid #e6ecf5'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#2c5364',
                      margin: '0'
                    }}>
                      Total ER Visits: {formatAnimatedNumber(animatedERVisits.displayValue)}
                    </h3>
                    <span className="material-icons" style={{
                      fontSize: '20px',
                      color: '#ea580c',
                      cursor: 'pointer'
                    }}>
                      close
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span className="material-icons" style={{
                        fontSize: '16px',
                        color: erVisitsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {erVisitsChange > 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: erVisitsChange > 0 ? '#10b981' : '#ef4444'
                      }}>
                        {erVisitsChange > 0 ? '+' : ''}{erVisitsChange.toFixed(1)}% vs last month
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      background: 'rgba(234, 88, 12, 0.1)',
                      borderRadius: '4px'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#666' }}>
                        AEPD:
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#ea580c' }}>
                        {(animatedERVisits.displayValue / daysInMonth).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div style={{ width: '100%' }}>
                <h4 style={{
                  margin: '0 0 16px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#666'
                }}>
                  ER Visits by Financial Class
                </h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={erVisitsByFinancialClassData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="financialClass"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} ER visits`, 'Count']}
                      contentStyle={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                      }}
                    />
                    <Bar
                      dataKey="visits"
                      fill="#ea580c"
                      radius={[8, 8, 0, 0]}
                      animationDuration={1200}
                    >
                      {erVisitsByFinancialClassData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p style={{
                  textAlign: 'center',
                  marginTop: '12px',
                  fontSize: '13px',
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  Click anywhere to collapse
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="cards-container second-row">
        <div className="card" style={{
          padding: '24px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <p style={{
                fontSize: '21px',
                fontWeight: '500',
                color: '#666',
                marginBottom: '8px',
                marginTop: '0'
              }}>
                Total Patient Revenue
              </p>
              <h3 style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#2c5364',
                marginBottom: '12px',
                marginTop: '0'
              }}>
                ${formatAnimatedNumber(animatedRevenue.displayValue)}
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span className="material-icons" style={{
                  fontSize: '16px',
                  color: revenueIncreased ? '#10b981' : '#ef4444'
                }}>
                  {revenueIncreased ? 'trending_up' : 'trending_down'}
                </span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: revenueIncreased ? '#10b981' : '#ef4444'
                }}>
                  {revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)}%
                </span>
                <span style={{
                  fontSize: '12px',
                  color: '#999'
                }}>
                  vs last month
                </span>
              </div>
            </div>
            <div style={{
              padding: '12px',
              background: 'rgba(44, 83, 100, 0.1)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span className="material-icons" style={{
                fontSize: '24px',
                color: '#2c5364'
              }}>
                attach_money
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{
          padding: '24px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <p style={{
                fontSize: '21px',
                fontWeight: '500',
                color: '#666',
                marginBottom: '8px',
                marginTop: '0'
              }}>
                Total Expenses
              </p>
              <h3 style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#2c5364',
                marginBottom: '12px',
                marginTop: '0'
              }}>
                ${formatAnimatedNumber(animatedExpenses.displayValue)}
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span className="material-icons" style={{
                  fontSize: '16px',
                  color: expensesIncreased ? '#ef4444' : '#10b981'
                }}>
                  {expensesIncreased ? 'trending_up' : 'trending_down'}
                </span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: expensesIncreased ? '#ef4444' : '#10b981'
                }}>
                  {expensesChange > 0 ? '+' : ''}{expensesChange.toFixed(1)}%
                </span>
                <span style={{
                  fontSize: '12px',
                  color: '#999'
                }}>
                  vs last month
                </span>
              </div>
            </div>
            <div style={{
              padding: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span className="material-icons" style={{
                fontSize: '24px',
                color: '#ef4444'
              }}>
                account_balance_wallet
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{
          padding: '24px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <p style={{
                fontSize: '21px',
                fontWeight: '500',
                color: '#666',
                marginBottom: '8px',
                marginTop: '0'
              }}>
                Net Income
              </p>
              <h3 style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#2c5364',
                marginBottom: '12px',
                marginTop: '0'
              }}>
                ${formatAnimatedNumber(animatedNetIncome.displayValue)}
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span className="material-icons" style={{
                  fontSize: '16px',
                  color: netIncomeIncreased ? '#10b981' : '#ef4444'
                }}>
                  {netIncomeIncreased ? 'trending_up' : 'trending_down'}
                </span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: netIncomeIncreased ? '#10b981' : '#ef4444'
                }}>
                  {netIncomeChange > 0 ? '+' : ''}{netIncomeChange.toFixed(1)}%
                </span>
                <span style={{
                  fontSize: '12px',
                  color: '#999'
                }}>
                  vs last month
                </span>
              </div>
            </div>
            <div style={{
              padding: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span className="material-icons" style={{
                fontSize: '24px',
                color: '#10b981'
              }}>
                trending_up
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Revenue Area Chart */}
      <div className="cards-container" style={{ marginTop: '20px' }}>
        <div className="card" style={{ width: '100%' }}>
          <h2>Patient Revenue Overview</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={monthlyTrendData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={formatCurrencyM} />
                <Tooltip formatter={formatTooltipThousands} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  name="Patient Revenue"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorExpenses)"
                  name="Operating Expenses"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="cards-container third-row">
        <div className="card revenue-chart-card">
          <div className="chart-header">
            <h2>Revenue by Type</h2>
            <button
              className="expand-button"
              onClick={() => setFullScreenChart('Revenue by Type')}
              aria-label="Expand chart to full screen"
              title="View full screen"
            >
              <span className="material-icons">fullscreen</span>
            </button>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueByType}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={formatCurrencyM} />
                <Tooltip formatter={formatTooltipThousands} />
                <Bar
                  dataKey="value"
                  fill="#1abc9c"
                  radius={[4, 4, 0, 0]}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-total">
              <strong>Total: {formatCurrencyM(revenueByType.reduce((sum, item) => sum + item.value, 0))}</strong>
            </div>
          </div>
        </div>

        <div className="card expenses-chart-card">
          <div className="chart-header">
            <h2>Operating Expenses by Type</h2>
            <button
              className="expand-button"
              onClick={() => setFullScreenChart('Operating Expenses by Type')}
              aria-label="Expand chart to full screen"
              title="View full screen"
            >
              <span className="material-icons">fullscreen</span>
            </button>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenseByType}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis tickFormatter={formatCurrencyM} />
                <Tooltip formatter={formatTooltipThousands} />
                <Bar
                  dataKey="value"
                  animationDuration={1000}
                  animationEasing="ease-out"
                >
                  {expenseByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-total">
              <strong>Total: {formatCurrencyM(expenseByType.reduce((sum, item) => sum + item.value, 0))}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="cards-container fourth-row">
        <div className="card trend-chart-card" style={{ width: '100%' }}>
          <div className="chart-header">
            <h2>Monthly Financial Performance Trend</h2>
            <button
              className="expand-button"
              onClick={() => setFullScreenChart('Monthly Financial Performance Trend')}
              aria-label="Expand chart to full screen"
              title="View full screen"
            >
              <span className="material-icons">fullscreen</span>
            </button>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={formatCurrencyM} />
                <Tooltip formatter={formatTooltipThousands} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#1abc9c"
                  strokeWidth={3}
                  dot={{ fill: '#1abc9c', strokeWidth: 2, r: 4 }}
                  name="Total Revenue"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#e74c3c"
                  strokeWidth={3}
                  dot={{ fill: '#e74c3c', strokeWidth: 2, r: 4 }}
                  name="Total Expenses"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="netPosition"
                  stroke="#f39c12"
                  strokeWidth={3}
                  dot={{ fill: '#f39c12', strokeWidth: 2, r: 4 }}
                  name="Net Position"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Full-screen chart overlay */}
      {fullScreenChart && (
        <div
          className="fullscreen-overlay"
          onClick={() => setFullScreenChart(null)}
        >
          <div
            className="fullscreen-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fullscreen-header">
              <h2>{fullScreenChart}</h2>
              <button
                className="fullscreen-close"
                onClick={() => setFullScreenChart(null)}
                aria-label="Close full-screen view"
              >
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="fullscreen-chart">
              {fullScreenChart === 'Revenue by Type' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={formatCurrencyM} />
                    <Tooltip formatter={formatTooltipThousands} />
                    <Bar
                      dataKey="value"
                      fill="#1abc9c"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {fullScreenChart === 'Operating Expenses by Type' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseByType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} />
                    <YAxis tickFormatter={formatCurrencyM} />
                    <Tooltip formatter={formatTooltipThousands} />
                    <Bar dataKey="value">
                      {expenseByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {fullScreenChart === 'Monthly Financial Performance Trend' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={formatCurrencyM} />
                    <Tooltip formatter={formatTooltipThousands} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#1abc9c"
                      strokeWidth={3}
                      dot={{ fill: '#1abc9c', strokeWidth: 2, r: 4 }}
                      name="Total Revenue"
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#e74c3c"
                      strokeWidth={3}
                      dot={{ fill: '#e74c3c', strokeWidth: 2, r: 4 }}
                      name="Total Expenses"
                    />
                    <Line
                      type="monotone"
                      dataKey="netPosition"
                      stroke="#f39c12"
                      strokeWidth={3}
                      dot={{ fill: '#f39c12', strokeWidth: 2, r: 4 }}
                      name="Net Position"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Dashboard;
