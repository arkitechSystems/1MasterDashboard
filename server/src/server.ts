import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { sendSupportTicket } from './emailService';
import { tenant } from './tenantConfig';
import {
  insertPlaidItem,
  listPlaidItemsByTenant,
  getPlaidItemById,
  getPlaidItemByPlaidId,
  updatePlaidItemCursor,
  updatePlaidItemStatus,
  deletePlaidItem,
  upsertBankTxn,
  deleteBankTxn,
  listBankTxns,
  PlaidItemRow,
  BankTransactionRow,
} from './db';
import { encryptToken, decryptToken } from './crypto';
import {
  pgEnabled,
  pool as pgPool,
  getSetupBundle,
  saveSetupBundle,
  getBudget,
  saveBudget,
  getGlDetail,
  saveGlDetail,
  saveCoaBankMappings,
  SetupBundle,
  BudgetRow as PgBudgetRow,
  GlDetailRow as PgGlDetailRow,
  BankMappingRow,
} from './dbSetup';
import {
  loadReconBatch,
  deterministicMatch,
  buildCandidates,
  findGlByAmount,
  findGlByDescription,
  findGlByJournal,
  fmtBank,
  fmtGl,
  Match,
  ReconException,
  BankLine,
  GlLine,
} from './aiRecon';
import {
  isPlaidConfigured,
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  removeItem,
} from './plaid';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:3174',
  'https://1masterdashboard-frontend.onrender.com',
  'https://1masterdashboard-demo-frontend.onrender.com',
  'https://demo.arkitechsystems.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
// 50 MB is generous; GL Detail uploads can run tens of thousands of rows.
app.use(express.json({ limit: '50mb' }));

app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/tenant', (req: Request, res: Response) => {
  res.json({ id: tenant.id, name: tenant.name });
});

