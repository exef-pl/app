import { randomUUID } from 'node:crypto';

export class KsefFacade {
  constructor(options = {}) {
    this.environment = options.environment ?? process.env.KSEF_ENV ?? 'demo';
  }

  async authenticateWithKsefToken({ token, nip } = {}) {
    if (!token) {
      throw new Error('Missing token');
    }
    if (!nip) {
      throw new Error('Missing nip');
    }

    return {
      accessToken: `stub-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      environment: this.environment
    };
  }

  async openOnlineSession({ accessToken } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }

    return {
      sessionId: randomUUID(),
      openedAt: new Date().toISOString()
    };
  }

  async sendOnlineInvoice({ accessToken, sessionId, invoiceXml } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }
    if (!sessionId) {
      throw new Error('Missing sessionId');
    }
    if (!invoiceXml) {
      throw new Error('Missing invoiceXml');
    }

    return {
      invoiceReference: randomUUID(),
      status: 'accepted_stub'
    };
  }

  async queryInvoiceMetadata({ accessToken, query } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }

    return {
      query: query ?? {},
      items: [],
      total: 0
    };
  }
}

export function createKsefFacade(options) {
  return new KsefFacade(options);
}
