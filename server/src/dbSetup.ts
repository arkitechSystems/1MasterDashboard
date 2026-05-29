/**
 * Postgres persistence for the Admin / Setup tabs.
 *
 * Reads DATABASE_URL from env (Render's internal Postgres URL). If unset, the
 * module logs a warning and every helper becomes a no-op so dev can boot
 * without the DB attached.
 */

import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

export const pgEnabled = Boolean(DATABASE_URL);

export let pool: Pool | null = null;
if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Render-hosted Postgres uses TLS; the cert isn't in node's CA bundle.
    ssl: DATABASE_URL.includes('render.com')
      ? { rejectUnauthorized: false }
      : undefined,
    max: 4,
  });
  pool.on('error', (err) => {
    console.error('[pg pool error]', err.message);
  });
} else {
  console.warn(
    '[dbSetup] DATABASE_URL not set — Postgres-backed endpoints will return 503.',
  );
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, name) VALUES ('default', 'Default Tenant')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  super_admin   boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS memberships (
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('tenant_admin','dept_head','viewer')),
  dept_scope  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);

CREATE TABLE IF NOT EXISTS organization (
  id              integer  PRIMARY KEY DEFAULT 1,
  name            text     NOT NULL DEFAULT '',
  fye_month       integer  NOT NULL DEFAULT 12,
  fye_day         integer  NOT NULL DEFAULT 31,
  num_entities    integer  NOT NULL DEFAULT 1,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO organization (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  account             text PRIMARY KEY,
  name                text NOT NULL DEFAULT '',
  legacy_gl           text NOT NULL DEFAULT '',
  type                text NOT NULL DEFAULT '',
  statement           text NOT NULL DEFAULT '',
  line                text NOT NULL DEFAULT '',
  dept                text NOT NULL DEFAULT '',
  dept_description    text NOT NULL DEFAULT '',
  sub_account         text NOT NULL DEFAULT '',
  active              boolean NOT NULL DEFAULT true,
  position            integer NOT NULL DEFAULT 0,
  bank                text NOT NULL DEFAULT '',
  bank_account_number text NOT NULL DEFAULT '',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS bank                text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS statement_lines (
  id          text PRIMARY KEY,
  statement   text NOT NULL CHECK (statement IN ('IS','BS')),
  kind        text NOT NULL CHECK (kind IN ('header','account','subtotal','formula')),
  label       text NOT NULL,
  section     text NOT NULL DEFAULT '',
  sign        text,
  formula     text,
  calc_terms  jsonb,
  bold        boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dept_list (
  code text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS beginning_trial_balance (
  account text PRIMARY KEY,
  balance numeric(20, 4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budget (
  id          serial PRIMARY KEY,
  month_end   text NOT NULL,
  account     text NOT NULL,
  amount      numeric(20, 4) NOT NULL DEFAULT 0,
  UNIQUE (month_end, account)
);
CREATE INDEX IF NOT EXISTS idx_budget_account ON budget(account);

CREATE TABLE IF NOT EXISTS gl_detail (
  id          serial PRIMARY KEY,
  template    text NOT NULL,
  date        text NOT NULL DEFAULT '',
  month_end   text NOT NULL DEFAULT '',
  account     text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  memo        text NOT NULL DEFAULT '',
  reference   text NOT NULL DEFAULT '',
  journal     text NOT NULL DEFAULT '',
  amount      numeric(20, 4) NOT NULL DEFAULT 0,
  tx_id       text
);
CREATE INDEX IF NOT EXISTS idx_gldetail_account ON gl_detail(account);
CREATE INDEX IF NOT EXISTS idx_gldetail_month ON gl_detail(month_end);

-- tx_id added after the table — idempotent for existing deployments. The
-- unique index is partial so legacy rows that haven't been backfilled
-- yet don't violate uniqueness during the rolling backfill.
ALTER TABLE gl_detail ADD COLUMN IF NOT EXISTS tx_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gldetail_tx_id
  ON gl_detail(tx_id) WHERE tx_id IS NOT NULL;

-- superseded_by points at the tx_id that replaces this row. NULL when
-- the row is "current". Set when the user re-uploads a corrected version
-- of a transaction (memo typo fix, amount correction) and confirms the
-- old row should be retired.
ALTER TABLE gl_detail ADD COLUMN IF NOT EXISTS superseded_by text;
CREATE INDEX IF NOT EXISTS idx_gldetail_superseded ON gl_detail(superseded_by);
`;

let migrated = false;
const ensureMigrated = async () => {
  if (!pool || migrated) return;
  await pool.query(SCHEMA_SQL);
  migrated = true;
};

const tx = async <T,>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
};

/* ─── Shapes the API trades in ────────────────────────────────────────── */

export interface Organization {
  name: string;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  numEntities: number;
}

export interface CoaRow {
  account: string;
  name: string;
  legacyGl: string;
  type: string;
  statement: '' | 'IS' | 'BS';
  line: string;
  dept: string;
  deptDescription: string;
  subAccount: string;
  active: boolean;
  bank: string;
  bankAccountNumber: string;
}

export interface StatementLine {
  id: string;
  statement: 'IS' | 'BS';
  kind: 'header' | 'account' | 'subtotal' | 'formula';
  label: string;
  section: string;
  sign?: '+' | '-' | null;
  formula?: string | null;
  calcTerms?: Array<{ sign: '+' | '-'; label: string }> | null;
  bold?: boolean;
}

export interface DeptRow {
  code: string;
  name: string;
}

export interface BeginningTbRow {
  account: string;
  balance: number;
}

export interface BudgetRow {
  monthEnd: string;
  account: string;
  amount: number;
}

export interface GlDetailRow {
  template: string;
  date: string;
  monthEnd: string;
  account: string;
  description: string;
  memo: string;
  reference: string;
  journal: string;
  amount: number;
}

export interface SetupBundle {
  organization: Organization;
  coa: CoaRow[];
  isLines: StatementLine[];
  bsLines: StatementLine[];
  deptList: DeptRow[];
  beginningTb: BeginningTbRow[];
}

export interface TenantRow {
  id: string;
  name: string;
  status: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  superAdmin: boolean;
}

export type Role = 'tenant_admin' | 'dept_head' | 'viewer';

export interface MembershipRow {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: Role;
  deptScope: string[];
}

/* ─── Auth: users + memberships ───────────────────────────────────────── */

/**
 * Look up a user by Auth0 sub. Returns null if not yet provisioned.
 */
export const getUserById = async (id: string): Promise<UserRow | null> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const r = await pool.query(
    `SELECT id, email, name, super_admin FROM users WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0) return null;
  const u = r.rows[0];
  return { id: u.id, email: u.email, name: u.name, superAdmin: u.super_admin };
};

/**
 * JIT user upsert called from auth middleware on every valid JWT. Idempotent
 * — keeps the user row in sync with the latest claims from Auth0. Promotes
 * the user to super_admin if their email is in SUPER_ADMIN_EMAILS.
 */
export const upsertUserFromClaims = async (claims: {
  sub: string;
  email: string;
  name?: string;
}): Promise<UserRow> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const superList = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isSuper = superList.includes((claims.email || '').toLowerCase());

  await pool.query(
    `INSERT INTO users (id, email, name, super_admin, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
       super_admin = users.super_admin OR EXCLUDED.super_admin,
       last_login_at = now()`,
    [claims.sub, claims.email, claims.name || '', isSuper],
  );

  // First-time super_admin: grant a default-tenant tenant_admin membership
  // so the user has somewhere to land. Idempotent.
  if (isSuper) {
    await pool.query(
      `INSERT INTO memberships (user_id, tenant_id, role)
       VALUES ($1, 'default', 'tenant_admin')
       ON CONFLICT DO NOTHING`,
      [claims.sub],
    );
  }

  const user = await getUserById(claims.sub);
  if (!user) throw new Error('Failed to upsert user');
  return user;
};

export const getMembershipsForUser = async (
  userId: string,
): Promise<MembershipRow[]> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const r = await pool.query(
    `SELECT m.user_id, m.tenant_id, t.name AS tenant_name, m.role, m.dept_scope
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1
      ORDER BY t.name`,
    [userId],
  );
  return r.rows.map((row) => ({
    userId: row.user_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    role: row.role,
    deptScope: Array.isArray(row.dept_scope) ? row.dept_scope : [],
  }));
};

export const listTenants = async (): Promise<TenantRow[]> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const r = await pool.query(
    `SELECT id, name, status FROM tenants ORDER BY name`,
  );
  return r.rows;
};

/* ─── Read ────────────────────────────────────────────────────────────── */

export const getSetupBundle = async (): Promise<SetupBundle> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();

  const org = await pool.query(
    `SELECT name, fye_month, fye_day, num_entities FROM organization WHERE id = 1`,
  );
  const coa = await pool.query(
    `SELECT account, name, legacy_gl, type, statement, line, dept,
            dept_description, sub_account, active, bank, bank_account_number
       FROM chart_of_accounts ORDER BY position, account`,
  );
  const lines = await pool.query(
    `SELECT id, statement, kind, label, section, sign, formula, calc_terms, bold
       FROM statement_lines ORDER BY statement, position`,
  );
  const dept = await pool.query(
    `SELECT code, name FROM dept_list ORDER BY position, code`,
  );
  const btb = await pool.query(
    `SELECT account, balance FROM beginning_trial_balance ORDER BY account`,
  );

  const o = org.rows[0] ?? { name: '', fye_month: 12, fye_day: 31, num_entities: 1 };

  return {
    organization: {
      name: o.name,
      fiscalYearEndMonth: o.fye_month,
      fiscalYearEndDay: o.fye_day,
      numEntities: o.num_entities,
    },
    coa: coa.rows.map((r) => ({
      account: r.account,
      name: r.name,
      legacyGl: r.legacy_gl,
      type: r.type,
      statement: r.statement,
      line: r.line,
      dept: r.dept,
      deptDescription: r.dept_description,
      subAccount: r.sub_account,
      active: r.active,
      bank: r.bank ?? '',
      bankAccountNumber: r.bank_account_number ?? '',
    })),
    isLines: lines.rows
      .filter((r) => r.statement === 'IS')
      .map((r) => ({
        id: r.id,
        statement: 'IS' as const,
        kind: r.kind,
        label: r.label,
        section: r.section,
        sign: r.sign,
        formula: r.formula,
        calcTerms: r.calc_terms,
        bold: r.bold,
      })),
    bsLines: lines.rows
      .filter((r) => r.statement === 'BS')
      .map((r) => ({
        id: r.id,
        statement: 'BS' as const,
        kind: r.kind,
        label: r.label,
        section: r.section,
        sign: r.sign,
        formula: r.formula,
        calcTerms: r.calc_terms,
        bold: r.bold,
      })),
    deptList: dept.rows,
    beginningTb: btb.rows.map((r) => ({ account: r.account, balance: Number(r.balance) })),
  };
};