app.post('/api/tickets/submit', async (req: Request, res: Response) => {
  try {
    const { ticketNumber, subject, message } = req.body;

    if (!ticketNumber || !subject || !message) {
      return res.status(400).json({ error: 'Ticket number, subject, and message are required' });
    }

    const result = await sendSupportTicket(ticketNumber, subject, message);

    if (!result.success) {
      return res.status(500).json({ error: result.message });
    }

    res.json({ success: true, message: result.message, ticketNumber });
  } catch (error) {
    console.error('Ticket submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/gl-data', async (req: Request, res: Response) => {
  try {
    const glDataPath = tenant.glDataFile;

    if (!fs.existsSync(glDataPath)) {
      console.error('GL data file not found at:', glDataPath);
      return res.status(500).json({ error: 'GL data file not found' });
    }

    const glData = JSON.parse(fs.readFileSync(glDataPath, 'utf-8'));
    res.json(glData);
  } catch (error) {
    console.error('GL data access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/gl-metadata', async (req: Request, res: Response) => {
  try {
    const glDataPath = tenant.glDataFile;

    if (!fs.existsSync(glDataPath)) {
      console.error('GL data file not found at:', glDataPath);
      return res.status(404).json({ error: 'GL data file not found' });
    }

    const stats = fs.statSync(glDataPath);
    res.json({
      lastModified: stats.mtime.toISOString(),
      fileSize: stats.size,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('GL metadata access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/available-months', async (req: Request, res: Response) => {
  try {
    const glDataPath = tenant.glDataFile;
    const rawData = fs.readFileSync(glDataPath, 'utf-8');
    const glData = JSON.parse(rawData);

    const meValues: number[] = ([...new Set(
      glData.map((r: any) => r.ME).filter((v: any) => v && v !== '')
    )] as number[]).sort((a, b) => a - b);

    const excelEpoch = new Date(1899, 11, 30).getTime();
    const monthNames = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    const shortMonthNames = ['Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'];

    const months = meValues.map((me: number) => {
      const date = new Date(excelEpoch + me * 86400000);
      const year = date.getFullYear();
      const month = date.getMonth();
      const value = `${year}-${String(month + 1).padStart(2, '0')}`;
      return {
        value,
        label: `${monthNames[month]} ${year}`,
        shortLabel: `${shortMonthNames[month]} ${year}`,
        meValue: me,
        fiscalYear: month >= 7 ? year + 1 : year
      };
    });

    res.json(months);
  } catch (error) {
    console.error('Available months error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Plaid routes ───────────────────────────────────────────────────────
// All endpoints are tenant-scoped via the existing tenantConfig.tenant.id.
// When real auth is added, replace `tenant.id` with the authenticated user's
// tenant_id from the session/JWT.

app.get('/api/plaid/status', (_req: Request, res: Response) => {
  res.json({ configured: isPlaidConfigured(), env: process.env.PLAID_ENV || 'sandbox' });
});

app.post('/api/plaid/link-token', async (_req: Request, res: Response) => {
  try {
    const result = await createLinkToken(tenant.id);
    res.json(result);
  } catch (error) {
    console.error('link-token error:', error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

app.post('/api/plaid/exchange', async (req: Request, res: Response) => {
  try {
    const { public_token } = req.body;
    if (!public_token) {
      return res.status(400).json({ error: 'public_token required' });
    }
    const { access_token, item_id, institution_id, institution_name } =
      await exchangePublicToken(public_token);
    // Idempotent: if the same item_id is already stored (re-connect flow),
    // we leave it alone instead of duplicating.
    const existing = getPlaidItemByPlaidId.get({ plaid_item_id: item_id });
    if (!existing) {
      insertPlaidItem.run({
        tenant_id: tenant.id,
        plaid_item_id: item_id,
        access_token_encrypted: encryptToken(access_token),
        institution_id,
        institution_name,
      });
    }
    const stored = getPlaidItemByPlaidId.get({ plaid_item_id: item_id });
    res.json({
      id: stored?.id,
      institution_name: stored?.institution_name,
    });
  } catch (error) {
    console.error('exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
});

app.get('/api/plaid/items', (_req: Request, res: Response) => {
  try {
    const rows = listPlaidItemsByTenant.all({ tenant_id: tenant.id });
    // Don't leak encrypted tokens to the frontend
    res.json(rows.map((r: PlaidItemRow) => ({
      id: r.id,
      institution_id: r.institution_id,
      institution_name: r.institution_name,
      status: r.status,
      last_synced_at: r.last_synced_at,
      created_at: r.created_at,
    })));
  } catch (error) {
    console.error('list items error:', error);
    res.status(500).json({ error: 'Failed to list items' });
  }
});

app.post('/api/plaid/items/:id/sync', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = getPlaidItemById.get({ id });
    if (!item || item.tenant_id !== tenant.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const accessToken = decryptToken(item.access_token_encrypted);
    let cursor = item.cursor;
    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;
    // Drain pagination: keep calling until hasMore is false
    while (true) {
      const result = await syncTransactions(accessToken, cursor);
      for (const t of result.added) {
        upsertBankTxn.run({
          tenant_id: tenant.id,
          plaid_item_id: item.id,
          plaid_txn_id: t.plaid_txn_id,
          date: t.date,
          amount: t.amount,
          description: t.description,
          check_number: t.check_number,
          bank_id: t.bank_id,
          me: t.me,
          pending: t.pending,
          raw: JSON.stringify(t.raw),
        });
        totalAdded++;
      }
      for (const t of result.modified) {
        upsertBankTxn.run({
          tenant_id: tenant.id,
          plaid_item_id: item.id,
          plaid_txn_id: t.plaid_txn_id,
          date: t.date,
          amount: t.amount,
          description: t.description,
          check_number: t.check_number,
          bank_id: t.bank_id,
          me: t.me,
          pending: t.pending,
          raw: JSON.stringify(t.raw),
        });
        totalModified++;
      }
      for (const txnId of result.removed) {
        deleteBankTxn.run({ plaid_txn_id: txnId });
        totalRemoved++;
      }
      cursor = result.cursor;
      if (!result.hasMore) break;
    }
    updatePlaidItemCursor.run({ id: item.id, cursor: cursor as string });
    res.json({ added: totalAdded, modified: totalModified, removed: totalRemoved });
  } catch (error) {
    console.error('sync error:', error);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

app.delete('/api/plaid/items/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = getPlaidItemById.get({ id });
    if (!item || item.tenant_id !== tenant.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    try {
      await removeItem(decryptToken(item.access_token_encrypted));
    } catch (e) {
      console.warn('Plaid /item/remove failed (continuing with local delete):', e);
    }
    deletePlaidItem.run({ id, tenant_id: tenant.id });
    res.json({ ok: true });
  } catch (error) {
    console.error('delete item error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

app.post('/api/plaid/webhook', (req: Request, res: Response) => {
  // Plaid webhook handler.
  //   webhook_type=ITEM, webhook_code=ERROR / PENDING_EXPIRATION → mark status
  //   webhook_type=TRANSACTIONS, webhook_code=SYNC_UPDATES_AVAILABLE → trigger sync
  // For now we just log + acknowledge. Wire up the dispatch when actually
  // connecting Plaid in production.
  try {
    const { webhook_type, webhook_code, item_id } = req.body || {};
    console.log(`[plaid webhook] type=${webhook_type} code=${webhook_code} item=${item_id}`);
    if (webhook_type === 'ITEM' && (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION')) {
      const item = getPlaidItemByPlaidId.get({ plaid_item_id: item_id });
      if (item) updatePlaidItemStatus.run({ id: item.id, status: 'login_required' });
    }
    res.json({ acknowledged: true });
  } catch (error) {
    console.error('webhook error:', error);
    res.status(200).json({ acknowledged: true }); // never fail webhooks
  }
});

app.get('/api/bank-transactions', (req: Request, res: Response) => {
  // me_start / me_end are ME serials (inclusive range)
  try {
    const me_start = parseInt(String(req.query.me_start || '0'), 10);
    const me_end = parseInt(String(req.query.me_end || '999999'), 10);
    const rows = listBankTxns.all({ tenant_id: tenant.id, me_start, me_end });
    res.json(rows.map((r: BankTransactionRow) => ({
      date: r.date,
      description: r.description,
      comments: '',
      checkNumber: r.check_number,
      amount: r.amount,
      bankId: r.bank_id,
      matchNum: r.match_num,
      me: r.me,
      pending: !!r.pending,
    })));
  } catch (error) {
    console.error('bank-transactions error:', error);
    res.status(500).json({ error: 'Failed to list bank transactions' });
  }
});

/* ───────────────────────────────────────────────────────────────
   Setup / Postgres endpoints
   ─────────────────────────────────────────────────────────────── */

const requirePg = (res: Response): boolean => {
  if (!pgEnabled) {
    res.status(503).json({
      error: 'DATABASE_URL not configured on this server.',
    });
    return false;
  }
  return true;
};

app.get('/api/setup', async (_req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const bundle = await getSetupBundle();
    res.json(bundle);
  } catch (e: any) {
    console.error('GET /api/setup', e);
    res.status(500).json({ error: e?.message || 'Failed to load setup' });
  }
});

app.put('/api/setup', async (req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const bundle = req.body as SetupBundle;
    if (!bundle || typeof bundle !== 'object') {
      res.status(400).json({ error: 'Body must be a SetupBundle.' });
      return;
    }
    await saveSetupBundle(bundle);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('PUT /api/setup', e);
    res.status(500).json({ error: e?.message || 'Failed to save setup' });
  }
});

/**
 * Update bank/bank_account_number on existing CoA rows without touching
 * the rest of the Setup bundle. Used by the Cash Summary page.
 */
app.patch('/api/coa/bank-mapping', async (req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const rows = req.body as BankMappingRow[] | { rows: BankMappingRow[] };
    const list: BankMappingRow[] = Array.isArray(rows)
      ? rows
      : Array.isArray((rows as any)?.rows)
      ? (rows as any).rows
      : [];
    if (!list.every((r) => r && typeof r.account === 'string')) {
      res.status(400).json({ error: 'Body must be an array of {account, bank, bankAccountNumber}.' });
      return;
    }
    await saveCoaBankMappings(list);
    res.json({ ok: true, updated: list.length });
  } catch (e: any) {
    console.error('PATCH /api/coa/bank-mapping', e);
    res.status(500).json({ error: e?.message || 'Failed to save bank mapping' });
  }
});

app.get('/api/budget', async (_req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const rows = await getBudget();
    res.json(rows);
  } catch (e: any) {
    console.error('GET /api/budget', e);
    res.status(500).json({ error: e?.message || 'Failed to load budget' });
  }
});

app.put('/api/budget', async (req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const rows = req.body as PgBudgetRow[];
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: 'Body must be an array of budget rows.' });
      return;
    }
    await saveBudget(rows);
    res.json({ ok: true, count: rows.length });
  } catch (e: any) {
    console.error('PUT /api/budget', e);
    res.status(500).json({ error: e?.message || 'Failed to save budget' });
  }
});

app.get('/api/gl-detail', async (_req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const rows = await getGlDetail();
    res.json(rows);
  } catch (e: any) {
    console.error('GET /api/gl-detail', e);
    res.status(500).json({ error: e?.message || 'Failed to load GL detail' });
  }
});

app.put('/api/gl-detail', async (req: Request, res: Response) => {
  if (!requirePg(res)) return;
  try {
    const rows = req.body as PgGlDetailRow[];
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: 'Body must be an array of GL detail rows.' });
      return;
    }
    await saveGlDetail(rows);
    res.json({ ok: true, count: rows.length });
  } catch (e: any) {
    console.error('PUT /api/gl-detail', e);
    res.status(500).json({ error: e?.message || 'Failed to save GL detail' });
  }
});

/* ───────────────────────────────────────────────────────────────
   Ask AI — Claude-backed chat endpoint
   ─────────────────────────────────────────────────────────────── */

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const ASK_AI_SYSTEM = `You are the AI assistant inside ArkiTech's financial dashboard.
You help users interpret and work with their financial data: the income statement,
balance sheet, GL transactions, beginning trial balance, budget, departmental
breakdowns, and the Setup tabs (Chart of Accounts, Income Statement Lines, Balance
Sheet Lines, Dept List).

The dashboard is built for community hospitals and similar healthcare orgs, so
expect questions about patient revenue, contractual allowances, dept-level cost
analysis, FTE / hours-per-unit-of-volume, supply cost per visit, variance vs
budget, and the line items used on IRS Form 990.

When answering:
- Be concrete. Cite specific account numbers, line items, or department codes
  when the user is asking about something in the data.
- If the user asks about a number you can't see, explain what you'd need from
  them (which tab, which month, which account) instead of guessing.
- Default to plain text. Use short bullet lists only when the answer is genuinely
  a list of distinct items.
- Decline politely if asked about anything outside finance, accounting, or
  hospital operations.`;

app.post('/api/ai/chat', async (req: Request, res: Response) => {
  if (!anthropicClient) {
    res.status(503).json({
      error:
        'ANTHROPIC_API_KEY not configured on the server. Ask AI is unavailable.',
    });
    return;
  }
  try {
    const { messages } = req.body as {
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: 'Body must be { messages: [{ role, content }, ...] }',
      });
      return;
    }

    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: ASK_AI_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    res.json({
      content: text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read: response.usage.cache_read_input_tokens,
        cache_write: response.usage.cache_creation_input_tokens,
      },
    });
  } catch (err: any) {
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'Rate limited — try again shortly.' });
    } else if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY is invalid.' });
    } else if (err instanceof Anthropic.APIError) {
      res.status(err.status ?? 500).json({ error: err.message });
    } else {
      console.error('[ask-ai] unexpected error', err);
      res.status(500).json({ error: err?.message || 'Unexpected server error.' });
    }
  }
});

/* ───────────────────────────────────────────────────────────────
   AI Reconciliation — three tiers, shared engine
   ─────────────────────────────────────────────────────────────── */

const requireAi = (res: Response): boolean => {
  if (!anthropicClient) {
    res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured. AI reconciliation unavailable.',
    });
    return false;
  }
  return true;
};

const RECON_SYSTEM = `You are a hospital bank-reconciliation assistant.
Each bank line should match one or more GL lines. Match on amount magnitude
(signs may differ — bank deposits are positive, GL cash entries vary), date
proximity (±5 days is normal, longer is a timing exception), and meaning
(description, memo, journal #, check #). Be conservative — only mark a match
"high" confidence when the evidence is clear. When in doubt, prefer "low" or
flag an exception rather than guessing.`;

/* ── Tier 1: deterministic matcher + Claude tiebreaker ────────────────── */

app.post('/api/ai/recon/tier1', async (req: Request, res: Response) => {
  if (!requireAi(res)) return;
  try {
    const { monthEnd } = req.body as { monthEnd?: string };
    if (!monthEnd) {
      res.status(400).json({ error: 'Body must include monthEnd (mm/dd/yyyy).' });
      return;
    }
    const { bank, gl } = await loadReconBatch(pgPool, tenant.id, monthEnd);
    const { matches, unmatchedBank, unmatchedGl } = deterministicMatch(bank, gl);

    const suggestions: Match[] = [];
    const exceptions: ReconException[] = [];

    if (unmatchedBank.length > 0 && unmatchedGl.length > 0) {
      const candidates = buildCandidates(unmatchedBank, unmatchedGl);
      const prompt = candidates
        .map(
          ({ bank: b, candidates: cs }) =>
            `BANK ${fmtBank(b)}\n` +
            (cs.length === 0
              ? '  (no candidate GL lines)\n'
              : cs.map((g) => `  CAND ${fmtGl(g)}`).join('\n')),
        )
        .join('\n\n');

      const response = await anthropicClient!.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: [
          { type: 'text', text: RECON_SYSTEM, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          {
            role: 'user',
            content:
              `Match each BANK line to one or more CAND lines below, or flag an ` +
              `exception. Return JSON only with this shape:\n` +
              `{"suggestions":[{"bankId":N,"glIds":[N],"confidence":"high|medium|low","reason":"..."}],` +
              `"exceptions":[{"bankId":N,"kind":"no_gl_match|duplicate|timing|other","message":"..."}]}\n\n` +
              prompt,
          },
        ],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      try {
        // Strip ```json fences if Claude added them.
        const json = text.replace(/```json\s*|\s*```/g, '').trim();
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed.suggestions)) suggestions.push(...parsed.suggestions);
        if (Array.isArray(parsed.exceptions)) exceptions.push(...parsed.exceptions);
      } catch (e) {
        console.warn('[recon tier1] failed to parse model JSON', e);
      }
    }

    // Anything still unmatched after suggestions becomes a "no match" exception.
    const suggestedBankIds = new Set(suggestions.map((s) => s.bankId));
    unmatchedBank.forEach((b) => {
      if (!suggestedBankIds.has(b.id)) {
        exceptions.push({
          bankId: b.id,
          kind: 'no_gl_match',
          message: `No GL line found for ${fmtBank(b)}`,
        });
      }
    });

    res.json({
      matches,
      suggestions,
      exceptions,
      stats: {
        bankRows: bank.length,
        glRows: gl.length,
        matchedRows: matches.length,
        suggestedRows: suggestions.length,
        unmatchedBank: unmatchedBank.length,
        unmatchedGl: unmatchedGl.length,
      },
    });
  } catch (err: any) {
    console.error('[recon tier1]', err);
    res.status(500).json({ error: err?.message || 'Tier 1 recon failed' });
  }
});

/* ── Tier 2 / Tier 3: tool-use agent loop ─────────────────────────────── */

const RECON_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_gl_by_amount',
    description:
      'Return GL lines whose amount magnitude matches the given amount (within a small tolerance).',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount magnitude to search for (sign ignored).' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'find_gl_by_description',
    description:
      'Fuzzy-search the GL by description, memo, reference, or journal #. Returns up to 20 hits ranked by overlap.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_gl_by_journal',
    description: 'Find GL lines by journal # or reference.',
    input_schema: {
      type: 'object',
      properties: {
        journal: { type: 'string', description: 'Journal number or reference string.' },
      },
      required: ['journal'],
    },
  },
  {
    name: 'propose_match',
    description:
      'Register a proposed match between one bank line and one or more GL lines.',
    input_schema: {
      type: 'object',
      properties: {
        bankId: { type: 'integer' },
        glIds: { type: 'array', items: { type: 'integer' } },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        reason: { type: 'string' },
      },
      required: ['bankId', 'glIds', 'confidence', 'reason'],
    },
  },
  {
    name: 'flag_exception',
    description:
      'Flag a bank or GL line that has no good match (or has a duplicate, timing issue, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        bankId: { type: 'integer' },
        glId: { type: 'integer' },
        kind: {
          type: 'string',
          enum: ['no_gl_match', 'no_bank_match', 'duplicate', 'timing', 'other'],
        },
        message: { type: 'string' },
      },
      required: ['kind', 'message'],
    },
  },
  {
    name: 'finalize',
    description: 'Call when reconciliation is complete and no more tool calls are needed.',
    input_schema: { type: 'object', properties: {} },
  },
];

interface ReconAgentState {
  gl: GlLine[];
  matches: Match[];
  exceptions: ReconException[];
  finalized: boolean;
}

const runReconTool = (
  state: ReconAgentState,
  name: string,
  input: any,
): string => {
  switch (name) {
    case 'find_gl_by_amount': {
      const hits = findGlByAmount(state.gl, Number(input.amount) || 0);
      return hits.length === 0
        ? 'No GL lines match that amount.'
        : hits.slice(0, 12).map(fmtGl).join('\n');
    }
    case 'find_gl_by_description': {
      const hits = findGlByDescription(state.gl, String(input.query || ''));
      return hits.length === 0
        ? 'No GL lines match that description.'
        : hits.map(fmtGl).join('\n');
    }
    case 'find_gl_by_journal': {
      const hits = findGlByJournal(state.gl, String(input.journal || ''));
      return hits.length === 0
        ? 'No GL lines with that journal/reference.'
        : hits.map(fmtGl).join('\n');
    }
    case 'propose_match': {
      state.matches.push({
        bankId: Number(input.bankId),
        glIds: (input.glIds || []).map((n: any) => Number(n)),
        confidence: input.confidence || 'low',
        reason: String(input.reason || ''),
      });
      return `Recorded match for bank#${input.bankId}.`;
    }
    case 'flag_exception': {
      state.exceptions.push({
        bankId: input.bankId != null ? Number(input.bankId) : undefined,
        glId: input.glId != null ? Number(input.glId) : undefined,
        kind: input.kind,
        message: String(input.message || ''),
      });
      return `Recorded exception (${input.kind}).`;
    }
    case 'finalize':
      state.finalized = true;
      return 'Reconciliation finalized.';
    default:
      return `Unknown tool: ${name}`;
  }
};

const runReconAgentLoop = async (
  bank: BankLine[],
  gl: GlLine[],
  userKickoff: string,
  maxIterations: number,
): Promise<{ matches: Match[]; exceptions: ReconException[]; iterations: number }> => {
  const state: ReconAgentState = { gl, matches: [], exceptions: [], finalized: false };
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userKickoff }];

  let iterations = 0;
  while (iterations < maxIterations && !state.finalized) {
    iterations++;
    const response = await anthropicClient!.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: [
        { type: 'text', text: RECON_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      tools: RECON_TOOLS,
      messages,
    });

    if (response.stop_reason === 'end_turn') break;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    messages.push({ role: 'assistant', content: response.content });

    if (toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => ({
      type: 'tool_result',
      tool_use_id: tu.id,
      content: runReconTool(state, tu.name, tu.input as any),
    }));
    messages.push({ role: 'user', content: toolResults });
  }

  return { matches: state.matches, exceptions: state.exceptions, iterations };
};

