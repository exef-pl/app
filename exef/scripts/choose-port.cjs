const net = require('node:net')

function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))

    server.listen(port, host)
  })
}

async function main() {
  const host = process.env.EXEF_WEB_HOST || '0.0.0.0'
  const preferred = Number(process.argv[2] || process.env.EXEF_WEB_PORT || 3000)
  const internal = Number(process.argv[3] || process.env.EXEF_WEB_INTERNAL_PORT || 3000)
  const maxTries = Number(process.argv[4] || process.env.EXEF_WEB_PORT_MAX_TRIES || 50)

  const start = Number.isNaN(preferred) ? 3000 : preferred
  const tries = Number.isNaN(maxTries) ? 50 : maxTries

  for (let i = 0; i < tries; i += 1) {
    const port = start + i
    if (port > 65535) {
      break
    }
    // Check binding on host port locally
    if (await canBind(host, port)) {
      process.stdout.write(`${port}:${internal}`)
      return
    }
  }

  // fallback to original mapping; docker may still fail but caller can handle
  process.stdout.write(`${start}:${internal}`)
}

main().catch((e) => {
  process.stderr.write(String(e && e.stack ? e.stack : e))
  process.exit(1)
})
