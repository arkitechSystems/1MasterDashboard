import React, { useState } from 'react';
import jsPDF from 'jspdf';

interface AccordionSectionProps {
  icon: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({ icon, title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={{
      border: '1px solid #e0e6ed',
      borderRadius: 10,
      marginBottom: 12,
      overflow: 'hidden',
      boxShadow: isOpen ? '0 4px 16px rgba(26, 188, 156, 0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'box-shadow 0.3s ease',
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          background: isOpen ? 'linear-gradient(135deg, #f0faf7, #f7f9fc)' : '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 600,
          color: '#1e293b',
          textAlign: 'left',
          transition: 'background 0.2s ease',
        }}
      >
        <span className="material-icons" style={{ color: 'var(--sidebar-accent)', fontSize: 22 }}>{icon}</span>
        <span style={{ flex: 1 }}>{title}</span>
        <span className="material-icons" style={{
          color: '#94a3b8',
          fontSize: 20,
          transition: 'transform 0.3s ease',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>expand_more</span>
      </button>
      <div style={{
        maxHeight: isOpen ? 2000 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s ease',
      }}>
        <div style={{ padding: '4px 20px 20px 54px', color: '#475569', lineHeight: 1.7, fontSize: 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

interface GuideSection {
  title: string;
  intro: string;
  featuresHeading?: string;
  features: Array<{ label: string; body: string }>;
  tipsHeading?: string;
  tips: string[];
  orderedSteps?: Array<{ label: string; body: string }>;
}

const guideSections: GuideSection[] = [
  {
    title: 'Dashboard',
    intro:
      "The Dashboard is your at-a-glance command center for the organization's financial health. It loads automatically when you log in and provides a real-time snapshot of key performance indicators.",
    features: [
      { label: 'KPI Cards', body: 'Animated counters display headline figures such as Total Revenue, Total Expenses, Net Income, and Operating Margin. Values count up on load so changes are immediately noticeable.' },
      { label: 'Operational Statistics', body: 'Volume metrics including Admissions, Patient Days, Surgeries, and ER Visits give context to the financial numbers.' },
      { label: 'Revenue & Expense Charts', body: 'Interactive bar and line charts visualize revenue versus expenses over time. Hover over data points for exact values and tooltips.' },
      { label: 'Clickable Detail Cards', body: 'Certain cards are clickable and navigate you to the relevant detailed report (e.g., clicking a revenue card may take you to the Income Statement).' },
    ],
    tips: [
      'Use the Dashboard to quickly identify whether the current period is trending above or below expectations before diving into detailed reports.',
      'The data refreshes when the underlying GL data is updated — no manual refresh is needed.',
    ],
  },
  {
    title: 'Income Statement',
    intro:
      'The Income Statement presents the traditional financial statement view — a structured breakdown of revenues and expenses for the selected period.',
    features: [
      { label: 'MTD / YTD Toggle', body: 'Switch between Month-to-Date and Year-to-Date views to analyze performance over different time horizons.' },
      { label: 'Prior Period Comparisons', body: 'Columns for Prior Month and Prior Year let you spot changes and trends at a glance. Variance columns highlight favorable and unfavorable differences.' },
      { label: 'Department Filtering', body: 'Use the department dropdown to filter the statement down to a single cost center or view the consolidated entity.' },
      { label: 'Drill-Down to GL', body: 'Click on any line item amount to drill directly into the underlying GL transactions that make up that balance.' },
      { label: 'Budget Comparison', body: 'Where budget data is available, the statement shows budget vs. actual with variance analysis.' },
    ],
    tips: [
      'Use department filtering to isolate underperforming areas, then drill into GL detail for root-cause analysis.',
      'Negative variances are color-coded so you can immediately focus on problem areas.',
    ],
  },
  {
    title: 'MD&A (Management Discussion & Analysis)',
    intro:
      'The MD&A tab provides a management-oriented view of the financial statements designed for leadership review and board reporting. It mirrors the structure of the Income Statement but is tailored for narrative financial analysis and executive summary.',
    features: [
      { label: 'Executive Summary Layout', body: 'Financial data is presented in a format that supports management discussion, with clear section headers for Revenue, Expenses, and Net Income.' },
      { label: 'Period Comparisons', body: 'Side-by-side current period, prior period, and prior year data with dollar and percentage variances.' },
      { label: 'Department-Level Views', body: 'Filter by department to focus discussion on specific operational areas during management meetings.' },
      { label: 'Drill-Down Capability', body: 'Like the Income Statement, you can click into individual line items to see underlying GL transactions for due diligence.' },
    ],
    tips: [
      'Use this view when preparing for finance committee or board meetings — the layout is designed to support narrative explanations of variances.',
      'Pair this with the Trended IS for multi-month context during discussions.',
    ],
  },
  {
    title: 'Trended Income Statement',
    intro:
      'The Trended IS displays the income statement across multiple consecutive periods (typically 12+ months), making it easy to identify seasonal patterns, growth trajectories, and anomalies.',
    features: [
      { label: 'Multi-Period Columns', body: 'Each column represents a month, laid out chronologically so you can read trends left to right.' },
      { label: 'Financial Ratios', body: 'Built-in ratio calculations (e.g., Operating Margin, Expense-to-Revenue) are displayed alongside the raw numbers. Click on a ratio value for a breakdown of how it was calculated.' },
      { label: 'Sparkline Indicators', body: 'Visual trend indicators help you quickly identify which line items are trending up or down across periods.' },
      { label: 'Export to Excel', body: 'Export the full trended view for use in external presentations or further analysis.' },
    ],
    tips: [
      'This is one of the most powerful analytical views — use it to spot seasonality in revenue or recurring expense spikes.',
      "Scroll horizontally to see all periods if your screen doesn't fit all columns.",
    ],
  },
  {
    title: 'MVA (Multiple Variable Analysis)',
    intro:
      "The MVA module lets you perform account-level trend analysis across multiple variables simultaneously. It's designed for deep analytical work when you need to compare how different accounts or metrics move in relation to each other.",
    features: [
      { label: 'Account Selection', body: 'Choose specific GL accounts or account groups to plot on the same chart for side-by-side comparison.' },
      { label: '12-Month Trend Visualization', body: 'Each selected variable is plotted over a rolling 12-month window, revealing correlations and divergences.' },
      { label: 'Interactive Charts', body: 'Hover over data points for exact values. Toggle variables on and off to simplify the view.' },
      { label: 'Department Filtering', body: 'Narrow the analysis to a specific department or view the consolidated entity.' },
    ],
    tips: [
      'Use MVA to investigate relationships — for example, plot staffing costs against patient volume to see if expenses scale proportionally.',
      'Compare revenue accounts against their related expense accounts to analyze contribution margins over time.',
    ],
  },
  {
    title: 'Impact Preview',
    intro:
      'The Impact Preview is a what-if scenario tool that lets you upload proposed journal entries and immediately see how they would affect the financial statements — before anything is posted.',
    features: [
      { label: 'Journal Entry Upload', body: 'Upload a file containing proposed journal entries (debits and credits) to simulate their financial impact.' },
      { label: 'Before & After View', body: 'See a side-by-side comparison of the financial statements with and without the proposed entries applied.' },
      { label: 'Variance Highlighting', body: 'Affected line items are highlighted so you can quickly identify which areas of the financials would change.' },
      { label: 'Non-Destructive', body: 'No data is actually posted. This is purely a forecasting and planning tool.' },
    ],
    tips: [
      "Use this before posting large or unusual journal entries to verify they'll produce the expected result on the financials.",
      'Great for month-end planning — preview accruals and adjustments before committing them.',
    ],
  },
  {
    title: 'Projections',
    intro:
      'The Projections module extends your actual financial data with forward-looking projected months, giving you a complete picture of where the organization is headed financially.',
    features: [
      { label: 'Actual + Projected', body: 'Actual YTD data is combined with projected future months so you can see the full fiscal year on one screen.' },
      { label: 'Projection Methodology', body: 'Projections can be based on budget, prior year trends, or custom assumptions depending on your configuration.' },
      { label: 'Ratio Calculations', body: 'Financial ratios are calculated across the blended actual/projected data to forecast year-end performance metrics.' },
      { label: 'Department Filtering', body: 'View projections at the consolidated level or drill into individual departments.' },
    ],
    tips: [
      'Use Projections during quarterly reviews to forecast year-end performance based on current trends.',
      'Compare projected margins against budget targets to identify potential shortfalls early.',
    ],
  },
  {
    title: 'Balance Sheet Trend',
    intro:
      'The Balance Sheet Trend presents a rolling 12-month view of the balance sheet, allowing you to track how assets, liabilities, and equity positions evolve over time.',
    features: [
      { label: '12-Month Rolling View', body: 'Each column represents a month-end balance sheet snapshot, giving you a full year of position data.' },
      { label: 'Asset, Liability & Equity Sections', body: 'The statement is organized in standard balance sheet format with clear section totals and a balancing check.' },
      { label: 'Trend Identification', body: 'Spot growing liabilities, declining cash positions, or equity changes over time without switching between multiple reports.' },
      { label: 'Export Capability', body: 'Download the trended balance sheet for external analysis or board reporting.' },
    ],
    tips: [
      'Monitor cash and cash equivalents monthly to ensure liquidity targets are being met.',
      'Watch for unexpected growth in accounts payable or accrued liabilities that could indicate timing issues.',
    ],
  },
  {
    title: 'Balance Sheet Activity',
    intro:
      'The Balance Sheet Activity report focuses on the month-to-month changes in balance sheet line items rather than the ending balances themselves. This makes it easy to see what moved and by how much.',
    features: [
      { label: 'Change-Focused View', body: 'Instead of showing ending balances, this report shows the increase or decrease in each line item from one month to the next.' },
      { label: 'Color-Coded Amounts', body: 'Positive and negative changes are color-coded for quick visual scanning of material movements.' },
      { label: '12-Month Activity', body: 'View a full year of monthly activity to understand the pattern and magnitude of balance sheet movements.' },
      { label: 'Drill-Down', body: 'Click on any activity amount to investigate the underlying transactions that drove the change.' },
    ],
    tips: [
      'Use this report during month-end close to verify that balance sheet movements are reasonable and expected.',
      'Large unexpected swings in activity are often the first sign of posting errors or missed accruals.',
    ],
  },
  {
    title: 'GL Transactions',
    intro:
      'The GL Transactions page provides transaction-level search and filtering across the general ledger. This is your tool for investigating individual postings and performing detailed account analysis.',
    features: [
      { label: 'Multi-Filter Search', body: "Filter transactions by Fiscal Year, Department, Account, and date range to narrow down exactly what you're looking for." },
      { label: 'Searchable Results', body: 'Once filtered, use the text search to find specific journal entries, vendors, or descriptions within the results.' },
      { label: 'Sortable Columns', body: 'Click column headers to sort by date, amount, description, or any other field.' },
      { label: 'Export to Excel', body: 'Download filtered transaction data for audit support or external analysis.' },
      { label: 'Linked from Other Reports', body: 'When you drill down from the Income Statement, MD&A, or Balance Sheet reports, you land here with the filters pre-populated.' },
    ],
    tips: [
      "When investigating a variance, drill down from the Income Statement rather than manually setting filters — it's faster and more accurate.",
      'Use the text search to find entries from a specific vendor or with a specific journal entry number.',
    ],
  },
  {
    title: 'Pro Forma',
    intro:
      "The Pro Forma tool lets you compile a customizable financial statement by selecting specific departments and periods. It's designed for ad-hoc reporting and scenario building.",
    features: [
      { label: 'Custom Department Selection', body: 'Choose one or more departments to include in the compiled statement, allowing you to create custom groupings beyond the standard org chart.' },
      { label: 'Flexible Period Selection', body: 'Select the reporting month to generate the statement for any available period.' },
      { label: 'Consolidated View', body: 'Selected departments are rolled up into a single consolidated statement, useful for creating service-line or division-level reports.' },
      { label: 'Export Options', body: 'Download the compiled pro forma for presentations or further analysis.' },
    ],
    tips: [
      'Use Pro Forma to create service-line reports by selecting all departments that belong to a clinical service.',
      'Great for what-if analysis — compile specific cost centers to model reorganization scenarios.',
    ],
  },
  {
    title: 'Monthly Report Options',
    intro:
      'The Monthly Report Options page lets you customize and export your monthly financial report package. Configure which sections to include and generate a complete report for distribution.',
    features: [
      { label: 'Report Section Selection', body: 'Toggle individual report sections on or off to build a custom report package tailored to your audience.', },
      { label: 'Export Formats', body: 'Generate reports in Excel or PDF format depending on whether the audience needs an editable or presentation-ready document.' },
      { label: 'Batch Generation', body: 'Generate all selected report sections in a single action rather than exporting each page individually.' },
    ],
    tips: [
      'Set up your preferred report configuration once — the selections can be reused each month for a consistent reporting package.',
      'Use PDF for board distribution and Excel for internal finance team analysis.',
    ],
  },
  {
    title: 'Ask AI',
    intro:
      'The Ask AI feature is an interactive AI assistant embedded directly in the dashboard. It can answer questions about your financial data, explain variances, and help with analysis.',
    features: [
      { label: 'Natural Language Queries', body: 'Ask questions in plain English like "Why did supply expenses increase this month?" or "What is our current operating margin?"' },
      { label: 'Context-Aware', body: 'The AI has access to your financial data and can reference specific accounts, departments, and periods in its responses.' },
      { label: 'Analysis Support', body: 'Request help with financial analysis tasks such as variance explanations, ratio interpretations, or trend summaries.' },
    ],
    tips: [
      'Be specific in your questions — "Why did Department 100\'s supply expense increase by $50K in March?" will get a more useful answer than "What happened to expenses?"',
      'The AI chat panel can be toggled open and closed without losing your conversation history.',
    ],
  },
  {
    title: 'Settings',
    intro:
      'The Settings page lets you configure your dashboard preferences to customize how data is displayed and which reporting period is shown by default.',
    features: [
      { label: 'Default Reporting Month', body: 'Set which month the dashboard loads by default. This controls the period shown across all financial reports.' },
      { label: 'Dynamic Month Switching', body: 'Enable automatic month advancement based on the current calendar date. When enabled, the dashboard will automatically switch to the new reporting month after a configurable day of the month (e.g., after the 15th, advance to the current month\'s data).' },
      { label: 'Display Preferences', body: 'Configure how numbers, charts, and layouts appear throughout the application.' },
    ],
    tips: [
      'If your close process typically completes by the 15th of the following month, set the dynamic switch day to 15 so the dashboard automatically advances after close.',
      'You can always manually override the reporting month regardless of the dynamic setting.',
    ],
  },
  {
    title: 'My Account',
    intro:
      'The My Account page manages your user profile and security settings, including multi-factor authentication (MFA).',
    features: [
      { label: 'Profile Information', body: 'View and update your account details such as display name and email.' },
      { label: 'Password Management', body: "Change your password from this page. You'll be required to enter your current password for verification." },
      { label: 'MFA Setup & Management', body: 'Enable or reconfigure multi-factor authentication for your account. MFA adds a second layer of security using an authenticator app.' },
    ],
    tips: [
      'Enabling MFA is strongly recommended to protect access to sensitive financial data.',
      'If you lose access to your authenticator app, contact your administrator to reset your MFA configuration.',
    ],
  },
  {
    title: 'Submit Ticket',
    intro:
      'The Submit Ticket page allows you to send support requests directly from within the dashboard. Use it to report issues, request new features, or ask questions.',
    features: [
      { label: 'Issue Submission', body: 'Describe the issue or request with as much detail as possible for faster resolution.' },
      { label: 'Category Selection', body: 'Categorize your ticket (bug report, feature request, question, etc.) to help the support team prioritize and route it appropriately.' },
    ],
    tips: [
      'Include the specific page, account, or period where you encountered the issue to help the team reproduce and resolve it faster.',
      'Screenshots can be very helpful — describe what you see versus what you expected.',
    ],
  },
  {
    title: 'Upcoming Modules',
    intro:
      'The Upcoming Modules page shows the feature roadmap — modules that are planned or in development for future releases.',
    featuresHeading: 'Planned modules include:',
    features: [
      { label: 'FTEs (Full-Time Equivalents)', body: 'Staffing analysis and labor cost tracking by department.' },
      { label: 'Supplies per Volume', body: 'Supply cost analysis normalized by patient volume metrics.' },
      { label: 'Revenue by Payer', body: 'Revenue breakdown by payer mix (Medicare, Medicaid, commercial, self-pay, etc.).' },
      { label: 'Volume Trends', body: 'Detailed patient volume trending across service lines and departments.' },
    ],
    tips: [
      "Check back periodically to see what's new. Modules will appear in the sidebar as they become available.",
      'Use the Submit Ticket page to request features or provide input on which modules would be most valuable to your team.',
    ],
  },
  {
    title: 'Getting Started',
    intro: "New to the Financial Dashboard? Here's a recommended workflow to get oriented:",
    features: [],
    tips: [],
    orderedSteps: [
      { label: 'Start with the Dashboard', body: 'Get a high-level overview of KPIs and identify any areas that need attention.' },
      { label: 'Review the Income Statement', body: 'Dive into the details for the current period to understand revenue and expense performance.' },
      { label: 'Check the Trended IS', body: 'Look at multi-month trends to put the current period in context.' },
      { label: 'Investigate with GL Transactions', body: 'Drill into any variances or unusual items at the transaction level.' },
      { label: 'Use Ask AI for questions', body: 'If you need help interpreting the data or want a quick variance explanation, ask the AI assistant.' },
      { label: 'Configure your Settings', body: 'Set your default reporting month and enable dynamic month switching to streamline your workflow.' },
    ],
  },
  {
    title: 'Support & Contact',
    intro: 'For additional support or questions about the Financial Dashboard, use any of the channels below.',
    featuresHeading: 'Contact channels:',
    features: [
      { label: 'Email', body: 'support@arkitech.com' },
      { label: 'Phone', body: '(555) 123-4567' },
      { label: 'Documentation', body: 'www.arkitech.com/docs' },
    ],
    tips: [
      'You can also use the Submit Ticket page within the app to send a support request directly to the team.',
    ],
  },
];

const generateUserGuidePDF = () => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const contentWidth = pageWidth - marginX * 2;
  const accent: [number, number, number] = [26, 188, 156];
  const dark: [number, number, number] = [30, 41, 59];
  const slate: [number, number, number] = [71, 85, 105];
  const muted: [number, number, number] = [100, 116, 139];
  const lightBg: [number, number, number] = [240, 250, 247];

  let y = 0;
  let pageNumber = 1;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const drawPageChrome = (isCover: boolean) => {
    if (isCover) {
      doc.setFillColor(...accent);
      doc.rect(0, 0, pageWidth, 220, 'F');
      doc.setFillColor(22, 160, 133);
      doc.rect(0, 200, pageWidth, 20, 'F');
    } else {
      doc.setFillColor(...accent);
      doc.rect(0, 0, pageWidth, 6, 'F');
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'normal');
      doc.text('Financial Dashboard — User Guide', marginX, pageHeight - 28);
      doc.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 28, { align: 'right' });
    }
  };

  const newPage = () => {
    doc.addPage();
    pageNumber += 1;
    drawPageChrome(false);
    y = 60;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 60) {
      newPage();
    }
  };

  const writeWrapped = (
    text: string,
    options: { size: number; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number]; indent?: number; lineGap?: number; }
  ) => {
    const { size, style = 'normal', color = slate, indent = 0, lineGap = 4 } = options;
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const wrapped = doc.splitTextToSize(text, contentWidth - indent);
    const lineHeight = size * 1.25;
    for (const line of wrapped) {
      ensureSpace(lineHeight);
      doc.text(line, marginX + indent, y);
      y += lineHeight;
    }
    y += lineGap;
  };

  const writeLabelBody = (label: string, body: string, bullet: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...dark);
    const bulletText = `${bullet}  ${label}`;
    const wrappedLabel = doc.splitTextToSize(bulletText, contentWidth - 14);
    const labelLineHeight = 11 * 1.3;
    for (const line of wrappedLabel) {
      ensureSpace(labelLineHeight);
      doc.text(line, marginX + 14, y);
      y += labelLineHeight;
    }
    y += 1;
    writeWrapped(body, { size: 10.5, color: slate, indent: 26, lineGap: 6 });
  };

  // ── Cover Page ──
  drawPageChrome(true);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(255, 255, 255);
  doc.text('Financial Dashboard', marginX, 110);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'normal');
  doc.text('User Guide', marginX, 145);
  doc.setFontSize(11);
  doc.text('A complete walkthrough of every module', marginX, 175);

