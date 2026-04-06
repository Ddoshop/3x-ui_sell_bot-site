import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: parseNumber(process.env.PORT, 8788),
  telegramToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  adminTelegramId: requireEnv('ADMIN_TELEGRAM_ID'),
  jwtSecret: requireEnv('JWT_SECRET'),
  adminPassword: requireEnv('ADMIN_PASSWORD'),
  publicBaseUrl: requireEnv('PUBLIC_BASE_URL').replace(/\/$/, ''),
  dbPath: process.env.DB_PATH || '../data/db.json',
  internalApiToken: process.env.INTERNAL_API_TOKEN || '',
  trialCooldownMs: parseNumber(process.env.TRIAL_COOLDOWN_MS, 1000 * 60 * 60 * 24 * 30),
  botHeartbeatStaleMs: parseNumber(process.env.BOT_HEARTBEAT_STALE_MS, 1000 * 60 * 2),
  siteHealthUrl: process.env.SITE_HEALTH_URL || 'http://site:3000/health',
  xui: {
    panelUrl: requireEnv('XUI_PANEL_URL').replace(/\/$/, ''),
    publicUrl: requireEnv('XUI_PUBLIC_URL').replace(/\/$/, ''),
    username: requireEnv('XUI_USERNAME'),
    password: requireEnv('XUI_PASSWORD'),
    inboundId: parseNumber(process.env.XUI_INBOUND_ID, 1)
  }
};