/* ── Tier 2: tool use, deterministic matcher applied first ────────────── */

app.post('/api/ai/recon/tier2', async (req: Request, res: Response) => {
  if (!requireAi(res)) return;
  try {
    const { monthEnd } = req.body as { monthEnd?: string };
    if (!monthEnd) {
      res.status(400).json({ error: 'Body must include monthEnd (mm/dd/yyyy).' });
      return;
    }
    const { bank, gl } = await loadReconBatch(pgPool, tenant.id, monthEnd);
    const { matches: deterministic, unmatchedBank, unmatchedGl } = deterministicMatch(bank, gl);

    const kickoff =
      `Reconcile the following unmatched bank lines against the unmatched GL ` +
      `lines. Use the tools to look up candidates, then propose_match or ` +
      `flag_exception for each. Call finalize when done.\n\n` +
      `UNMATCHED BANK (${unmatchedBank.length}):\n` +
      unmatchedBank.map(fmtBank).join('\n') +
      `\n\nUNMATCHED GL (${unmatchedGl.length}):\n` +
      unmatchedGl.map(fmtGl).join('\n');

    const { matches: agentMatches, exceptions, iterations } = await runReconAgentLoop(
      unmatchedBank,
      unmatchedGl,
      kickoff,
      /* maxIterations */ 12,
    );

    res.json({
      matches: deterministic,
      suggestions: agentMatches,
      exceptions,
      iterations,
      stats: {
        bankRows: bank.length,
        glRows: gl.length,
        matchedRows: deterministic.length,
        suggestedRows: agentMatches.length,
        unmatchedBank: unmatchedBank.length,
        unmatchedGl: unmatchedGl.length,
      },
    });
  } catch (err: any) {
    console.error('[recon tier2]', err);
    res.status(500).json({ error: err?.message || 'Tier 2 recon failed' });
  }
});

