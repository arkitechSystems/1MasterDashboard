import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './Admin.css';

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */
type StatementCode = 'IS' | 'BS' | '';

interface CoaRow {
  id: string;
  account: string;
  name: string;
  legacyGl: string;
  type: string;
  statement: StatementCode;
  line: string;
  dept: string;
  deptDescription: string;
  subAccount: string;
  active: boolean;
}

type LineKind = 'header' | 'account' | 'subtotal' | 'formula';

interface CalcTerm {
  sign: '+' | '-';
  label: string;
}

interface StatementLine {
  id: string;
  kind: LineKind;
  label: string;
  section: string;
  sign?: '+' | '-';
  formula?: string;
  calcTerms?: CalcTerm[];
  bold?: boolean;
}

interface DeptRow {
  id: string;
  code: string;
  name: string;
}

const INITIAL_COA: CoaRow[] = [];
const INITIAL_IS_LINES: StatementLine[] = [];
const INITIAL_BS_LINES: StatementLine[] = [];
const INITIAL_DEPT_LIST: DeptRow[] = [];

const STATEMENT_COLOR: Record<string, { bg: string; fg: string; ring: string }> = {
  IS: { bg: '#e8f8f4', fg: '#0f8a72', ring: '#bce8dc' },
  BS: { bg: '#eaf1ff', fg: '#1d4ed8', ring: '#c2d5fb' },
  '': { bg: '#fff7ed', fg: '#b45309', ring: '#fcd9a8' },
};

const KIND_META: Record<LineKind, { label: string; color: string; icon: string }> = {
  header:   { label: 'Header',       color: '#64748b', icon: 'label' },
  account:  { label: 'Account line', color: '#0f8a72', icon: 'view_stream' },
  subtotal: { label: 'Subtotal',     color: '#1d4ed8', icon: 'functions' },
  formula:  { label: 'Calculation',  color: '#9333ea', icon: 'calculate' },
};

const TYPES = [
  'Asset',
  'Contra Asset',
  'Liability',
  'Equity',
  'Revenue',
  'Contra Revenue',
  'Expense',
];

const IS_TYPES = new Set(['Revenue', 'Contra Revenue', 'Expense']);
const BS_TYPES = new Set(['Asset', 'Contra Asset', 'Liability', 'Equity']);

/** Map an FS / Type cell value to a target statement. */
const inferStatementFromFs = (fs: string): 'IS' | 'BS' | '' => {
  const t = (fs || '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  if (lower === 'is' || lower === 'income statement') return 'IS';
  if (lower === 'bs' || lower === 'balance sheet') return 'BS';
  if (IS_TYPES.has(t)) return 'IS';
  if (BS_TYPES.has(t)) return 'BS';
  return '';
};

const Icon: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => (
  <span className="material-icons" style={style}>{name}</span>
);

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ─────────────────────────────────────────────
   Mapping typeahead — replaces fixed dropdown.
   On exact match → link; on no match → offer to
   create a new line on the IS or BS, appended at
   the bottom of the chosen statement.
   ───────────────────────────────────────────── */
interface MapDropdownProps {
  row: CoaRow;
  isLineLabels: string[];
  bsLineLabels: string[];
  onLink: (statement: 'IS' | 'BS', line: string) => void;
  onClear: () => void;
  onCreate: (statement: 'IS' | 'BS', line: string) => void;
}

const MapDropdown: React.FC<MapDropdownProps> = ({
  row,
  isLineLabels,
  bsLineLabels,
  onLink,
  onClear,
  onCreate,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = query.trim();
  const ql = q.toLowerCase();
  const matchesIs = useMemo(
    () => isLineLabels.filter((l) => l.toLowerCase().includes(ql)),
    [isLineLabels, ql],
  );
  const matchesBs = useMemo(
    () => bsLineLabels.filter((l) => l.toLowerCase().includes(ql)),
    [bsLineLabels, ql],
  );

  const exactExists =
    isLineLabels.some((l) => l.toLowerCase() === ql) ||
    bsLineLabels.some((l) => l.toLowerCase() === ql);

  const preferredStatement: 'IS' | 'BS' | null = IS_TYPES.has(row.type)
    ? 'IS'
    : BS_TYPES.has(row.type)
    ? 'BS'
    : null;

  const color = STATEMENT_COLOR[row.statement || ''];
  const label = row.line || 'Unmapped';

  const closeMenu = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={`mapdrop ${open ? 'open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`mapdrop-btn ${row.line ? 'mapped' : 'unmapped'}`}
        onClick={() => setOpen((o) => !o)}
        style={
          row.line
            ? { background: color.bg, color: color.fg, boxShadow: `inset 0 0 0 1px ${color.ring}` }
            : undefined
        }
      >
        {row.line && (
          <span className="mapdrop-tag" style={{ background: color.fg }}>
            {row.statement}
          </span>
        )}
        <span className="mapdrop-text">{label}</span>
        <Icon
          name="expand_more"
          style={{ fontSize: 16, color: row.line ? color.fg : 'var(--ap-muted)' }}
        />
      </button>
      {open && (
        <div className="mapdrop-menu">
          <div className="mapdrop-search">
            <Icon name="search" style={{ fontSize: 16, color: 'var(--ap-muted)' }} />
            <input
              autoFocus
              type="text"
              placeholder="Type to search or create…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {row.line && (
              <button
                type="button"
                className="mapdrop-clear"
                onClick={() => {
                  onClear();
                  closeMenu();
                }}
              >
                Clear
              </button>
            )}
          </div>

          {(matchesIs.length > 0 || (!q && isLineLabels.length === 0 && bsLineLabels.length === 0)) && (
            <>
              <div className="mapdrop-section">
                <span className="ms-tag is">IS</span> Income Statement
              </div>
              {matchesIs.length === 0 && (
                <div className="mapdrop-empty">No income-statement lines yet.</div>
              )}
              {matchesIs.map((it) => (
                <div
                  key={'is-' + it}
                  className={`mapdrop-opt ${row.statement === 'IS' && row.line === it ? 'on' : ''}`}
                  onClick={() => {
                    onLink('IS', it);
                    closeMenu();
                  }}
                >
                  <Icon
                    name="radio_button_unchecked"
                    style={{
                      fontSize: 14,
                      color:
                        row.statement === 'IS' && row.line === it
                          ? 'var(--ap-accent)'
                          : 'var(--ap-faint)',
                    }}
                  />
                  {it}
                </div>
              ))}
            </>
          )}

          {(matchesBs.length > 0 || (!q && bsLineLabels.length === 0)) && (
            <>
              <div className="mapdrop-section" style={{ marginTop: 6 }}>
                <span className="ms-tag bs">BS</span> Balance Sheet
              </div>
              {matchesBs.length === 0 && (
                <div className="mapdrop-empty">No balance-sheet lines yet.</div>
              )}
              {matchesBs.map((it) => (
                <div
                  key={'bs-' + it}
                  className={`mapdrop-opt ${row.statement === 'BS' && row.line === it ? 'on' : ''}`}
                  onClick={() => {
                    onLink('BS', it);
                    closeMenu();
                  }}
                >
                  <Icon
                    name="radio_button_unchecked"
                    style={{
                      fontSize: 14,
                      color:
                        row.statement === 'BS' && row.line === it
                          ? 'var(--ap-accent)'
                          : 'var(--ap-faint)',
                    }}
                  />
                  {it}
                </div>
              ))}
            </>
          )}

          {q && !exactExists && (
            <>
              <div className="mapdrop-section" style={{ marginTop: 6 }}>
                <Icon name="add_circle_outline" style={{ fontSize: 14 }} />
                Create new line
              </div>
              <div
                className={`mapdrop-opt create ${preferredStatement === 'IS' ? 'on' : ''}`}
                onClick={() => {
                  onCreate('IS', q);
                  closeMenu();
                }}
              >
                <span className="ms-tag is">IS</span>
                Add &ldquo;{q}&rdquo; to Income Statement
              </div>
              <div
                className={`mapdrop-opt create ${preferredStatement === 'BS' ? 'on' : ''}`}
                onClick={() => {
                  onCreate('BS', q);
                  closeMenu();
                }}
              >
                <span className="ms-tag bs">BS</span>
                Add &ldquo;{q}&rdquo; to Balance Sheet
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Type pill
   ───────────────────────────────────────────── */
const TypePill: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const cls = value ? value.toLowerCase().replace(/\s/g, '-') : '';
  return (
    <div className={`type-pill-wrap ${open ? 'open' : ''}`}>
      <button
        type="button"
        className={`type-pill ${value ? 'set' : 'empty'} ${cls}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value || '—'}</span>
        <Icon name="expand_more" style={{ fontSize: 14, opacity: 0.6 }} />
      </button>
      {open && (
        <div className="type-pill-menu">
          {TYPES.map((t) => (
            <div
              key={t}
              className={`type-pill-opt ${t === value ? 'on' : ''}`}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
            >
              {t}
            </div>
          ))}
          <div
            className="type-pill-opt clear"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            Clear
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Workbook template + parsing
   ───────────────────────────────────────────── */
const SHEET = {
  coa: 'Chart of Accounts',
  is: 'Income Statement Lines',
  bs: 'Balance Sheet Lines',
  dept: 'Dept List',
};

const COA_HEADERS = [
  'ACCOUNT #',
  'ACCOUNT NAME',
  'LEGACY GL',
  'FS',
  'MAPS TO',
  'DEPT #',
  'DEPT DESC',
  'SUB ACT',
  'ACTIVE',
];
const IS_HEADERS = ['ORDER', 'KIND', 'LABEL', 'SECTION', 'SIGN', 'FORMULA', 'BOLD'];
const BS_HEADERS = ['ORDER', 'KIND', 'LABEL', 'SECTION', 'SIGN', 'FORMULA', 'BOLD'];
const DEPT_HEADERS = ['DEPT CODE', 'DEPT NAME'];

const downloadTemplate = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COA_HEADERS]), SHEET.coa);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([IS_HEADERS]), SHEET.is);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([BS_HEADERS]), SHEET.bs);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([DEPT_HEADERS]), SHEET.dept);
  XLSX.writeFile(wb, 'financial_setup_template.xlsx');
};

