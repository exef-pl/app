const { contextBridge } = require('electron');
const fs = require('node:fs')
const dotenv = require('dotenv')

const envFile = process.env.EXEF_ENV_FILE || (
  process.env.NODE_ENV === 'test' && fs.existsSync('.env.test') ? '.env.test' : null
)
dotenv.config(envFile ? { path: envFile } : {})

function readPortFile(filePath) {
  if (!filePath) {
    return null
  }
  try {
    const raw = fs.readFileSync(filePath, { encoding: 'utf8' }).trim()
    const port = Number(raw)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return null
    }
    return port
  } catch (_e) {
    return null
  }
}

function resolveLocalServiceBaseUrl() {
  const override = process.env.EXEF_DESKTOP_LOCAL_SERVICE_BASE_URL
  if (override) {
    return override
  }

  const host = process.env.EXEF_LOCAL_SERVICE_HOST ?? process.env.LOCAL_SERVICE_HOST ?? '127.0.0.1'
  const preferredPort = Number(process.env.EXEF_LOCAL_SERVICE_PORT ?? process.env.LOCAL_SERVICE_PORT ?? 3030)
  const portFile = process.env.EXEF_LOCAL_SERVICE_PORT_FILE ?? '/run/exef/exef-local-service.port'
  const discoveredPort = readPortFile(portFile)
  const port = discoveredPort ?? (Number.isNaN(preferredPort) ? 3030 : preferredPort)
  return `http://${host}:${port}`
}

contextBridge.exposeInMainWorld('exef', {
  localServiceBaseUrl: resolveLocalServiceBaseUrl(),
});
