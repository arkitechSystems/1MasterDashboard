import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Reconciliation from './bank-recon/Reconciliation';
import Matches from './bank-recon/Matches';
import BankGL from './bank-recon/BankGL';
import Balances from './bank-recon/Balances';
import Upload from './bank-recon/Upload';
import ConnectToBankButton from './bank-recon/ConnectToBankButton';
import './BankRecon.css';
import {
  INITIAL_BANK_DATA,
  INITIAL_GL_DATA,
  BankRow,
  GLRow,
  BALANCES_DATA,
  AttachmentMap,
  excelSerialToMonthYear,
  excelSerialToString,
  computeMatches,
  formatAmount,
} from './bank-recon/data';

type BankReconTab = 'reconciliation' | 'matches' | 'bank-gl' | 'upload' | 'balances';

const TABS: { id: BankReconTab; label: string; icon: string }[] = [
  { id: 'reconciliation', label: 'Reconciliation', icon: 'verified' },
  { id: 'matches',        label: 'Matches',        icon: 'join_inner' },
  { id: 'bank-gl',        label: 'Bank/GL',        icon: 'compare_arrows' },
  { id: 'balances',       label: 'Balances',       icon: 'account_balance' },
  { id: 'upload',         label: 'Upload',         icon: 'upload_file' },
];

