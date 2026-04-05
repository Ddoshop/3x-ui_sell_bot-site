import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

export const config = {
  telegramToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  paymentsApiUrl: requireEnv('PAYMENTS_API_URL').replace(/\/$/, ''),
  brandName: process.env.BRAND_NAME || 'VPN Premium',
  brandEmoji: process.env.BRAND_EMOJI || '🌐',
  supportTelegramId: process.env.BOT_CHAT_ID || ''
};