export const getBudget = async (): Promise<BudgetRow[]> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const r = await pool.query(
    `SELECT month_end, account, amount FROM budget ORDER BY month_end, account`,
  );
  return r.rows.map((row) => ({
    monthEnd: row.month_end,
    account: row.account,
    amount: Number(row.amount),
  }));
};

export const getGlDetail = async (): Promise<GlDetailRow[]> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const r = await pool.query(
    `SELECT template, date, month_end, account, description, memo, reference, journal, amount
       FROM gl_detail ORDER BY id`,
  );
  return r.rows.map((row) => ({
    template: row.template,
    date: row.date,
    monthEnd: row.month_end,
    account: row.account,
    description: row.description,
    memo: row.memo,
    reference: row.reference,
    journal: row.journal,
    amount: Number(row.amount),
  }));
};

/* ─── Write ───────────────────────────────────────────────────────────── */

/**
 * Replace the Setup bundle in a single transaction. Each section is
 * delete-all + insert-all — simple and correct, and the volumes are small
 * (sub-1000 rows in practice).
 */
export const saveSetupBundle = (b: SetupBundle) =>
  tx(async (c) => {
    await c.query(
      `UPDATE organization
         SET name = $1, fye_month = $2, fye_day = $3, num_entities = $4,
             updated_at = now()
       WHERE id = 1`,
      [b.organization.name, b.organization.fiscalYearEndMonth,
       b.organization.fiscalYearEndDay, b.organization.numEntities],
    );

    // Preserve any bank mapping the user has saved from Cash Summary —
    // saveSetupBundle is a full replace of CoA, so we read those columns
    // first and merge them back in.
    const existingBank = await c.query(
      `SELECT account, bank, bank_account_number FROM chart_of_accounts`,
    );
    const bankByAcct = new Map<string, { bank: string; bankAccountNumber: string }>();
    for (const row of existingBank.rows) {
      bankByAcct.set(row.account, {
        bank: row.bank ?? '',
        bankAccountNumber: row.bank_account_number ?? '',
      });
    }

    await c.query('DELETE FROM chart_of_accounts');
    for (let i = 0; i < b.coa.length; i++) {
      const r = b.coa[i];
      if (!r.account?.trim()) continue;
      const acct = r.account.trim();
      const carried = bankByAcct.get(acct);
      const bank = r.bank ?? carried?.bank ?? '';
      const bankAccountNumber = r.bankAccountNumber ?? carried?.bankAccountNumber ?? '';
      await c.query(
        `INSERT INTO chart_of_accounts
           (account, name, legacy_gl, type, statement, line, dept,
            dept_description, sub_account, active, position, bank, bank_account_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [acct, r.name, r.legacyGl, r.type, r.statement, r.line,
         r.dept, r.deptDescription, r.subAccount, !!r.active, i,
         bank, bankAccountNumber],
      );
    }

    await c.query('DELETE FROM statement_lines');
    const writeLines = async (statement: 'IS' | 'BS', lines: StatementLine[]) => {
      for (let i = 0; i < lines.length; i++) {
        const r = lines[i];
        await c.query(
          `INSERT INTO statement_lines
             (id, statement, kind, label, section, sign, formula, calc_terms, bold, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [r.id, statement, r.kind, r.label, r.section || '',
           r.sign ?? null, r.formula ?? null,
           r.calcTerms ? JSON.stringify(r.calcTerms) : null,
           !!r.bold, i],
        );
      }
    };
    await writeLines('IS', b.isLines);
    await writeLines('BS', b.bsLines);

    await c.query('DELETE FROM dept_list');
    for (let i = 0; i < b.deptList.length; i++) {
      const d = b.deptList[i];
      if (!d.code?.trim()) continue;
      await c.query(
        `INSERT INTO dept_list (code, name, position) VALUES ($1,$2,$3)`,
        [d.code.trim(), d.name, i],
      );
    }

    await c.query('DELETE FROM beginning_trial_balance');
    for (const r of b.beginningTb) {
      if (!r.account?.trim()) continue;
      await c.query(
        `INSERT INTO beginning_trial_balance (account, balance) VALUES ($1,$2)`,
        [r.account.trim(), r.balance],
      );
    }
  });

