import crypto from 'crypto';
import { config } from './config.js';

// Отключаем проверку самоподписанного сертификата
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function randomHex(size = 8) {
  return crypto.randomBytes(size).toString('hex');
}

function nowPlusDays(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

class XuiClient {
  constructor(options = config.xui) {
    this.options = options;
    this.cookie = '';
  }

  async login() {
    console.log(`[XUI] Logging in to ${this.options.panelUrl}/login`);
    
    const response = await fetch(`${this.options.panelUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        username: this.options.username,
        password: this.options.password
      })
    });

    if (!response.ok) {
      throw new Error(`x-ui login failed with status ${response.status}`);
    }

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('x-ui login succeeded without session cookie');
    }

    this.cookie = setCookie.split(';')[0];
    console.log(`[XUI] Login successful, cookie: ${this.cookie.substring(0, 20)}...`);
  }

  async request(path, init = {}) {
    if (!this.cookie) {
      await this.login();
    }

    const response = await fetch(`${this.options.panelUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.cookie,
        ...(init.headers ?? {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      console.log(`[XUI] Session expired, re-logging in...`);
      this.cookie = '';
      await this.login();
      return this.request(path, init);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`x-ui request failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  async addVpnClient({ username, days }) {
    console.log(`[XUI] Adding VPN client for user @${username}, ${days} days`);
    
    const uuid = crypto.randomUUID();
    const email = `@${username}-${randomHex(4)}`;
    const subId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const expiryTime = nowPlusDays(days);

    const payload = {
      id: this.options.inboundId,
      settings: JSON.stringify({
        clients: [
          {
            id: uuid,
            email,
            limitIp: 0,
            totalGB: 0,
            expiryTime,
            enable: true,
            tgId: `@${username}`,
            subId,
            reset: 0
          }
        ]
      })
    };

    console.log(`[XUI] POST /panel/api/inbounds/addClient with payload:`, JSON.stringify(payload, null, 2));

    const result = await this.request('/panel/api/inbounds/addClient', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.success === false) {
      throw new Error(result.msg || 'x-ui rejected addClient request');
    }

    const subscriptionUrl = `${this.options.publicUrl}/sub/${subId}`;

    console.log(`[XUI] Client added successfully! Subscription URL: ${subscriptionUrl}`);

    return {
      username,
      email,
      uuid,
      subId,
      expiresAt: new Date(expiryTime).toISOString(),
      expiryTime,
      subscriptionUrl
    };
  }

  async extendVpnClient({ uuid, username, extraDays, currentExpiryTime = 0, email, subId }) {
    const baseExpiry = Math.max(Number(currentExpiryTime) || 0, Date.now());
    const newExpiryTime = baseExpiry + extraDays * 24 * 60 * 60 * 1000;
    const resolvedSubId = subId || crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const resolvedEmail = email || `@${username}-${randomHex(4)}`;

    const payload = {
      id: this.options.inboundId,
      settings: JSON.stringify({
        clients: [
          {
            id: uuid,
            email: resolvedEmail,
            limitIp: 0,
            totalGB: 0,
            expiryTime: newExpiryTime,
            enable: true,
            tgId: `@${username}`,
            subId: resolvedSubId,
            reset: 0
          }
        ]
      })
    };

    console.log(`[XUI] Extending VPN client ${uuid} by ${extraDays} days`);

    const result = await this.request(`/panel/api/inbounds/updateClient/${uuid}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.success === false) {
      throw new Error(result.msg || 'x-ui rejected updateClient request');
    }

    return {
      username,
      uuid,
      email: resolvedEmail,
      subId: resolvedSubId,
      expiryTime: newExpiryTime,
      expiresAt: new Date(newExpiryTime).toISOString(),
      subscriptionUrl: `${this.options.publicUrl}/sub/${resolvedSubId}`
    };
  }

  async removeVpnClient(uuid) {
    console.log(`[XUI] Deleting VPN client ${uuid}`);
    
    const payload = {
      id: this.options.inboundId,
      settings: JSON.stringify({
        clients: [{ id: uuid }]
      })
    };

    const result = await this.request('/panel/api/inbounds/delClient', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.success === false) {
      throw new Error(result.msg || 'x-ui rejected delClient request');
    }

    return true;
  }

  async getInbounds() {
    console.log(`[XUI] Getting inbounds list`);
    
    const result = await this.request('/panel/api/inbounds/list');
    
    if (result.success === false) {
      throw new Error(result.msg || 'x-ui rejected inbounds list request');
    }

    console.log(`[XUI] Available inbounds:`, JSON.stringify(result.obj, null, 2));
    return result.obj;
  }
}

export const xuiClient = new XuiClient();

// Экспортируем функции для использования в server.js
export async function createXuiClient({ username, days }) {
  return xuiClient.addVpnClient({ username, days });
}

export async function extendXuiClient({ uuid, username, extraDays, currentExpiryTime, email, subId }) {
  return xuiClient.extendVpnClient({ uuid, username, extraDays, currentExpiryTime, email, subId });
}

export async function removeXuiClient(clientId) {
  return xuiClient.removeVpnClient(clientId);
}

export async function getXuiInbounds() {
  return xuiClient.getInbounds();
}
