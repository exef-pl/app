const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const app = express()
app.use(helmet({ crossOriginEmbedderPolicy: false }))
app.use(cors())
app.use(express.json({ limit: '50mb' }))

function normalizeFileBuffer(value) {
  if (!value) return null

  if (Buffer.isBuffer(value)) return value

  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data)
  }

  const s = String(value).trim()
  if (!s) return null

  const dataUrlMatch = s.match(/^data:([^;]+);base64,(.*)$/i)
  if (dataUrlMatch) {
    return Buffer.from(dataUrlMatch[2], 'base64')
  }

  const base64Candidate = s.replace(/\s/g, '')
  const looksBase64 =
    base64Candidate.length >= 8 &&
    base64Candidate.length % 4 === 0 &&
    /^[a-z0-9+/]+=*$/i.test(base64Candidate)

  if (looksBase64) {
    return Buffer.from(base64Candidate, 'base64')
  }

  return Buffer.from(s, 'utf8')
}

function inferExtension(fileType) {
  const ft = String(fileType || '').toLowerCase()
  if (ft.includes('pdf')) return '.pdf'
  if (ft.includes('png')) return '.png'
  if (ft.includes('jpeg') || ft.includes('jpg')) return '.jpg'
  if (ft.includes('tiff') || ft.includes('tif')) return '.tif'
  return '.bin'
}

function isPdf({ fileType, fileName } = {}) {
  const ft = String(fileType || '').toLowerCase()
  const fn = String(fileName || '').toLowerCase()
  return ft.includes('pdf') || fn.endsWith('.pdf')
}

function spawnCapture(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    let killed = false

    const t = setTimeout(() => {
      killed = true
      try {
        child.kill('SIGKILL')
      } catch (_e) {
      }
    }, Math.max(1000, Number(timeoutMs) || 60000))

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })

    child.on('error', (err) => {
      clearTimeout(t)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(t)
      resolve({ stdout, stderr, exitCode: killed ? null : code })
    })
  })
}

async function runTesseract({ fileBuffer, fileType, tesseractBin, lang, psm, oem, timeoutMs }) {
  const ext = inferExtension(fileType)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'exef-pro-ocr-'))
  const inputPath = path.join(dir, `input${ext}`)

  try {
    await fs.writeFile(inputPath, fileBuffer)

    const args = [
      inputPath,
      'stdout',
      '-l',
      String(lang || 'pol'),
      '--psm',
      String(psm ?? 3),
      '--oem',
      String(oem ?? 1),
    ]

    const { stdout, stderr, exitCode } = await spawnCapture(tesseractBin, args, timeoutMs)
    if (exitCode !== 0) {
      const hint = exitCode === null ? ' (timeout)' : ''
      const msg = (stderr || '').trim()
      throw new Error(`Tesseract OCR failed${hint}${msg ? `: ${msg}` : ''}`)
    }

    return { text: (stdout || '').trim(), confidence: null }
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      throw new Error('Tesseract binary not found. Install `tesseract-ocr` and ensure `tesseract` is on PATH.')
    }
    throw e
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

