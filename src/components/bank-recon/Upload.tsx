import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BankRow, GLRow } from './data';

interface UploadProps {
  setBankData: React.Dispatch<React.SetStateAction<BankRow[]>>;
  setGlData: React.Dispatch<React.SetStateAction<GLRow[]>>;
}

// Template column definitions — must match the Bank/GL tables in BankGL.tsx
const BANK_COLUMNS = ['Date', 'Description', 'Comments', 'Check Number', 'Amount', 'Bank ID', 'Match #', 'ME'];
const GL_COLUMNS = ['Date', 'Memo', 'Reference', 'Journal', 'Amount', 'Match #', 'ME'];

const BANK_COL_WIDTHS = [12, 32, 22, 15, 12, 15, 10, 12];
const GL_COL_WIDTHS = [12, 32, 18, 12, 12, 10, 12];

const downloadBankTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([BANK_COLUMNS]);
  ws['!cols'] = BANK_COL_WIDTHS.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank');
  XLSX.writeFile(wb, 'Bank_Template.xlsx');
};

const downloadGlTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([GL_COLUMNS]);
  ws['!cols'] = GL_COL_WIDTHS.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GL');
  XLSX.writeFile(wb, 'GL_Template.xlsx');
};

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseBankFile = async (file: File): Promise<BankRow[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  return rows
    .slice(1) // skip header
    .filter((r) => Array.isArray(r) && r.some((c) => c !== null && c !== ''))
    .map<BankRow>((r) => ({
      date: num(r[0]),
      description: String(r[1] ?? ''),
      comments: String(r[2] ?? ''),
      checkNumber: String(r[3] ?? ''),
      amount: num(r[4]),
      bankId: String(r[5] ?? ''),
      matchNum: num(r[6]),
      me: num(r[7]),
    }));
};

const parseGlFile = async (file: File): Promise<GLRow[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  return rows
    .slice(1)
    .filter((r) => Array.isArray(r) && r.some((c) => c !== null && c !== ''))
    .map<GLRow>((r) => ({
      date: num(r[0]),
      memo: String(r[1] ?? ''),
      reference: String(r[2] ?? ''),
      journal: String(r[3] ?? ''),
      checkNumber: '',
      amount: num(r[4]),
      matchNum: num(r[5]),
      me: num(r[6]),
    }));
};

// ─── Styles ───
const panelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: '1px solid #d0d0d0',
  borderRadius: '6px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  padding: '20px',
};

const primaryBtn: React.CSSProperties = {
  background: '#1e40af',
  color: '#fff',
  border: '1.5px solid #1e3a8a',
  padding: '10px 20px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  whiteSpace: 'nowrap',
};

const secondaryBtn: React.CSSProperties = {
  background: '#e8e8e8',
  color: '#202020',
  border: '1.5px solid #b8b8b8',
  padding: '10px 20px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  whiteSpace: 'nowrap',
};

