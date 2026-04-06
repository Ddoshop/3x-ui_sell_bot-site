import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/db.json');

// Инициализация структуры БД
const INITIAL_DB = {
  users: [],
  payments: [],
  vouchers: [],
  issuedAccess: [],
  auditLogs: [],
  reminderLogs: [],
  trialGrants: [],
  systemState: {
    botHeartbeatAt: null,
    botDeliveryMode: null,
    botVersion: null,
    lastSuccessfulExtensionAt: null,
    lastSuccessfulExtension: null
  },
  adminSettings: {
    plans: [
      {
        id: 'vpn-30',
        title: 'Старт на 30 дней',
        badge: 'Для знакомства',
        description: 'Полный доступ для 1 устройства',
        days: 30,
        price: 300,
        currency: 'RUB',
        enabled: true
      },
      {
        id: 'vpn-90',
        title: 'Стандарт на 90 дней',
        badge: 'Хит продаж',
        description: 'Оптимальный баланс цены и срока',
        days: 90,
        price: 750,
        currency: 'RUB',
        enabled: true
      },
      {
        id: 'vpn-365',
        title: 'Максимум на 365 дней',
        badge: 'Максимальная выгода',
        description: 'Годовой доступ с минимальной ценой',
        days: 365,
        price: 2500,
        currency: 'RUB',
        enabled: true
      }
    ]
  }
};

async function readDb() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    return normalizeDb(parsed);
  } catch {
    return normalizeDb({ ...INITIAL_DB });
  }
}

function normalizeDb(data) {
  const db = data || {};
  db.users = Array.isArray(db.users) ? db.users : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.vouchers = Array.isArray(db.vouchers) ? db.vouchers : [];
  db.issuedAccess = Array.isArray(db.issuedAccess) ? db.issuedAccess : [];
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  db.reminderLogs = Array.isArray(db.reminderLogs) ? db.reminderLogs : [];
  db.trialGrants = Array.isArray(db.trialGrants) ? db.trialGrants : [];

  if (!db.systemState || typeof db.systemState !== 'object') {
    db.systemState = { ...INITIAL_DB.systemState };
  }
  db.systemState.botHeartbeatAt = db.systemState.botHeartbeatAt || null;
  db.systemState.botDeliveryMode = db.systemState.botDeliveryMode || null;
  db.systemState.botVersion = db.systemState.botVersion || null;
  db.systemState.lastSuccessfulExtensionAt = db.systemState.lastSuccessfulExtensionAt || null;
  db.systemState.lastSuccessfulExtension = db.systemState.lastSuccessfulExtension || null;

  if (!db.adminSettings || typeof db.adminSettings !== 'object') {
    db.adminSettings = { plans: [...INITIAL_DB.adminSettings.plans] };
  }
  if (!Array.isArray(db.adminSettings.plans) || !db.adminSettings.plans.length) {
    db.adminSettings.plans = [...INITIAL_DB.adminSettings.plans];
  }

  db.adminSettings.plans = db.adminSettings.plans.map(plan => ({
    ...plan,
    enabled: plan.enabled !== false
  }));

  return db;
}

async function writeDb(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Платежи
export async function createPayment(paymentData) {
  const db = await readDb();
  const payment = {
    id: crypto.randomUUID(),
    status: 'pending', // pending, confirmed, failed
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    ...paymentData
  };
  db.payments.push(payment);
  await writeDb(db);
  return payment;
}

export async function getPayment(paymentId) {
  const db = await readDb();
  return db.payments.find(p => p.id === paymentId) || null;
}

export async function getPaymentsByUser(userId) {
  const db = await readDb();
  return db.payments.filter(p => p.userId === userId);
}

export async function updatePayment(paymentId, updates) {
  const db = await readDb();
  const payment = db.payments.find(p => p.id === paymentId);
  if (!payment) throw new Error('Payment not found');
  Object.assign(payment, updates);
  await writeDb(db);
  return payment;
}

export async function deletePayment(paymentId) {
  const db = await readDb();
  const index = db.payments.findIndex(p => p.id === paymentId);
  if (index === -1) return false;
  db.payments.splice(index, 1);
  await writeDb(db);
  return true;
}

// Ваучеры
export async function createVoucher(voucherData) {
  const db = await readDb();
  const voucher = {
    id: crypto.randomUUID(),
    code: generateVoucherCode(),
    status: 'active', // active, used, expired
    createdAt: new Date().toISOString(),
    usedAt: null,
    usedBy: null,
    linkedPaymentId: null,
    ...voucherData
  };
  db.vouchers.push(voucher);
  await writeDb(db);
  return voucher;
}

export async function getVoucher(code) {
  const db = await readDb();
  return db.vouchers.find(v => v.code === code) || null;
}

export async function getVoucherById(voucherId) {
  const db = await readDb();
  return db.vouchers.find(v => v.id === voucherId) || null;
}

export async function getVouchersByPayment(paymentId) {
  const db = await readDb();
  return db.vouchers.filter(v => v.linkedPaymentId === paymentId);
}

export async function useVoucher(code, userId) {
  const db = await readDb();
  const voucher = db.vouchers.find(v => v.code === code);
  if (!voucher) throw new Error('Voucher not found');
  if (voucher.status !== 'active') throw new Error('Voucher is not active');
  
  Object.assign(voucher, {
    status: 'used',
    usedAt: new Date().toISOString(),
    usedBy: userId
  });
  
  await writeDb(db);
  return voucher;
}

export async function getPendingPayments() {
  const db = await readDb();
  return db.payments.filter(p => p.status === 'pending');
}

export async function getConfirmedPayments() {
  const db = await readDb();
  return db.payments.filter(p => p.status === 'confirmed');
}

// Выданный доступ
export async function saveIssuedAccess(accessData) {
  const db = await readDb();
  const access = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...accessData
  };
  db.issuedAccess.push(access);
  await writeDb(db);
  return access;
}