/* ── Tier 3: fully autonomous run on the whole batch ──────────────────── */

app.post('/api/ai/recon/tier3', async (req: Request, res: Response) => {
  if (!requireAi(res)) return;
  try {
    const { monthEnd } = req.body as { monthEnd?: string };
    if (!monthEnd) {
      res.status(400).json({ error: 'Body must include monthEnd (mm/dd/yyyy).' });
      return;
    }
    const { bank, gl } = await loadReconBatch(pgPool, tenant.id, monthEnd);

    const kickoff =
      `Reconcile the entire month autonomously. Use the search tools to find ` +
      `candidates, propose_match for each pairing you can defend (assigning a ` +
      `confidence), and flag_exception for anything you can't reconcile. When ` +
      `you've covered every bank line, call finalize.\n\n` +
      `ALL BANK LINES (${bank.length}):\n` +
      bank.map(fmtBank).join('\n') +
      `\n\nALL GL LINES (${gl.length}):\n` +
      gl.map(fmtGl).join('\n');

    const { matches, exceptions, iterations } = await runReconAgentLoop(
      bank,
      gl,
      kickoff,
      /* maxIterations */ 20,
    );

    res.json({
      matches: [],          // tier 3 doesn't run the deterministic pre-pass
      suggestions: matches, // everything Claude proposed
      exceptions,
      iterations,
      stats: {
        bankRows: bank.length,
        glRows: gl.length,
        matchedRows: 0,
        suggestedRows: matches.length,
        unmatchedBank: 0,
        unmatchedGl: 0,
      },
    });
  } catch (err: any) {
    console.error('[recon tier3]', err);
    res.status(500).json({ error: err?.message || 'Tier 3 recon failed' });
  }
});

const startServer = () => {
  if (USE_HTTPS) {
    const certPath = path.join(__dirname, '..', 'certs');
    const keyPath = path.join(certPath, 'key.pem');
    const certFilePath = path.join(certPath, 'cert.pem');

    if (!fs.existsSync(keyPath) || !fs.existsSync(certFilePath)) {
      console.error('HTTPS enabled but SSL certificates not found at:', certPath);
      process.exit(1);
    }

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certFilePath)
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`HTTPS server running on port ${PORT}`);
    });
  } else {
    http.createServer(app).listen(PORT, () => {
      console.log(`Server running on port ${PORT} (tenant: ${tenant.id})`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  }
};

startServer();
