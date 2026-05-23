import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { sendSupportTicket } from './emailService';
import { tenant } from './tenantConfig';

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
