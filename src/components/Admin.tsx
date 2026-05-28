import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import * as setupApi from '../services/setupApi';
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

/* ─────────────────────────────────────────────
   Smart-suggest helpers
   Lexical match between an account's name (plus
   any extra fields the user might recognize) and
   the existing IS / BS line labels. Boosted by a
   small synonym dictionary tuned for finance.
   ───────────────────────────────────────────── */
const MAP_STOPWORDS = new Set([
  'the', 'of', 'a', 'an', 'and', 'or', 'for', 'to', 'with', 'in', 'on', 'at',
  'by', 'as', 'is', 'be', 'from', '&',
]);

const MAP_SYNONYM_GROUPS: string[][] = [
  ['wage', 'wages', 'salary', 'salaries', 'pay', 'payroll', 'compensation', 'comp'],
  ['benefit', 'benefits', 'healthcare', 'medical', 'pension', '401k', 'retirement'],
  ['supply', 'supplies', 'material', 'materials', 'consumable', 'consumables'],
  ['drug', 'drugs', 'pharma', 'pharmacy', 'pharmaceutical', 'pharmaceuticals', 'med', 'meds'],
  ['insurance', 'ins', 'coverage'],
  ['depreciation', 'depr', 'amortization', 'amort'],
  ['maintenance', 'maint', 'repair', 'repairs', 'upkeep'],
  ['rent', 'lease', 'leases', 'rental'],
  ['utility', 'utilities', 'electric', 'electricity', 'gas', 'water', 'sewer', 'trash'],
  ['interest', 'int', 'finance'],
  ['tax', 'taxes', 'taxation'],
  ['revenue', 'revenues', 'sales', 'income', 'fees', 'charge', 'charges'],
  ['inpatient', 'ip'],
  ['outpatient', 'op'],
  ['er', 'ed', 'emergency'],
  ['receivable', 'receivables', 'ar'],
  ['payable', 'payables', 'ap'],
  ['cash', 'bank', 'deposit', 'deposits'],
  ['equipment', 'machinery', 'fixture', 'fixtures'],
  ['building', 'buildings', 'facility', 'facilities', 'plant', 'property'],
  ['investment', 'investments', 'security', 'securities'],
  ['debt', 'loan', 'loans', 'note', 'notes', 'bond', 'bonds'],
  ['professional', 'physician', 'doctor', 'md', 'dr'],
  ['contract', 'contracts', 'contracted', 'contractual'],
  ['allowance', 'allowances', 'discount', 'discounts', 'deduction', 'deductions'],
  ['grant', 'grants', 'subsidy', 'subsidies', 'funding'],
  ['nursing', 'nurse', 'nurses', 'rn'],
  ['admin', 'administration', 'administrative', 'g&a'],
  ['food', 'dietary', 'meal', 'meals'],
  ['cleaning', 'janitorial', 'housekeeping', 'sanitation'],
];

const MAP_SYNONYMS: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  MAP_SYNONYM_GROUPS.forEach((group) => {
    const set = new Set(group);
    group.forEach((w) => m.set(w, set));
  });
  return m;
})();

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !MAP_STOPWORDS.has(w) && w.length > 1);

const scoreMatch = (source: string, candidate: string): number => {
  const src = tokenize(source);
  const cand = tokenize(candidate);
  if (!src.length || !cand.length) return 0;
  const candSet = new Set(cand);
  let hits = 0;
  src.forEach((w) => {
    if (candSet.has(w)) {
      hits += 2; // exact token match counts more
      return;
    }
    const syns = MAP_SYNONYMS.get(w);
    if (syns && cand.some((c) => syns.has(c))) {
      hits += 1; // synonym match
    }
  });
  return hits;
};

interface Suggestion {
  statement: 'IS' | 'BS';
  line: string;
  score: number;
}

const buildSuggestions = (
  row: CoaRow,
  isLabels: string[],
  bsLabels: string[],
  preferred: 'IS' | 'BS' | null,
  max = 5,
): Suggestion[] => {
  const source = `${row.name} ${row.account} ${row.deptDescription}`;
  const cands: Suggestion[] = [
    ...isLabels.map((l) => ({ statement: 'IS' as const, line: l, score: scoreMatch(source, l) })),
    ...bsLabels.map((l) => ({ statement: 'BS' as const, line: l, score: scoreMatch(source, l) })),
  ].filter((c) => c.score > 0);
  cands.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (preferred && a.statement !== b.statement) {
      if (a.statement === preferred) return -1;
      if (b.statement === preferred) return 1;
    }
    return 0;
  });
  return cands.slice(0, max);
};

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

  // Only suggest when the row isn't mapped yet AND the user hasn't started typing.
  const suggestions = useMemo(
    () =>
      !row.line && !q
        ? buildSuggestions(row, isLineLabels, bsLineLabels, preferredStatement, 5)
        : [],
    [row, isLineLabels, bsLineLabels, preferredStatement, q],
  );

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

          {suggestions.length > 0 && (
            <>
              <div className="mapdrop-section suggested">
                <Icon
                  name="auto_awesome"
                  style={{ fontSize: 13, color: 'var(--ap-accent-2)' }}
                />
                Suggested
              </div>
              {suggestions.map((s) => (
                <div
                  key={`sg-${s.statement}-${s.line}`}
                  className="mapdrop-opt suggested"
                  onClick={() => {
                    onLink(s.statement, s.line);
                    closeMenu();
                  }}
                >
                  <span className={`ms-tag ${s.statement === 'IS' ? 'is' : 'bs'}`}>
                    {s.statement}
                  </span>
                  <span className="mapdrop-text">{s.line}</span>
                </div>
              ))}
            </>
          )}

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

  const addRow = (kind: LineKind, customLabel?: string) => {
    const fallbackLabel =
      kind === 'header'
        ? 'NEW SECTION'
        : kind === 'subtotal'
        ? 'New Subtotal'
        : kind === 'formula'
        ? 'New Calculation'
        : 'New Line Item';
    const label = (customLabel ?? '').trim() || fallbackLabel;
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

  const [addLabel, setAddLabel] = useState('');
  const [addKind, setAddKind] = useState<Exclude<LineKind, 'header'>>('account');
  const submitAdd = () => {
    addRow(addKind, addLabel);
    setAddLabel('');
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
          <div className="builder-add-form">
            <input
              type="text"
              className="builder-add-input"
              placeholder="Line item label"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAdd();
              }}
            />
            <select
              className="builder-add-select"
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as Exclude<LineKind, 'header'>)}
            >
              <option value="account">Account line</option>
              <option value="subtotal">Subtotal</option>
              <option value="formula">Calculation</option>
            </select>
            <button type="button" className="btn primary sm" onClick={submitAdd}>
              <Icon name="add" />
              Add line item
            </button>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => addRow('header')}
            title="Add a section header"
          >
            <span className="kind-dot" style={{ background: KIND_META.header.color }} />
            Header
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
type Tab = 'org' | 'coa' | 'is' | 'btb' | 'bs' | 'budget';

interface Organization {
  name: string;
  fiscalYearEndMonth: number; // 1–12
  fiscalYearEndDay: number;   // 1–31
  numEntities: number;
}

interface BeginningTbRow {
  id: string;
  account: string;
  balance: number;
}

interface BudgetRow {
  id: string;
  monthEnd: string;
  account: string;
  amount: number;
}

const INITIAL_ORG: Organization = {
  name: '',
  fiscalYearEndMonth: 12,
  fiscalYearEndDay: 31,
  numEntities: 1,
};
type Filter = 'all' | 'mapped' | 'unmapped' | 'is' | 'bs';
type View = 'main' | 'upload' | 'gl-upload' | 'preview' | 'pending';

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

type GlTemplate = 'cpsi' | 'general';

interface GlDetailRow {
  id: string;
  template: GlTemplate;
  date: string;        // formatted mm/dd/yyyy
  monthEnd: string;    // last calendar day of `date`'s month, mm/dd/yyyy
  account: string;
  description: string;
  memo: string;
  reference: string;
  journal: string;
  amount: number;
}