interface ParsedCoaRow {
  account: string;
  name: string;
  legacyGl: string;
  type: string;
  mapsTo: string;
  dept: string;
  deptDescription: string;
  subAccount: string;
  active: boolean;
}
interface ParsedLineRow {
  order: number;
  kind: LineKind;
  label: string;
  section: string;
  sign: '+' | '-' | undefined;
  formula: string;
  bold: boolean;
}
interface ParsedDeptRow {
  code: string;
  name: string;
}
interface ParsedWorkbook {
  filename: string;
  coa: ParsedCoaRow[];
  isLines: ParsedLineRow[];
  bsLines: ParsedLineRow[];
  dept: ParsedDeptRow[];
}

const parseSheet = <T,>(
  wb: XLSX.WorkBook,
  name: string,
  mapper: (raw: any, idx: number) => T,
): T[] => {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
  return rows.map(mapper);
};

const parseWorkbook = async (file: File): Promise<ParsedWorkbook> => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const parseActive = (v: any): boolean => {
    if (v === '' || v === null || v === undefined) return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).trim().toLowerCase();
    return !['false', 'no', 'n', '0', 'inactive', 'off'].includes(s);
  };

  const coa = parseSheet<ParsedCoaRow>(wb, SHEET.coa, (r) => ({
    account: String(r['ACCOUNT #'] ?? r['Account #'] ?? r['Account Number'] ?? '').trim(),
    name: String(r['ACCOUNT NAME'] ?? r['Account Name'] ?? '').trim(),
    legacyGl: String(r['LEGACY GL'] ?? r['Legacy GL'] ?? '').trim(),
    type: String(r['FS'] ?? r['Type'] ?? '').trim(),
    mapsTo: String(r['MAPS TO'] ?? r['Maps to'] ?? r['Maps To'] ?? '').trim(),
    dept: String(r['DEPT #'] ?? r['Dept #'] ?? r['Dept'] ?? '').trim(),
    deptDescription: String(r['DEPT DESC'] ?? r['Dept Desc'] ?? r['Dept Description'] ?? '').trim(),
    subAccount: String(r['SUB ACT'] ?? r['Sub Act'] ?? r['Sub Account'] ?? '').trim(),
    active: parseActive(r['ACTIVE'] ?? r['Active']),
  })).filter((r) => r.account || r.name);

  const parseLine = (r: any, idx: number): ParsedLineRow => {
    const kindRaw = String(r['KIND'] ?? r['Kind'] ?? 'account').trim().toLowerCase();
    const kind: LineKind = (['header', 'account', 'subtotal', 'formula'] as LineKind[]).includes(
      kindRaw as LineKind,
    )
      ? (kindRaw as LineKind)
      : 'account';
    const signRaw = String(r['SIGN'] ?? r['Sign'] ?? '').trim();
    const boldRaw = r['BOLD'] ?? r['Bold'];
    return {
      order: Number(r['ORDER'] ?? r['Order'] ?? idx + 1) || idx + 1,
      kind,
      label: String(r['LABEL'] ?? r['Label'] ?? '').trim(),
      section: String(r['SECTION'] ?? r['Section'] ?? '').trim(),
      sign: signRaw === '-' || signRaw === '−' ? '-' : signRaw === '+' ? '+' : undefined,
      formula: String(r['FORMULA'] ?? r['Formula'] ?? '').trim(),
      bold: String(boldRaw ?? '').trim().toLowerCase() === 'true' || boldRaw === true || boldRaw === 1,
    };
  };

  const isLines = parseSheet<ParsedLineRow>(wb, SHEET.is, parseLine)
    .filter((r) => r.label)
    .sort((a, b) => a.order - b.order);
  const bsLines = parseSheet<ParsedLineRow>(wb, SHEET.bs, parseLine)
    .filter((r) => r.label)
    .sort((a, b) => a.order - b.order);

  const dept = parseSheet<ParsedDeptRow>(wb, SHEET.dept, (r) => ({
    code: String(r['DEPT CODE'] ?? r['Dept Code'] ?? '').trim(),
    name: String(r['DEPT NAME'] ?? r['Dept Name'] ?? '').trim(),
  })).filter((r) => r.code || r.name);

  return { filename: file.name, coa, isLines, bsLines, dept };
};

/* ─────────────────────────────────────────────
   Dropzone — single workbook drop
   ───────────────────────────────────────────── */
type DropStatus =
  | { state: 'idle' }
  | { state: 'busy'; filename: string }
  | { state: 'ready'; filename: string; counts: { coa: number; is: number; bs: number; dept: number } }
  | { state: 'error'; filename: string; message: string };

const Dropzone: React.FC<{
  onParsed: (workbook: ParsedWorkbook) => void;
  status: DropStatus;
  setStatus: (s: DropStatus) => void;
}> = ({ onParsed, status, setStatus }) => {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setStatus({ state: 'busy', filename: file.name });
    try {
      const parsed = await parseWorkbook(file);
      setStatus({
        state: 'ready',
        filename: file.name,
        counts: {
          coa: parsed.coa.length,
          is: parsed.isLines.length,
          bs: parsed.bsLines.length,
          dept: parsed.dept.length,
        },
      });
      onParsed(parsed);
    } catch (err: any) {
      setStatus({
        state: 'error',
        filename: file.name,
        message: err?.message || 'Failed to parse workbook.',
      });
    }
  };

  const cls =
    status.state === 'busy'
      ? 'busy'
      : status.state === 'ready'
      ? 'done'
      : status.state === 'error'
      ? 'error'
      : hover
      ? 'hover'
      : '';

  return (
    <div
      className={`drop ${cls}`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <div className="drop-icon">
        <Icon
          name={
            status.state === 'ready'
              ? 'task_alt'
              : status.state === 'busy'
              ? 'sync'
              : status.state === 'error'
              ? 'error_outline'
              : 'cloud_upload'
          }
          style={{ fontSize: 28 }}
        />
      </div>
      <div className="drop-title">
        {status.state === 'ready' && `Parsed ${status.filename}`}
        {status.state === 'busy' && `Parsing ${status.filename}…`}
        {status.state === 'error' && `Failed to parse ${status.filename}`}
        {status.state === 'idle' && 'Drop your Excel template here'}
      </div>
      <div className="drop-sub">
        {status.state === 'ready' &&
          `${status.counts.coa} accounts · ${status.counts.is} IS lines · ${status.counts.bs} BS lines · ${status.counts.dept} departments`}
        {status.state === 'busy' && 'Reading sheets…'}
        {status.state === 'error' && status.message}
        {status.state === 'idle' && 'or'}
      </div>
      {status.state !== 'busy' && (
        <div className="drop-actions">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" />
            Choose file
          </button>
          <button type="button" className="btn ghost" onClick={downloadTemplate}>
            <Icon name="download" />
            Download template
          </button>
          {(status.state === 'ready' || status.state === 'error') && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setStatus({ state: 'idle' })}
            >
              <Icon name="restart_alt" />
              Upload another
            </button>
          )}
        </div>
      )}
      <div className="drop-formats">
        Accepts <strong>.xlsx</strong> · One workbook with four tabs:{' '}
        <strong>Chart of Accounts</strong> · <strong>Income Statement Lines</strong> ·{' '}
        <strong>Balance Sheet Lines</strong> · <strong>Dept List</strong>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
};

/* ─────────────────────────────────────────────
   COA Table
   ───────────────────────────────────────────── */
