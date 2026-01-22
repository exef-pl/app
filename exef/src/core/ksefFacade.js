const {
  constants,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomUUID,
} = require('node:crypto');

const ENV_BASE_URLS = {
  test: 'https://api-test.ksef.mf.gov.pl',
  demo: 'https://api-demo.ksef.mf.gov.pl',
  production: 'https://api.ksef.mf.gov.pl',
};

class KsefFacade {
  constructor(options = {}) {
    this.environment = options.environment ?? process.env.KSEF_ENV ?? 'demo';
    this.baseURL =
      options.baseURL ??
      process.env.KSEF_BASE_URL ??
      ENV_BASE_URLS[this.environment] ??
      ENV_BASE_URLS.demo;
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
      environment: this.environment,
    };
  }

  async openOnlineSession({ accessToken, formCode } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }

    const requestBody = {
      formCode: formCode ?? {
        systemCode: 'FA (3)',
        schemaVersion: '1-0E',
        value: 'FA',
      },
      encryption: await this.resolveEncryptionInfo(accessToken),
    };

    return this.requestJson({
      method: 'POST',
      path: '/api/v2/sessions/online',
      accessToken,
      body: requestBody,
    });
  }

  async closeOnlineSession({ accessToken, sessionId, generateUpo } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }
    if (!sessionId) {
      throw new Error('Missing sessionId');
    }

    const requestBody = {
      sessionId,
      generateUpo: generateUpo ?? true,
    };

    const res = await this.requestRaw({
      method: 'POST',
      path: `/api/v2/sessions/online/${encodeURIComponent(sessionId)}/close`,
      accessToken,
      body: requestBody,
    });

    if (res.status === 204) {
      return {
        sessionId,
        status: 'closed',
        closedAt: new Date().toISOString(),
      };
    }

    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    if (!raw) {
      return {
        sessionId,
        status: 'closed',
        closedAt: new Date().toISOString(),
      };
    }
    if (contentType.includes('application/json')) {
      return JSON.parse(raw);
    }
    return raw;
  }

  async sendOnlineInvoice({ accessToken, sessionId, invoice, validateOnly } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }
    if (!sessionId) {
      throw new Error('Missing sessionId');
    }
    if (!invoice) {
      throw new Error('Missing invoice');
    }

    const requestBody = {
      sessionId,
      invoice,
      validateOnly: validateOnly ?? false,
    };

    return this.requestJson({
      method: 'POST',
      path: `/session/online/${encodeURIComponent(sessionId)}/invoice`,
      accessToken,
      body: requestBody,
    });
  }

  async queryInvoiceMetadata({ accessToken, query } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }

    return this.requestJson({
      method: 'POST',
      path: '/invoice/query',
      accessToken,
      body: query ?? {},
    });
  }

  async getInvoiceStatus({ accessToken, ksefReferenceNumber } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }
    if (!ksefReferenceNumber) {
      throw new Error('Missing ksefReferenceNumber');
    }

    return this.requestJson({
      method: 'GET',
      path: `/invoice/${encodeURIComponent(ksefReferenceNumber)}/status`,
      accessToken,
    });
  }

  async downloadInvoice({ accessToken, ksefReferenceNumber, format } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }
    if (!ksefReferenceNumber) {
      throw new Error('Missing ksefReferenceNumber');
    }

    const effectiveFormat = format ?? 'xml';
    const accept = effectiveFormat === 'pdf' ? 'application/pdf' : 'application/xml';

    const res = await this.requestRaw({
      method: 'GET',
      path: `/invoice/${encodeURIComponent(ksefReferenceNumber)}`,
      accessToken,
      headers: {
        Accept: accept,
      },
    });

    if (effectiveFormat === 'pdf') {
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        format: 'pdf',
        contentType: res.headers.get('content-type') ?? 'application/pdf',
        dataBase64: buffer.toString('base64'),
      };
    }

    const text = await res.text();
    return {
      format: 'xml',
      contentType: res.headers.get('content-type') ?? 'application/xml',
      data: text,
    };
  }

  async resolveEncryptionInfo(accessToken) {
    const res = await this.requestJson({
      method: 'GET',
      path: '/api/v2/security/public-key-certificates',
      accessToken,
    });

    if (!Array.isArray(res)) {
      return this.createFallbackEncryptionInfo();
    }

    const entry = res.find((e) => Array.isArray(e?.usage) && e.usage.includes('SymmetricKeyEncryption'));
    if (!entry?.certificate) {
      return this.createFallbackEncryptionInfo();
    }

    return this.createEncryptionInfoFromCertificate(entry.certificate);
  }

  createEncryptionInfoFromCertificate(certificateBase64) {
    const pem = this.wrapPem(certificateBase64);
    const publicKey = createPublicKey(pem);
    const symmetricKey = randomBytes(32);
    const iv = randomBytes(16);

    const encryptedKey = publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      symmetricKey
    );

    return {
      encryptedSymmetricKey: encryptedKey.toString('base64'),
      initializationVector: iv.toString('base64'),
    };
  }

  createFallbackEncryptionInfo() {
    return {
      encryptedSymmetricKey: randomBytes(32).toString('base64'),
      initializationVector: randomBytes(16).toString('base64'),
    };
  }

  wrapPem(certificateBase64) {
    const lines = certificateBase64.match(/.{1,64}/g) || [certificateBase64];
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  }

  async requestJson({ method, path, accessToken, body, headers } = {}) {
    const res = await this.requestRaw({ method, path, accessToken, body, headers });
    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text();

    if (!raw) {
      return null;
    }

    if (contentType.includes('application/json')) {
      return JSON.parse(raw);
    }

    return raw;
  }

  async requestRaw({ method, path, accessToken, body, headers } = {}) {
    const url = new URL(path, this.baseURL).toString();
    const effectiveHeaders = {
      ...(headers ?? {}),
    };

    if (accessToken) {
      effectiveHeaders.Authorization = effectiveHeaders.Authorization ?? `Bearer ${accessToken}`;
    }

    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      effectiveHeaders['Content-Type'] = effectiveHeaders['Content-Type'] ?? 'application/json';
    }

    const res = await fetch(url, {
      method: method ?? 'GET',
      headers: effectiveHeaders,
      body: payload,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KSeF request failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`);
    }

    return res;
  }

  async pollNewInvoices({ accessToken, since, until, subjectType } = {}) {
    if (!accessToken) {
      throw new Error('Missing accessToken');
    }

    if (process.env.NODE_ENV === 'test' || process.env.EXEF_KSEF_MOCK === 'true') {
      return [];
    }

    const dateFrom = since ? new Date(since).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dateTo = until ? new Date(until).toISOString() : null;

    const query = {
      queryCriteria: {
        subjectType: subjectType ?? 'subject2',
        type: 'incremental',
        acquisitionTimestampThresholdFrom: dateFrom,
      },
    };
    if (dateTo) {
      query.queryCriteria.acquisitionTimestampThresholdTo = dateTo;
    }

    const metadata = await this.queryInvoiceMetadata({
      accessToken,
      query,
    });

    if (!metadata || !metadata.invoices) {
      return [];
    }

    return metadata.invoices.map((inv) => ({
      source: 'ksef',
      ksefId: inv.ksefReferenceNumber || inv.invoiceReferenceNumber,
      ksefReferenceNumber: inv.ksefReferenceNumber,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.invoicingDate,
      contractorNip: inv.subjectTo?.issuedByIdentifier?.identifier,
      contractorName: inv.subjectTo?.issuedByName,
      grossAmount: inv.grossValue,
      currency: inv.currency || 'PLN',
      fetchedAt: new Date().toISOString(),
    }));
  }
}

function createKsefFacade(options) {
  return new KsefFacade(options);
}

module.exports = { KsefFacade, createKsefFacade };
