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
  xui: {
    panelUrl: requireEnv('XUI_PANEL_URL').replace(/\/$/, ''),
    publicUrl: requireEnv('XUI_PUBLIC_URL').replace(/\/$/, ''),
    username: requireEnv('XUI_USERNAME'),
    password: requireEnv('XUI_PASSWORD'),
    inboundId: parseNumber(process.env.XUI_INBOUND_ID, 1)
  }
};
