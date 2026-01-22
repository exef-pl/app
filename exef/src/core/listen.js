const net = require('node:net')

function isPortNumber(value) {
  return Number.isInteger(value) && value >= 0 && value <= 65535
}

function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, host)
  })
}

async function findAvailablePort({ host, preferredPort, maxTries, step }) {
  if (!isPortNumber(preferredPort)) {
    throw new Error('Invalid preferredPort')
  }

  if (preferredPort === 0) {
    return 0
  }

  const tries = Number.isInteger(maxTries) && maxTries > 0 ? maxTries : 50
  const portStep = Number.isInteger(step) && step > 0 ? step : 1

  for (let i = 0; i < tries; i += 1) {
    const port = preferredPort + i * portStep
    if (port > 65535) {
      break
    }
    if (await canBind(host, port)) {
      return port
    }
  }

  return 0
}

async function listenWithFallback(app, { host, port, maxTries, step, allowRandom } = {}) {
  const effectiveHost = host ?? '0.0.0.0'
  const preferredPort = Number(port ?? 0)
  const resolvedPort = await findAvailablePort({
    host: effectiveHost,
    preferredPort: Number.isNaN(preferredPort) ? 0 : preferredPort,
    maxTries,
    step,
  })

  const shouldAllowRandom = allowRandom === true
  if (preferredPort !== 0 && resolvedPort === 0 && !shouldAllowRandom) {
    throw new Error('No available port found within maxTries')
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(resolvedPort === 0 && shouldAllowRandom ? 0 : resolvedPort, effectiveHost, () => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : resolvedPort
      resolve({ server, host: effectiveHost, port: actualPort })
    })

    server.on('error', (err) => reject(err))
  })
}

module.exports = { listenWithFallback }