async function runPdfFallback({ pdfBuffer, pdftoppmBin, dpi, timeoutMs, maxPages, tesseractArgs }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'exef-pro-pdf-'))
  const inputPdf = path.join(dir, 'input.pdf')
  const outPrefix = path.join(dir, 'page')

  try {
    await fs.writeFile(inputPdf, pdfBuffer)

    const args = ['-png', '-r', String(dpi ?? 200), inputPdf, outPrefix]
    const { stderr, exitCode } = await spawnCapture(pdftoppmBin, args, timeoutMs)
    if (exitCode !== 0) {
      const msg = (stderr || '').trim()
      throw new Error(`PDF conversion failed${msg ? `: ${msg}` : ''}`)
    }

    const entries = await fs.readdir(dir)
    const pages = entries
      .filter((n) => n.startsWith('page-') && n.toLowerCase().endsWith('.png'))
      .sort((a, b) => {
        const na = Number((a.match(/page-(\d+)/) || [])[1] || 0)
        const nb = Number((b.match(/page-(\d+)/) || [])[1] || 0)
        return na - nb
      })

    if (!pages.length) {
      throw new Error('PDF conversion produced no pages')
    }

    const limited = pages.slice(0, Math.max(1, Number(maxPages) || 30))
    const texts = []

    for (const p of limited) {
      const buf = await fs.readFile(path.join(dir, p))
      const pageRes = await runTesseract({
        fileBuffer: buf,
        fileType: 'image/png',
        ...tesseractArgs,
      })
      if (pageRes?.text) texts.push(pageRes.text)
    }

    return { text: texts.join('\n').trim(), confidence: null, pages: limited.length }
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      throw new Error('PDF conversion tool not found. Install `poppler-utils` (pdftoppm) or configure a supported PDF renderer.')
    }
    throw e
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'exef-pro' })
})

app.post('/ocr', async (req, res) => {
  try {
    const fileType = req.body?.fileType || null
    const fileName = req.body?.fileName || null
    const fileBuffer = normalizeFileBuffer(req.body?.base64)

    if (!fileBuffer) {
      return res.status(400).json({ error: 'base64_required' })
    }

    const tesseractBin = process.env.EXEF_PRO_TESSERACT_BIN || 'tesseract'
    const lang = process.env.EXEF_PRO_TESSERACT_LANG || 'pol'
    const psm = process.env.EXEF_PRO_TESSERACT_PSM ? Number(process.env.EXEF_PRO_TESSERACT_PSM) : 3
    const oem = process.env.EXEF_PRO_TESSERACT_OEM ? Number(process.env.EXEF_PRO_TESSERACT_OEM) : 1
    const tesseractTimeoutMs = process.env.EXEF_PRO_TESSERACT_TIMEOUT_MS ? Number(process.env.EXEF_PRO_TESSERACT_TIMEOUT_MS) : 60000

    const pdftoppmBin = process.env.EXEF_PRO_PDFTOPPM_BIN || 'pdftoppm'
    const pdfDpi = process.env.EXEF_PRO_PDF_DPI ? Number(process.env.EXEF_PRO_PDF_DPI) : 200
    const pdfTimeoutMs = process.env.EXEF_PRO_PDF_TIMEOUT_MS ? Number(process.env.EXEF_PRO_PDF_TIMEOUT_MS) : 120000
    const pdfMaxPages = process.env.EXEF_PRO_PDF_MAX_PAGES ? Number(process.env.EXEF_PRO_PDF_MAX_PAGES) : 30

    let result

    if (isPdf({ fileType, fileName })) {
      try {
        result = await runTesseract({
          fileBuffer,
          fileType: fileType || 'application/pdf',
          tesseractBin,
          lang,
          psm,
          oem,
          timeoutMs: tesseractTimeoutMs,
        })
      } catch (_e) {
        result = await runPdfFallback({
          pdfBuffer: fileBuffer,
          pdftoppmBin,
          dpi: pdfDpi,
          timeoutMs: pdfTimeoutMs,
          maxPages: pdfMaxPages,
          tesseractArgs: {
            tesseractBin,
            lang,
            psm,
            oem,
            timeoutMs: tesseractTimeoutMs,
          },
        })
      }
    } else {
      result = await runTesseract({
        fileBuffer,
        fileType,
        tesseractBin,
        lang,
        psm,
        oem,
        timeoutMs: tesseractTimeoutMs,
      })
    }

    res.json({ text: result.text || '', confidence: result.confidence ?? null, pages: result.pages ?? null })
  } catch (err) {
    res.status(400).json({ error: err?.message || String(err) })
  }
})

const port = process.env.PORT ? Number(process.env.PORT) : 8095
const host = process.env.HOST || '127.0.0.1'
app.listen(port, host, () => {
  console.log(`exef-pro listening on http://${host}:${port}`)
})
