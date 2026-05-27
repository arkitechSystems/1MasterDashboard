import React, { useMemo, useRef, useState } from 'react';
import {
  BALANCES_DATA,
  BalanceRow,
  BankRow,
  GLRow,
  AttachmentMap,
  excelSerialToMonthYear,
  formatAmount,
} from './data';

const Amt: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null || value === undefined) return <span className="faint">—</span>;
  const cls = value < 0 ? 'neg' : value > 0 ? 'pos' : 'zero';
  return <span className={`amt ${cls}`}>{formatAmount(value)}</span>;
};

interface BalancesProps {
  bankData: BankRow[];
  glData: GLRow[];
  bankPdfs: AttachmentMap;
  setBankPdfs: React.Dispatch<React.SetStateAction<AttachmentMap>>;
  bankExcels: AttachmentMap;
  setBankExcels: React.Dispatch<React.SetStateAction<AttachmentMap>>;
  bankBalances: Record<number, number>;
  setBankBalances: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  glBalances: Record<number, number>;
  setGlBalances: React.Dispatch<React.SetStateAction<Record<number, number>>>;
}

const PDF_ACCEPT = 'application/pdf,.pdf';
const EXCEL_ACCEPT = '.xlsx,.xls,.xlsm,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

const triggerDownload = (file: { name: string; blob: Blob }) => {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const iconBtnBase: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: '4px',
  background: 'var(--bg-surface)',
  cursor: 'pointer',
  padding: '2px 4px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const Balances: React.FC<BalancesProps> = ({
  bankData,
  glData,
  bankPdfs,
  setBankPdfs,
  bankExcels,
  setBankExcels,
  bankBalances,
  setBankBalances,
  glBalances,
  setGlBalances,
}) => {
  // Single hidden file input per kind, retargeted by row via uploadTarget.
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ me: number; kind: 'pdf' | 'excel' } | null>(null);
  // Preview modal for attached file
  const [viewer, setViewer] = useState<{ url: string; name: string; kind: 'pdf' | 'excel' } | null>(null);
  // In-app replace-confirm modal (replaces window.confirm)
  const [replacePrompt, setReplacePrompt] = useState<{ me: number; kind: 'pdf' | 'excel'; existingName: string } | null>(null);

  // Step 2 of the upload flow — actually open the file picker
  const openFilePicker = (me: number, kind: 'pdf' | 'excel') => {
    setUploadTarget({ me, kind });
    const ref = kind === 'pdf' ? pdfInputRef : excelInputRef;
    ref.current?.click();
  };

  const triggerUpload = (me: number, kind: 'pdf' | 'excel') => {
    const map = kind === 'pdf' ? bankPdfs : bankExcels;
    const existing = map[me];
    if (existing) {
      // Show the in-app confirm modal instead of window.confirm
      setReplacePrompt({ me, kind, existingName: existing.name });
      return;
    }
    openFilePicker(me, kind);
  };

  const confirmReplace = () => {
    if (!replacePrompt) return;
    const { me, kind } = replacePrompt;
    setReplacePrompt(null);
    openFilePicker(me, kind);
  };

  const cancelReplace = () => setReplacePrompt(null);

  const openViewer = (attached: { name: string; blob: Blob }, kind: 'pdf' | 'excel') => {
    const url = URL.createObjectURL(attached.blob);
    setViewer({ url, name: attached.name, kind });
  };

  const closeViewer = () => {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

  const handleFileSelected =
    (kind: 'pdf' | 'excel') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const target = uploadTarget;
      if (!file || !target || target.kind !== kind) {
        if (e.target) e.target.value = '';
        return;
      }
      const setter = kind === 'pdf' ? setBankPdfs : setBankExcels;
      setter((prev) => ({ ...prev, [target.me]: { name: file.name, blob: file } }));
      setUploadTarget(null);
      if (e.target) e.target.value = '';
    };

  const renderAttachmentCell = (me: number, kind: 'pdf' | 'excel', extraClass = '') => {
    const map = kind === 'pdf' ? bankPdfs : bankExcels;
    const attached = map[me];
    return (
      <td className={`c ${extraClass}`} style={{ padding: '4px 4px' }}>
        <div style={{ display: 'inline-flex', gap: '2px' }}>
          <button
            type="button"
            onClick={() => triggerUpload(me, kind)}
            title={attached ? `Replace (current: ${attached.name})` : `Upload ${kind === 'pdf' ? 'PDF' : 'Excel/CSV'}`}
            style={{
              ...iconBtnBase,
              padding: '1px 3px',
              borderColor: attached ? 'var(--pos)' : 'var(--line)',
            }}
          >
            <span
              className="material-icons"
              style={{ fontSize: '14px', color: attached ? 'var(--pos)' : 'var(--muted)' }}
            >
              upload_file
            </span>
          </button>
          <button
            type="button"
            onClick={() => attached && triggerDownload(attached)}
            disabled={!attached}
            title={attached ? `Download ${attached.name}` : 'No file uploaded'}
            style={{
              ...iconBtnBase,
              padding: '1px 3px',
              cursor: attached ? 'pointer' : 'not-allowed',
              opacity: attached ? 1 : 0.4,
            }}
          >
            <span className="material-icons" style={{ fontSize: '14px', color: 'var(--muted)' }}>
              file_download
            </span>
          </button>
          <button
            type="button"
            onClick={() => attached && openViewer(attached, kind)}
            disabled={!attached}
            title={attached ? `View ${attached.name}` : 'No file uploaded'}
            style={{
              ...iconBtnBase,
              padding: '1px 3px',
              cursor: attached ? 'pointer' : 'not-allowed',
              opacity: attached ? 1 : 0.4,
            }}
          >
            <span className="material-icons" style={{ fontSize: '14px', color: 'var(--muted)' }}>
              visibility
            </span>
          </button>
        </div>
      </td>
    );
  };

  // For each balance row, override the static activity with the live sum
  // from the Bank/GL tab data for the matching ME (month). Balances also
  // accept manual overrides via the bankBalances / glBalances state.
  const rows: BalanceRow[] = useMemo(() => {
    return BALANCES_DATA.map((row) => {
      const bankActivityLive = bankData
        .filter((r) => r.me === row.me)
        .reduce((s, r) => s + r.amount, 0);
      const glActivityLive = glData
        .filter((r) => r.me === row.me)
        .reduce((s, r) => s + r.amount, 0);
      return {
        ...row,
        bankBalance: row.me in bankBalances ? bankBalances[row.me] : row.bankBalance,
        glBalance: row.me in glBalances ? glBalances[row.me] : row.glBalance,
        bankActivity: bankActivityLive,
        glActivityPerTab: glActivityLive,
      };
    });
  }, [bankData, glData, bankBalances, glBalances]);

  // Editable balance cell. Stores raw string state so leading "-" / partial
  // edits don't clobber user input. Empty input → remove override.
  const balanceInput = (
    me: number,
    kind: 'bank' | 'gl',
    extraClass = '',
  ) => {
    const overrides = kind === 'bank' ? bankBalances : glBalances;
    const setOverrides = kind === 'bank' ? setBankBalances : setGlBalances;
    const defaultRow = BALANCES_DATA.find((r) => r.me === me);
    const defaultVal = kind === 'bank' ? defaultRow?.bankBalance : defaultRow?.glBalance;
    const current = me in overrides ? overrides[me] : defaultVal;
    return (
      <td className={`r ${extraClass}`}>
        <input
          type="number"
          step="0.01"
          className="cell-input r"
          value={current ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              setOverrides((prev) => {
                const { [me]: _, ...rest } = prev;
                return rest;
              });
              return;
            }
            const parsed = parseFloat(raw);
            if (Number.isNaN(parsed)) return;
            setOverrides((prev) => ({ ...prev, [me]: parsed }));
          }}
        />
      </td>
    );
  };

  const sum = (key: keyof BalanceRow): number =>
    rows.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);

  const totals = {
    bankBalance: sum('bankBalance'),
    bankActivity: sum('bankActivity'),
    bankRollFwd: sum('bankRollFwd'),
    bankVariance: sum('bankVariance'),
    glBalance: sum('glBalance'),
    glActivityPerTab: sum('glActivityPerTab'),
    glRollFwd: sum('glRollFwd'),
    glVariance: sum('glVariance'),
    glVsBank: sum('glVsBank'),
  };

  const numCell = (v: number | null, extraClass = '') => (
    <td className={`r ${extraClass}`}><Amt value={v} /></td>
  );

  return (
    <div className="balances-subpage" style={{ marginTop: '12px' }}>
      <div className="recon-panel">
        <div className="recon-panel-head">
          <div className="rph-title">
            <span className="rph-tag">BALANCES</span>
            <h2>Month-end roll-forward</h2>
          </div>
          <span className="rph-sub">Bank vs GL — manual overrides win over defaults</span>
        </div>

        <div className="recon-table-wrap">
          <table className="recon-table">
            <thead>
              <tr className="group-row">
                <th rowSpan={2}>ME</th>
                <th className="c" colSpan={6}>Bank</th>
                <th className="c gb" colSpan={4}>GL</th>
                <th className="r gb" rowSpan={2}>GL vs Bank</th>
              </tr>
              <tr className="sub-row">
                <th className="r">Balance</th>
                <th className="r">Roll forward</th>
                <th className="r">Activity</th>
                <th className="r">Variance</th>
                <th className="c gb">Bank PDF</th>
                <th className="c">Bank Excel</th>
                <th className="r gb">Balance</th>
                <th className="r">Roll forward</th>
                <th className="r">Activity Per Tab</th>
                <th className="r">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.me}>
                  <td className="mono">{excelSerialToMonthYear(r.me)}</td>
                  {balanceInput(r.me, 'bank')}
                  {numCell(r.bankRollFwd)}
                  {numCell(r.bankActivity)}
                  {numCell(r.bankVariance)}
                  {renderAttachmentCell(r.me, 'pdf', 'gb')}
                  {renderAttachmentCell(r.me, 'excel')}
                  {balanceInput(r.me, 'gl', 'gb')}
                  {numCell(r.glRollFwd)}
                  {numCell(r.glActivityPerTab)}
                  {numCell(r.glVariance)}
                  {numCell(r.glVsBank, 'gb')}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {numCell(totals.bankBalance)}
                {numCell(totals.bankRollFwd)}
                {numCell(totals.bankActivity)}
                {numCell(totals.bankVariance)}
                <td className="gb" />
                <td />
                {numCell(totals.glBalance, 'gb')}
                {numCell(totals.glRollFwd)}
                {numCell(totals.glActivityPerTab)}
                {numCell(totals.glVariance)}
                {numCell(totals.glVsBank, 'gb')}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Hidden file inputs — retargeted per row via uploadTarget state */}
      <input
        ref={pdfInputRef}
        type="file"
        accept={PDF_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleFileSelected('pdf')}
      />
      <input
        ref={excelInputRef}
        type="file"
        accept={EXCEL_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleFileSelected('excel')}
      />

      {/* Replace-confirmation modal — shown when uploading over an existing file */}
      {replacePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={cancelReplace}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '15vh',
            zIndex: 1100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
              width: 'min(480px, 92vw)',
              padding: '22px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="material-icons" style={{ fontSize: '24px', color: '#b45309' }}>warning</span>
              <h2 style={{ margin: 0, fontSize: '17px' }}>Replace existing bank statement?</h2>
            </div>
            <p style={{ margin: '4px 0 6px 0', fontSize: '13px', color: '#444' }}>
              A bank statement has already been uploaded for this month. Would you like to replace it?
            </p>
            <p style={{ margin: '4px 0 18px 0', fontSize: '12px', color: '#888' }}>
              Current file: <strong>{replacePrompt.existingName}</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={cancelReplace}
                style={{
                  background: '#fff',
                  color: '#202020',
                  border: '1.5px solid #b8b8b8',
                  padding: '8px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReplace}
                style={{
                  background: '#1e40af',
                  color: '#fff',
                  border: '1.5px solid #1e3a8a',
                  padding: '8px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span className="material-icons" style={{ fontSize: '18px' }}>upload_file</span>
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document viewer modal — embeds the file via blob URL.
          Browsers render PDFs natively in an iframe; Excel files trigger
          the browser's default behavior (download or open in app). */}
      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeViewer}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              width: 'min(1100px, 95vw)',
              height: 'min(900px, 92vh)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              borderBottom: '1px solid #e0e0e0',
              background: '#fafafa',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                <span className="material-icons" style={{ fontSize: '18px', color: '#555' }}>
                  {viewer.kind === 'pdf' ? 'picture_as_pdf' : 'table_view'}
                </span>
                <span>{viewer.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={viewer.url}
                  download={viewer.name}
                  style={{
                    background: '#e8e8e8',
                    color: '#202020',
                    border: '1.5px solid #b8b8b8',
                    padding: '6px 14px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span className="material-icons" style={{ fontSize: '16px' }}>file_download</span>
                  Download
                </a>
                <button
                  type="button"
                  onClick={closeViewer}
                  aria-label="Close"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#555',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                >
                  <span className="material-icons" style={{ fontSize: '22px' }}>close</span>
                </button>
              </div>
            </div>
            {viewer.kind === 'pdf' ? (
              <iframe
                src={viewer.url}
                title={viewer.name}
                style={{ flex: 1, border: 'none', width: '100%' }}
              />
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                textAlign: 'center',
                color: '#666',
                gap: '12px',
              }}>
                <span className="material-icons" style={{ fontSize: '48px', color: '#999' }}>table_view</span>
                <div style={{ fontSize: '14px' }}>
                  Excel/CSV files can't be previewed in-browser.
                </div>
                <div style={{ fontSize: '13px', color: '#888' }}>
                  Use the Download button above to open in your spreadsheet app.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Balances;