  y = 280;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...slate);
  const introCopy =
    'This guide walks through every section of the Financial Dashboard, explaining what each module does, how to use its key functions, and tips to get the most out of your financial reporting and analysis tools. Use the table of contents on the next page to jump directly to any section.';
  const introWrapped = doc.splitTextToSize(introCopy, contentWidth);
  doc.text(introWrapped, marginX, y);
  y += introWrapped.length * 14 + 30;

  // Detail box
  doc.setFillColor(...lightBg);
  doc.roundedRect(marginX, y, contentWidth, 130, 8, 8, 'F');
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, y, contentWidth, 130, 8, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text('Document Details', marginX + 18, y + 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...slate);
  doc.text(`Generated: ${today}`, marginX + 18, y + 50);
  doc.text(`Modules covered: ${guideSections.length}`, marginX + 18, y + 68);
  doc.text('Format: Letter (8.5" x 11")', marginX + 18, y + 86);
  doc.text('Audience: Finance & operations users', marginX + 18, y + 104);

  y = pageHeight - 90;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text('Prepared by ArkiTech  |  support@arkitech.com', marginX, y);

  // ── Table of Contents ──
  newPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...dark);
  doc.text('Table of Contents', marginX, y);
  y += 8;
  doc.setDrawColor(...accent);
  doc.setLineWidth(1.4);
  doc.line(marginX, y, marginX + 70, y);
  y += 28;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...slate);
  guideSections.forEach((section, idx) => {
    ensureSpace(20);
    const num = String(idx + 1).padStart(2, '0');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text(num, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...dark);
    doc.text(section.title, marginX + 28, y);
    y += 20;
  });

  // ── Each section ──
  guideSections.forEach((section, idx) => {
    newPage();

    // Section header band
    doc.setFillColor(...lightBg);
    doc.rect(marginX, y - 14, contentWidth, 56, 'F');
    doc.setFillColor(...accent);
    doc.rect(marginX, y - 14, 4, 56, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...accent);
    doc.text(`SECTION ${String(idx + 1).padStart(2, '0')}`, marginX + 16, y);
    doc.setFontSize(20);
    doc.setTextColor(...dark);
    doc.text(section.title, marginX + 16, y + 24);
    y += 70;

    writeWrapped(section.intro, { size: 11, color: slate, lineGap: 10 });

    if (section.features.length > 0) {
      ensureSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...dark);
      doc.text(section.featuresHeading || 'Key features:', marginX, y);
      y += 16;
      section.features.forEach(f => writeLabelBody(f.label, f.body, '•'));
      y += 4;
    }

    if (section.orderedSteps && section.orderedSteps.length > 0) {
      ensureSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...dark);
      doc.text('Recommended workflow:', marginX, y);
      y += 16;
      section.orderedSteps.forEach((s, i) => writeLabelBody(s.label, s.body, `${i + 1}.`));
      y += 4;
    }

    if (section.tips.length > 0) {
      ensureSpace(70);
      doc.setFillColor(...lightBg);
      const tipsTop = y;
      const tipsLineHeight = 10.5 * 1.4;
      const tipsHeight = 30 + section.tips.reduce((acc, tip) => {
        const wrapped = doc.splitTextToSize(`•  ${tip}`, contentWidth - 32);
        return acc + wrapped.length * tipsLineHeight + 4;
      }, 0);
      doc.roundedRect(marginX, tipsTop, contentWidth, tipsHeight, 6, 6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...accent);
      doc.text(section.tipsHeading || 'Tips', marginX + 16, tipsTop + 20);
      let tipY = tipsTop + 38;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...slate);
      section.tips.forEach(tip => {
        const wrapped = doc.splitTextToSize(`•  ${tip}`, contentWidth - 32);
        wrapped.forEach((line: string) => {
          doc.text(line, marginX + 16, tipY);
          tipY += tipsLineHeight;
        });
        tipY += 4;
      });
      y = tipsTop + tipsHeight + 14;
    }
  });

  doc.save('Financial-Dashboard-User-Guide.pdf');
};

