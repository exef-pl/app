import express from 'express';
import helmet from 'helmet';
import 'dotenv/config';

import { createKsefFacade } from '../core/ksefFacade.js';

const app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

const ksef = createKsefFacade({});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'exef-local-service' });
});

app.post('/ksef/auth/token', async (req, res) => {
  try {
    const result = await ksef.authenticateWithKsefToken(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' });
  }
});

const port = Number(process.env.LOCAL_SERVICE_PORT ?? 3030);
const host = process.env.LOCAL_SERVICE_HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  process.stdout.write(`exef-local-service listening on http://${host}:${port}\n`);
});