const COATable: React.FC<{
  rows: CoaRow[];
  setRows: React.Dispatch<React.SetStateAction<CoaRow[]>>;
  visible: CoaRow[];
  isLineLabels: string[];
  bsLineLabels: string[];
  onCreateLine: (statement: 'IS' | 'BS', label: string, accountId: string) => void;
}> = ({ rows, setRows, visible, isLineLabels, bsLineLabels, onCreateLine }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const srcIdx = rows.findIndex((r) => r.id === dragId);
    const dstIdx = rows.findIndex((r) => r.id === targetId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = [...rows];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, moved);
    setRows(next);
    setDragId(null);
    setOverId(null);
  };

  const updateRow = (id: string, patch: Partial<CoaRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="coa-table-wrap">
      <table className="coa-table">
        <colgroup>
          <col style={{ width: 32 }} />
          <col style={{ width: 50 }} />
          <col style={{ width: 110 }} />
          <col />
          <col style={{ width: 120 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 320 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 200 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 36 }} />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th className="c">#</th>
            <th>ACCOUNT #</th>
            <th>ACCOUNT NAME</th>
            <th>Legacy GL</th>
            <th>FS</th>
            <th>MAPS TO</th>
            <th>Dept #</th>
            <th>Dept Desc</th>
            <th>Sub Act</th>
            <th className="c">Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={12} className="coa-empty">
                No accounts yet. Click <strong>Upload</strong> at the top right to import a
                workbook, or <strong>Add account</strong> below.
              </td>
            </tr>
          )}
          {visible.map((r) => {
            const realIdx = rows.findIndex((x) => x.id === r.id);
            const isOver = overId === r.id;
            const isDrag = dragId === r.id;
            const needsMap = !r.line;
            return (
              <tr
                key={r.id}
                className={`coa-row ${isOver ? 'over' : ''} ${isDrag ? 'dragging' : ''} ${needsMap ? 'needs-map' : ''}`}
                draggable
                onDragStart={() => setDragId(r.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(r.id);
                }}
                onDragLeave={() => setOverId((p) => (p === r.id ? null : p))}
                onDrop={() => onDrop(r.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <td className="drag-handle">
                  <Icon name="drag_indicator" />
                </td>
                <td className="c muted mono">{realIdx + 1}</td>
                <td className="mono">
                  <input
                    className="inline-input mono"
                    value={r.account}
                    onChange={(e) => updateRow(r.id, { account: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="inline-input strong"
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                  />
                </td>
                <td className="mono">
                  <input
                    className="inline-input mono"
                    value={r.legacyGl}
                    onChange={(e) => updateRow(r.id, { legacyGl: e.target.value })}
                    placeholder="—"
                  />
                </td>
                <td>
                  <TypePill value={r.type} onChange={(v) => updateRow(r.id, { type: v })} />
                </td>
                <td>
                  <MapDropdown
                    row={r}
                    isLineLabels={isLineLabels}
                    bsLineLabels={bsLineLabels}
                    onLink={(statement, line) => updateRow(r.id, { statement, line })}
                    onClear={() => updateRow(r.id, { statement: '', line: '' })}
                    onCreate={(statement, line) => onCreateLine(statement, line, r.id)}
                  />
                </td>
                <td className="mono">
                  <input
                    className="inline-input mono"
                    value={r.dept}
                    onChange={(e) => updateRow(r.id, { dept: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="inline-input"
                    value={r.deptDescription}
                    onChange={(e) => updateRow(r.id, { deptDescription: e.target.value })}
                    placeholder="—"
                  />
                </td>
                <td className="mono">
                  <input
                    className="inline-input mono"
                    value={r.subAccount}
                    onChange={(e) => updateRow(r.id, { subAccount: e.target.value })}
                    placeholder="—"
                  />
                </td>
                <td className="c">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={(e) => updateRow(r.id, { active: e.target.checked })}
                    />
                    <span />
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="row-trash"
                    onClick={() => removeRow(r.id)}
                    title="Delete row"
                  >
                    <Icon name="delete_outline" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="coa-add">
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            setRows((p) => [
              ...p,
              {
                id: newId('n'),
                account: '',
                name: 'New account',
                legacyGl: '',
                type: '',
                statement: '',
                line: '',
                dept: '',
                deptDescription: '',
                subAccount: '',
                active: true,
              },
            ])
          }
        >
          <Icon name="add" />
          Add account
        </button>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Line-kind dropdown — used in the Type column.
   Only the three switchable kinds are offered;
   Header rows are still creatable from the toolbar.
   ───────────────────────────────────────────── */
const KIND_OPTIONS: LineKind[] = ['account', 'subtotal', 'formula'];

const KindDropdown: React.FC<{
  value: LineKind;
  onChange: (k: LineKind) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const meta = KIND_META[value];
  return (
    <div className={`kind-pill-wrap ${open ? 'open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="kind-pill"
        style={{ color: meta.color, borderColor: 'var(--ap-line)' }}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={meta.icon} style={{ fontSize: 14 }} />
        <span>{meta.label}</span>
        <Icon name="expand_more" style={{ fontSize: 14, opacity: 0.6 }} />
      </button>
      {open && (
        <div className="kind-pill-menu">
          {KIND_OPTIONS.map((k) => {
            const m = KIND_META[k];
            return (
              <div
                key={k}
                className={`kind-pill-opt ${k === value ? 'on' : ''}`}
                style={{ color: m.color }}
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
              >
                <Icon name={m.icon} style={{ fontSize: 14 }} />
                <span>{m.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Calculation editor — pick subtotals, choose
   add or subtract for each.
   ───────────────────────────────────────────── */
const CalcEditor: React.FC<{
  terms: CalcTerm[];
  availableSubtotals: string[];
  onChange: (terms: CalcTerm[]) => void;
}> = ({ terms, availableSubtotals, onChange }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const usedLabels = new Set(terms.map((t) => t.label.toLowerCase()));
  const pickable = availableSubtotals.filter((l) => !usedLabels.has(l.toLowerCase()));

  const addTerm = (label: string) => {
    onChange([...terms, { sign: '+', label }]);
    setPickerOpen(false);
  };
  const removeTerm = (idx: number) => onChange(terms.filter((_, i) => i !== idx));
  const setSign = (idx: number, sign: '+' | '-') =>
    onChange(terms.map((t, i) => (i === idx ? { ...t, sign } : t)));

  return (
    <div className="calc-editor">
      {terms.length === 0 && (
        <span className="calc-empty">No subtotals selected.</span>
      )}
      {terms.map((t, i) => (
        <span key={`${t.label}-${i}`} className="calc-term">
          <div className="sign-toggle">
            <button
              type="button"
              className={t.sign === '+' ? 'on' : ''}
              onClick={() => setSign(i, '+')}
            >
              +
            </button>
            <button
              type="button"
              className={t.sign === '-' ? 'on' : ''}
              onClick={() => setSign(i, '-')}
            >
              −
            </button>
          </div>
          <span className="calc-label">{t.label}</span>
          <button
            type="button"
            className="calc-remove"
            onClick={() => removeTerm(i)}
            title="Remove"
          >
            <Icon name="close" style={{ fontSize: 12 }} />
          </button>
        </span>
      ))}
      <div className={`calc-add-wrap ${pickerOpen ? 'open' : ''}`} ref={wrapRef}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setPickerOpen((o) => !o)}
        >
          <Icon name="add" />
          Add subtotal
        </button>
        {pickerOpen && (
          <div className="calc-picker">
            {pickable.length === 0 ? (
              <div className="calc-picker-empty">
                {availableSubtotals.length === 0
                  ? 'No subtotals on this statement yet. Add a Subtotal row first.'
                  : 'Every subtotal is already in this calculation.'}
              </div>
            ) : (
              pickable.map((label) => (
                <div
                  key={label}
                  className="calc-picker-opt"
                  onClick={() => addTerm(label)}
                >
                  <Icon name="functions" style={{ fontSize: 14, color: KIND_META.subtotal.color }} />
                  {label}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Statement Builder
   ───────────────────────────────────────────── */
const StatementBuilder: React.FC<{
  rows: StatementLine[];
  setRows: React.Dispatch<React.SetStateAction<StatementLine[]>>;
  statementType: 'IS' | 'BS';
}> = ({ rows, setRows, statementType }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const srcIdx = rows.findIndex((r) => r.id === dragId);
    const dstIdx = rows.findIndex((r) => r.id === targetId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = [...rows];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, moved);
    setRows(next);
    setDragId(null);
    setOverId(null);
  };

  const update = (id: string, patch: Partial<StatementLine>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = (kind: LineKind) => {
    const label =
      kind === 'header'
        ? 'NEW SECTION'
        : kind === 'subtotal'
        ? 'New Subtotal'
        : kind === 'formula'
        ? 'New Calculation'
        : 'New Line Item';
    setRows((p) => [
      ...p,
      {
        id: newId('s'),
        kind,
        label,
        section: '',
        sign: kind === 'account' ? '+' : undefined,
        calcTerms: kind === 'formula' ? [] : undefined,
      },
    ]);
  };

  const switchKind = (id: string, kind: LineKind) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next: StatementLine = {
          ...r,
          kind,
          sign: kind === 'account' ? r.sign ?? '+' : undefined,
          calcTerms: kind === 'formula' ? r.calcTerms ?? [] : undefined,
          formula: kind === 'formula' ? r.formula : undefined,
        };
        return next;
      }),
    );
  };

  const availableSubtotals = rows
    .filter((r) => r.kind === 'subtotal' && r.label.trim())
    .map((r) => r.label);

  return (
    <div className="builder">
      <div className="builder-head">
        <div>
          <h3>{statementType === 'IS' ? 'Income Statement Template' : 'Balance Sheet Template'}</h3>
          <div className="builder-sub">
            Defines the printed structure. <strong>Account lines</strong> sum any GL accounts mapped
            to them. <strong>Subtotals</strong> add all preceding account lines within the same
            section. <strong>Calculations</strong> reference other line totals (e.g.{' '}
            <code className="ck">Total Revenue − Total Expenses</code>).
          </div>
        </div>
        <div className="builder-add">
          <span className="builder-add-k">Add</span>
          <button type="button" className="btn ghost sm" onClick={() => addRow('header')}>
            <span className="kind-dot" style={{ background: KIND_META.header.color }} />
            Header
          </button>
          <button type="button" className="btn ghost sm" onClick={() => addRow('account')}>
            <span className="kind-dot" style={{ background: KIND_META.account.color }} />
            Account line
          </button>
          <button type="button" className="btn ghost sm" onClick={() => addRow('subtotal')}>
            <span className="kind-dot" style={{ background: KIND_META.subtotal.color }} />
            Subtotal
          </button>
          <button type="button" className="btn ghost sm" onClick={() => addRow('formula')}>
            <span className="kind-dot" style={{ background: KIND_META.formula.color }} />
            Calculation
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="builder-empty">
          No lines yet. Map accounts on the Chart of Accounts tab — new line names typed in
          <em> Maps to</em> will appear here. Or click <strong>Add</strong> above.
        </div>
      ) : (
        <table className="builder-table">
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 130 }} />
            <col />
            <col style={{ width: 60 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th className="c">#</th>
              <th>Type</th>
              <th>Label / Formula</th>
              <th className="c">Bold</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const meta = KIND_META[r.kind];
              const isOver = overId === r.id;
              const isDrag = dragId === r.id;
              return (
                <tr
                  key={r.id}
                  className={`builder-row k-${r.kind} ${isOver ? 'over' : ''} ${isDrag ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverId(r.id);
                  }}
                  onDragLeave={() => setOverId((p) => (p === r.id ? null : p))}
                  onDrop={() => onDrop(r.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  <td className="drag-handle">
                    <Icon name="drag_indicator" />
                  </td>
                  <td className="c muted mono">{i + 1}</td>
                  <td>
                    {r.kind === 'header' ? (
                      <div className="kind-cell" style={{ color: meta.color }}>
                        <Icon name={meta.icon} style={{ fontSize: 14 }} />
                        <span>{meta.label}</span>
                      </div>
                    ) : (
                      <KindDropdown
                        value={r.kind}
                        onChange={(k) => switchKind(r.id, k)}
                      />
                    )}
                  </td>
                  <td>
                    {r.kind === 'header' && (
                      <input
                        className="inline-input header-input"
                        value={r.label}
                        onChange={(e) => update(r.id, { label: e.target.value })}
                      />
                    )}
                    {r.kind === 'account' && (
                      <div className="row-flex">
                        <input
                          className="inline-input strong"
                          value={r.label}
                          onChange={(e) => update(r.id, { label: e.target.value })}
                        />
                        <div className="sign-toggle">
                          <button
                            type="button"
                            className={r.sign !== '-' ? 'on' : ''}
                            onClick={() => update(r.id, { sign: '+' })}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className={r.sign === '-' ? 'on' : ''}
                            onClick={() => update(r.id, { sign: '-' })}
                          >
                            −
                          </button>
                        </div>
                      </div>
                    )}
                    {r.kind === 'subtotal' && (
                      <div className="row-flex">
                        <input
                          className="inline-input strong"
                          value={r.label}
                          onChange={(e) => update(r.id, { label: e.target.value })}
                        />
                        <span className="formula-hint">
                          Σ account lines above until the next non-account row
                        </span>
                      </div>
                    )}
                    {r.kind === 'formula' && (
                      <div className="formula-cell">
                        <input
                          className="inline-input strong"
                          value={r.label}
                          onChange={(e) => update(r.id, { label: e.target.value })}
                          placeholder="Line label"
                        />
                        <CalcEditor
                          terms={r.calcTerms ?? []}
                          availableSubtotals={availableSubtotals}
                          onChange={(terms) => update(r.id, { calcTerms: terms })}
                        />
                      </div>
                    )}
                  </td>
                  <td className="c">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={!!r.bold}
                        onChange={(e) => update(r.id, { bold: e.target.checked })}
                      />
                      <span />
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="row-trash"
                      onClick={() => remove(r.id)}
                      title="Delete"
                    >
                      <Icon name="delete_outline" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Import review
   ───────────────────────────────────────────── */
type Decision = 'apply' | 'skip';
const COA_DIFF_FIELDS: { key: keyof ParsedCoaRow; label: string }[] = [
  { key: 'name', label: 'Account Name' },
  { key: 'legacyGl', label: 'Legacy GL' },
  { key: 'type', label: 'FS' },
  { key: 'mapsTo', label: 'Maps to' },
  { key: 'dept', label: 'Dept #' },
  { key: 'deptDescription', label: 'Dept Desc' },
  { key: 'subAccount', label: 'Sub Act' },
  { key: 'active', label: 'Active' },
];

interface CoaReviewItem {
  index: number;             // 0-based row position in the upload
  parsed: ParsedCoaRow;
  existing: CoaRow | null;
  changedFields: Set<string>;
  errors: string[];          // validation problems; non-empty → blocks apply for this row
}

const renderDiffValue = (key: keyof ParsedCoaRow, value: any): React.ReactNode => {
  if (key === 'active') return value ? 'Yes' : 'No';
  const s = value == null ? '' : String(value);
  return s || <em>(blank)</em>;
};

const buildCoaReview = (parsed: ParsedCoaRow[], existing: CoaRow[]): CoaReviewItem[] => {
  const byAccount = new Map(existing.map((r) => [r.account.trim(), r]));
  // First pass: count occurrences of each account # in the upload so we can flag dupes.
  const uploadCounts = new Map<string, number>();
  parsed.forEach((p) => {
    const k = p.account.trim();
    if (!k) return;
    uploadCounts.set(k, (uploadCounts.get(k) || 0) + 1);
  });

  return parsed.map((p, index) => {
    const acct = p.account.trim();
    const ex = acct ? byAccount.get(acct) || null : null;
    const changed = new Set<string>();
    if (ex) {
      if ((ex.name || '') !== p.name) changed.add('name');
      if ((ex.legacyGl || '') !== p.legacyGl) changed.add('legacyGl');
      if ((ex.type || '') !== p.type) changed.add('type');
      if ((ex.line || '') !== p.mapsTo) changed.add('mapsTo');
      if ((ex.dept || '') !== p.dept) changed.add('dept');
      if ((ex.deptDescription || '') !== p.deptDescription) changed.add('deptDescription');
      if ((ex.subAccount || '') !== p.subAccount) changed.add('subAccount');
      if (ex.active !== p.active) changed.add('active');
    }
    const errors: string[] = [];
    if (!acct) errors.push('Account # is required.');
    else if ((uploadCounts.get(acct) || 0) > 1) {
      errors.push('Duplicate Account # in this upload.');
    }
    return { index, parsed: p, existing: ex, changedFields: changed, errors };
  });
};

const ImportReview: React.FC<{
  workbook: ParsedWorkbook;
  existingCoa: CoaRow[];
  existingIsLabels: Set<string>;
  existingBsLabels: Set<string>;
  existingDeptCodes: Set<string>;
  onApply: (decisions: {
    coa: Map<number, Decision>;
    isLines: Map<number, Decision>;
    bsLines: Map<number, Decision>;
    dept: Map<number, Decision>;
  }) => void;
  onCancel: () => void;
}> = ({
  workbook,
  existingCoa,
  existingIsLabels,
  existingBsLabels,
  existingDeptCodes,
  onApply,
  onCancel,
}) => {
  const coaReview = useMemo(() => buildCoaReview(workbook.coa, existingCoa), [
    workbook.coa,
    existingCoa,
  ]);

  const defaultCoaDecisions = useMemo(() => {
    const m = new Map<number, Decision>();
    coaReview.forEach((it) => {
      // Error rows default to skip (they can't be applied safely). Everything else defaults to apply.
      m.set(it.index, it.errors.length > 0 ? 'skip' : 'apply');
    });
    return m;
  }, [coaReview]);

  const [coaDecisions, setCoaDecisions] = useState<Map<number, Decision>>(defaultCoaDecisions);
  const [isDecisions, setIsDecisions] = useState<Map<number, Decision>>(
    () => new Map(workbook.isLines.map((_, i) => [i, 'apply' as Decision])),
  );
  const [bsDecisions, setBsDecisions] = useState<Map<number, Decision>>(
    () => new Map(workbook.bsLines.map((_, i) => [i, 'apply' as Decision])),
  );
  const [deptDecisions, setDeptDecisions] = useState<Map<number, Decision>>(
    () => new Map(workbook.dept.map((_, i) => [i, 'apply' as Decision])),
  );

  const setCoa = (idx: number, d: Decision) =>
    setCoaDecisions((prev) => {
      const next = new Map(prev);
      next.set(idx, d);
      return next;
    });
  const setIs = (idx: number, d: Decision) =>
    setIsDecisions((prev) => {
      const next = new Map(prev);
      next.set(idx, d);
      return next;
    });
  const setBs = (idx: number, d: Decision) =>
    setBsDecisions((prev) => {
      const next = new Map(prev);
      next.set(idx, d);
      return next;
    });
  const setDept = (idx: number, d: Decision) =>
    setDeptDecisions((prev) => {
      const next = new Map(prev);
      next.set(idx, d);
      return next;
    });

  const bulkCoa = (d: Decision) => {
    setCoaDecisions(
      new Map(
        coaReview.map((it) => [
          it.index,
          // Bulk-apply still won't override blocking errors — those stay as skip.
          d === 'apply' && it.errors.length > 0 ? 'skip' : d,
        ]),
      ),
    );
  };

  const newCount = coaReview.filter((it) => !it.existing && it.errors.length === 0).length;
  const conflictCount = coaReview.filter(
    (it) => it.existing && it.changedFields.size > 0 && it.errors.length === 0,
  ).length;
  const unchangedCount = coaReview.filter(
    (it) => it.existing && it.changedFields.size === 0 && it.errors.length === 0,
  ).length;
  const errorRows = coaReview.filter((it) => it.errors.length > 0);
  const errorCount = errorRows.length;

  const blockingErrors = errorRows.some(
    (it) => (coaDecisions.get(it.index) ?? 'skip') === 'apply',
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    <div
      className="import-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Review upload"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="import-modal">
        <header className="import-modal-header">
          <div className="ir-banner">
            <Icon name="description" />
            <div className="ir-banner-text">
              <div className="ir-banner-title">
                Review <strong>{workbook.filename}</strong>
              </div>
              <div className="ir-banner-sub">
                Nothing changes until you click <strong>Apply changes</strong>. Scroll through
                every row, resolve any errors, then commit.
              </div>
            </div>
            <button
              type="button"
              className="ir-close"
              aria-label="Close"
              onClick={onCancel}
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="ir-summary">
            <div className="ir-summary-item">
              <div className="ir-k">New accounts</div>
              <div className="ir-v pos">{newCount}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Conflicts</div>
              <div className="ir-v neg">{conflictCount}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Unchanged</div>
              <div className="ir-v">{unchangedCount}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Errors</div>
              <div className={`ir-v ${errorCount ? 'neg' : ''}`}>{errorCount}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">IS lines</div>
              <div className="ir-v">{workbook.isLines.length}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">BS lines</div>
              <div className="ir-v">{workbook.bsLines.length}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Departments</div>
              <div className="ir-v">{workbook.dept.length}</div>
            </div>
          </div>
        </header>

        <div className="import-modal-body">

      {errorCount > 0 && (
        <section className="ir-error-panel">
          <div className="ir-error-head">
            <Icon name="error" />
            <strong>{errorCount} row{errorCount === 1 ? '' : 's'} need attention.</strong>{' '}
            Account # is required; duplicate account numbers within one upload aren&rsquo;t
            allowed. Fix the workbook and re-upload, or skip these rows.
          </div>
          <ul className="ir-error-list">
            {errorRows.map((it) => (
              <li key={`err-${it.index}`}>
                <span className="ir-error-row">Row {it.index + 2}</span>
                <span className="ir-error-acct">
                  {it.parsed.account || <em>(no account #)</em>}
                </span>
                <span className="ir-error-name">{it.parsed.name || <em>(no name)</em>}</span>
                <span className="ir-error-msgs">{it.errors.join(' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {coaReview.length > 0 && (
        <section className="ir-section">
          <div className="ir-section-head">
            <h3>Chart of Accounts &mdash; {coaReview.length} row{coaReview.length === 1 ? '' : 's'}</h3>
            <div className="ir-bulk">
              <button type="button" className="btn ghost sm" onClick={() => bulkCoa('skip')}>
                Skip all
              </button>
              <button type="button" className="btn ghost sm" onClick={() => bulkCoa('apply')}>
                Apply all
              </button>
            </div>
          </div>

          <div className="ir-table-wrap tall">
            <table className="ir-table">
              <thead>
                <tr>
                  <th className="c">Row</th>
                  <th>Account #</th>
                  <th>Name / Field</th>
                  <th>Status</th>
                  <th>Current</th>
                  <th>Incoming</th>
                  <th className="c">Decision</th>
                </tr>
              </thead>
              <tbody>
                {coaReview.map((it) => {
                  const decision = coaDecisions.get(it.index) ?? 'apply';
                  const rowNum = it.index + 2; // +2: header row in workbook is row 1
                  if (it.errors.length > 0) {
                    return (
                      <tr key={`err-${it.index}`} className="ir-row error">
                        <td className="c mono">{rowNum}</td>
                        <td className="mono">{it.parsed.account || <em>(blank)</em>}</td>
                        <td>{it.parsed.name || <em>(blank)</em>}</td>
                        <td>
                          <span className="ir-badge error">Error</span>
                        </td>
                        <td className="muted" colSpan={2}>
                          {it.errors.join(' ')}
                        </td>
                        <td className="c">
                          <SkipApplyToggle
                            value={decision}
                            onChange={(d) => setCoa(it.index, d)}
                          />
                        </td>
                      </tr>
                    );
                  }
                  if (!it.existing) {
                    return (
                      <tr key={`new-${it.index}`} className="ir-row new">
                        <td className="c mono">{rowNum}</td>
                        <td className="mono">{it.parsed.account}</td>
                        <td>{it.parsed.name || <em>(blank)</em>}</td>
                        <td>
                          <span className="ir-badge new">New</span>
                        </td>
                        <td className="muted">—</td>
                        <td className="muted">{it.parsed.type || '—'}</td>
                        <td className="c">
                          <SkipApplyToggle
                            value={decision}
                            onChange={(d) => setCoa(it.index, d)}
                          />
                        </td>
                      </tr>
                    );
                  }
                  if (it.changedFields.size === 0) {
                    return (
                      <tr key={`unch-${it.index}`} className="ir-row unchanged">
                        <td className="c mono">{rowNum}</td>
                        <td className="mono">{it.parsed.account}</td>
                        <td>{it.parsed.name}</td>
                        <td>
                          <span className="ir-badge unchanged">Unchanged</span>
                        </td>
                        <td className="muted" colSpan={2}>
                          No field differences
                        </td>
                        <td className="c muted">—</td>
                      </tr>
                    );
                  }
                  const rows = COA_DIFF_FIELDS.filter((f) => it.changedFields.has(f.key));
                  return rows.map((f, idx) => (
                    <tr
                      key={`${it.index}-${f.key}`}
                      className={`ir-row conflict ${idx === 0 ? 'first' : 'continuation'}`}
                    >
                      {idx === 0 ? (
                        <>
                          <td className="c mono" rowSpan={rows.length}>
                            {rowNum}
                          </td>
                          <td className="mono" rowSpan={rows.length}>
                            {it.parsed.account}
                          </td>
                          <td rowSpan={rows.length}>
                            <div className="ir-account-name">{it.existing!.name}</div>
                            <span className="ir-badge conflict">Conflict</span>
                          </td>
                        </>
                      ) : null}
                      <td className="ir-field">{f.label}</td>
                      <td className="ir-current">
                        {renderDiffValue(
                          f.key,
                          (it.existing as any)[f.key === 'mapsTo' ? 'line' : f.key],
                        )}
                      </td>
                      <td className="ir-incoming">
                        <span className="ir-changed">{renderDiffValue(f.key, it.parsed[f.key])}</span>
                      </td>
                      {idx === 0 ? (
                        <td className="c" rowSpan={rows.length}>
                          <SkipApplyToggle
                            value={decision}
                            onChange={(d) => setCoa(it.index, d)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {workbook.isLines.length > 0 && (
        <ImportLineReview
          title="Income Statement Lines"
          rows={workbook.isLines}
          existingLabels={existingIsLabels}
          decisions={isDecisions}
          onChange={setIs}
        />
      )}
      {workbook.bsLines.length > 0 && (
        <ImportLineReview
          title="Balance Sheet Lines"
          rows={workbook.bsLines}
          existingLabels={existingBsLabels}
          decisions={bsDecisions}
          onChange={setBs}
        />
      )}

      {workbook.dept.length > 0 && (
        <section className="ir-section">
          <div className="ir-section-head">
            <h3>Departments</h3>
          </div>
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="c">Decision</th>
                </tr>
              </thead>
              <tbody>
                {workbook.dept.map((d, i) => {
                  const exists = existingDeptCodes.has(d.code);
                  return (
                    <tr key={i} className={`ir-row ${exists ? 'conflict' : 'new'}`}>
                      <td className="mono">{d.code}</td>
                      <td>{d.name}</td>
                      <td>
                        <span className={`ir-badge ${exists ? 'conflict' : 'new'}`}>
                          {exists ? 'Conflict' : 'New'}
                        </span>
                      </td>
                      <td className="c">
                        <SkipApplyToggle
                          value={deptDecisions.get(i) ?? 'apply'}
                          onChange={(v) => setDept(i, v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

        </div>
        <footer className="import-modal-footer">
          {blockingErrors && (
            <div className="ir-footer-warn">
              <Icon name="error_outline" />
              Error rows are still set to Apply. Switch them to Skip (or fix the workbook and
              re-upload) before committing.
            </div>
          )}
          <button type="button" className="btn ghost" onClick={onCancel}>
            <Icon name="close" />
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={blockingErrors}
            onClick={() =>
              onApply({
                coa: coaDecisions,
                isLines: isDecisions,
                bsLines: bsDecisions,
                dept: deptDecisions,
              })
            }
          >
            <Icon name="check_circle" />
            Apply changes
          </button>
        </footer>
      </div>
    </div>
  );
};

const ImportLineReview: React.FC<{
  title: string;
  rows: ParsedLineRow[];
  existingLabels: Set<string>;
  decisions: Map<number, Decision>;
  onChange: (idx: number, d: Decision) => void;
}> = ({ title, rows, existingLabels, decisions, onChange }) => (
  <section className="ir-section">
    <div className="ir-section-head">
      <h3>{title}</h3>
    </div>
    <div className="ir-table-wrap">
      <table className="ir-table">
        <thead>
          <tr>
            <th className="c">#</th>
            <th>Kind</th>
            <th>Label</th>
            <th>Section</th>
            <th>Status</th>
            <th className="c">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const exists = existingLabels.has(r.label.toLowerCase());
            return (
              <tr key={i} className={`ir-row ${exists ? 'conflict' : 'new'}`}>
                <td className="c mono">{r.order}</td>
                <td>{KIND_META[r.kind]?.label || r.kind}</td>
                <td>{r.label}</td>
                <td className="muted">{r.section || '—'}</td>
                <td>
                  <span className={`ir-badge ${exists ? 'conflict' : 'new'}`}>
                    {exists ? 'Conflict' : 'New'}
                  </span>
                </td>
                <td className="c">
                  <SkipApplyToggle
                    value={decisions.get(i) ?? 'apply'}
                    onChange={(v) => onChange(i, v)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
);

const SkipApplyToggle: React.FC<{
  value: Decision;
  onChange: (d: Decision) => void;
}> = ({ value, onChange }) => (
  <div className="ir-toggle">
    <button
      type="button"
      className={value === 'skip' ? 'on skip' : ''}
      onClick={() => onChange('skip')}
    >
      Skip
    </button>
    <button
      type="button"
      className={value === 'apply' ? 'on apply' : ''}
      onClick={() => onChange('apply')}
    >
      Apply
    </button>
  </div>
);

/* ─────────────────────────────────────────────
   Admin page
   ───────────────────────────────────────────── */
type Tab = 'coa' | 'is' | 'bs';
type Filter = 'all' | 'mapped' | 'unmapped';
type View = 'main' | 'upload' | 'gl-upload';

/* ─────────────────────────────────────────────
   GL Transaction templates
   ───────────────────────────────────────────── */
const GL_GENERAL_HEADERS = [
  'POSTING DATE',
  'PERIOD',
  'ACCOUNT #',
  'ACCOUNT NAME',
  'DEPT #',
  'DESCRIPTION',
  'JOURNAL #',
  'REFERENCE',
  'DEBIT',
  'CREDIT',
  'AMOUNT',
  'SOURCE',
  'POSTED BY',
];

const GL_CPSI_HEADERS = [
  'glm_comp',
  'glm_acc',
  'glm_desc',
  'gl_beginning_bal',
  'gl_net',
  'gl_ending_bal',
  'gl_category',
  'glj_date',
  'glj_memo',
  'glj_reference',
  'glj_journal',
  'glj_csnum',
  'glj_batch',
  'glj_seq',
  'po_number',
  'glj_amt',
  'detail_month',
  'detail_year',
  'grouping_field',
];

const downloadGlGeneralTemplate = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([GL_GENERAL_HEADERS]), 'GL Transactions');
  XLSX.writeFile(wb, 'gl_transactions_template.xlsx');
};

const downloadGlCpsiTemplate = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([GL_CPSI_HEADERS]), 'CPSI GL Export');
  XLSX.writeFile(wb, 'gl_transactions_cpsi_template.xlsx');
};

type GlStatus =
  | { state: 'idle' }
  | { state: 'busy'; filename: string }
  | { state: 'ready'; filename: string; sheet: string; rows: number }
  | { state: 'error'; filename: string; message: string };

interface GlUnknownDraft {
  account: string;
  name: string;
  legacyGl: string;
  type: string;
  mapsTo: string;
  dept: string;
  deptDescription: string;
  subAccount: string;
}

/** Pull the account number + (optional) account name from one GL transaction row. */
const readGlAccount = (r: any): { account: string; name: string } => {
  const account = String(
    r['ACCOUNT #'] ??
      r['Account #'] ??
      r['Account Number'] ??
      r['glm_acc'] ??
      r['GL Account'] ??
      r['account'] ??
      '',
  ).trim();
  const name = String(
    r['ACCOUNT NAME'] ??
      r['Account Name'] ??
      r['glm_desc'] ??
      r['name'] ??
      '',
  ).trim();
  return { account, name };
};

const collectUnknownGlAccounts = (
  glRows: any[],
  existingCoa: CoaRow[],
): GlUnknownDraft[] => {
  const known = new Set(existingCoa.map((r) => r.account.trim()));
  const seen = new Map<string, GlUnknownDraft>();
  glRows.forEach((r) => {
    const { account, name } = readGlAccount(r);
    if (!account) return;
    if (known.has(account)) return;
    if (seen.has(account)) {
      // keep the first non-blank name encountered
      const existing = seen.get(account)!;
      if (!existing.name && name) existing.name = name;
      return;
    }
    seen.set(account, {
      account,
      name,
      legacyGl: '',
      type: '',
      mapsTo: '',
      dept: '',
      deptDescription: '',
      subAccount: '',
    });
  });
  return Array.from(seen.values());
};

const GlDropzone: React.FC<{
  status: GlStatus;
  onChoose: (file: File) => void;
  setStatus: (s: GlStatus) => void;
}> = ({ status, onChoose, setStatus }) => {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cls =
    status.state === 'busy'
      ? 'busy'
      : status.state === 'ready'
      ? 'done'
      : status.state === 'error'
      ? 'error'
      : hover
      ? 'hover'
      : '';

  return (
    <div
      className={`drop ${cls}`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onChoose(file);
      }}
    >
      <div className="drop-icon">
        <Icon
          name={
            status.state === 'ready'
              ? 'task_alt'
              : status.state === 'busy'
              ? 'sync'
              : status.state === 'error'
              ? 'error_outline'
              : 'receipt_long'
          }
          style={{ fontSize: 28 }}
        />
      </div>
      <div className="drop-title">
        {status.state === 'ready' &&
          `Parsed ${status.filename} — ${status.rows.toLocaleString()} rows`}
        {status.state === 'busy' && `Parsing ${status.filename}…`}
        {status.state === 'error' && `Failed to parse ${status.filename}`}
        {status.state === 'idle' && 'Drop your GL transactions file here'}
      </div>
      <div className="drop-sub">
        {status.state === 'ready' && `From sheet "${status.sheet}". Backend ingestion pending.`}
        {status.state === 'busy' && 'Reading rows…'}
        {status.state === 'error' && status.message}
        {status.state === 'idle' && 'or'}
      </div>
      {status.state !== 'busy' && (
        <div className="drop-actions">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" />
            Choose file
          </button>
          {(status.state === 'ready' || status.state === 'error') && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setStatus({ state: 'idle' })}
            >
              <Icon name="restart_alt" />
              Upload another
            </button>
          )}
        </div>
      )}
      <div className="drop-formats">
        Accepts <strong>.xlsx</strong> or <strong>.csv</strong> · Use the General or CPSI template
        below to see the expected column layout.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChoose(file);
          e.target.value = '';
        }}
      />
    </div>
  );
};

const GlUnknownAccountsModal: React.FC<{
  filename: string;
  drafts: GlUnknownDraft[];
  setDrafts: (d: GlUnknownDraft[]) => void;
  onSkip: () => void;
  onAdd: (drafts: GlUnknownDraft[]) => void;
}> = ({ filename, drafts, setDrafts, onSkip, onAdd }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onSkip]);

  const patch = (idx: number, p: Partial<GlUnknownDraft>) =>
    setDrafts(drafts.map((d, i) => (i === idx ? { ...d, ...p } : d)));

  return (
    <div
      className="import-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Unknown GL accounts"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSkip();
      }}
    >
      <div className="import-modal">
        <header className="import-modal-header">
          <div className="ir-banner">
            <Icon name="warning" />
            <div className="ir-banner-text">
              <div className="ir-banner-title">
                {drafts.length} GL account{drafts.length === 1 ? '' : 's'} in{' '}
                <strong>{filename}</strong> aren&rsquo;t in your Chart of Accounts.
              </div>
              <div className="ir-banner-sub">
                Want to add them now? Optionally fill in any of the other columns — leave them
                blank and the accounts come in unmapped (they won&rsquo;t flow to a statement
                until you map them later).
              </div>
            </div>
            <button type="button" className="ir-close" aria-label="Close" onClick={onSkip}>
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="import-modal-body">
          <section className="ir-section">
            <div className="ir-section-head">
              <h3>Unknown accounts &mdash; {drafts.length}</h3>
            </div>
            <div className="ir-table-wrap tall">
              <table className="gl-unknown-table">
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 180 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>ACCOUNT #</th>
                    <th>ACCOUNT NAME</th>
                    <th>LEGACY GL</th>
                    <th>FS</th>
                    <th>MAPS TO</th>
                    <th>DEPT #</th>
                    <th>DEPT DESC</th>
                    <th>SUB ACT</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d, i) => (
                    <tr key={d.account}>
                      <td className="mono">{d.account}</td>
                      <td>
                        <input
                          className="inline-input strong"
                          value={d.name}
                          onChange={(e) => patch(i, { name: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                      <td className="mono">
                        <input
                          className="inline-input mono"
                          value={d.legacyGl}
                          onChange={(e) => patch(i, { legacyGl: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <TypePill value={d.type} onChange={(v) => patch(i, { type: v })} />
                      </td>
                      <td>
                        <input
                          className="inline-input"
                          value={d.mapsTo}
                          onChange={(e) => patch(i, { mapsTo: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                      <td className="mono">
                        <input
                          className="inline-input mono"
                          value={d.dept}
                          onChange={(e) => patch(i, { dept: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          className="inline-input"
                          value={d.deptDescription}
                          onChange={(e) => patch(i, { deptDescription: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                      <td className="mono">
                        <input
                          className="inline-input mono"
                          value={d.subAccount}
                          onChange={(e) => patch(i, { subAccount: e.target.value })}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className="import-modal-footer">
          <button type="button" className="btn ghost" onClick={onSkip}>
            <Icon name="block" />
            Don&rsquo;t add
          </button>
          <button type="button" className="btn primary" onClick={() => onAdd(drafts)}>
            <Icon name="playlist_add" />
            Add to chart of accounts
          </button>
        </footer>
      </div>
    </div>
  );
};

const Admin: React.FC = () => {
  const [tab, setTab] = useState<Tab>('coa');
  const [view, setView] = useState<View>('main');
  const [coa, setCoa] = useState<CoaRow[]>(INITIAL_COA);
  const [isLines, setIsLines] = useState<StatementLine[]>(INITIAL_IS_LINES);
  const [bsLines, setBsLines] = useState<StatementLine[]>(INITIAL_BS_LINES);
  const [deptList, setDeptList] = useState<DeptRow[]>(INITIAL_DEPT_LIST);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dropStatus, setDropStatus] = useState<DropStatus>({ state: 'idle' });
  const [glStatus, setGlStatus] = useState<
    | { state: 'idle' }
    | { state: 'busy'; filename: string }
    | { state: 'ready'; filename: string; sheet: string; rows: number }
    | { state: 'error'; filename: string; message: string }
  >({ state: 'idle' });
  const [glUnknowns, setGlUnknowns] = useState<{
    filename: string;
    drafts: GlUnknownDraft[];
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<ParsedWorkbook | null>(null);

  const isAccountLabels = useMemo(
    () => isLines.filter((l) => l.kind === 'account').map((l) => l.label),
    [isLines],
  );
  const bsAccountLabels = useMemo(
    () => bsLines.filter((l) => l.kind === 'account').map((l) => l.label),
    [bsLines],
  );

  const filteredCoa = useMemo(() => {
    let list = coa;
    if (filter === 'mapped') list = list.filter((r) => !!r.line);
    else if (filter === 'unmapped') list = list.filter((r) => !r.line);
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.account.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.legacyGl || '').toLowerCase().includes(q) ||
        (r.type || '').toLowerCase().includes(q) ||
        (r.line || '').toLowerCase().includes(q) ||
        (r.dept || '').toLowerCase().includes(q) ||
        (r.deptDescription || '').toLowerCase().includes(q) ||
        (r.subAccount || '').toLowerCase().includes(q),
    );
  }, [coa, filter, search]);

  const stats = useMemo(
    () => ({
      total: coa.length,
      mapped: coa.filter((r) => r.line).length,
      unmapped: coa.filter((r) => !r.line).length,
      active: coa.filter((r) => r.active).length,
      is: coa.filter((r) => r.statement === 'IS').length,
      bs: coa.filter((r) => r.statement === 'BS').length,
    }),
    [coa],
  );

  const pct = Math.round((stats.mapped / Math.max(1, stats.total)) * 100);

  const TABS: { id: Tab; icon: string; label: string; count: number }[] = [
    { id: 'coa', icon: 'list_alt',        label: 'Chart of Accounts', count: stats.total },
    { id: 'is',  icon: 'description',     label: 'Income Statement',  count: isLines.length },
    { id: 'bs',  icon: 'account_balance', label: 'Balance Sheet',     count: bsLines.length },
  ];

  /* When user types a brand-new line in Maps to and selects "Create" */
  const createMappedLine = (statement: 'IS' | 'BS', label: string, accountId: string) => {
    const setter = statement === 'IS' ? setIsLines : setBsLines;
    setter((prev) => {
      if (prev.some((l) => l.kind === 'account' && l.label.toLowerCase() === label.toLowerCase())) {
        return prev;
      }
      return [
        ...prev,
        {
          id: newId('s'),
          kind: 'account',
          label,
          section: '',
          sign: '+',
        },
      ];
    });
    setCoa((prev) =>
      prev.map((r) => (r.id === accountId ? { ...r, statement, line: label } : r)),
    );
  };

  const applyImport = (decisions: {
    coa: Map<number, Decision>;
    isLines: Map<number, Decision>;
    bsLines: Map<number, Decision>;
    dept: Map<number, Decision>;
  }) => {
    if (!pendingImport) return;

    // Pre-compute new IS/BS line labels that the CoA upload needs created. We look at every
    // applied row whose FS column resolves to IS or BS AND whose Maps To label doesn't already
    // exist on that statement. These get appended to the appropriate statement so the merged
    // CoA row can link to them.
    const existingIsLabels = new Set(isLines.map((l) => l.label.toLowerCase()));
    const existingBsLabels = new Set(bsLines.map((l) => l.label.toLowerCase()));
    const newIsFromCoa: string[] = [];
    const newBsFromCoa: string[] = [];
    const seenNewIs = new Set<string>();
    const seenNewBs = new Set<string>();
    pendingImport.coa.forEach((p, i) => {
      if ((decisions.coa.get(i) ?? 'apply') !== 'apply') return;
      if (!p.account.trim() || !p.mapsTo) return;
      const target = inferStatementFromFs(p.type);
      if (!target) return;
      const key = p.mapsTo.toLowerCase();
      if (target === 'IS' && !existingIsLabels.has(key) && !seenNewIs.has(key)) {
        seenNewIs.add(key);
        newIsFromCoa.push(p.mapsTo);
      } else if (target === 'BS' && !existingBsLabels.has(key) && !seenNewBs.has(key)) {
        seenNewBs.add(key);
        newBsFromCoa.push(p.mapsTo);
      }
    });

    // CoA: replace conflicts, add new — both gated by per-row "apply" decision.
    setCoa((prev) => {
      const byAccount = new Map(prev.map((r) => [r.account.trim(), r]));
      pendingImport.coa.forEach((p, i) => {
        if ((decisions.coa.get(i) ?? 'apply') !== 'apply') return;
        if (!p.account.trim()) return;
        const existing = byAccount.get(p.account.trim());
        const merged: CoaRow = {
          id: existing?.id || newId('imp'),
          account: p.account,
          name: p.name || existing?.name || 'Untitled',
          legacyGl: p.legacyGl,
          type: p.type,
          statement: existing?.statement ?? '',
          line: p.mapsTo || existing?.line || '',
          dept: p.dept,
          deptDescription: p.deptDescription,
          subAccount: p.subAccount,
          active: p.active,
        };
        if (merged.line) {
          const lineLc = merged.line.toLowerCase();
          // FS column wins if it resolves; otherwise fall back to whichever statement already
          // owns the label, then to the account type.
          const fromFs = inferStatementFromFs(merged.type);
          if (fromFs) {
            merged.statement = fromFs;
          } else if (existingIsLabels.has(lineLc) || seenNewIs.has(lineLc)) {
            merged.statement = 'IS';
          } else if (existingBsLabels.has(lineLc) || seenNewBs.has(lineLc)) {
            merged.statement = 'BS';
          }
        }
        byAccount.set(p.account.trim(), merged);
      });
      return Array.from(byAccount.values());
    });

    // IS lines — add explicit IS-sheet imports + CoA-driven creations.
    setIsLines((prev) => {
      const known = new Set(prev.map((l) => l.label.toLowerCase()));
      const additions: StatementLine[] = [];
      pendingImport.isLines.forEach((r, i) => {
        if ((decisions.isLines.get(i) ?? 'apply') !== 'apply') return;
        if (known.has(r.label.toLowerCase())) return;
        known.add(r.label.toLowerCase());
        additions.push({
          id: newId('is'),
          kind: r.kind,
          label: r.label,
          section: r.section,
          sign: r.sign,
          formula: r.formula || undefined,
          bold: r.bold || undefined,
        });
      });
      newIsFromCoa.forEach((label) => {
        if (known.has(label.toLowerCase())) return;
        known.add(label.toLowerCase());
        additions.push({
          id: newId('is'),
          kind: 'account',
          label,
          section: '',
          sign: '+',
        });
      });
      return [...prev, ...additions];
    });

    // BS lines — add explicit BS-sheet imports + CoA-driven creations.
    setBsLines((prev) => {
      const known = new Set(prev.map((l) => l.label.toLowerCase()));
      const additions: StatementLine[] = [];
      pendingImport.bsLines.forEach((r, i) => {
        if ((decisions.bsLines.get(i) ?? 'apply') !== 'apply') return;
        if (known.has(r.label.toLowerCase())) return;
        known.add(r.label.toLowerCase());
        additions.push({
          id: newId('bs'),
          kind: r.kind,
          label: r.label,
          section: r.section,
          sign: r.sign,
          formula: r.formula || undefined,
          bold: r.bold || undefined,
        });
      });
      newBsFromCoa.forEach((label) => {
        if (known.has(label.toLowerCase())) return;
        known.add(label.toLowerCase());
        additions.push({
          id: newId('bs'),
          kind: 'account',
          label,
          section: '',
          sign: '+',
        });
      });
      return [...prev, ...additions];
    });

    // Dept list
    setDeptList((prev) => {
      const byCode = new Map(prev.map((d) => [d.code, d]));
      pendingImport.dept.forEach((r, i) => {
        if ((decisions.dept.get(i) ?? 'apply') !== 'apply') return;
        byCode.set(r.code, { id: byCode.get(r.code)?.id || newId('d'), code: r.code, name: r.name });
      });
      return Array.from(byCode.values());
    });

    setPendingImport(null);
    setDropStatus({ state: 'idle' });
    setView('main');
  };

  const goToSetup = () => {
    setPendingImport(null);
    setDropStatus({ state: 'idle' });
    setGlStatus({ state: 'idle' });
    setView('main');
  };

  const pageActions = (
    <div className="page-actions">
      <button
        type="button"
        className={`btn ${view === 'main' ? 'active' : ''}`}
        onClick={goToSetup}
      >
        <Icon name="tune" />
        Setup
      </button>
      <button
        type="button"
        className={`btn ${view === 'upload' ? 'active' : ''}`}
        onClick={() => setView('upload')}
      >
        <Icon name="upload" />
        Upload
      </button>
      <button
        type="button"
        className={`btn ${view === 'gl-upload' ? 'active' : ''}`}
        onClick={() => setView('gl-upload')}
      >
        <Icon name="receipt_long" />
        GL Transactions
      </button>
      <button type="button" className="btn primary">
        <Icon name="check_circle" />
        Save setup
      </button>
    </div>
  );

  if (view === 'gl-upload') {
    const handleGlFile = async (file: File) => {
      setGlStatus({ state: 'busy', filename: file.name });
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) throw new Error('Workbook contains no sheets.');
        const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[firstSheet], { defval: '' });
        console.log(
          `[Admin] Parsed GL Transactions (${file.name} / sheet "${firstSheet}") — ${rows.length} rows`,
          rows.slice(0, 3),
        );
        setGlStatus({
          state: 'ready',
          filename: file.name,
          sheet: firstSheet,
          rows: rows.length,
        });
        const unknowns = collectUnknownGlAccounts(rows, coa);
        if (unknowns.length > 0) {
          setGlUnknowns({ filename: file.name, drafts: unknowns });
        }
      } catch (err: any) {
        setGlStatus({
          state: 'error',
          filename: file.name,
          message: err?.message || 'Failed to parse workbook.',
        });
      }
    };

    const addUnknownsToCoa = (drafts: GlUnknownDraft[]) => {
      const additions: CoaRow[] = drafts.map((d) => {
        // Resolve statement from FS if it picks one up; otherwise leave blank.
        const statement: StatementCode = inferStatementFromFs(d.type) || '';
        return {
          id: newId('gl'),
          account: d.account,
          name: d.name,
          legacyGl: d.legacyGl,
          type: d.type,
          statement,
          line: d.mapsTo,
          dept: d.dept,
          deptDescription: d.deptDescription,
          subAccount: d.subAccount,
          active: true,
        };
      });
      setCoa((prev) => [...prev, ...additions]);
      setGlUnknowns(null);
    };

    return (
      <div className="admin-page">
        <div className="page-head">
          <div>
            <h1 className="page-title">GL Transactions</h1>
            <div className="page-sub">
              Drop a GL transaction export to load journal-level activity. Two templates are
              available — pick the one that matches your source system.
            </div>
          </div>
          {pageActions}
        </div>

        <GlDropzone status={glStatus} onChoose={handleGlFile} setStatus={setGlStatus} />

        <div className="upload-guide">
          <div className="ug-head">
            <Icon name="info" style={{ color: 'var(--ap-accent)', fontSize: 22 }} />
            <h2>Templates</h2>
          </div>
          <div className="ug-grid">
            <div className="ug-card">
              <div className="ug-card-head">
                <Icon name="description" style={{ color: 'var(--ap-accent)' }} />
                <h3>General GL template</h3>
              </div>
              <p>
                Plain-English column names that work for most accounting systems:{' '}
                <strong>POSTING DATE</strong>, <strong>ACCOUNT #</strong>, <strong>DEBIT</strong>,
                <strong> CREDIT</strong>, <strong>AMOUNT</strong>, <strong>JOURNAL #</strong>, and
                friends. Use this when your export format isn&rsquo;t CPSI.
              </p>
              <div className="ug-card-actions">
                <button type="button" className="btn" onClick={downloadGlGeneralTemplate}>
                  <Icon name="download" />
                  Download General template
                </button>
              </div>
            </div>

            <div className="ug-card">
              <div className="ug-card-head">
                <Icon name="storage" style={{ color: 'var(--ap-accent)' }} />
                <h3>CPSI template</h3>
              </div>
              <p>
                Matches the raw CPSI GL export schema:{' '}
                <code>glm_comp</code>, <code>glm_acc</code>, <code>glj_date</code>,{' '}
                <code>glj_amt</code>, and the rest. Drop a CPSI extract straight in without
                reshaping the columns.
              </p>
              <div className="ug-card-actions">
                <button type="button" className="btn" onClick={downloadGlCpsiTemplate}>
                  <Icon name="download" />
                  Download CPSI template
                </button>
              </div>
            </div>
          </div>
        </div>

        {glUnknowns && (
          <GlUnknownAccountsModal
            filename={glUnknowns.filename}
            drafts={glUnknowns.drafts}
            setDrafts={(d) =>
              setGlUnknowns((prev) => (prev ? { ...prev, drafts: d } : prev))
            }
            onSkip={() => setGlUnknowns(null)}
            onAdd={addUnknownsToCoa}
          />
        )}
      </div>
    );
  }

  if (view === 'upload') {
    return (
      <div className="admin-page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Upload</h1>
            <div className="page-sub">
              Drop a single Excel workbook to refresh the chart of accounts, statement layouts, and
              department list.
            </div>
          </div>
          {pageActions}
        </div>

        <Dropzone
          onParsed={(wb) => setPendingImport(wb)}
          status={dropStatus}
          setStatus={setDropStatus}
        />

        <div className="upload-guide">
              <div className="ug-head">
                <Icon name="info" style={{ color: 'var(--ap-accent)', fontSize: 22 }} />
                <h2>How upload &amp; mapping works</h2>
              </div>

              <div className="ug-grid">
                <div className="ug-card">
                  <div className="ug-card-head">
                    <Icon name="table_view" style={{ color: 'var(--ap-accent)' }} />
                    <h3>One workbook, four tabs</h3>
                  </div>
                  <p>
                    The template contains a tab for each setup file:{' '}
                    <strong>Chart of Accounts</strong>, <strong>Income Statement Lines</strong>,{' '}
                    <strong>Balance Sheet Lines</strong>, and <strong>Dept List</strong>. Fill any
                    or all of them and drop the workbook here in one upload. Sheets you don&rsquo;t
                    populate are simply skipped.
                  </p>
                </div>

                <div className="ug-card">
                  <div className="ug-card-head">
                    <Icon name="key" style={{ color: 'var(--ap-accent)' }} />
                    <h3>Account # is the primary key</h3>
                  </div>
                  <p>
                    Every chart-of-accounts row is identified by its <strong>Account #</strong>. On
                    upload we check each account against what&rsquo;s already loaded and flag
                    matches as conflicts. You&rsquo;ll see the differences side-by-side with
                    incoming changes highlighted, and can decide per row whether to{' '}
                    <strong>Skip</strong> (keep current) or <strong>Apply</strong> (overwrite with
                    the upload). New accounts come in as-is.
                  </p>
                </div>

                <div className="ug-card">
                  <div className="ug-card-head">
                    <Icon name="alt_route" style={{ color: 'var(--ap-accent)' }} />
                    <h3>Maps To is free-form</h3>
                  </div>
                  <p>
                    The <strong>Maps to</strong> column links a GL account to a line on the income
                    statement or balance sheet. Type the line name you want — if it already exists
                    we link to it; if it&rsquo;s new we create it and append it to the bottom of
                    the appropriate statement. You can reorder lines anytime from the IS/BS tabs.
                  </p>
                </div>

                <div className="ug-card">
                  <div className="ug-card-head">
                    <Icon name="swap_horiz" style={{ color: 'var(--ap-accent)' }} />
                    <h3>Built for system conversions</h3>
                  </div>
                  <p>
                    The <strong>Legacy GL</strong> column lets you carry the old account number
                    when a company switches accounting systems. We use it to stitch historical
                    activity back to today&rsquo;s chart of accounts so trended financials stay
                    continuous across the conversion.
                  </p>
                </div>

                <div className="ug-card">
                  <div className="ug-card-head">
                    <Icon name="reorder" style={{ color: 'var(--ap-accent)' }} />
                    <h3>New lines append to the bottom</h3>
                  </div>
                  <p>
                    Whether a line is created from a typed mapping or imported from the workbook,
                    new entries append to the bottom of their statement. Drag them into place from
                    the Income Statement / Balance Sheet tabs once the upload is complete.
                  </p>
                </div>

                <div className="ug-card">
                  <div className="ug-card-head">
                    <Icon name="rule" style={{ color: 'var(--ap-accent)' }} />
                    <h3>Nothing changes until you Apply</h3>
                  </div>
                  <p>
                    Uploading parses the workbook and shows a review of every change. Your current
                    setup stays untouched until you click <strong>Apply changes</strong>. Cancel at
                    any time and the upload is discarded.
                  </p>
                </div>
              </div>
            </div>

        {pendingImport && (
          <ImportReview
            workbook={pendingImport}
            existingCoa={coa}
            existingIsLabels={new Set(isLines.map((l) => l.label.toLowerCase()))}
            existingBsLabels={new Set(bsLines.map((l) => l.label.toLowerCase()))}
            existingDeptCodes={new Set(deptList.map((d) => d.code))}
            onApply={applyImport}
            onCancel={() => {
              setPendingImport(null);
              setDropStatus({ state: 'idle' });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Setup</h1>
          <div className="page-sub">
            Upload your chart of accounts and define how GL accounts flow into the income statement
            and balance sheet.
            <span className="pip">
              <span className="pip-dot" />
              Setup mode
            </span>
          </div>
        </div>
        {pageActions}
      </div>

      {/* Setup progress strip */}
      <div className="setup-strip">
        <div className="ss-stat">
          <div className="ss-k">Accounts loaded</div>
          <div className="ss-v mono">{stats.total}</div>
        </div>
        <div className="ss-divider" />
        <div className="ss-stat">
          <div className="ss-k">Mapped</div>
          <div className="ss-v mono pos">{stats.mapped}</div>
        </div>
        <div className="ss-stat">
          <div className="ss-k">Unmapped</div>
          <div className="ss-v mono neg">{stats.unmapped}</div>
        </div>
        <div className="ss-divider" />
        <div className="ss-stat">
          <div className="ss-k">→ Income Statement</div>
          <div className="ss-v mono">{stats.is}</div>
        </div>
        <div className="ss-stat">
          <div className="ss-k">→ Balance Sheet</div>
          <div className="ss-v mono">{stats.bs}</div>
        </div>
        <div className="ss-spacer" />
        <div className="ss-progress">
          <div className="ss-pct mono">{pct}% mapped</div>
          <div className="ss-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {TABS.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`br-tab ${tab === it.id ? 'active' : ''}`}
            onClick={() => setTab(it.id)}
          >
            <Icon name={it.icon} />
            {it.label}
            <span className="tab-count">{it.count}</span>
          </button>
        ))}
      </div>

      {tab === 'coa' && (
        <>
          <div className="coa-toolbar">
            <div className="search-wrap">
              <Icon name="search" style={{ fontSize: 16, color: 'var(--ap-muted)' }} />
              <input
                type="text"
                placeholder="Search by account #, name, type, or mapped line…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear" onClick={() => setSearch('')}>
                  <Icon name="close" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>

            <div className="seg compact">
              <button
                type="button"
                className={filter === 'all' ? 'on' : ''}
                onClick={() => setFilter('all')}
              >
                All <span className="seg-count">{stats.total}</span>
              </button>
              <button
                type="button"
                className={filter === 'mapped' ? 'on' : ''}
                onClick={() => setFilter('mapped')}
              >
                Mapped <span className="seg-count">{stats.mapped}</span>
              </button>
              <button
                type="button"
                className={filter === 'unmapped' ? 'on' : ''}
                onClick={() => setFilter('unmapped')}
              >
                Unmapped <span className="seg-count">{stats.unmapped}</span>
              </button>
            </div>

            <div className="ct-spacer" />

            <button type="button" className="btn">
              <Icon name="auto_awesome" />
              Auto-map by name
            </button>
            <button type="button" className="btn ghost">
              <Icon name="download" />
              Export CSV
            </button>
          </div>

          <div className="admin-card">
            <COATable
              rows={coa}
              setRows={setCoa}
              visible={filteredCoa}
              isLineLabels={isAccountLabels}
              bsLineLabels={bsAccountLabels}
              onCreateLine={createMappedLine}
            />
          </div>
        </>
      )}

      {tab === 'is' && (
        <div className="admin-card">
          <StatementBuilder rows={isLines} setRows={setIsLines} statementType="IS" />
        </div>
      )}

      {tab === 'bs' && (
        <div className="admin-card">
          <StatementBuilder rows={bsLines} setRows={setBsLines} statementType="BS" />
        </div>
      )}

      <div className="explainer">
        <Icon name="lightbulb" style={{ color: '#b45309', fontSize: 20 }} />
        <div>
          <strong>How mappings flow into your financials.</strong> Each GL account in the Chart of
          Accounts gets assigned to a single line on either the Income Statement or Balance Sheet.
          When the period closes, every <em>Account line</em> on a statement sums the balances of
          all GL accounts mapped to it. <em>Subtotal</em> lines automatically add every account
          line above them within the same section. <em>Calculations</em> reference named
          subtotals — e.g.{' '}
          <code className="ck">Net Operating Income = Total Operating Revenue − Total Operating Expenses</code>.
          Use the <strong>−</strong> sign toggle on a row to flip it (e.g. Contractual Allowances,
          Accumulated Depreciation) so it subtracts from its section.
        </div>
      </div>
    </div>
  );
};

export default Admin;