/**
 * Update only the bank/bank_account_number columns on existing CoA rows.
 * Used by the Cash Summary page so the user can fill in bank mappings
 * without going through the full Setup-bundle save.
 */
export interface BankMappingRow {
  account: string;
  bank: string;
  bankAccountNumber: string;
}

export const saveCoaBankMappings = (rows: BankMappingRow[]) =>
  tx(async (c) => {
    for (const r of rows) {
      if (!r.account?.trim()) continue;
      await c.query(
        `UPDATE chart_of_accounts
            SET bank = $2, bank_account_number = $3, updated_at = now()
          WHERE account = $1`,
        [r.account.trim(), r.bank ?? '', r.bankAccountNumber ?? ''],
      );
    }
  });

export const saveBudget = (rows: BudgetRow[]) =>
  tx(async (c) => {
    await c.query('DELETE FROM budget');
    for (const r of rows) {
      if (!r.account?.trim()) continue;
      await c.query(
        `INSERT INTO budget (month_end, account, amount) VALUES ($1,$2,$3)`,
        [r.monthEnd, r.account.trim(), r.amount],
      );
    }
  });

/**
 * Legacy full-replace upload. Kept for cases where the user genuinely
 * wants to wipe and rebuild (e.g. an initial demo load) — but the
 * recommended path is mergeGlDetail. Backfills tx_id on every row it
 * writes so the dedupe column stays correct.
 */