export async function getIssuedAccessByUser(userId) {
  const db = await readDb();
  return db.issuedAccess.filter(a => a.userId === userId);
}

export async function getLatestIssuedAccessByUser(userId) {
  const access = await getIssuedAccessByUser(userId);
  if (!access.length) return null;

  return access
    .slice()
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];
}

export async function getIssuedAccessByVoucher(voucherId) {
  const db = await readDb();
  return db.issuedAccess.filter(a => a.voucherId === voucherId);
}

export async function getTrialAccessBySourcePayment(paymentId) {
  const db = await readDb();
  return db.issuedAccess.find(a => a.sourcePaymentId === paymentId && a.isTrial) || null;
}

export async function deleteIssuedAccess(accessId) {
  const db = await readDb();
  const index = db.issuedAccess.findIndex(a => a.id === accessId);
  if (index === -1) return false;
  db.issuedAccess.splice(index, 1);
  await writeDb(db);
  return true;
}

// Пользователи
export async function upsertUser(userData) {
  const db = await readDb();
  let user = db.users.find(u => u.telegramId === userData.telegramId);
  if (!user) {
    user = {
      telegramId: userData.telegramId,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      username: userData.username || '',
      telegramChatId: userData.telegramChatId || null,
      trialIssuedAt: userData.trialIssuedAt || null,
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    Object.assign(user, userData);
  }
  await writeDb(db);
  return user;
}

export async function getUser(telegramId) {
  const db = await readDb();
  return db.users.find(u => u.telegramId === telegramId) || null;
}

export async function clearUserTrialIssuedAt(telegramId) {
  const db = await readDb();
  const user = db.users.find(u => u.telegramId === telegramId);
  if (!user) return false;
  user.trialIssuedAt = null;
  await writeDb(db);
  return true;
}

// Утилиты
function generateVoucherCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Формат: XXXX-XXXX-XXXX-XXXX
  return code.match(/.{1,4}/g).join('-');
}

export async function getPlans() {
  const db = await readDb();
  return db.adminSettings.plans;
}

export async function getPlanById(planId) {
  const plans = await getPlans();
  return plans.find(p => p.id === planId) || null;
}

export async function createPlan(planData) {
  const db = await readDb();
  const exists = db.adminSettings.plans.find(p => p.id === planData.id);
  if (exists) {
    throw new Error('Plan with this id already exists');
  }

  const plan = {
    id: planData.id,
    title: planData.title,
    badge: planData.badge || '',
    description: planData.description || '',
    days: Number(planData.days),
    price: Number(planData.price),
    currency: planData.currency || 'RUB'
  };

  db.adminSettings.plans.push(plan);
  await writeDb(db);
  return plan;
}

export async function updatePlan(planId, updates) {
  const db = await readDb();
  const plan = db.adminSettings.plans.find(p => p.id === planId);
  if (!plan) throw new Error('Plan not found');

  Object.assign(plan, {
    title: updates.title ?? plan.title,
    badge: updates.badge ?? plan.badge,
    description: updates.description ?? plan.description,
    days: updates.days !== undefined ? Number(updates.days) : plan.days,
    price: updates.price !== undefined ? Number(updates.price) : plan.price,
    currency: updates.currency ?? plan.currency,
    enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : plan.enabled
  });

  await writeDb(db);
  return plan;
}

export async function deletePlan(planId) {
  const db = await readDb();
  const index = db.adminSettings.plans.findIndex(p => p.id === planId);
  if (index === -1) throw new Error('Plan not found');
  const deleted = db.adminSettings.plans.splice(index, 1)[0];
  await writeDb(db);
  return deleted;
}