const Upload: React.FC<UploadProps> = ({ setBankData, setGlData }) => {
  const bankInputRef = useRef<HTMLInputElement>(null);
  const glInputRef = useRef<HTMLInputElement>(null);
  const [bankStatus, setBankStatus] = useState<string>('');
  const [glStatus, setGlStatus] = useState<string>('');

  const handleBankUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankStatus('Reading…');
    try {
      const rows = await parseBankFile(file);
      if (rows.length === 0) {
        setBankStatus('No rows found. Check the template format.');
        return;
      }
      setBankData(rows);
      setBankStatus(`Loaded ${rows.length} row${rows.length === 1 ? '' : 's'} from ${file.name}`);
    } catch (err) {
      console.error(err);
      setBankStatus('Could not parse the file. Confirm it matches the Bank template.');
    } finally {
      if (bankInputRef.current) bankInputRef.current.value = '';
    }
  };

  const handleGlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGlStatus('Reading…');
    try {
      const rows = await parseGlFile(file);
      if (rows.length === 0) {
        setGlStatus('No rows found. Check the template format.');
        return;
      }
      setGlData(rows);
      setGlStatus(`Loaded ${rows.length} row${rows.length === 1 ? '' : 's'} from ${file.name}`);
    } catch (err) {
      console.error(err);
      setGlStatus('Could not parse the file. Confirm it matches the GL template.');
    } finally {
      if (glInputRef.current) glInputRef.current.value = '';
    }
  };

  return (
    <div className="bank-recon-subpage" style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
        {/* ─── Bank side ─── */}
        <div style={panelStyle}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Bank Statement</h2>
          <p style={{ marginTop: 0, fontSize: '13px', color: '#666' }}>
            Download the template, paste in your bank's exported transactions,
            then upload to populate the Bank table.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <button type="button" onClick={downloadBankTemplate} style={secondaryBtn}>
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>download</span>
              <span>Download Bank Template</span>
            </button>
            <button type="button" onClick={() => bankInputRef.current?.click()} style={primaryBtn}>
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>upload_file</span>
              <span>Upload Bank</span>
            </button>
            <input
              ref={bankInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              onChange={handleBankUpload}
              style={{ display: 'none' }}
            />
            {bankStatus && (
              <div style={{ fontSize: '13px', color: '#444', fontStyle: 'italic' }}>{bankStatus}</div>
            )}
          </div>
          <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
            <strong>Columns:</strong> {BANK_COLUMNS.join(' · ')}
          </div>
        </div>

        {/* ─── GL side ─── */}
        <div style={panelStyle}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>GL Extract</h2>
          <p style={{ marginTop: 0, fontSize: '13px', color: '#666' }}>
            Download the template, paste in your GL detail for the cash account,
            then upload to populate the GL table.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <button type="button" onClick={downloadGlTemplate} style={secondaryBtn}>
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>download</span>
              <span>Download GL Template</span>
            </button>
            <button type="button" onClick={() => glInputRef.current?.click()} style={primaryBtn}>
              <span className="material-icons" aria-hidden="true" style={{ fontSize: '18px' }}>upload_file</span>
              <span>Upload GL</span>
            </button>
            <input
              ref={glInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              onChange={handleGlUpload}
              style={{ display: 'none' }}
            />
            {glStatus && (
              <div style={{ fontSize: '13px', color: '#444', fontStyle: 'italic' }}>{glStatus}</div>
            )}
          </div>
          <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
            <strong>Columns:</strong> {GL_COLUMNS.join(' · ')}
          </div>
        </div>
      </div>

      {/* ─── Instructions ─── */}
      <div style={{
        marginTop: '24px',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        background: '#fafafa',
        padding: '20px 24px',
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#333' }}>
          How to use the Upload page
        </h3>
        <ol style={{ margin: 0, paddingLeft: '22px', color: '#444', fontSize: '13px', lineHeight: 1.7 }}>
          <li>
            <strong>Download the templates.</strong> Click <em>Download Bank Template</em> and
            <em> Download GL Template</em> above. Each is a one-sheet Excel file with the column
            headers your data must follow.
          </li>
          <li>
            <strong>Fill in your transactions.</strong> Open the downloaded files and paste
            your bank statement export into the Bank template, and your GL detail for the
            cash account into the GL template. Add one row per transaction beneath the
            header row.
          </li>
          <li>
            <strong>Use the right values per column.</strong>
            <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
              <li><strong>Date</strong> and <strong>ME</strong> — Excel date cells (the templates are pre-formatted).
                  ME is the month-end this row reconciles to.</li>
              <li><strong>Amount</strong> — signed number. Positive for deposits / debits to cash, negative for withdrawals / credits to cash.</li>
              <li><strong>Match #</strong> — leave blank (0) for unmatched rows. The Bank/GL tab will let
                  you assign these later, or use Auto Match to pair amounts to the penny.</li>
              <li>Bank-only: <strong>Bank ID</strong> is the bank's internal transaction ID (optional, useful for Plaid).</li>
              <li>GL-only: <strong>Reference</strong> and <strong>Journal</strong> are the JE / batch identifiers from the GL.</li>
            </ul>
          </li>
          <li>
            <strong>Upload.</strong> Click <em>Upload Bank</em> or <em>Upload GL</em> and pick your
            filled-in file. The Bank/GL tab populates immediately, and the Balances / Matches /
            Reconciliation tabs recompute against the new data.
          </li>
          <li>
            <strong>Re-uploading replaces.</strong> Each upload overwrites the prior dataset for
            that side. To append, paste new rows into your existing template and re-upload.
          </li>
        </ol>
        <div style={{ marginTop: '14px', fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
          Supported formats: .xlsx, .xls, .xlsm, .csv. Header row must match the template exactly.
        </div>
      </div>
    </div>
  );
};

export default Upload;
