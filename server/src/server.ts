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
  isPlaidConfigured,
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  removeItem,
} from './plaid';

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
app.use(express.json());

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