const UserGuide: React.FC = () => {
  const [allOpen, setAllOpen] = useState(false);
  const [key, setKey] = useState(0);

  const toggleAll = () => {
    setAllOpen(!allOpen);
    setKey(prev => prev + 1);
  };

  const handleDownloadPdf = () => {
    try {
      generateUserGuidePDF();
    } catch (err) {
      console.error('Failed to generate user guide PDF:', err);
      alert('Sorry, we could not generate the PDF. Please try again or contact support.');
    }
  };

  return (
    <div className="user-guide" style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>User Guide</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleDownloadPdf}
            title="Download a professionally formatted PDF version of this guide"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: '#fff',
              color: 'var(--sidebar-accent)',
              border: '1.5px solid var(--sidebar-accent)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span className="material-icons" style={{ fontSize: 18 }}>picture_as_pdf</span>
            Download PDF Guide
          </button>
          <button
            onClick={toggleAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'var(--sidebar-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span className="material-icons" style={{ fontSize: 18 }}>
              {allOpen ? 'unfold_less' : 'unfold_more'}
            </span>
            {allOpen ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>
      <hr />

      <p style={{ color: '#64748b', marginBottom: 16, fontSize: 15 }}>
        Welcome to the Financial Dashboard. This guide covers every section of the application to help you get the most out of your financial reporting and analysis tools. Click any section below to expand it, or{' '}
        <button
          onClick={handleDownloadPdf}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            color: 'var(--sidebar-accent)',
            fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        >
          download the full guide as a PDF
        </button>{' '}
        for offline reference and sharing.
      </p>

      <div key={key}>
        {/* ── Dashboard ── */}
        <AccordionSection icon="dashboard" title="Dashboard" defaultOpen={allOpen}>
          <p>
            The <strong>Dashboard</strong> is your at-a-glance command center for the organization's financial health. It loads automatically when you log in and provides a real-time snapshot of key performance indicators.
          </p>
          <p><strong>What you'll find here:</strong></p>
          <ul>
            <li><strong>KPI Cards</strong> — Animated counters display headline figures such as Total Revenue, Total Expenses, Net Income, and Operating Margin. Values count up on load so changes are immediately noticeable.</li>
            <li><strong>Operational Statistics</strong> — Volume metrics including Admissions, Patient Days, Surgeries, and ER Visits give context to the financial numbers.</li>
            <li><strong>Revenue &amp; Expense Charts</strong> — Interactive bar and line charts visualize revenue versus expenses over time. Hover over data points for exact values and tooltips.</li>
            <li><strong>Clickable Detail Cards</strong> — Certain cards are clickable and navigate you to the relevant detailed report (e.g., clicking a revenue card may take you to the Income Statement).</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use the Dashboard to quickly identify whether the current period is trending above or below expectations before diving into detailed reports.</li>
            <li>The data refreshes when the underlying GL data is updated — no manual refresh is needed.</li>
          </ul>
        </AccordionSection>

        {/* ── Income Statement ── */}
        <AccordionSection icon="description" title="Income Statement" defaultOpen={allOpen}>
          <p>
            The <strong>Income Statement</strong> presents the traditional financial statement view — a structured breakdown of revenues and expenses for the selected period.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>MTD / YTD Toggle</strong> — Switch between Month-to-Date and Year-to-Date views to analyze performance over different time horizons.</li>
            <li><strong>Prior Period Comparisons</strong> — Columns for Prior Month and Prior Year let you spot changes and trends at a glance. Variance columns highlight favorable and unfavorable differences.</li>
            <li><strong>Department Filtering</strong> — Use the department dropdown to filter the statement down to a single cost center or view the consolidated entity.</li>
            <li><strong>Drill-Down to GL</strong> — Click on any line item amount to drill directly into the underlying GL transactions that make up that balance.</li>
            <li><strong>Budget Comparison</strong> — Where budget data is available, the statement shows budget vs. actual with variance analysis.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use department filtering to isolate underperforming areas, then drill into GL detail for root-cause analysis.</li>
            <li>Negative variances are color-coded so you can immediately focus on problem areas.</li>
          </ul>
        </AccordionSection>

        {/* ── MD&A ── */}
        <AccordionSection icon="article" title="MD&A (Management Discussion & Analysis)" defaultOpen={allOpen}>
          <p>
            The <strong>MD&amp;A</strong> tab provides a management-oriented view of the financial statements designed for leadership review and board reporting. It mirrors the structure of the Income Statement but is tailored for narrative financial analysis and executive summary.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Executive Summary Layout</strong> — Financial data is presented in a format that supports management discussion, with clear section headers for Revenue, Expenses, and Net Income.</li>
            <li><strong>Period Comparisons</strong> — Side-by-side current period, prior period, and prior year data with dollar and percentage variances.</li>
            <li><strong>Department-Level Views</strong> — Filter by department to focus discussion on specific operational areas during management meetings.</li>
            <li><strong>Drill-Down Capability</strong> — Like the Income Statement, you can click into individual line items to see underlying GL transactions for due diligence.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use this view when preparing for finance committee or board meetings — the layout is designed to support narrative explanations of variances.</li>
            <li>Pair this with the Trended IS for multi-month context during discussions.</li>
          </ul>
        </AccordionSection>

        {/* ── Trended IS ── */}
        <AccordionSection icon="bar_chart" title="Trended Income Statement" defaultOpen={allOpen}>
          <p>
            The <strong>Trended IS</strong> displays the income statement across multiple consecutive periods (typically 12+ months), making it easy to identify seasonal patterns, growth trajectories, and anomalies.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Multi-Period Columns</strong> — Each column represents a month, laid out chronologically so you can read trends left to right.</li>
            <li><strong>Financial Ratios</strong> — Built-in ratio calculations (e.g., Operating Margin, Expense-to-Revenue) are displayed alongside the raw numbers. Click on a ratio value for a breakdown of how it was calculated.</li>
            <li><strong>Sparkline Indicators</strong> — Visual trend indicators help you quickly identify which line items are trending up or down across periods.</li>
            <li><strong>Export to Excel</strong> — Export the full trended view for use in external presentations or further analysis.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>This is one of the most powerful analytical views — use it to spot seasonality in revenue or recurring expense spikes.</li>
            <li>Scroll horizontally to see all periods if your screen doesn't fit all columns.</li>
          </ul>
        </AccordionSection>

        {/* ── MVA ── */}
        <AccordionSection icon="analytics" title="MVA (Multiple Variable Analysis)" defaultOpen={allOpen}>
          <p>
            The <strong>MVA</strong> module lets you perform account-level trend analysis across multiple variables simultaneously. It's designed for deep analytical work when you need to compare how different accounts or metrics move in relation to each other.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Account Selection</strong> — Choose specific GL accounts or account groups to plot on the same chart for side-by-side comparison.</li>
            <li><strong>12-Month Trend Visualization</strong> — Each selected variable is plotted over a rolling 12-month window, revealing correlations and divergences.</li>
            <li><strong>Interactive Charts</strong> — Hover over data points for exact values. Toggle variables on and off to simplify the view.</li>
            <li><strong>Department Filtering</strong> — Narrow the analysis to a specific department or view the consolidated entity.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use MVA to investigate relationships — for example, plot staffing costs against patient volume to see if expenses scale proportionally.</li>
            <li>Compare revenue accounts against their related expense accounts to analyze contribution margins over time.</li>
          </ul>
        </AccordionSection>

        {/* ── Impact Preview ── */}
        <AccordionSection icon="preview" title="Impact Preview" defaultOpen={allOpen}>
          <p>
            The <strong>Impact Preview</strong> is a what-if scenario tool that lets you upload proposed journal entries and immediately see how they would affect the financial statements — before anything is posted.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Journal Entry Upload</strong> — Upload a file containing proposed journal entries (debits and credits) to simulate their financial impact.</li>
            <li><strong>Before &amp; After View</strong> — See a side-by-side comparison of the financial statements with and without the proposed entries applied.</li>
            <li><strong>Variance Highlighting</strong> — Affected line items are highlighted so you can quickly identify which areas of the financials would change.</li>
            <li><strong>Non-Destructive</strong> — No data is actually posted. This is purely a forecasting and planning tool.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use this before posting large or unusual journal entries to verify they'll produce the expected result on the financials.</li>
            <li>Great for month-end planning — preview accruals and adjustments before committing them.</li>
          </ul>
        </AccordionSection>

        {/* ── Projections ── */}
        <AccordionSection icon="trending_up" title="Projections" defaultOpen={allOpen}>
          <p>
            The <strong>Projections</strong> module extends your actual financial data with forward-looking projected months, giving you a complete picture of where the organization is headed financially.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Actual + Projected</strong> — Actual YTD data is combined with projected future months so you can see the full fiscal year on one screen.</li>
            <li><strong>Projection Methodology</strong> — Projections can be based on budget, prior year trends, or custom assumptions depending on your configuration.</li>
            <li><strong>Ratio Calculations</strong> — Financial ratios are calculated across the blended actual/projected data to forecast year-end performance metrics.</li>
            <li><strong>Department Filtering</strong> — View projections at the consolidated level or drill into individual departments.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use Projections during quarterly reviews to forecast year-end performance based on current trends.</li>
            <li>Compare projected margins against budget targets to identify potential shortfalls early.</li>
          </ul>
        </AccordionSection>

        {/* ── Balance Sheet Trend ── */}
        <AccordionSection icon="account_balance" title="Balance Sheet Trend" defaultOpen={allOpen}>
          <p>
            The <strong>Balance Sheet Trend</strong> presents a rolling 12-month view of the balance sheet, allowing you to track how assets, liabilities, and equity positions evolve over time.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>12-Month Rolling View</strong> — Each column represents a month-end balance sheet snapshot, giving you a full year of position data.</li>
            <li><strong>Asset, Liability &amp; Equity Sections</strong> — The statement is organized in standard balance sheet format with clear section totals and a balancing check.</li>
            <li><strong>Trend Identification</strong> — Spot growing liabilities, declining cash positions, or equity changes over time without switching between multiple reports.</li>
            <li><strong>Export Capability</strong> — Download the trended balance sheet for external analysis or board reporting.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Monitor cash and cash equivalents monthly to ensure liquidity targets are being met.</li>
            <li>Watch for unexpected growth in accounts payable or accrued liabilities that could indicate timing issues.</li>
          </ul>
        </AccordionSection>

        {/* ── Balance Sheet Activity ── */}
        <AccordionSection icon="insights" title="Balance Sheet Activity" defaultOpen={allOpen}>
          <p>
            The <strong>Balance Sheet Activity</strong> report focuses on the month-to-month <em>changes</em> in balance sheet line items rather than the ending balances themselves. This makes it easy to see what moved and by how much.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Change-Focused View</strong> — Instead of showing ending balances, this report shows the increase or decrease in each line item from one month to the next.</li>
            <li><strong>Color-Coded Amounts</strong> — Positive and negative changes are color-coded for quick visual scanning of material movements.</li>
            <li><strong>12-Month Activity</strong> — View a full year of monthly activity to understand the pattern and magnitude of balance sheet movements.</li>
            <li><strong>Drill-Down</strong> — Click on any activity amount to investigate the underlying transactions that drove the change.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use this report during month-end close to verify that balance sheet movements are reasonable and expected.</li>
            <li>Large unexpected swings in activity are often the first sign of posting errors or missed accruals.</li>
          </ul>
        </AccordionSection>

        {/* ── GL Transactions ── */}
        <AccordionSection icon="receipt_long" title="GL Transactions" defaultOpen={allOpen}>
          <p>
            The <strong>GL Transactions</strong> page provides transaction-level search and filtering across the general ledger. This is your tool for investigating individual postings and performing detailed account analysis.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Multi-Filter Search</strong> — Filter transactions by Fiscal Year, Department, Account, and date range to narrow down exactly what you're looking for.</li>
            <li><strong>Searchable Results</strong> — Once filtered, use the text search to find specific journal entries, vendors, or descriptions within the results.</li>
            <li><strong>Sortable Columns</strong> — Click column headers to sort by date, amount, description, or any other field.</li>
            <li><strong>Export to Excel</strong> — Download filtered transaction data for audit support or external analysis.</li>
            <li><strong>Linked from Other Reports</strong> — When you drill down from the Income Statement, MD&amp;A, or Balance Sheet reports, you land here with the filters pre-populated.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>When investigating a variance, drill down from the Income Statement rather than manually setting filters — it's faster and more accurate.</li>
            <li>Use the text search to find entries from a specific vendor or with a specific journal entry number.</li>
          </ul>
        </AccordionSection>

        {/* ── Pro Forma ── */}
        <AccordionSection icon="tune" title="Pro Forma" defaultOpen={allOpen}>
          <p>
            The <strong>Pro Forma</strong> tool lets you compile a customizable financial statement by selecting specific departments and periods. It's designed for ad-hoc reporting and scenario building.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Custom Department Selection</strong> — Choose one or more departments to include in the compiled statement, allowing you to create custom groupings beyond the standard org chart.</li>
            <li><strong>Flexible Period Selection</strong> — Select the reporting month to generate the statement for any available period.</li>
            <li><strong>Consolidated View</strong> — Selected departments are rolled up into a single consolidated statement, useful for creating service-line or division-level reports.</li>
            <li><strong>Export Options</strong> — Download the compiled pro forma for presentations or further analysis.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Use Pro Forma to create service-line reports by selecting all departments that belong to a clinical service.</li>
            <li>Great for what-if analysis — compile specific cost centers to model reorganization scenarios.</li>
          </ul>
        </AccordionSection>

        {/* ── Monthly Report Options ── */}
        <AccordionSection icon="print" title="Monthly Report Options" defaultOpen={allOpen}>
          <p>
            The <strong>Monthly Report Options</strong> page lets you customize and export your monthly financial report package. Configure which sections to include and generate a complete report for distribution.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Report Section Selection</strong> — Toggle individual report sections on or off to build a custom report package tailored to your audience.</li>
            <li><strong>Export Formats</strong> — Generate reports in Excel or PDF format depending on whether the audience needs an editable or presentation-ready document.</li>
            <li><strong>Batch Generation</strong> — Generate all selected report sections in a single action rather than exporting each page individually.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Set up your preferred report configuration once — the selections can be reused each month for a consistent reporting package.</li>
            <li>Use PDF for board distribution and Excel for internal finance team analysis.</li>
          </ul>
        </AccordionSection>

        {/* ── Ask AI ── */}
        <AccordionSection icon="text_fields_alt" title="Ask AI" defaultOpen={allOpen}>
          <p>
            The <strong>Ask AI</strong> feature is an interactive AI assistant embedded directly in the dashboard. It can answer questions about your financial data, explain variances, and help with analysis.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Natural Language Queries</strong> — Ask questions in plain English like "Why did supply expenses increase this month?" or "What is our current operating margin?"</li>
            <li><strong>Context-Aware</strong> — The AI has access to your financial data and can reference specific accounts, departments, and periods in its responses.</li>
            <li><strong>Analysis Support</strong> — Request help with financial analysis tasks such as variance explanations, ratio interpretations, or trend summaries.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Be specific in your questions — "Why did Department 100's supply expense increase by $50K in March?" will get a more useful answer than "What happened to expenses?"</li>
            <li>The AI chat panel can be toggled open and closed without losing your conversation history.</li>
          </ul>
        </AccordionSection>

        {/* ── Settings ── */}
        <AccordionSection icon="settings" title="Settings" defaultOpen={allOpen}>
          <p>
            The <strong>Settings</strong> page lets you configure your dashboard preferences to customize how data is displayed and which reporting period is shown by default.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Default Reporting Month</strong> — Set which month the dashboard loads by default. This controls the period shown across all financial reports.</li>
            <li><strong>Dynamic Month Switching</strong> — Enable automatic month advancement based on the current calendar date. When enabled, the dashboard will automatically switch to the new reporting month after a configurable day of the month (e.g., after the 15th, advance to the current month's data).</li>
            <li><strong>Display Preferences</strong> — Configure how numbers, charts, and layouts appear throughout the application.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>If your close process typically completes by the 15th of the following month, set the dynamic switch day to 15 so the dashboard automatically advances after close.</li>
            <li>You can always manually override the reporting month regardless of the dynamic setting.</li>
          </ul>
        </AccordionSection>

        {/* ── My Account ── */}
        <AccordionSection icon="person" title="My Account" defaultOpen={allOpen}>
          <p>
            The <strong>My Account</strong> page manages your user profile and security settings, including multi-factor authentication (MFA).
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Profile Information</strong> — View and update your account details such as display name and email.</li>
            <li><strong>Password Management</strong> — Change your password from this page. You'll be required to enter your current password for verification.</li>
            <li><strong>MFA Setup &amp; Management</strong> — Enable or reconfigure multi-factor authentication for your account. MFA adds a second layer of security using an authenticator app.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Enabling MFA is strongly recommended to protect access to sensitive financial data.</li>
            <li>If you lose access to your authenticator app, contact your administrator to reset your MFA configuration.</li>
          </ul>
        </AccordionSection>

        {/* ── Submit Ticket ── */}
        <AccordionSection icon="support_agent" title="Submit Ticket" defaultOpen={allOpen}>
          <p>
            The <strong>Submit Ticket</strong> page allows you to send support requests directly from within the dashboard. Use it to report issues, request new features, or ask questions.
          </p>
          <p><strong>Key features:</strong></p>
          <ul>
            <li><strong>Issue Submission</strong> — Describe the issue or request with as much detail as possible for faster resolution.</li>
            <li><strong>Category Selection</strong> — Categorize your ticket (bug report, feature request, question, etc.) to help the support team prioritize and route it appropriately.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Include the specific page, account, or period where you encountered the issue to help the team reproduce and resolve it faster.</li>
            <li>Screenshots can be very helpful — describe what you see versus what you expected.</li>
          </ul>
        </AccordionSection>

        {/* ── Upcoming Modules ── */}
        <AccordionSection icon="rocket_launch" title="Upcoming Modules" defaultOpen={allOpen}>
          <p>
            The <strong>Upcoming Modules</strong> page shows the feature roadmap — modules that are planned or in development for future releases.
          </p>
          <p><strong>Planned modules include:</strong></p>
          <ul>
            <li><strong>FTEs (Full-Time Equivalents)</strong> — Staffing analysis and labor cost tracking by department.</li>
            <li><strong>Supplies per Volume</strong> — Supply cost analysis normalized by patient volume metrics.</li>
            <li><strong>Revenue by Payer</strong> — Revenue breakdown by payer mix (Medicare, Medicaid, commercial, self-pay, etc.).</li>
            <li><strong>Volume Trends</strong> — Detailed patient volume trending across service lines and departments.</li>
          </ul>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Check back periodically to see what's new. Modules will appear in the sidebar as they become available.</li>
            <li>Use the Submit Ticket page to request features or provide input on which modules would be most valuable to your team.</li>
          </ul>
        </AccordionSection>

        {/* ── Getting Started ── */}
        <AccordionSection icon="play_circle" title="Getting Started" defaultOpen={allOpen}>
          <p>New to the Financial Dashboard? Here's a recommended workflow to get oriented:</p>
          <ol style={{ paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Start with the Dashboard</strong> — Get a high-level overview of KPIs and identify any areas that need attention.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Review the Income Statement</strong> — Dive into the details for the current period to understand revenue and expense performance.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Check the Trended IS</strong> — Look at multi-month trends to put the current period in context.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Investigate with GL Transactions</strong> — Drill into any variances or unusual items at the transaction level.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Use Ask AI for questions</strong> — If you need help interpreting the data or want a quick variance explanation, ask the AI assistant.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Configure your Settings</strong> — Set your default reporting month and enable dynamic month switching to streamline your workflow.
            </li>
          </ol>
        </AccordionSection>

        {/* ── Support ── */}
        <AccordionSection icon="contact_support" title="Support & Contact" defaultOpen={allOpen}>
          <p>For additional support or questions about the Financial Dashboard:</p>
          <ul>
            <li><strong>Email:</strong> support@arkitech.com</li>
            <li><strong>Phone:</strong> (555) 123-4567</li>
            <li><strong>Documentation:</strong> www.arkitech.com/docs</li>
          </ul>
          <p>You can also use the <strong>Submit Ticket</strong> page within the app to send a support request directly to the team.</p>
        </AccordionSection>
      </div>
    </div>
  );
};

export default UserGuide;
