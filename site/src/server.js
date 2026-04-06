import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://localhost:8788';

app.use(express.json());

app.use('/api', async (req, res) => {
  try {
    const targetUrl = `${API_URL}${req.originalUrl}`;
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json'
    };

    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const init = {
      method: req.method,
      headers
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      init.body = JSON.stringify(req.body ?? {});
    }

    const response = await fetch(targetUrl, init);
    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();

    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    res.send(text);
  } catch (error) {
    res.status(502).json({ error: `API proxy error: ${error.message}` });
  }
});

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(
    `window.APP_CONFIG = ${JSON.stringify({
      apiUrl: '/api',
      tgBotUsername: process.env.TG_BOT_USERNAME || '',
      brandName: process.env.BRAND_NAME || 'VPN Premium',
      brandEmoji: process.env.BRAND_EMOJI || '🌐'
    })};`
  );
});

// Раздать статику
app.use(express.static(path.join(__dirname, '../public')));

// CORS для API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🌐 Website is running on http://localhost:${PORT}`);
});
