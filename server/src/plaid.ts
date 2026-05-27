// Plaid service wrapper.
//
// When PLAID_CLIENT_ID / PLAID_SECRET are set, talks to the real Plaid API.
// When unset, returns realistic mock data so the frontend flow can be
// exercised end-to-end without Plaid credentials. This keeps "build the
// infrastructure now, connect later" honest — every code path is wired and
// callable, the only thing missing is the live keys.

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox') as 'sandbox' | 'development' | 'production';
const REDIRECT_URI = process.env.PLAID_REDIRECT_URI; // optional, only for oauth banks

export const isPlaidConfigured = (): boolean => !!(PLAID_CLIENT_ID && PLAID_SECRET);

// ─── Excel-date helpers (Plaid returns ISO yyyy-mm-dd; the app stores
//     Excel serial dates and month-end serials so it lines up with GL data). ─

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const isoToExcelSerial = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return Math.round((t - EXCEL_EPOCH) / 86400000);
};

const meSerial = (iso: string): number => {
  const [y, m] = iso.split('-').map(Number);
  // Last day of that month
  const t = Date.UTC(y, m, 0);
  return Math.round((t - EXCEL_EPOCH) / 86400000);
};

// ─── Public API surface ─────────────────────────────────────────────────

export interface NormalizedTxn {
  plaid_txn_id: string;
  date: number;     // Excel serial
  amount: number;
  description: string;
  check_number: string;
  bank_id: string;  // we use plaid_txn_id as the Bank ID
  me: number;       // month-end Excel serial
  pending: number;  // 0 or 1
  raw: unknown;
}

export interface SyncResult {
  added: NormalizedTxn[];
  modified: NormalizedTxn[];
  removed: string[];   // plaid_txn_ids to delete
  cursor: string;      // new cursor to persist
  hasMore: boolean;
}

// Lazy-loaded so the `plaid` SDK is only required when actually configured.
// Lets the server boot without the package installed in dev/static mode.
let plaidClient: any = null;
const getClient = async () => {
  if (plaidClient) return plaidClient;
  if (!isPlaidConfigured()) {
    throw new Error('Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET missing)');
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
  const cfg = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
    },
  });
  plaidClient = new PlaidApi(cfg);
  return plaidClient;
};

// ─── createLinkToken — used by frontend to open Plaid Link ──────────────
export const createLinkToken = async (tenantId: string): Promise<{ link_token: string; expiration: string }> => {
  if (!isPlaidConfigured()) {
    // Mock — frontend can still open a placeholder Link UI for dev
    return {
      link_token: `link-mock-${tenantId}-${Date.now()}`,
      expiration: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    };
  }
  const client = await getClient();
  const resp = await client.linkTokenCreate({
    user: { client_user_id: tenantId },
    client_name: '1MasterDashboard',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
    ...(REDIRECT_URI ? { redirect_uri: REDIRECT_URI } : {}),
  });
  return { link_token: resp.data.link_token, expiration: resp.data.expiration };
};

// ─── exchangePublicToken — swap short-lived public_token for access_token ─
export const exchangePublicToken = async (
  publicToken: string,
): Promise<{
  access_token: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
}> => {
  if (!isPlaidConfigured()) {
    return {
      access_token: `access-mock-${Date.now()}`,
      item_id: `item-mock-${Date.now()}`,
      institution_id: 'ins_mock',
      institution_name: 'Mock Bank',
    };
  }
  const client = await getClient();
  const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;
  // Pull institution metadata so we can display "Connected to Chase / Bank of America / etc."
  let institutionId: string | null = null;
  let institutionName: string | null = null;
  try {
    const itemResp = await client.itemGet({ access_token: accessToken });
    institutionId = itemResp.data.item.institution_id ?? null;
    if (institutionId) {
      const inst = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: ['US'],
      });
      institutionName = inst.data.institution.name;
    }
  } catch (e) {
    console.warn('Plaid item metadata fetch failed (non-fatal):', e);
  }
  return { access_token: accessToken, item_id: itemId, institution_id: institutionId, institution_name: institutionName };
};

// ─── syncTransactions — cursor-based delta sync, the right way ──────────
export const syncTransactions = async (
  accessToken: string,
  cursor: string | null,
): Promise<SyncResult> => {
  if (!isPlaidConfigured()) {
    // Mock: a single batch of fake transactions on first call, then nothing
    if (cursor) {
      return { added: [], modified: [], removed: [], cursor, hasMore: false };
    }
    const mockIso = (offset: number) => {
      const d = new Date(Date.now() - offset * 86400000);
      return d.toISOString().slice(0, 10);
    };
    const mk = (idx: number, amt: number, name: string): NormalizedTxn => {
      const iso = mockIso(idx);
      return {
        plaid_txn_id: `mock-${idx}`,
        date: isoToExcelSerial(iso),
        amount: amt,
        description: name,
        check_number: '',
        bank_id: `mock-${idx}`,
        me: meSerial(iso),
        pending: 0,
        raw: { mock: true, iso, name, amount: amt },
      };
    };
    return {
      added: [
        mk(2, -12.5, 'Coffee Shop'),
        mk(5, 1500, 'Payroll Deposit'),
        mk(7, -85.43, 'Utilities'),
      ],
      modified: [],
      removed: [],
      cursor: `cursor-mock-${Date.now()}`,
      hasMore: false,
    };
  }
  const client = await getClient();
  const resp = await client.transactionsSync({
    access_token: accessToken,
    cursor: cursor ?? undefined,
  });
  const normalize = (t: any): NormalizedTxn => ({
    plaid_txn_id: t.transaction_id,
    // Plaid uses positive for outflows; the app convention is signed-from-perspective-of-account.
    // Flip the sign so deposits are positive and withdrawals are negative.
    date: isoToExcelSerial(t.date),
    amount: -t.amount,
    description: t.merchant_name || t.name || '',
    check_number: t.check_number ?? '',
    bank_id: t.transaction_id,
    me: meSerial(t.date),
    pending: t.pending ? 1 : 0,
    raw: t,
  });
  return {
    added: (resp.data.added || []).map(normalize),
    modified: (resp.data.modified || []).map(normalize),
    removed: (resp.data.removed || []).map((r: any) => r.transaction_id),
    cursor: resp.data.next_cursor,
    hasMore: resp.data.has_more,
  };
};

// ─── removeItem — disconnect a connected account ────────────────────────
export const removeItem = async (accessToken: string): Promise<void> => {
  if (!isPlaidConfigured()) return;
  const client = await getClient();
  await client.itemRemove({ access_token: accessToken });
};
