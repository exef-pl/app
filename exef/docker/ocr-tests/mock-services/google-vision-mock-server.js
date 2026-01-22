const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))

const PORT = process.env.PORT || 8095

let last = null

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'google-vision-mock-api' })
})

app.get('/admin/last', (_req, res) => {
  res.json({ last })
})

app.post('/v1/images:annotate', (req, res) => {
  const key = req.query && Object.prototype.hasOwnProperty.call(req.query, 'key') ? String(req.query.key) : null
  const payload = req.body && typeof req.body === 'object' ? req.body : {}
  const requests = Array.isArray(payload.requests) ? payload.requests : []

  const first = requests[0] && typeof requests[0] === 'object' ? requests[0] : null
  const contentB64 = first?.image?.content ? String(first.image.content) : ''

  let decodedLen = 0
  if (contentB64) {
    try {
      decodedLen = Buffer.from(contentB64, 'base64').length
    } catch (_e) {
      decodedLen = 0
    }
  }

  last = {
    ts: new Date().toISOString(),
    key,
    base64Length: contentB64.length,
    decodedBytesLength: decodedLen,
  }

  const text = String(process.env.MOCK_TEXT || '').trim()

  res.json({
    responses: [
      {
        fullTextAnnotation: { text },
        textAnnotations: text ? [{ description: text }] : [],
      },
    ],
  })
})

app.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`mock-google-vision listening on http://0.0.0.0:${PORT}\n`)
})
