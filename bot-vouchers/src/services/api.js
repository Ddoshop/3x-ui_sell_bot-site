import { config } from '../config.js';

export const api = {
  async getPlans() {
    const res = await fetch(`${config.paymentsApiUrl}/api/plans`);
    if (!res.ok) throw new Error('Failed to fetch plans');
    return res.json();
  },

  async createPayment(userId, planId, userData) {
    const res = await fetch(`${config.paymentsApiUrl}/api/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        planId,
        ...userData
      })
    });
    if (!res.ok) throw new Error('Failed to create payment');
    return res.json();
  },

  async activateVoucher(code, username) {
    const res = await fetch(`${config.paymentsApiUrl}/api/vouchers/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, username })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to activate voucher');
    }
    return res.json();
  },

  async getUserSubscriptions(username) {
    const res = await fetch(`${config.paymentsApiUrl}/api/users/${username}/subscriptions`);
    if (!res.ok) throw new Error('Failed to fetch subscriptions');
    return res.json();
  }
};