export const saveGlDetail = (rows: GlDetailRow[]) =>
  tx(async (c) => {
    // Lazy import keeps the txId helper out of the cold-start path.
    const { computeGlDetailTxId } = await import('./txId');
    await c.query('DELETE FROM gl_detail');
    // Use a multi-row INSERT in batches of 500 for speed with large uploads.
    const batchSize = 500;
    for (let off = 0; off < rows.length; off += batchSize) {
      const slice = rows.slice(off, off + batchSize);
      if (slice.length === 0) continue;
      const values: any[] = [];
      const placeholders: string[] = [];
      slice.forEach((r, i) => {
        const base = i * 10;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`,
        );
        values.push(
          r.template, r.date, r.monthEnd, r.account,
          r.description, r.memo, r.reference, r.journal, r.amount,
          computeGlDetailTxId(r),
        );
      });
      await c.query(
        `INSERT INTO gl_detail
           (template, date, month_end, account, description, memo, reference, journal, amount, tx_id)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (tx_id) DO NOTHING`,
        values,
      );
    }
  });

export interface MergeResult {
  inserted: number;
  skipped: number;
  total: number;
  candidates: SupersedeCandidate[];
}

/** A pair returned to the UI when a freshly-inserted row LOOKS like the
 * corrected version of an existing row (same account + date + amount,
 * different other fields). The user decides whether to mark the old
 * row as superseded. */
export interface SupersedeCandidate {
  oldRow: GlDetailRowWithTxId;
  newRow: GlDetailRowWithTxId;
}

export interface GlDetailRowWithTxId extends GlDetailRow {
  txId: string;
}

/**
 * Given a set of tx_ids that were just inserted into gl_detail, find
 * older "current" rows (superseded_by IS NULL) that share account+date+
 * amount with one of those new rows but differ on at least one of
 * memo/journal/reference/description. These are candidates the user can
 * mark as replaced.
 *
 * Two different real transactions could legitimately share those three
 * fields, so this is a *suggestion* — the UI must let the user confirm
 * or reject each candidate.
 */
export const findSupersedeCandidates = async (
  insertedTxIds: string[],
): Promise<SupersedeCandidate[]> => {
  if (!pool || insertedTxIds.length === 0) return [];
  await ensureMigrated();
  // Self-join on (account, date, amount). Exclude pairs where both rows
  // are in the just-inserted set (they're peers, not predecessor).
  const r = await pool.query(
    `WITH inserted AS (SELECT tx_id FROM gl_detail WHERE tx_id = ANY($1::text[]))
     SELECT
       o.id AS old_id, o.template AS old_template, o.date AS old_date,
       o.month_end AS old_month_end, o.account AS old_account,
       o.description AS old_description, o.memo AS old_memo,
       o.reference AS old_reference, o.journal AS old_journal,
       o.amount AS old_amount, o.tx_id AS old_tx_id,
       n.id AS new_id, n.template AS new_template, n.date AS new_date,
       n.month_end AS new_month_end, n.account AS new_account,
       n.description AS new_description, n.memo AS new_memo,
       n.reference AS new_reference, n.journal AS new_journal,
       n.amount AS new_amount, n.tx_id AS new_tx_id
       FROM gl_detail n
       JOIN gl_detail o ON
         o.account = n.account
         AND o.date = n.date
         AND o.amount = n.amount
         AND o.tx_id <> n.tx_id
      WHERE n.tx_id = ANY($1::text[])
        AND o.superseded_by IS NULL
        AND o.tx_id NOT IN (SELECT tx_id FROM inserted)
        AND (
          o.memo IS DISTINCT FROM n.memo
          OR o.journal IS DISTINCT FROM n.journal
          OR o.reference IS DISTINCT FROM n.reference
          OR o.description IS DISTINCT FROM n.description
        )
      ORDER BY n.tx_id, o.id`,
    [insertedTxIds],
  );
  return r.rows.map((row) => ({
    oldRow: {
      template: row.old_template, date: row.old_date, monthEnd: row.old_month_end,
      account: row.old_account, description: row.old_description, memo: row.old_memo,
      reference: row.old_reference, journal: row.old_journal,
      amount: Number(row.old_amount), txId: row.old_tx_id,
    },
    newRow: {
      template: row.new_template, date: row.new_date, monthEnd: row.new_month_end,
      account: row.new_account, description: row.new_description, memo: row.new_memo,
      reference: row.new_reference, journal: row.new_journal,
      amount: Number(row.new_amount), txId: row.new_tx_id,
    },
  }));
};

export interface SupersedePair {
  oldTxId: string;
  newTxId: string;
}

/**
 * Mark old rows as superseded by new rows. Idempotent — running the same
 * pair twice yields the same final state. Refuses to set superseded_by
 * to the row's own tx_id.
 */
export const applySupersedes = async (
  pairs: SupersedePair[],
): Promise<{ updated: number }> => {
  if (!pool || pairs.length === 0) return { updated: 0 };
  await ensureMigrated();
  let updated = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of pairs) {
      if (!p.oldTxId || !p.newTxId || p.oldTxId === p.newTxId) continue;
      const r = await client.query(
        `UPDATE gl_detail SET superseded_by = $2 WHERE tx_id = $1`,
        [p.oldTxId, p.newTxId],
      );
      updated += r.rowCount ?? 0;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return { updated };
};

/**
 * Idempotent upsert for gl_detail. Computes tx_id for each candidate row
 * server-side and uses INSERT … ON CONFLICT (tx_id) DO NOTHING so rows
 * already in the DB (including ones whose matchNum is referenced from
 * Bank Recon) are left untouched. Returns counts so the UI can show
 * "5,231 rows uploaded → 312 new, 4,919 already in GL".
 */
export const mergeGlDetail = async (rows: GlDetailRow[]): Promise<MergeResult> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const { computeGlDetailTxId } = await import('./txId');

  // Backfill tx_id on any pre-existing rows that don't have one yet so
  // the merge below can rely on the unique index. One-shot per call —
  // cheap because tx_id is sparse-indexed and existing-row count is
  // bounded by what's already in the DB.
  await pool.query(`SELECT 1 FROM gl_detail WHERE tx_id IS NULL LIMIT 1`).then(async (r) => {
    if (r.rows.length === 0) return;
    const legacy = await pool!.query(
      `SELECT id, template, date, month_end, account, description, memo,
              reference, journal, amount
         FROM gl_detail
        WHERE tx_id IS NULL`,
    );
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      for (const row of legacy.rows) {
        const tx = computeGlDetailTxId({
          date: row.date, monthEnd: row.month_end,
          account: row.account, description: row.description, memo: row.memo,
          reference: row.reference, journal: row.journal, amount: Number(row.amount),
        });
        await client.query(`UPDATE gl_detail SET tx_id = $1 WHERE id = $2`, [tx, row.id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });

  let inserted = 0;
  const insertedTxIds: string[] = [];
  const batchSize = 500;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let off = 0; off < rows.length; off += batchSize) {
      const slice = rows.slice(off, off + batchSize);
      if (slice.length === 0) continue;
      const values: any[] = [];
      const placeholders: string[] = [];
      slice.forEach((r, i) => {
        const base = i * 10;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`,
        );
        values.push(
          r.template, r.date, r.monthEnd, r.account,
          r.description, r.memo, r.reference, r.journal, r.amount,
          computeGlDetailTxId(r),
        );
      });
      // RETURNING gives us the actually-inserted tx_ids (ON CONFLICT
      // skipped rows don't appear), which we feed to the supersede
      // detector after the transaction commits.
      const result = await client.query(
        `INSERT INTO gl_detail
           (template, date, month_end, account, description, memo, reference, journal, amount, tx_id)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (tx_id) DO NOTHING
         RETURNING tx_id`,
        values,
      );
      inserted += result.rowCount ?? 0;
      for (const row of result.rows) insertedTxIds.push(row.tx_id);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  const candidates = await findSupersedeCandidates(insertedTxIds);
  return {
    inserted,
    skipped: rows.length - inserted,
    total: rows.length,
    candidates,
  };
};

/**
 * Diff-only preview — no writes. Computes tx_id for each candidate and
 * looks them up in gl_detail, returning counts the UI can use to render
 * a confirm dialog before the user actually merges.
 */
export const previewGlDetailMerge = async (rows: GlDetailRow[]): Promise<MergeResult> => {
  if (!pool) throw new Error('Postgres not configured');
  await ensureMigrated();
  const { computeGlDetailTxId } = await import('./txId');
  if (rows.length === 0) return { inserted: 0, skipped: 0, total: 0, candidates: [] };

  // Dedupe within the upload itself first — the same tx_id appearing
  // multiple times in the source file would otherwise inflate the
  // "new" count past what the merge would actually insert.
  const uniqueIds = new Set<string>();
  for (const r of rows) uniqueIds.add(computeGlDetailTxId(r));

  // Batched lookup so we don't blow past Postgres's parameter cap.
  const idArr = Array.from(uniqueIds);
  const existing = new Set<string>();
  const lookupBatch = 1000;
  for (let off = 0; off < idArr.length; off += lookupBatch) {
    const slice = idArr.slice(off, off + lookupBatch);
    const r = await pool.query(
      `SELECT tx_id FROM gl_detail WHERE tx_id = ANY($1::text[])`,
      [slice],
    );
    for (const row of r.rows) existing.add(row.tx_id);
  }
  const inserted = idArr.length - existing.size;
  return { inserted, skipped: rows.length - inserted, total: rows.length, candidates: [] };
};