/** Parse an Excel-cell value (Date object, serial number, or string) into a Date. */
const parseDateCell = (input: any): Date | null => {
  if (input == null || input === '') return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    // Excel serial: days since 1899-12-30 (accounts for the 1900 leap-year bug).
    if (input <= 0 || input > 100000) return null;
    const ms = (input - 25569) * 86400 * 1000;
    const u = new Date(ms);
    if (isNaN(u.getTime())) return null;
    // Re-anchor to local midnight to dodge timezone day-shifts in mm/dd/yyyy output.
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    // YYYY-MM-DD (ISO date)
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    // MM/DD/YYYY or M/D/YY
    const us = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/.exec(s);
    if (us) {
      let y = Number(us[3]);
      if (y < 100) y += y < 70 ? 2000 : 1900;
      return new Date(y, Number(us[1]) - 1, Number(us[2]));
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const fmtMmDdYyyy = (d: Date | null): string => {
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};

const monthEndOf = (d: Date | null): Date | null => {
  if (!d) return null;
  // day 0 of next month = last day of current month.
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

/** Pick the strongest template match from a sample row's header keys. */
const detectGlTemplate = (sample: any): GlTemplate | null => {
  if (!sample) return null;
  const keys = new Set(Object.keys(sample));
  const cpsiSignals = ['glm_acc', 'glj_date', 'glj_amt', 'glm_desc', 'glj_journal'];
  const genSignals = ['ACCOUNT #', 'POSTING DATE', 'AMOUNT', 'JOURNAL #', 'DEBIT', 'CREDIT'];
  const cpsiHits = cpsiSignals.filter((s) => keys.has(s)).length;
  const genHits = genSignals.filter((s) => keys.has(s)).length;
  if (cpsiHits >= 2 && cpsiHits >= genHits) return 'cpsi';
  if (genHits >= 2) return 'general';
  return null;
};

const normalizeGlRow = (r: any, template: GlTemplate, idx: number): GlDetailRow => {
  const rawDate = template === 'cpsi' ? r['glj_date'] : r['POSTING DATE'];
  const parsedDate = parseDateCell(rawDate);
  const date = fmtMmDdYyyy(parsedDate);
  const monthEnd = fmtMmDdYyyy(monthEndOf(parsedDate));

  if (template === 'cpsi') {
    return {
      id: `gl-${idx}-${Date.now().toString(36)}`,
      template,
      date,
      monthEnd,
      account: String(r['glm_acc'] ?? '').trim(),
      description: String(r['glm_desc'] ?? '').trim(),
      memo: String(r['glj_memo'] ?? '').trim(),
      reference: String(r['glj_reference'] ?? '').trim(),
      journal: String(r['glj_journal'] ?? '').trim(),
      amount: Number(r['glj_amt']) || 0,
    };
  }
  const debit = Number(r['DEBIT']) || 0;
  const credit = Number(r['CREDIT']) || 0;
  const amount =
    r['AMOUNT'] !== undefined && r['AMOUNT'] !== ''
      ? Number(r['AMOUNT']) || 0
      : debit - credit;
  return {
    id: `gl-${idx}-${Date.now().toString(36)}`,
    template,
    date,
    monthEnd,
    account: String(r['ACCOUNT #'] ?? '').trim(),
    description: String(r['ACCOUNT NAME'] ?? '').trim(),
    memo: String(r['DESCRIPTION'] ?? '').trim(),
    reference: String(r['REFERENCE'] ?? '').trim(),
    journal: String(r['JOURNAL #'] ?? '').trim(),
    amount,
  };
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
          <button type="button" className="btn primary" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" />
            Update GL
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
        Accepts <strong>.xlsx</strong> or <strong>.csv</strong> · <strong>Update GL</strong>{' '}
        replaces every row in the GL Detail table with the contents of the upload.
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

interface GlReviewRow {
  index: number;             // 0-based parse-order index
  parsed: GlDetailRow;
  errors: string[];
  warnings: string[];
}

const buildGlReview = (rows: GlDetailRow[], coa: CoaRow[]): GlReviewRow[] => {
  const known = new Set(coa.map((c) => c.account.trim()));
  return rows.map((r, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!r.account.trim()) errors.push('Account # is required.');
    if (!r.date.trim()) warnings.push('Missing date.');
    if (r.amount === 0) warnings.push('Amount is zero.');
    if (r.account.trim() && !known.has(r.account.trim())) {
      warnings.push(`Account ${r.account} is not in the Chart of Accounts.`);
    }
    return { index, parsed: r, errors, warnings };
  });
};

const GlReviewModal: React.FC<{
  filename: string;
  template: GlTemplate;
  sheet: string;
  review: GlReviewRow[];
  decisions: Map<number, Decision>;
  setDecision: (idx: number, d: Decision) => void;
  bulkSet: (d: Decision) => void;
  onCancel: () => void;
  onApply: () => void;
}> = ({
  filename,
  template,
  sheet,
  review,
  decisions,
  setDecision,
  bulkSet,
  onCancel,
  onApply,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const errorRows = review.filter((r) => r.errors.length > 0);
  const warningRows = review.filter((r) => r.errors.length === 0 && r.warnings.length > 0);
  const cleanRows = review.length - errorRows.length - warningRows.length;
  const blockingErrors = errorRows.some(
    (r) => (decisions.get(r.index) ?? 'skip') === 'apply',
  );
  const applyCount = review.filter(
    (r) => (decisions.get(r.index) ?? 'apply') === 'apply',
  ).length;

  const fmtAmt = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });

  return (
    <div
      className="import-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Review GL upload"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="import-modal" style={{ maxWidth: 960 }}>
        <header className="import-modal-header">
          <div className="ir-banner">
            <Icon name="receipt_long" />
            <div className="ir-banner-text">
              <div className="ir-banner-title">
                Review <strong>{filename}</strong>
              </div>
              <div className="ir-banner-sub">
                Detected <strong>{template === 'cpsi' ? 'CPSI' : 'General GL'}</strong> template
                from sheet &ldquo;{sheet}&rdquo;. Clicking <strong>Update GL</strong> replaces every
                row in the GL Detail table with the rows kept here.
              </div>
            </div>
            <button type="button" className="ir-close" aria-label="Close" onClick={onCancel}>
              <Icon name="close" />
            </button>
          </div>

          <div className="ir-summary">
            <div className="ir-summary-item">
              <div className="ir-k">Parsed</div>
              <div className="ir-v">{review.length.toLocaleString()}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Clean</div>
              <div className="ir-v pos">{cleanRows.toLocaleString()}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Warnings</div>
              <div className="ir-v">{warningRows.length.toLocaleString()}</div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Errors</div>
              <div className={`ir-v ${errorRows.length ? 'neg' : ''}`}>
                {errorRows.length.toLocaleString()}
              </div>
            </div>
            <div className="ir-summary-item">
              <div className="ir-k">Will be applied</div>
              <div className="ir-v">{applyCount.toLocaleString()}</div>
            </div>
          </div>
        </header>

        <div className="import-modal-body">
          {errorRows.length > 0 && (
            <section className="ir-error-panel">
              <div className="ir-error-head">
                <Icon name="error" />
                <strong>
                  {errorRows.length} row{errorRows.length === 1 ? '' : 's'} need attention.
                </strong>{' '}
                Account # is required; rows without one will be skipped. Switch their decision to
                Apply only if you fix the source.
              </div>
              <ul className="ir-error-list">
                {errorRows.slice(0, 20).map((r) => (
                  <li key={`err-${r.index}`}>
                    <span className="ir-error-row">Row {r.index + 2}</span>
                    <span className="ir-error-acct">
                      {r.parsed.account || <em>(no account #)</em>}
                    </span>
                    <span className="ir-error-name">
                      {r.parsed.description || <em>(no description)</em>}
                    </span>
                    <span className="ir-error-msgs">{r.errors.join(' ')}</span>
                  </li>
                ))}
              </ul>
              {errorRows.length > 20 && (
                <div style={{ fontSize: 12, color: 'var(--ap-muted)', marginTop: 6 }}>
                  + {errorRows.length - 20} more error
                  {errorRows.length - 20 === 1 ? '' : 's'} not shown.
                </div>
              )}
            </section>
          )}

          <section className="ir-section">
            <div className="ir-section-head">
              <h3>GL Transactions &mdash; {review.length.toLocaleString()} row{review.length === 1 ? '' : 's'}</h3>
              <div className="ir-bulk">
                <button type="button" className="btn ghost sm" onClick={() => bulkSet('skip')}>
                  Skip all
                </button>
                <button type="button" className="btn ghost sm" onClick={() => bulkSet('apply')}>
                  Apply all
                </button>
              </div>
            </div>

            <div className="ir-table-wrap tall">
              <table className="ir-table">
                <thead>
                  <tr>
                    <th className="c">Row</th>
                    <th>Date</th>
                    <th>Account #</th>
                    <th>Description</th>
                    <th>Memo</th>
                    <th>Journal #</th>
                    <th className="c">Amount</th>
                    <th>Status</th>
                    <th className="c">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {review.slice(0, 500).map((r) => {
                    const decision = decisions.get(r.index) ?? (r.errors.length ? 'skip' : 'apply');
                    const status =
                      r.errors.length > 0
                        ? 'error'
                        : r.warnings.length > 0
                        ? 'warning'
                        : 'ok';
                    return (
                      <tr
                        key={r.parsed.id}
                        className={`ir-row ${status === 'error' ? 'error' : status === 'warning' ? 'conflict' : 'new'}`}
                        title={[...r.errors, ...r.warnings].join(' ')}
                      >
                        <td className="c mono">{r.index + 2}</td>
                        <td className="mono">{r.parsed.date || <em className="muted">—</em>}</td>
                        <td className="mono">
                          {r.parsed.account || <em className="muted">(blank)</em>}
                        </td>
                        <td>{r.parsed.description || <em className="muted">—</em>}</td>
                        <td>{r.parsed.memo || <em className="muted">—</em>}</td>
                        <td className="mono">{r.parsed.journal || <em className="muted">—</em>}</td>
                        <td
                          className={`c mono ${
                            r.parsed.amount < 0
                              ? 'gl-amt-neg'
                              : r.parsed.amount > 0
                              ? 'gl-amt-pos'
                              : ''
                          }`}
                        >
                          {fmtAmt(r.parsed.amount)}
                        </td>
                        <td>
                          <span
                            className={`ir-badge ${status === 'error' ? 'error' : status === 'warning' ? 'conflict' : 'new'}`}
                          >
                            {status === 'error' ? 'Error' : status === 'warning' ? 'Warning' : 'OK'}
                          </span>
                        </td>
                        <td className="c">
                          <SkipApplyToggle
                            value={decision}
                            onChange={(d) => setDecision(r.index, d)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {review.length > 500 && (
              <div
                style={{
                  padding: '8px 18px',
                  fontSize: 12,
                  color: 'var(--ap-muted)',
                  borderTop: '1px solid var(--ap-line)',
                }}
              >
                Showing the first 500 of {review.length.toLocaleString()} rows. Bulk Skip/Apply
                covers every row.
              </div>
            )}
          </section>
        </div>

        <footer className="import-modal-footer">
          {blockingErrors && (
            <div className="ir-footer-warn">
              <Icon name="error_outline" />
              Error rows are still set to Apply. Switch them to Skip or fix the source before
              committing.
            </div>
          )}
          <button type="button" className="btn ghost" onClick={onCancel}>
            <Icon name="close" />
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={blockingErrors || applyCount === 0}
            onClick={onApply}
          >
            <Icon name="check_circle" />
            Update GL
          </button>
        </footer>
      </div>
    </div>
  );
};

const GlTemplateErrorModal: React.FC<{
  filename: string;
  onClose: () => void;
}> = ({ filename, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="import-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Unrecognized GL template"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="import-modal" style={{ maxWidth: 560 }}>
        <header className="import-modal-header">
          <div className="ir-banner">
            <Icon name="error" style={{ color: 'var(--ap-neg)' }} />
            <div className="ir-banner-text">
              <div className="ir-banner-title">
                Can&rsquo;t detect the template in <strong>{filename}</strong>.
              </div>
              <div className="ir-banner-sub">
                The header row doesn&rsquo;t match the General GL or CPSI layouts. Download a
                template below, paste your data into it, and re-upload.
              </div>
            </div>
            <button type="button" className="ir-close" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="import-modal-body">
          <div className="ug-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="ug-card">
              <div className="ug-card-head">
                <Icon name="description" style={{ color: 'var(--ap-accent)' }} />
                <h3>General GL template</h3>
              </div>
              <p>
                Plain-English headers: <strong>POSTING DATE</strong>, <strong>ACCOUNT #</strong>,
                <strong> DEBIT</strong>, <strong>CREDIT</strong>, <strong>AMOUNT</strong>,{' '}
                <strong>JOURNAL #</strong>.
              </p>
              <div className="ug-card-actions">
                <button type="button" className="btn" onClick={downloadGlGeneralTemplate}>
                  <Icon name="download" />
                  Download General
                </button>
              </div>
            </div>
            <div className="ug-card">
              <div className="ug-card-head">
                <Icon name="storage" style={{ color: 'var(--ap-accent)' }} />
                <h3>CPSI template</h3>
              </div>
              <p>
                Raw CPSI schema: <code>glm_comp</code>, <code>glm_acc</code>,{' '}
                <code>glj_date</code>, <code>glj_amt</code>, etc.
              </p>
              <div className="ug-card-actions">
                <button type="button" className="btn" onClick={downloadGlCpsiTemplate}>
                  <Icon name="download" />
                  Download CPSI
                </button>
              </div>
            </div>
          </div>
        </div>

        <footer className="import-modal-footer">
          <button type="button" className="btn primary" onClick={onClose}>
            <Icon name="check" />
            Got it
          </button>
        </footer>
      </div>
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

/* ─────────────────────────────────────────────
   Organization form
   ───────────────────────────────────────────── */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const OrganizationForm: React.FC<{
  value: Organization;
  onChange: (org: Organization) => void;
}> = ({ value, onChange }) => {
  const daysInMonth = new Date(2024, value.fiscalYearEndMonth, 0).getDate();
  return (
    <div className="admin-card org-card">
      <div className="org-section">
        <h3 className="org-section-title">Organization</h3>
        <div className="org-grid">
          <label className="org-field">
            <span>Organization name</span>
            <input
              type="text"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="e.g. Coosa Valley Medical Center"
            />
          </label>
          <label className="org-field">
            <span>Number of entities</span>
            <input
              type="number"
              min={1}
              value={value.numEntities}
              onChange={(e) =>
                onChange({ ...value, numEntities: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </label>
        </div>
      </div>

      <div className="org-section">
        <h3 className="org-section-title">Fiscal year end</h3>
        <div className="org-grid">
          <label className="org-field">
            <span>Month</span>
            <select
              value={value.fiscalYearEndMonth}
              onChange={(e) =>
                onChange({ ...value, fiscalYearEndMonth: Number(e.target.value) })
              }
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="org-field">
            <span>Day</span>
            <select
              value={Math.min(value.fiscalYearEndDay, daysInMonth)}
              onChange={(e) =>
                onChange({ ...value, fiscalYearEndDay: Number(e.target.value) })
              }
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="org-hint">
          Drives YTD math, the 12-month trended views, and any FYTD-vs-budget calculations.
        </div>
      </div>

      <div className="org-section">
        <h3 className="org-section-title">Entities</h3>
        <p className="org-hint">
          When this is greater than 1, each entity will hold its own Chart of Accounts and GL
          transactions. The setup workbook will gain a tab per entity, and a consolidated view
          will sum across them. The per-entity backend isn&rsquo;t wired up yet — for now this is
          recorded so we know what scaffolding to build.
        </p>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Beginning trial balance editor
   ───────────────────────────────────────────── */
const BTB_HEADERS = ['ACCOUNT #', 'BEGINNING BALANCE'];
const downloadBegTbTemplate = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([BTB_HEADERS]), 'Beginning Trial Balance');
  XLSX.writeFile(wb, 'beginning_trial_balance_template.xlsx');
};

const BeginningTbEditor: React.FC<{
  rows: BeginningTbRow[];
  setRows: React.Dispatch<React.SetStateAction<BeginningTbRow[]>>;
}> = ({ rows, setRows }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (id: string, patch: Partial<BeginningTbRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () =>
    setRows((p) => [...p, { id: newId('btb'), account: '', balance: 0 }]);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
      const next: BeginningTbRow[] = raw
        .map((r, i) => ({
          id: newId(`btb-${i}`),
          account: String(r['ACCOUNT #'] ?? r['Account #'] ?? r['account'] ?? '').trim(),
          balance: Number(r['BEGINNING BALANCE'] ?? r['Beginning Balance'] ?? 0) || 0,
        }))
        .filter((r) => r.account);
      if (next.length === 0) {
        setError('No usable rows. Expecting columns ACCOUNT # and BEGINNING BALANCE.');
        return;
      }
      setRows(next);
    } catch (e: any) {
      setError(e?.message || 'Failed to parse file.');
    }
  };

  const totalBalance = rows.reduce((a, r) => a + (r.balance || 0), 0);

  return (
    <>
      <div
        className={`drop ${hover ? 'hover' : ''} ${error ? 'error' : ''}`}
        style={{ marginBottom: 14 }}
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
          <Icon name={error ? 'error_outline' : 'balance'} style={{ fontSize: 28 }} />
        </div>
        <div className="drop-title">
          {rows.length > 0
            ? `${rows.length.toLocaleString()} opening balance row${rows.length === 1 ? '' : 's'} loaded`
            : 'Drop a Beginning Trial Balance workbook'}
        </div>
        <div className="drop-sub">
          {error
            ? error
            : 'Two columns: ACCOUNT # and BEGINNING BALANCE. Used to seed the Balance Sheet preview with full balances at period start.'}
        </div>
        <div className="drop-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" />
            Choose file
          </button>
          <button type="button" className="btn ghost" onClick={downloadBegTbTemplate}>
            <Icon name="download" />
            Download template
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="admin-card">
        <div className="coa-table-wrap">
          <table className="coa-table">
            <colgroup>
              <col style={{ width: 50 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="c">#</th>
                <th>ACCOUNT #</th>
                <th>BEGINNING BALANCE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="coa-empty">
                    No opening balances yet. Drop a workbook above or click{' '}
                    <strong>Add row</strong> below.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className="coa-row">
                  <td className="c muted mono">{i + 1}</td>
                  <td className="mono">
                    <input
                      className="inline-input mono"
                      value={r.account}
                      onChange={(e) => updateRow(r.id, { account: e.target.value })}
                    />
                  </td>
                  <td className="mono">
                    <input
                      className="inline-input mono"
                      type="number"
                      value={r.balance}
                      onChange={(e) => updateRow(r.id, { balance: Number(e.target.value) || 0 })}
                    />
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
              ))}
              {rows.length > 0 && (
                <tr className="coa-row">
                  <td />
                  <td className="mono" style={{ fontWeight: 600 }}>
                    Total
                  </td>
                  <td
                    className="mono"
                    style={{
                      fontWeight: 600,
                      color: totalBalance === 0 ? 'var(--ap-pos)' : 'var(--ap-ink)',
                    }}
                  >
                    {totalBalance.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 2,
                    })}
                    {totalBalance === 0 && (
                      <span
                        style={{ marginLeft: 8, fontSize: 11, color: 'var(--ap-pos)' }}
                      >
                        balances
                      </span>
                    )}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="coa-add">
          <button type="button" className="btn ghost" onClick={addRow}>
            <Icon name="add" />
            Add row
          </button>
        </div>
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   Budget editor — same shape as GL transactions
   but lives in its own state so we can diff
   budget vs actual later.
   ───────────────────────────────────────────── */
const BUDGET_HEADERS = ['MONTH_END', 'ACCOUNT #', 'BUDGET AMOUNT'];
const downloadBudgetTemplate = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([BUDGET_HEADERS]), 'Budget');
  XLSX.writeFile(wb, 'budget_template.xlsx');
};

const BudgetEditor: React.FC<{
  rows: BudgetRow[];
  setRows: React.Dispatch<React.SetStateAction<BudgetRow[]>>;
  onPersist?: (rows: BudgetRow[]) => void;
}> = ({ rows, setRows, onPersist }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
      const next: BudgetRow[] = raw
        .map((r, i) => {
          const rawDate = r['MONTH_END'] ?? r['Month_End'] ?? r['month_end'];
          const parsed = parseDateCell(rawDate);
          return {
            id: newId(`bud-${i}`),
            monthEnd: fmtMmDdYyyy(parsed),
            account: String(r['ACCOUNT #'] ?? r['Account #'] ?? r['account'] ?? '').trim(),
            amount:
              Number(r['BUDGET AMOUNT'] ?? r['Budget Amount'] ?? r['amount'] ?? 0) || 0,
          };
        })
        .filter((r) => r.account);
      if (next.length === 0) {
        setError('No usable rows. Expecting columns MONTH_END, ACCOUNT #, and BUDGET AMOUNT.');
        return;
      }
      setRows(next);
      onPersist?.(next);
    } catch (e: any) {
      setError(e?.message || 'Failed to parse file.');
    }
  };

  return (
    <>
      <div
        className={`drop ${hover ? 'hover' : ''} ${error ? 'error' : ''}`}
        style={{ marginBottom: 14 }}
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
          <Icon name={error ? 'error_outline' : 'savings'} style={{ fontSize: 28 }} />
        </div>
        <div className="drop-title">
          {rows.length > 0
            ? `${rows.length.toLocaleString()} budget row${rows.length === 1 ? '' : 's'} loaded`
            : 'Drop your Budget workbook'}
        </div>
        <div className="drop-sub">
          {error
            ? error
            : 'Three columns: MONTH_END, ACCOUNT #, and BUDGET AMOUNT. Same idea as GL Transactions but lands in the Budget table — keeps budget vs actual cleanly separated.'}
        </div>
        <div className="drop-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" />
            Update Budget
          </button>
          <button type="button" className="btn ghost" onClick={downloadBudgetTemplate}>
            <Icon name="download" />
            Download template
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {rows.length > 0 && (
        <div className="admin-card">
          <div className="coa-table-wrap">
            <table className="coa-table">
              <colgroup>
                <col style={{ width: 50 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 140 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th className="c">#</th>
                  <th>MONTH_END</th>
                  <th>ACCOUNT #</th>
                  <th className="c">BUDGET AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((r, i) => (
                  <tr key={r.id} className="coa-row">
                    <td className="c muted mono">{i + 1}</td>
                    <td className="mono">{r.monthEnd || <em className="muted">—</em>}</td>
                    <td className="mono">{r.account}</td>
                    <td className="c mono">
                      {r.amount.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 500 && (
            <div className="coa-add">
              <span className="muted" style={{ fontSize: 12 }}>
                Showing first 500 of {rows.length.toLocaleString()} rows.
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ─────────────────────────────────────────────
   Pending — punch list of setup pieces needed
   to make every sidebar tab driven by Setup.
   ───────────────────────────────────────────── */
type PendingStatus = 'not-started' | 'in-progress' | 'partial' | 'done';

interface PendingItem {
  title: string;
  status: PendingStatus;
  description: string;
  unlocks: string[];
}

const PENDING_ITEMS: PendingItem[] = [
  {
    title: 'Selectable subtotals',
    status: 'in-progress',
    description:
      'Today a Subtotal sums every account line above it until the next non-account row. That works for simple layouts but breaks when an IS section needs sub-rolls — for example "Total Patient Revenue = Inpatient + Outpatient + Swing Bed + Retail Pharmacy" sitting alongside other revenue lines. Subtotals should support an explicit term list (same UI as Calculations, signs implicit as +) so you can pick exactly which line items roll into each subtotal.',
    unlocks: ['Income Statement', 'Trended IS', 'Departmental IS', 'Balance Sheet'],
  },
  {
    title: 'Beginning trial balance',
    status: 'partial',
    description:
      'Upload + editable table now live on the Beginning Trial Balance tab. Two columns: ACCOUNT # and BEGINNING BALANCE, with a running total that flags whether the file balances. Still needed: wire these opening balances into the Balance Sheet preview so it shows full balances instead of monthly activity.',
    unlocks: ['Balance Sheet', 'Balance Sheet Trend', 'Balance Sheet Activity'],
  },
  {
    title: 'Budget data',
    status: 'partial',
    description:
      'Budget tab now accepts an upload with MONTH_END / ACCOUNT # / BUDGET AMOUNT columns and stores the rows in their own Budget table (separate from GL Detail so we can diff budget vs actual cleanly). Still needed: join Budget to the IS preview/MVA/MD&A and add a budget-vs-actual variance column.',
    unlocks: ['Income Statement', 'MVA', 'MD&A', 'Budget', 'Pro Forma'],
  },
  {
    title: 'Prior-year actuals',
    status: 'partial',
    description:
      'Prior-year comparisons work today if the GL upload covers ≥ 24 months. If clients only send one year at a time, we need a "prior-year actuals" upload (same shape as GL) that holds historical data separately so we can join it without rebuilding the current year.',
    unlocks: ['Income Statement (PY column)', 'Trended IS', 'MD&A'],
  },
  {
    title: 'Fiscal calendar',
    status: 'partial',
    description:
      'Organization tab now records fiscal year-end (month + day) and the organization name. Still needed: derive the period list from that anchor and feed YTD math, Trended IS month order, MVA period buckets, and any FYTD-vs-budget calculations.',
    unlocks: ['Trended IS', 'MVA', 'Projections', 'Pro Forma', 'Budget deliverable'],
  },
  {
    title: 'Multi-entity setup',
    status: 'partial',
    description:
      'Organization tab captures the entity count, but each entity still needs its own Chart of Accounts / GL / Beginning TB / Budget tables on the backend, plus a "Consolidated vs By Entity" toggle on the reporting views. Schema and the per-entity workbook tabs are pending.',
    unlocks: ['Consolidated financials', 'By-entity financials'],
  },
  {
    title: 'Statement of Cash Flows template',
    status: 'not-started',
    description:
      'A third statement template alongside IS and BS. Line items plus the source — either direct (account → cash flow bucket) or indirect (starts at Net Income, adds back depreciation, working-capital deltas, etc.). Add the template builder and the workbook tab.',
    unlocks: ['Cash Flow report', 'Days Cash on Hand KPI'],
  },
  {
    title: 'Statistics & volumes',
    status: 'not-started',
    description:
      'Non-financial monthly metrics: patient days, admissions, ER visits, surgeries, FTEs, etc. Stored keyed by metric + Month_End. Feeds every "per-X" KPI (revenue per admission, cost per visit, ADC) and the main Dashboard tiles.',
    unlocks: ['Dashboard', 'MD&A', 'MVA', 'Trended IS ratios'],
  },
  {
    title: 'KPI / ratio definitions',
    status: 'not-started',
    description:
      'Named formulas built from subtotals + statistics. Examples: Operating Margin = Operating Income / Total Revenue; Days Cash on Hand = Cash × 365 / Operating Expenses; AR Days = AR × Days / Net Revenue. Same calc-term picker as Calculations, extended to reference Statistics too.',
    unlocks: ['Dashboard', 'MD&A', 'Trended IS ratios block'],
  },
  {
    title: 'Dashboard tile bindings',
    status: 'not-started',
    description:
      'Which subtotals/KPIs show up on the main Dashboard as headline tiles (Operating Margin, Net Patient Revenue, Days Cash on Hand, etc.), in what order. A small drag-to-reorder list in the Setup pages, each tile pointing at a defined subtotal or KPI.',
    unlocks: ['Dashboard'],
  },
  {
    title: 'MD&A narrative rules',
    status: 'not-started',
    description:
      'Variance thresholds + boilerplate templates: "If <line> moves more than <X%> vs <comparison>, draft a paragraph saying …". Lets MD&A auto-fill commentary from the data instead of being a blank doc.',
    unlocks: ['MD&A'],
  },
  {
    title: 'Pro-forma assumptions',
    status: 'not-started',
    description:
      'Growth rates, FTE plans, capex plans, and any driver-based inputs for projecting forward. Stored per line item or per subtotal, possibly with monthly seasonality factors.',
    unlocks: ['Pro Forma', 'Projections', 'Impact Preview'],
  },
  {
    title: 'Impact preview scenarios',
    status: 'not-started',
    description:
      'Saved scenario sets: starting from the current pro-forma, what-if a service-line expansion, a hiring plan, a rate adjustment. Each scenario is a delta on top of the base assumptions and shows on Impact Preview.',
    unlocks: ['Impact Preview'],
  },
  {
    title: 'Departmental cost allocation',
    status: 'partial',
    description:
      'Today the Dept field on each account drives a direct departmental split. For shared overhead (Admin, IT, Facilities) we need allocation rules — e.g., allocate Admin to revenue-producing departments on a percent basis or by stat driver. Add an allocation matrix tab.',
    unlocks: ['Departmental IS'],
  },
  {
    title: 'Account / line sign conventions',
    status: 'partial',
    description:
      'Sign toggle exists per row in the IS/BS builder. We should also normalize sign on upload (CPSI exports debits/credits as positive numbers; Contra Revenue should flip sign automatically). Likely a per-FS-type default with per-account override.',
    unlocks: ['Income Statement', 'Trended IS', 'Balance Sheet'],
  },
  {
    title: 'Period-locked / closed periods',
    status: 'not-started',
    description:
      'Once a month is closed, GL uploads should refuse to overwrite that month (or warn loudly). Stored as a "closed through" flag; drives the GL update flow and any audit trail.',
    unlocks: ['GL Transactions', 'Income Statement', 'Balance Sheet'],
  },
];

const STATUS_LABEL: Record<PendingStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  partial: 'Partial',
  done: 'Done',
};

const PendingList: React.FC = () => (
  <div className="pending-list">
    {PENDING_ITEMS.map((it) => (
      <article key={it.title} className={`pending-card status-${it.status}`}>
        <header className="pending-card-head">
          <h3>{it.title}</h3>
          <span className={`pending-badge status-${it.status}`}>
            {STATUS_LABEL[it.status]}
          </span>
        </header>
        <p className="pending-card-desc">{it.description}</p>
        <div className="pending-card-foot">
          <span className="pending-foot-k">Unlocks</span>
          {it.unlocks.map((u) => (
            <span key={u} className="pending-tag">
              {u}
            </span>
          ))}
        </div>
      </article>
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   Financial preview — IS / BS rendered from
   configured line items + CoA mappings.
   ───────────────────────────────────────────── */
const parseMmDdYyyy = (s: string): Date | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
};

const FinancialPreview: React.FC<{
  isLines: StatementLine[];
  bsLines: StatementLine[];
  coa: CoaRow[];
  glRows: GlDetailRow[];
}> = ({ isLines, bsLines, coa, glRows }) => {
  const [tab, setTab] = useState<'is' | 'bs'>('is');

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    glRows.forEach((r) => {
      if (r.monthEnd) set.add(r.monthEnd);
    });
    return Array.from(set).sort((a, b) => {
      const pa = parseMmDdYyyy(a)?.getTime() ?? 0;
      const pb = parseMmDdYyyy(b)?.getTime() ?? 0;
      return pb - pa; // newest first
    });
  }, [glRows]);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  // Auto-select the most recent month when data arrives or the user hasn't picked yet.
  useEffect(() => {
    if (!selectedMonth && availableMonths.length > 0) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Sum of GL amount per account for the selected month.
  const accountTotals = useMemo(() => {
    const m = new Map<string, number>();
    glRows.forEach((r) => {
      if (!r.account) return;
      if (selectedMonth && r.monthEnd !== selectedMonth) return;
      m.set(r.account, (m.get(r.account) || 0) + (r.amount || 0));
    });
    return m;
  }, [glRows, selectedMonth]);

  return (
    <>
      <div className="preview-tabbar">
        <div className="admin-tabs" style={{ margin: 0, borderBottom: 'none' }}>
          <button
            type="button"
            className={`br-tab ${tab === 'is' ? 'active' : ''}`}
            onClick={() => setTab('is')}
          >
            <Icon name="description" />
            Income Statement
            <span className="tab-count">{isLines.length}</span>
          </button>
          <button
            type="button"
            className={`br-tab ${tab === 'bs' ? 'active' : ''}`}
            onClick={() => setTab('bs')}
          >
            <Icon name="account_balance" />
            Balance Sheet
            <span className="tab-count">{bsLines.length}</span>
          </button>
          {tab === 'bs' && (
            <div className="preview-bs-note">
              <Icon name="info" style={{ fontSize: 14, color: 'var(--ap-muted)' }} />
              Showing balance-sheet activity for the chosen month — upload a beginning trial
              balance to see full balances.
            </div>
          )}
        </div>
        <div className="preview-month">
          <label htmlFor="preview-month-select">Month</label>
          <select
            id="preview-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            disabled={availableMonths.length === 0}
          >
            {availableMonths.length === 0 ? (
              <option value="">No GL months available</option>
            ) : (
              availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <PreviewStatement
        rows={tab === 'is' ? isLines : bsLines}
        statement={tab === 'is' ? 'IS' : 'BS'}
        coa={coa}
        accountTotals={accountTotals}
        hasGlData={glRows.length > 0}
      />
    </>
  );
};

const PreviewStatement: React.FC<{
  rows: StatementLine[];
  statement: 'IS' | 'BS';
  coa: CoaRow[];
  accountTotals: Map<string, number>;
  hasGlData: boolean;
}> = ({ rows, statement, coa, accountTotals, hasGlData }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const accountsByLine = useMemo(() => {
    const m = new Map<string, CoaRow[]>();
    coa.forEach((r) => {
      if (r.statement !== statement || !r.line) return;
      const key = r.line.toLowerCase();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    });
    return m;
  }, [coa, statement]);

  // Per-row computed values:
  //   • account → sum of mapped account totals (sign-flipped if r.sign === '-')
  //   • subtotal → sum of account-line values since the last non-account row
  //   • formula  → linear combination of subtotals via calcTerms
  const rowValues = useMemo(() => {
    const values = new Map<string, number>();
    const subtotalsByLabel = new Map<string, number>();
    let sectionAccounts: number[] = [];
    rows.forEach((r) => {
      if (r.kind === 'header') {
        sectionAccounts = [];
        return;
      }
      if (r.kind === 'account') {
        const mapped = accountsByLine.get(r.label.toLowerCase()) ?? [];
        let amt = 0;
        mapped.forEach((a) => {
          amt += accountTotals.get(a.account) || 0;
        });
        if (r.sign === '-') amt = -amt;
        values.set(r.id, amt);
        sectionAccounts.push(amt);
        return;
      }
      if (r.kind === 'subtotal') {
        const sub = sectionAccounts.reduce((a, b) => a + b, 0);
        values.set(r.id, sub);
        subtotalsByLabel.set(r.label.toLowerCase(), sub);
        sectionAccounts = []; // reset so the next subtotal doesn't double-count
        return;
      }
      if (r.kind === 'formula') {
        let v = 0;
        (r.calcTerms || []).forEach((t) => {
          const sub = subtotalsByLabel.get(t.label.toLowerCase()) || 0;
          v += t.sign === '-' ? -sub : sub;
        });
        values.set(r.id, v);
        sectionAccounts = [];
      }
    });
    return values;
  }, [rows, accountsByLine, accountTotals]);

  const fmtAmt = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  const placeholder = hasGlData ? '$0' : '—';

  if (rows.length === 0) {
    return (
      <div className="admin-card" style={{ padding: 32, textAlign: 'center' }}>
        <div className="muted" style={{ color: 'var(--ap-muted)', fontSize: 13 }}>
          No {statement === 'IS' ? 'Income Statement' : 'Balance Sheet'} lines configured yet.
          Build the template on the Setup page.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrapper">
        <table className="income-statement-table">
          <thead>
            <tr>
              <th>Line Item</th>
              <th style={{ textAlign: 'right' }}>Current Period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === 'header') {
                return (
                  <tr key={r.id} className="section-header">
                    <td colSpan={2}>{r.label}</td>
                  </tr>
                );
              }
              if (r.kind === 'subtotal') {
                const v = rowValues.get(r.id) ?? 0;
                return (
                  <tr key={r.id} className="subtotal">
                    <td className="line-item">{r.label}</td>
                    <td className={`amount ${v < 0 ? 'negative' : v > 0 ? 'positive' : ''}`}>
                      {hasGlData ? fmtAmt(v) : placeholder}
                    </td>
                  </tr>
                );
              }
              if (r.kind === 'formula') {
                const v = rowValues.get(r.id) ?? 0;
                return (
                  <tr key={r.id} className="subtotal">
                    <td className="line-item">
                      {r.label}
                      {r.calcTerms && r.calcTerms.length > 0 && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 10.5,
                            color: 'var(--ap-muted)',
                            fontWeight: 400,
                            marginTop: 2,
                          }}
                        >
                          {r.calcTerms
                            .map((t, i) => `${i === 0 && t.sign === '+' ? '' : t.sign} ${t.label}`)
                            .join(' ')}
                        </span>
                      )}
                    </td>
                    <td className={`amount ${v < 0 ? 'negative' : v > 0 ? 'positive' : ''}`}>
                      {hasGlData ? fmtAmt(v) : placeholder}
                    </td>
                  </tr>
                );
              }
              // account line — expandable
              const isOpen = expanded.has(r.id);
              const mapped = accountsByLine.get(r.label.toLowerCase()) ?? [];
              const lineVal = rowValues.get(r.id) ?? 0;
              return (
                <React.Fragment key={r.id}>
                  <tr
                    className="preview-account-line"
                    onClick={() => toggle(r.id)}
                    style={{ cursor: mapped.length ? 'pointer' : 'default' }}
                  >
                    <td className="line-item indent">
                      <span className="preview-chev">
                        <Icon
                          name={isOpen ? 'expand_more' : 'chevron_right'}
                          style={{
                            fontSize: 16,
                            color: mapped.length ? 'var(--ap-ink-2)' : 'var(--ap-faint)',
                            verticalAlign: 'middle',
                          }}
                        />
                      </span>
                      {r.label}
                      {r.sign === '-' && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: 'var(--ap-neg)',
                            fontWeight: 600,
                          }}
                        >
                          (−)
                        </span>
                      )}
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: 'var(--ap-muted)',
                          fontWeight: 400,
                        }}
                      >
                        {mapped.length} account{mapped.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td
                      className={`amount ${lineVal < 0 ? 'negative' : lineVal > 0 ? 'positive' : ''}`}
                    >
                      {hasGlData ? fmtAmt(lineVal) : placeholder}
                    </td>
                  </tr>
                  {isOpen &&
                    mapped.map((a) => {
                      const raw = accountTotals.get(a.account) || 0;
                      const acctVal = r.sign === '-' ? -raw : raw;
                      return (
                        <tr key={`${r.id}-${a.id}`} className="preview-account-row">
                          <td className="line-item" style={{ paddingLeft: 48 }}>
                            <span
                              className="mono"
                              style={{ color: 'var(--ap-muted)', marginRight: 8 }}
                            >
                              {a.account}
                            </span>
                            {a.name}
                            {a.dept && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 11,
                                  color: 'var(--ap-faint)',
                                }}
                              >
                                · dept {a.dept}
                              </span>
                            )}
                          </td>
                          <td
                            className={`amount ${
                              acctVal < 0 ? 'negative' : acctVal > 0 ? 'positive' : ''
                            }`}
                            style={{ color: acctVal === 0 ? 'var(--ap-muted)' : undefined }}
                          >
                            {hasGlData ? fmtAmt(acctVal) : placeholder}
                          </td>
                        </tr>
                      );
                    })}
                  {isOpen && mapped.length === 0 && (
                    <tr className="preview-account-row">
                      <td
                        colSpan={2}
                        style={{
                          paddingLeft: 48,
                          fontSize: 12,
                          color: 'var(--ap-faint)',
                          fontStyle: 'italic',
                        }}
                      >
                        No GL accounts mapped to this line yet.
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Admin: React.FC = () => {
  const [tab, setTab] = useState<Tab>('coa');
  const [organization, setOrganization] = useState<Organization>(INITIAL_ORG);
  const [beginningTb, setBeginningTb] = useState<BeginningTbRow[]>([]);
  const [budget, setBudget] = useState<BudgetRow[]>([]);
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
  const [glDetail, setGlDetail] = useState<{
    filename: string;
    sheet: string;
    template: GlTemplate;
    rows: GlDetailRow[];
  } | null>(null);
  const [glTemplateError, setGlTemplateError] = useState<{ filename: string } | null>(null);
  const [glPending, setGlPending] = useState<{
    filename: string;
    sheet: string;
    template: GlTemplate;
    review: GlReviewRow[];
  } | null>(null);
  const [glPendingDecisions, setGlPendingDecisions] = useState<Map<number, Decision>>(
    new Map(),
  );

  /* ── Backend wiring ─────────────────────────────────────────
     Hydrate from /api/setup on mount; Save Setup writes back.
     If the server has no DATABASE_URL the call 503s and we stay
     in local-only mode without complaining.
     ──────────────────────────────────────────────────────── */
  const [persist, setPersist] = useState<{
    state: 'unknown' | 'available' | 'unavailable' | 'saving' | 'saved' | 'error';
    message?: string;
    lastSavedAt?: number;
  }>({ state: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bundle = await setupApi.getSetup();
        if (cancelled) return;
        // Hydrate state from the loaded bundle.
        setOrganization({
          name: bundle.organization.name || '',
          fiscalYearEndMonth: bundle.organization.fiscalYearEndMonth || 12,
          fiscalYearEndDay: bundle.organization.fiscalYearEndDay || 31,
          numEntities: bundle.organization.numEntities || 1,
        });
        setCoa(
          bundle.coa.map((r, i) => ({
            id: newId('coa-' + i),
            account: r.account,
            name: r.name,
            legacyGl: r.legacyGl,
            type: r.type,
            statement: r.statement,
            line: r.line,
            dept: r.dept,
            deptDescription: r.deptDescription,
            subAccount: r.subAccount,
            active: r.active,
          })),
        );
        const restoreLines = (rows: setupApi.StatementLineWire[]): StatementLine[] =>
          rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            label: r.label,
            section: r.section,
            sign: (r.sign ?? undefined) as '+' | '-' | undefined,
            formula: r.formula ?? undefined,
            calcTerms: r.calcTerms ?? undefined,
            bold: r.bold || undefined,
          }));
        setIsLines(restoreLines(bundle.isLines));
        setBsLines(restoreLines(bundle.bsLines));
        setDeptList(
          bundle.deptList.map((d, i) => ({ id: newId('d-' + i), code: d.code, name: d.name })),
        );
        setBeginningTb(
          bundle.beginningTb.map((b, i) => ({
            id: newId('btb-' + i),
            account: b.account,
            balance: b.balance,
          })),
        );
        setPersist({ state: 'available' });
      } catch (e: any) {
        if (cancelled) return;
        // 503 = backend has no DB; quietly drop to local-only.
        if (e?.status === 503) {
          setPersist({ state: 'unavailable' });
        } else {
          console.warn('[setup load] falling back to local state:', e?.message);
          setPersist({ state: 'unavailable', message: e?.message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSetup = async () => {
    if (persist.state === 'unavailable') return;
    setPersist((p) => ({ ...p, state: 'saving' }));
    try {
      const bundle: setupApi.SetupBundle = {
        organization,
        coa: coa.map((r) => ({
          account: r.account,
          name: r.name,
          legacyGl: r.legacyGl,
          type: r.type,
          statement: r.statement,
          line: r.line,
          dept: r.dept,
          deptDescription: r.deptDescription,
          subAccount: r.subAccount,
          active: r.active,
        })),
        isLines: isLines.map((l) => ({
          id: l.id,
          statement: 'IS',
          kind: l.kind,
          label: l.label,
          section: l.section || '',
          sign: l.sign ?? null,
          formula: l.formula ?? null,
          calcTerms: l.calcTerms ?? null,
          bold: !!l.bold,
        })),
        bsLines: bsLines.map((l) => ({
          id: l.id,
          statement: 'BS',
          kind: l.kind,
          label: l.label,
          section: l.section || '',
          sign: l.sign ?? null,
          formula: l.formula ?? null,
          calcTerms: l.calcTerms ?? null,
          bold: !!l.bold,
        })),
        deptList: deptList.map((d) => ({ code: d.code, name: d.name })),
        beginningTb: beginningTb.map((b) => ({ account: b.account, balance: b.balance })),
      };
      await setupApi.saveSetup(bundle);
      setPersist({ state: 'saved', lastSavedAt: Date.now() });
    } catch (e: any) {
      setPersist({ state: 'error', message: e?.message || 'Save failed' });
    }
  };
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
    else if (filter === 'is') list = list.filter((r) => r.statement === 'IS');
    else if (filter === 'bs') list = list.filter((r) => r.statement === 'BS');
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
    { id: 'org',    icon: 'business',         label: 'Organization',           count: organization.numEntities || 0 },
    { id: 'coa',    icon: 'list_alt',         label: 'Chart of Accounts',      count: stats.total },
    { id: 'is',     icon: 'description',      label: 'Income Statement',       count: isLines.length },
    { id: 'btb',    icon: 'balance',          label: 'Beginning Trial Balance', count: beginningTb.length },
    { id: 'bs',     icon: 'account_balance',  label: 'Balance Sheet',          count: bsLines.length },
    { id: 'budget', icon: 'savings',          label: 'Budget',                 count: budget.length },
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
        className={`btn ${view === 'pending' ? 'active' : ''}`}
        onClick={() => setView('pending')}
      >
        <Icon name="task_alt" />
        Pending
      </button>
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
      <button
        type="button"
        className="btn primary"
        onClick={handleSaveSetup}
        disabled={persist.state === 'unavailable' || persist.state === 'saving'}
        title={
          persist.state === 'unavailable'
            ? 'Backend Postgres not configured — running in local-only mode.'
            : 'Save the entire Setup bundle (Organization, CoA, IS, BS, Dept List, Beg TB) to the database.'
        }
      >
        <Icon
          name={
            persist.state === 'saving'
              ? 'sync'
              : persist.state === 'saved'
              ? 'check_circle'
              : persist.state === 'error'
              ? 'error_outline'
              : 'check_circle'
          }
        />
        {persist.state === 'saving' ? 'Saving…' : 'Save setup'}
      </button>
      <button
        type="button"
        className={`btn ${view === 'preview' ? 'active' : ''}`}
        onClick={() => setView('preview')}
      >
        <Icon name="visibility" />
        Preview Financials
      </button>
      {persist.state === 'unavailable' && (
        <span className="persist-badge muted" title={persist.message}>
          Local only
        </span>
      )}
      {persist.state === 'saved' && (
        <span className="persist-badge ok">Saved</span>
      )}
      {persist.state === 'error' && (
        <span className="persist-badge err" title={persist.message}>
          Save failed
        </span>
      )}
    </div>
  );

  if (view === 'pending') {
    return (
      <div className="admin-page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Pending</h1>
            <div className="page-sub">
              Setup pieces still needed so every sidebar tab in the dashboard updates dynamically
              from this menu.
            </div>
          </div>
          {pageActions}
        </div>
        <PendingList />
      </div>
    );
  }

  if (view === 'preview') {
    return (
      <div className="admin-page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Preview Financials</h1>
            <div className="page-sub">
              Read-only view of the Income Statement and Balance Sheet using the line items you
              configured. Expand an account line to see every GL account mapped to it.
            </div>
          </div>
          {pageActions}
        </div>

        <FinancialPreview
          isLines={isLines}
          bsLines={bsLines}
          coa={coa}
          glRows={glDetail?.rows ?? []}
        />
      </div>
    );
  }

  if (view === 'gl-upload') {
    const handleGlFile = async (file: File) => {
      setGlStatus({ state: 'busy', filename: file.name });
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) throw new Error('Workbook contains no sheets.');
        const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[firstSheet], { defval: '' });

        const template = detectGlTemplate(rawRows[0]);
        if (!template) {
          console.warn(
            `[Admin] GL upload (${file.name}) — could not detect template. Headers:`,
            rawRows[0] ? Object.keys(rawRows[0]) : '(empty)',
          );
          setGlStatus({ state: 'idle' });
          setGlTemplateError({ filename: file.name });
          return;
        }

        const normalized = rawRows
          .map((r, i) => normalizeGlRow(r, template, i))
          .filter((r) => r.account || r.date || r.amount !== 0);

        console.log(
          `[Admin] Parsed GL Transactions (${file.name} / sheet "${firstSheet}" / ${template}) — ${normalized.length} rows`,
        );

        setGlStatus({
          state: 'ready',
          filename: file.name,
          sheet: firstSheet,
          rows: normalized.length,
        });

        const review = buildGlReview(normalized, coa);
        const initialDecisions = new Map<number, Decision>(
          review.map((r) => [r.index, r.errors.length > 0 ? 'skip' : 'apply']),
        );
        setGlPending({ filename: file.name, sheet: firstSheet, template, review });
        setGlPendingDecisions(initialDecisions);
      } catch (err: any) {
        setGlStatus({
          state: 'error',
          filename: file.name,
          message: err?.message || 'Failed to parse workbook.',
        });
      }
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

        {glDetail && (
          <div className="gl-detail-section">
            <div className="gl-detail-head">
              <div>
                <h2>GL Detail</h2>
                <div className="gl-detail-sub">
                  <strong>{glDetail.filename}</strong>
                  <span className="gl-detail-pill">
                    {glDetail.template === 'cpsi' ? 'CPSI template' : 'General GL template'}
                  </span>
                  <span className="gl-detail-count">
                    {glDetail.rows.length.toLocaleString()} row
                    {glDetail.rows.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setGlDetail(null);
                  setGlStatus({ state: 'idle' });
                }}
              >
                <Icon name="close" />
                Clear
              </button>
            </div>

            <div className="admin-card">
              <div className="coa-table-wrap">
                <table className="coa-table">
                  <colgroup>
                    <col style={{ width: 50 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 110 }} />
                    <col />
                    <col />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="c">#</th>
                      <th>DATE</th>
                      <th>ACCOUNT #</th>
                      <th>DESCRIPTION</th>
                      <th>MEMO</th>
                      <th>REFERENCE</th>
                      <th>JOURNAL #</th>
                      <th className="c">AMOUNT</th>
                      <th>MONTH_END</th>
                    </tr>
                  </thead>
                  <tbody>
                    {glDetail.rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="coa-empty">
                          Workbook parsed, but no usable rows were found.
                        </td>
                      </tr>
                    )}
                    {glDetail.rows.slice(0, 500).map((r, i) => (
                      <tr key={r.id} className="coa-row">
                        <td className="c muted mono">{i + 1}</td>
                        <td className="mono">{r.date || <em className="muted">—</em>}</td>
                        <td className="mono">{r.account || <em className="muted">—</em>}</td>
                        <td>{r.description || <em className="muted">—</em>}</td>
                        <td>{r.memo || <em className="muted">—</em>}</td>
                        <td className="mono">{r.reference || <em className="muted">—</em>}</td>
                        <td className="mono">{r.journal || <em className="muted">—</em>}</td>
                        <td
                          className={`c mono ${
                            r.amount < 0 ? 'gl-amt-neg' : r.amount > 0 ? 'gl-amt-pos' : ''
                          }`}
                        >
                          {r.amount.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="mono">{r.monthEnd || <em className="muted">—</em>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {glDetail.rows.length > 500 && (
                <div className="coa-add">
                  <span className="muted" style={{ fontSize: 12 }}>
                    Showing the first 500 of {glDetail.rows.length.toLocaleString()} rows.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {glTemplateError && (
          <GlTemplateErrorModal
            filename={glTemplateError.filename}
            onClose={() => setGlTemplateError(null)}
          />
        )}

        {glPending && (
          <GlReviewModal
            filename={glPending.filename}
            template={glPending.template}
            sheet={glPending.sheet}
            review={glPending.review}
            decisions={glPendingDecisions}
            setDecision={(idx, d) =>
              setGlPendingDecisions((prev) => {
                const next = new Map(prev);
                next.set(idx, d);
                return next;
              })
            }
            bulkSet={(d) =>
              setGlPendingDecisions(
                new Map(
                  glPending.review.map((r) => [
                    r.index,
                    d === 'apply' && r.errors.length > 0 ? 'skip' : d,
                  ]),
                ),
              )
            }
            onCancel={() => {
              setGlPending(null);
              setGlStatus({ state: 'idle' });
            }}
            onApply={() => {
              const kept = glPending.review
                .filter((r) => (glPendingDecisions.get(r.index) ?? 'apply') === 'apply')
                .map((r) => r.parsed);
              setGlDetail({
                filename: glPending.filename,
                sheet: glPending.sheet,
                template: glPending.template,
                rows: kept,
              });
              setGlPending(null);
              // Fire-and-forget persistence — succeed locally even if backend is down.
              if (persist.state !== 'unavailable') {
                setupApi
                  .saveGlDetail(
                    kept.map((r) => ({
                      template: r.template,
                      date: r.date,
                      monthEnd: r.monthEnd,
                      account: r.account,
                      description: r.description,
                      memo: r.memo,
                      reference: r.reference,
                      journal: r.journal,
                      amount: r.amount,
                    })),
                  )
                  .catch((e) =>
                    console.warn('[saveGlDetail] backend write failed:', e?.message),
                  );
              }
            }}
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
        <button
          type="button"
          className={`ss-stat ss-clickable ${filter === 'all' ? 'on' : ''}`}
          onClick={() => {
            setTab('coa');
            setFilter('all');
          }}
          aria-pressed={filter === 'all'}
          title="Show all accounts"
        >
          <div className="ss-k">Accounts loaded</div>
          <div className="ss-v mono">{stats.total}</div>
        </button>
        <div className="ss-divider" />
        <button
          type="button"
          className={`ss-stat ss-clickable ${filter === 'mapped' ? 'on' : ''}`}
          onClick={() => {
            setTab('coa');
            setFilter('mapped');
          }}
          aria-pressed={filter === 'mapped'}
          title="Filter to mapped accounts"
        >
          <div className="ss-k">Mapped</div>
          <div className="ss-v mono pos">{stats.mapped}</div>
        </button>
        <button
          type="button"
          className={`ss-stat ss-clickable ${filter === 'unmapped' ? 'on' : ''}`}
          onClick={() => {
            setTab('coa');
            setFilter('unmapped');
          }}
          aria-pressed={filter === 'unmapped'}
          title="Filter to unmapped accounts"
        >
          <div className="ss-k">Unmapped</div>
          <div className="ss-v mono neg">{stats.unmapped}</div>
        </button>
        <div className="ss-divider" />
        <button
          type="button"
          className={`ss-stat ss-clickable ${filter === 'is' ? 'on' : ''}`}
          onClick={() => {
            setTab('coa');
            setFilter('is');
          }}
          aria-pressed={filter === 'is'}
          title="Filter to accounts mapped to the Income Statement"
        >
          <div className="ss-k">→ Income Statement</div>
          <div className="ss-v mono">{stats.is}</div>
        </button>
        <button
          type="button"
          className={`ss-stat ss-clickable ${filter === 'bs' ? 'on' : ''}`}
          onClick={() => {
            setTab('coa');
            setFilter('bs');
          }}
          aria-pressed={filter === 'bs'}
          title="Filter to accounts mapped to the Balance Sheet"
        >
          <div className="ss-k">→ Balance Sheet</div>
          <div className="ss-v mono">{stats.bs}</div>
        </button>
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

      {tab === 'org' && (
        <OrganizationForm value={organization} onChange={setOrganization} />
      )}

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

      {tab === 'btb' && (
        <BeginningTbEditor rows={beginningTb} setRows={setBeginningTb} />
      )}

      {tab === 'bs' && (
        <div className="admin-card">
          <StatementBuilder rows={bsLines} setRows={setBsLines} statementType="BS" />
        </div>
      )}

      {tab === 'budget' && (
        <BudgetEditor
          rows={budget}
          setRows={setBudget}
          onPersist={(rows) => {
            if (persist.state === 'unavailable') return;
            setupApi
              .saveBudget(
                rows.map((r) => ({
                  monthEnd: r.monthEnd,
                  account: r.account,
                  amount: r.amount,
                })),
              )
              .catch((e) => console.warn('[saveBudget] backend write failed:', e?.message));
          }}
        />
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