const BankRecon: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [activeTab, setActiveTab] = useState<BankReconTab>('reconciliation');

  // Lifted state so Matches and Bank/GL tabs share the same underlying data
  const [bankData, setBankData] = useState<BankRow[]>(INITIAL_BANK_DATA);
  const [glData, setGlData] = useState<GLRow[]>(INITIAL_GL_DATA);
  const [savedSnapshot, setSavedSnapshot] = useState<{ bank: BankRow[]; gl: GLRow[] }>({
    bank: INITIAL_BANK_DATA,
    gl: INITIAL_GL_DATA,
  });

  // Reconciliation metadata — lifted so PDF/Excel exports can read it.
  const [glAccountNumber, setGlAccountNumber] = useState('');
  const [accountDescription, setAccountDescription] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  // Filter checkbox state — Excel export mirrors what the user is seeing on
  // the Reconciliation tab (PDF always uses the non-zero filter).
  const [hideZeroReconciling, setHideZeroReconciling] = useState(false);

  // Per-month bank statement attachments (keyed by ME serial)
  const [bankPdfs, setBankPdfs] = useState<AttachmentMap>({});
  const [bankExcels, setBankExcels] = useState<AttachmentMap>({});

  // Per-month manual balance entries (keyed by ME serial). Override the
  // defaults in BALANCES_DATA for both the Balances tab and the
  // Reconciliation tab's GL Account Balance + Bank Balance lookups.
  const [bankBalances, setBankBalances] = useState<Record<number, number>>({});
  const [glBalances, setGlBalances] = useState<Record<number, number>>({});

  // Cross-tab navigation: clicking a Match # on Reconciliation jumps to
  // Bank/GL and filters both tables down to that single match number.
  const [matchNumFilter, setMatchNumFilter] = useState<number | null>(null);
  const jumpToMatch = (matchNum: number) => {
    setMatchNumFilter(matchNum);
    setActiveTab('bank-gl');
  };

  const handleExportExcel = () => {
    const periodSerial = parseInt(selectedMonth, 10);
    const hasPeriod = !Number.isNaN(periodSerial);
    const periodLabel = hasPeriod ? excelSerialToMonthYear(periodSerial) : '';

    const filteredBank = hasPeriod ? bankData.filter((r) => r.me <= periodSerial) : bankData;
    const filteredGL = hasPeriod ? glData.filter((r) => r.me <= periodSerial) : glData;
    const allMatches = computeMatches(filteredBank, filteredGL);

    // Mirror the Reconciliation tab: respect the "Show only reconciling
    // amounts" checkbox. Checked → only non-zero recon. Unchecked → all.
    const visibleMatches = hideZeroReconciling
      ? allMatches.filter((m) => +(m.glAmt - m.bankAmt).toFixed(2) !== 0)
      : allMatches;
    const visibleMatchNums = new Set(visibleMatches.map((m) => m.matchNum));

    const bankTxnsExport = hideZeroReconciling
      ? filteredBank.filter((r) => visibleMatchNums.has(r.matchNum))
      : filteredBank;
    const glTxnsExport = hideZeroReconciling
      ? filteredGL.filter((r) => visibleMatchNums.has(r.matchNum))
      : filteredGL;

    // Balances lookups
    let currentBalance: number | null = null;
    let priorBalance: number | null = null;
    let bankBalanceForMonth: number | null = null;
    if (hasPeriod) {
      const idx = BALANCES_DATA.findIndex((r) => r.me === periodSerial);
      if (idx !== -1) {
        currentBalance = BALANCES_DATA[idx].glBalance;
        priorBalance = idx > 0 ? BALANCES_DATA[idx - 1].glBalance : null;
        bankBalanceForMonth = BALANCES_DATA[idx].bankBalance;
      }
    }
    const numOrZero = (v: number | null) => (typeof v === 'number' ? v : 0);
    const balanceChange =
      currentBalance === null ? null : numOrZero(currentBalance) - numOrZero(priorBalance);
    const totalBank = visibleMatches.reduce((s, m) => s + m.bankAmt, 0);
    const totalGL = visibleMatches.reduce((s, m) => s + m.glAmt, 0);
    const totalReconcilingAmount = +(
      numOrZero(bankBalanceForMonth) + visibleMatches.reduce((s, m) => s + (m.glAmt - m.bankAmt), 0)
    ).toFixed(2);
    const varianceToGLBalance =
      currentBalance === null ? null : +(numOrZero(currentBalance) - totalReconcilingAmount).toFixed(2);

    const wb = XLSX.utils.book_new();

    // ─── Sheet 1: Reconciliation ───
    const reconRows: (string | number | null)[][] = [];
    reconRows.push([]);
    reconRows.push(['', '', '', '[Entity Name]']);
    reconRows.push(['', '', '', 'Bank Reconciliation']);
    reconRows.push(['', '', '', 'For the Period Ending:', '', periodLabel || '']);
    reconRows.push([]);
    reconRows.push(['GL Account Number:', '', glAccountNumber, '', 'Reviewed By:']);
    reconRows.push(['Account Description:', '', accountDescription, '', 'Prepared By:']);
    reconRows.push(['Bank Name:', '', bankName, '', 'Bank Account Number:', '', bankAccountNumber]);
    reconRows.push([]);
    reconRows.push(['', '', '', 'Current Month', 'Prior Month', 'Change']);
    reconRows.push(['GL Account Balance', '', '', currentBalance, priorBalance, balanceChange]);
    reconRows.push([]);
    reconRows.push(['Detail Support for Current Month']);
    reconRows.push(['Match #', 'Description', 'Bank', 'GL', 'Reconciling Amount']);
    reconRows.push(['', 'Bank Balance', '', '', bankBalanceForMonth]);
    visibleMatches.forEach((m) => {
      const desc =
        m.matchNum === 0
          ? 'Unreconciled Activity'
          : m.bankCount > 0 && m.glCount > 0
            ? `${m.bankDesc} ${m.glDesc}`
            : m.bankCount > 0
              ? m.bankDesc
              : m.glDesc;
      reconRows.push([m.matchNum, desc, m.bankAmt, m.glAmt, +(m.glAmt - m.bankAmt).toFixed(2)]);
    });
    reconRows.push(['Total', '', totalBank, totalGL, totalReconcilingAmount]);
    reconRows.push(['Variance to GL Balance', '', '', '', varianceToGLBalance]);
    const wsRecon = XLSX.utils.aoa_to_sheet(reconRows);
    wsRecon['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsRecon, 'Reconciliation');

    // ─── Sheet 2: Matches ───
    const matchesRows: (string | number)[][] = [
      ['Match #', 'Description', 'Bank Amt', 'Bank Desc', 'Bank Month', 'Bank Count', 'GL Amt', 'GL Desc', 'GL Month', 'GL Count', 'Reconciling Amount'],
      ...visibleMatches.map((m) => [
        m.matchNum,
        m.matchNum === 0 ? 'Unreconciled Activity' : `${m.bankDesc} ${m.glDesc}`.trim(),
        m.bankAmt,
        m.bankDesc,
        m.bankMonth ? excelSerialToMonthYear(m.bankMonth) : '',
        m.bankCount,
        m.glAmt,
        m.glDesc,
        m.glMonth ? excelSerialToMonthYear(m.glMonth) : '',
        m.glCount,
        +(m.glAmt - m.bankAmt).toFixed(2),
      ]),
    ];
    const wsMatches = XLSX.utils.aoa_to_sheet(matchesRows);
    wsMatches['!cols'] = [
      { wch: 10 }, { wch: 36 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMatches, 'Matches');

    // ─── Sheet 3: Bank ───
    const bankRows: (string | number)[][] = [
      ['Date', 'Description', 'Comments', 'Check Number', 'Amount', 'Bank ID', 'Match #', 'ME'],
      ...bankTxnsExport.map((r) => [
        excelSerialToString(r.date),
        r.description,
        r.comments,
        r.checkNumber,
        r.amount,
        r.bankId,
        r.matchNum,
        excelSerialToString(r.me),
      ]),
    ];
    const wsBank = XLSX.utils.aoa_to_sheet(bankRows);
    wsBank['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsBank, 'Bank');

    // ─── Sheet 4: GL ───
    const glRows: (string | number)[][] = [
      ['Date', 'Memo', 'Reference', 'Journal', 'Amount', 'Match #', 'ME'],
      ...glTxnsExport.map((r) => [
        excelSerialToString(r.date),
        r.memo,
        r.reference,
        r.journal,
        r.amount,
        r.matchNum,
        excelSerialToString(r.me),
      ]),
    ];
    const wsGL = XLSX.utils.aoa_to_sheet(glRows);
    wsGL['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsGL, 'GL');

    // ─── Sheet 5: Balances ───
    const balRows: (string | number | null)[][] = [
      ['ME', 'Bank Balance', 'Bank Activity', 'Bank Roll 4wd', 'Bank Variance', 'GL Balance', 'GL Activity Per Tab', 'GL Roll 4wd', 'GL Variance', 'GL vs Bank'],
      ...BALANCES_DATA.map((r) => {
        const bankAct = bankData.filter((b) => b.me === r.me).reduce((s, b) => s + b.amount, 0);
        const glAct = glData.filter((g) => g.me === r.me).reduce((s, g) => s + g.amount, 0);
        return [
          excelSerialToMonthYear(r.me),
          r.bankBalance,
          bankAct,
          r.bankRollFwd,
          r.bankVariance,
          r.glBalance,
          glAct,
          r.glRollFwd,
          r.glVariance,
          r.glVsBank,
        ];
      }),
    ];
    const wsBal = XLSX.utils.aoa_to_sheet(balRows);
    wsBal['!cols'] = Array(10).fill({ wch: 14 });
    XLSX.utils.book_append_sheet(wb, wsBal, 'Balances');

    const fileName = `Bank_Reconciliation${periodLabel ? `_${periodLabel.replace(' ', '_')}` : ''}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportPDF = () => {
    const periodSerial = parseInt(selectedMonth, 10);
    const hasPeriod = !Number.isNaN(periodSerial);
    const periodLabel = hasPeriod ? excelSerialToMonthYear(periodSerial) : '';

    // Cumulative SUMIF: only transactions ≤ period ending count
    const filteredBank = hasPeriod ? bankData.filter((r) => r.me <= periodSerial) : bankData;
    const filteredGL = hasPeriod ? glData.filter((r) => r.me <= periodSerial) : glData;
    const matches = computeMatches(filteredBank, filteredGL);

    // Only matches with non-zero reconciling amount (gl − bank) flow to the PDF
    const reconcilingMatches = matches.filter(
      (m) => +(m.glAmt - m.bankAmt).toFixed(2) !== 0,
    );
    const reconcilingMatchNums = new Set(reconcilingMatches.map((m) => m.matchNum));

    // Pull the bank/GL transactions tied to those non-zero match numbers
    const bankTxnsForPDF = filteredBank.filter((r) => reconcilingMatchNums.has(r.matchNum));
    const glTxnsForPDF = filteredGL.filter((r) => reconcilingMatchNums.has(r.matchNum));

    // GL Account Balance lookup
    let currentBalance: number | null = null;
    let priorBalance: number | null = null;
    let bankBalanceForMonth: number | null = null;
    if (hasPeriod) {
      const idx = BALANCES_DATA.findIndex((r) => r.me === periodSerial);
      if (idx !== -1) {
        currentBalance = BALANCES_DATA[idx].glBalance;
        priorBalance = idx > 0 ? BALANCES_DATA[idx - 1].glBalance : null;
        bankBalanceForMonth = BALANCES_DATA[idx].bankBalance;
      }
    }
    const numOrZero = (v: number | null) => (typeof v === 'number' ? v : 0);
    const balanceChange = numOrZero(currentBalance) - numOrZero(priorBalance);
    const totalBank = matches.reduce((s, m) => s + m.bankAmt, 0);
    const totalGL = matches.reduce((s, m) => s + m.glAmt, 0);
    const totalReconcilingAmount = +(
      numOrZero(bankBalanceForMonth) + matches.reduce((s, m) => s + (m.glAmt - m.bankAmt), 0)
    ).toFixed(2);
    const varianceToGLBalance = +(numOrZero(currentBalance) - totalReconcilingAmount).toFixed(2);

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // ─── Page 1: Reconciliation summary ───
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('[Entity Name]', pageWidth / 2, 56, { align: 'center' });
    doc.setFontSize(13);
    doc.text('Bank Reconciliation', pageWidth / 2, 76, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`For the Period Ending: ${periodLabel || '—'}`, pageWidth / 2, 94, { align: 'center' });

    // Metadata block
    const metaLeftLabel = 60;
    const metaLeftVal = 200;
    const metaRightLabel = 330;
    const metaRightVal = 480;
    let metaY = 130;
    doc.setFont('helvetica', 'bold');
    doc.text('GL Account Number:', metaLeftLabel, metaY);
    doc.text('Reviewed By:', metaRightLabel, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(glAccountNumber || '—', metaLeftVal, metaY);
    metaY += 18;
    doc.setFont('helvetica', 'bold');
    doc.text('Account Description:', metaLeftLabel, metaY);
    doc.text('Prepared By:', metaRightLabel, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(accountDescription || '—', metaLeftVal, metaY);
    metaY += 18;
    doc.setFont('helvetica', 'bold');
    doc.text('Bank Name:', metaLeftLabel, metaY);
    doc.text('Bank Account Number:', metaRightLabel, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(bankName || '—', metaLeftVal, metaY);
    doc.text(bankAccountNumber || '—', metaRightVal, metaY);

    // Balance summary
    autoTable(doc, {
      startY: metaY + 28,
      head: [['', 'Current Month', 'Prior Month', 'Change']],
      body: [[
        'GL Account Balance',
        currentBalance === null ? '—' : formatAmount(currentBalance),
        priorBalance === null ? '—' : formatAmount(priorBalance),
        currentBalance === null ? '—' : formatAmount(balanceChange),
      ]],
      headStyles: { fillColor: [245, 245, 245], textColor: 50, fontStyle: 'bold' },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    });

    // Detail support
    // @ts-ignore — autoTable mutates doc.lastAutoTable
    const afterBalanceY = (doc as any).lastAutoTable.finalY + 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Detail Support for Current Month', 60, afterBalanceY);

    const detailBody: (string | number)[][] = [];
    detailBody.push([
      '',
      'Bank Balance',
      '',
      '',
      bankBalanceForMonth === null ? '—' : formatAmount(bankBalanceForMonth),
    ]);
    matches.forEach((m) => {
      const recAmt = +(m.glAmt - m.bankAmt).toFixed(2);
      const description =
        m.matchNum === 0
          ? 'Unreconciled Activity'
          : m.bankCount > 0 && m.glCount > 0
            ? `${m.bankDesc} ${m.glDesc}`
            : m.bankCount > 0
              ? m.bankDesc
              : m.glDesc;
      detailBody.push([
        m.matchNum,
        description,
        formatAmount(m.bankAmt),
        formatAmount(m.glAmt),
        formatAmount(recAmt),
      ]);
    });

    autoTable(doc, {
      startY: afterBalanceY + 8,
      head: [['Match #', 'Description', 'Bank', 'GL', 'Reconciling Amount']],
      body: detailBody,
      foot: [
        ['Total', '',
          totalBank === 0 ? '—' : formatAmount(totalBank),
          totalGL === 0 ? '—' : formatAmount(totalGL),
          totalReconcilingAmount === 0 ? '—' : formatAmount(totalReconcilingAmount),
        ],
        ['Variance to GL Balance', '', '', '',
          currentBalance === null ? '—' : formatAmount(varianceToGLBalance),
        ],
      ],
      headStyles: { fillColor: [245, 245, 245], textColor: 50, fontStyle: 'bold' },
      footStyles: { fillColor: [250, 250, 250], textColor: 40, fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { halign: 'right', cellWidth: 50 },
        1: { halign: 'left' },
        2: { halign: 'right', cellWidth: 70 },
        3: { halign: 'right', cellWidth: 70 },
        4: { halign: 'center', cellWidth: 90, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // Red highlight on non-zero reconciling amounts + variance to GL
        if (data.section === 'body' && data.column.index === 4) {
          const v = parseFloat(String(data.cell.raw).replace(/[(),]/g, '').replace(/^-/, '-')) || 0;
          const isParen = String(data.cell.raw).includes('(');
          const signed = isParen ? -Math.abs(v) : v;
          if (signed !== 0 && data.cell.raw !== '—') {
            data.cell.styles.textColor = [185, 28, 28];
          } else if (data.cell.raw !== '—') {
            data.cell.styles.textColor = [21, 128, 61];
          }
        }
        if (data.section === 'foot' && data.row.index === 1 && data.column.index === 4) {
          if (varianceToGLBalance !== 0) {
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fillColor = [254, 242, 242];
          } else if (currentBalance !== null) {
            data.cell.styles.textColor = [21, 128, 61];
          }
        }
      },
    });

    // ─── Page 2: Matches (only non-zero reconciling) ───
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Matches — Reconciling Items', pageWidth / 2, 56, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period Ending ${periodLabel || '—'}`, pageWidth / 2, 74, { align: 'center' });

    if (reconcilingMatches.length === 0) {
      doc.setFontSize(11);
      doc.text(
        'No matches have a non-zero reconciling amount for this period.',
        pageWidth / 2,
        110,
        { align: 'center' },
      );
    } else {
      autoTable(doc, {
        startY: 96,
        head: [['Match #', 'Description', 'Bank Amt', 'Bank Desc', 'Bank Cnt', 'GL Amt', 'GL Desc', 'GL Cnt', 'Reconciling']],
        body: reconcilingMatches.map((m) => [
          m.matchNum,
          m.matchNum === 0 ? 'Unreconciled Activity' : `${m.bankDesc} ${m.glDesc}`.trim(),
          formatAmount(m.bankAmt),
          m.bankDesc,
          m.bankCount,
          formatAmount(m.glAmt),
          m.glDesc,
          m.glCount,
          formatAmount(+(m.glAmt - m.bankAmt).toFixed(2)),
        ]),
        headStyles: { fillColor: [245, 245, 245], textColor: 50, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { halign: 'right', cellWidth: 40 },
          2: { halign: 'right' },
          4: { halign: 'right', cellWidth: 35 },
          5: { halign: 'right' },
          7: { halign: 'right', cellWidth: 30 },
          8: { halign: 'right', fontStyle: 'bold' },
        },
      });
    }

    // ─── Page 3: Bank transactions (only those tied to non-zero matches) ───
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Bank Transactions — Reconciling Items', pageWidth / 2, 56, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period Ending ${periodLabel || '—'}`, pageWidth / 2, 74, { align: 'center' });

    if (bankTxnsForPDF.length === 0) {
      doc.setFontSize(11);
      doc.text('No bank transactions tie to reconciling matches.', pageWidth / 2, 110, { align: 'center' });
    } else {
      autoTable(doc, {
        startY: 96,
        head: [['Date', 'Description', 'Check #', 'Amount', 'Bank ID', 'Match #', 'ME']],
        body: bankTxnsForPDF.map((r) => [
          excelSerialToString(r.date),
          r.description,
          r.checkNumber,
          formatAmount(r.amount),
          r.bankId,
          r.matchNum,
          excelSerialToString(r.me),
        ]),
        headStyles: { fillColor: [245, 245, 245], textColor: 50, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: {
          3: { halign: 'right' },
          5: { halign: 'right', cellWidth: 50 },
        },
      });
    }

    // ─── Page 4: GL transactions (only those tied to non-zero matches) ───
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('General Ledger Transactions — Reconciling Items', pageWidth / 2, 56, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period Ending ${periodLabel || '—'}`, pageWidth / 2, 74, { align: 'center' });

    if (glTxnsForPDF.length === 0) {
      doc.setFontSize(11);
      doc.text('No GL transactions tie to reconciling matches.', pageWidth / 2, 110, { align: 'center' });
    } else {
      autoTable(doc, {
        startY: 96,
        head: [['Date', 'Memo', 'Reference', 'Journal', 'Amount', 'Match #', 'ME']],
        body: glTxnsForPDF.map((r) => [
          excelSerialToString(r.date),
          r.memo,
          r.reference,
          r.journal,
          formatAmount(r.amount),
          r.matchNum,
          excelSerialToString(r.me),
        ]),
        headStyles: { fillColor: [245, 245, 245], textColor: 50, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right', cellWidth: 50 },
        },
      });
    }

    const fileName = `Bank_Reconciliation${periodLabel ? `_${periodLabel.replace(' ', '_')}` : ''}.pdf`;
    doc.save(fileName);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'reconciliation':
        return (
          <Reconciliation
            selectedMonth={selectedMonth}
            bankData={bankData}
            glData={glData}
            glAccountNumber={glAccountNumber}
            setGlAccountNumber={setGlAccountNumber}
            accountDescription={accountDescription}
            setAccountDescription={setAccountDescription}
            bankName={bankName}
            setBankName={setBankName}
            bankAccountNumber={bankAccountNumber}
            setBankAccountNumber={setBankAccountNumber}
            hideZeroReconciling={hideZeroReconciling}
            setHideZeroReconciling={setHideZeroReconciling}
            onMatchClick={jumpToMatch}
            bankBalances={bankBalances}
            glBalances={glBalances}
          />
        );
      case 'matches':
        return <Matches bankData={bankData} glData={glData} />;
      case 'bank-gl':
        return (
          <BankGL
            bankData={bankData}
            setBankData={setBankData}
            glData={glData}
            setGlData={setGlData}
            savedSnapshot={savedSnapshot}
            setSavedSnapshot={setSavedSnapshot}
            matchNumFilter={matchNumFilter}
            setMatchNumFilter={setMatchNumFilter}
          />
        );
      case 'upload':
        return <Upload setBankData={setBankData} setGlData={setGlData} />;
      case 'balances':
        return (
          <Balances
            bankData={bankData}
            glData={glData}
            bankPdfs={bankPdfs}
            setBankPdfs={setBankPdfs}
            bankExcels={bankExcels}
            setBankExcels={setBankExcels}
            bankBalances={bankBalances}
            setBankBalances={setBankBalances}
            glBalances={glBalances}
            setGlBalances={setGlBalances}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="bank-recon">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h1 className="page-title">Bank Reconciliation</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <ConnectToBankButton setBankData={setBankData} />
          <label htmlFor="bank-recon-month" style={{ fontWeight: 'bold' }}>
            Month:
          </label>
          <select
            id="bank-recon-month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              minWidth: '160px'
            }}
          >
            <option value="">—</option>
            {BALANCES_DATA.map((r) => (
              <option key={r.me} value={String(r.me)}>
                {excelSerialToMonthYear(r.me)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <hr style={{ margin: '4px 0' }} />

      <div
        className="bank-recon-tabs-row"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '8px 0' }}
      >
        <div className="br-tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`br-tab ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="material-icons" aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn" onClick={handleExportExcel}>
            <span className="material-icons" aria-hidden="true">download</span>
            <span>Export to Excel</span>
          </button>
          <button type="button" className="btn" onClick={handleExportPDF}>
            <span className="material-icons" aria-hidden="true">picture_as_pdf</span>
            <span>Export to PDF</span>
          </button>
        </div>
      </div>

      {renderTab()}
    </div>
  );
};

export default BankRecon;