export async function togglePlanEnabled(planId) {
  const db = await readDb();
  const plan = db.adminSettings.plans.find(p => p.id === planId);
  if (!plan) throw new Error('Plan not found');
  plan.enabled = !plan.enabled;
  await writeDb(db);
  return plan;
}

export async function addAuditLog(entry) {
  const db = await readDb();
  const item = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry
  };
  db.auditLogs.unshift(item);
  await writeDb(db);
  return item;
}

export async function getAuditLogs(limit = 200) {
  const db = await readDb();
  return db.auditLogs.slice(0, limit);
}

export async function hasReminderLog(accessId, reminderType) {
  const db = await readDb();
  return db.reminderLogs.some(r => r.accessId === accessId && r.reminderType === reminderType);
}

export async function addReminderLog(entry) {
  const db = await readDb();
  const item = {
    id: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
    ...entry
  };
  db.reminderLogs.push(item);
  await writeDb(db);
  return item;
}

export async function getAllUsersAdminView(query = '') {
  const db = await readDb();
  const q = String(query || '').trim().toLowerCase();

  const users = db.users.filter((u) => {
    if (!q) return true;
    const username = String(u.username || u.telegramId || '').toLowerCase();
    return username.includes(q);
  });

  return users.map((user) => {
    const userId = user.telegramId;
    const userPayments = db.payments
      .filter(p => p.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const userAccess = db.issuedAccess
      .filter(a => a.userId === userId)
      .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());

    const activeAccess = userAccess.find(a => new Date(a.expiresAt) > new Date()) || null;
    const userVouchers = db.vouchers
      .filter(v => v.usedBy === userId || (v.assignedUsername && v.assignedUsername === userId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      telegramId: user.telegramId,
      username: user.username || user.telegramId,
      telegramChatId: user.telegramChatId || null,
      trialIssuedAt: user.trialIssuedAt || null,
      activeSubscription: activeAccess
        ? {
            planTitle: activeAccess.planTitle,
            expiresAt: activeAccess.expiresAt,
            subscriptionUrl: activeAccess.subscriptionUrl,
            isTrial: Boolean(activeAccess.isTrial)
          }
        : null,
      paymentsHistory: userPayments,
      vouchersHistory: userVouchers,
      accessHistory: userAccess
    };
  });
}

function normalizeTrialGrantValue(value) {
  return String(value || '').trim().toLowerCase();
}

export async function addTrialGrant(entry) {
  const db = await readDb();
  const item = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    username: normalizeTrialGrantValue(entry.username),
    ip: normalizeTrialGrantValue(entry.ip),
    fingerprint: normalizeTrialGrantValue(entry.fingerprint),
    paymentId: entry.paymentId || null,
    expiresAt: entry.expiresAt || null
  };

  db.trialGrants.unshift(item);
  if (db.trialGrants.length > 5000) {
    db.trialGrants = db.trialGrants.slice(0, 5000);
  }

  await writeDb(db);
  return item;
}

export async function getLatestTrialGrantByUsername(username) {
  const db = await readDb();
  const normalized = normalizeTrialGrantValue(username);
  if (!normalized) return null;
  return db.trialGrants.find(item => item.username === normalized) || null;
}

export async function getLatestTrialGrantByIp(ip) {
  const db = await readDb();
  const normalized = normalizeTrialGrantValue(ip);
  if (!normalized) return null;
  return db.trialGrants.find(item => item.ip === normalized) || null;
}

export async function getLatestTrialGrantByFingerprint(fingerprint) {
  const db = await readDb();
  const normalized = normalizeTrialGrantValue(fingerprint);
  if (!normalized) return null;
  return db.trialGrants.find(item => item.fingerprint === normalized) || null;
}

export async function updateBotHeartbeat(data) {
  const db = await readDb();
  db.systemState.botHeartbeatAt = new Date().toISOString();
  db.systemState.botDeliveryMode = data.deliveryMode || db.systemState.botDeliveryMode || null;
  db.systemState.botVersion = data.botVersion || db.systemState.botVersion || null;
  await writeDb(db);
  return db.systemState;
}

export async function markLastSuccessfulExtension(data) {
  const db = await readDb();
  const now = new Date().toISOString();
  db.systemState.lastSuccessfulExtensionAt = now;
  db.systemState.lastSuccessfulExtension = {
    at: now,
    operation: data.operation || 'unknown',
    userId: data.userId || null,
    planId: data.planId || null,
    planTitle: data.planTitle || null,
    expiresAt: data.expiresAt || null
  };
  await writeDb(db);
  return db.systemState.lastSuccessfulExtension;
}

export async function getSystemState() {
  const db = await readDb();
  return db.systemState;
}
