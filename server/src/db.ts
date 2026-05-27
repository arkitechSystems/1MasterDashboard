// SQLite persistence layer (better-sqlite3, synchronous).
//
// For Render production, swap to pg + DATABASE_URL — the schema is plain SQL
// with only minor sqlite-isms (AUTOINCREMENT, INTEGER timestamps). The query
// surface is small enough that a node-postgres adapter is a few hours' work
// when you're ready.

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(__dirname, '..', 'database.sqlite');

// Ensure parent dir exists (especially on Render persistent disks)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema migration ───────────────────────────────────────────────────
// Idempotent. Runs on every boot. Add new tables / columns here; never
// destructively modify in place — write a new migration step.
const migrate = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      plaid_item_id TEXT NOT NULL UNIQUE,
      access_token_encrypted TEXT NOT NULL,
      institution_id TEXT,
      institution_name TEXT,
      cursor TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plaid_items_tenant
      ON plaid_items(tenant_id);

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      plaid_item_id INTEGER NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
      plaid_txn_id TEXT NOT NULL UNIQUE,
      date INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      check_number TEXT NOT NULL DEFAULT '',
      bank_id TEXT NOT NULL DEFAULT '',
      match_num INTEGER NOT NULL DEFAULT 0,
      me INTEGER NOT NULL,
      pending INTEGER NOT NULL DEFAULT 0,
      raw TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bank_txn_tenant_me
      ON bank_transactions(tenant_id, me);
    CREATE INDEX IF NOT EXISTS idx_bank_txn_item
      ON bank_transactions(plaid_item_id);
  `);
};

migrate();

// ─── Typed helpers ──────────────────────────────────────────────────────

export interface PlaidItemRow {
  id: number;
  tenant_id: string;
  plaid_item_id: string;
  access_token_encrypted: string;
  institution_id: string | null;
  institution_name: string | null;
  cursor: string | null;
  status: string;
  last_synced_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface BankTransactionRow {
  id: number;
  tenant_id: string;
  plaid_item_id: number;
  plaid_txn_id: string;
  date: number;
  amount: number;
  description: string;
  check_number: string;
  bank_id: string;
  match_num: number;
  me: number;
  pending: number;
  raw: string | null;
  created_at: number;
}

export const insertPlaidItem = db.prepare<{
  tenant_id: string;
  plaid_item_id: string;
  access_token_encrypted: string;
  institution_id: string | null;
  institution_name: string | null;
}>(`
  INSERT INTO plaid_items (tenant_id, plaid_item_id, access_token_encrypted, institution_id, institution_name)
  VALUES (@tenant_id, @plaid_item_id, @access_token_encrypted, @institution_id, @institution_name)
`);

export const listPlaidItemsByTenant = db.prepare<{ tenant_id: string }, PlaidItemRow>(`
  SELECT * FROM plaid_items WHERE tenant_id = @tenant_id ORDER BY created_at DESC
`);

export const getPlaidItemById = db.prepare<{ id: number }, PlaidItemRow>(`
  SELECT * FROM plaid_items WHERE id = @id
`);

export const getPlaidItemByPlaidId = db.prepare<{ plaid_item_id: string }, PlaidItemRow>(`
  SELECT * FROM plaid_items WHERE plaid_item_id = @plaid_item_id
`);

export const updatePlaidItemCursor = db.prepare<{ id: number; cursor: string }>(`
  UPDATE plaid_items
  SET cursor = @cursor, last_synced_at = strftime('%s','now'), updated_at = strftime('%s','now')
  WHERE id = @id
`);

export const updatePlaidItemStatus = db.prepare<{ id: number; status: string }>(`
  UPDATE plaid_items
  SET status = @status, updated_at = strftime('%s','now')
  WHERE id = @id
`);

export const deletePlaidItem = db.prepare<{ id: number; tenant_id: string }>(`
  DELETE FROM plaid_items WHERE id = @id AND tenant_id = @tenant_id
`);

export const upsertBankTxn = db.prepare<{
  tenant_id: string;
  plaid_item_id: number;
  plaid_txn_id: string;
  date: number;
  amount: number;
  description: string;
  check_number: string;
  bank_id: string;
  me: number;
  pending: number;
  raw: string;
}>(`
  INSERT INTO bank_transactions
    (tenant_id, plaid_item_id, plaid_txn_id, date, amount, description,
     check_number, bank_id, me, pending, raw)
  VALUES
    (@tenant_id, @plaid_item_id, @plaid_txn_id, @date, @amount, @description,
     @check_number, @bank_id, @me, @pending, @raw)
  ON CONFLICT(plaid_txn_id) DO UPDATE SET
    date = excluded.date,
    amount = excluded.amount,
    description = excluded.description,
    pending = excluded.pending,
    raw = excluded.raw
`);

export const deleteBankTxn = db.prepare<{ plaid_txn_id: string }>(`
  DELETE FROM bank_transactions WHERE plaid_txn_id = @plaid_txn_id
`);

export const listBankTxns = db.prepare<{
  tenant_id: string;
  me_start: number;
  me_end: number;
}, BankTransactionRow>(`
  SELECT * FROM bank_transactions
  WHERE tenant_id = @tenant_id AND me BETWEEN @me_start AND @me_end
  ORDER BY date ASC
`);
