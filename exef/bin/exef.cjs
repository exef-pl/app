#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const VERSION = '0.1.0'
const DEFAULT_URL = process.env.EXEF_API_URL || 'http://127.0.0.1:3030'

const COMMANDS = {
  help: 'Wyświetl pomoc',
  version: 'Wyświetl wersję',
  health: 'Sprawdź status usługi',
  'inbox list': 'Lista faktur w skrzynce',
  'inbox stats': 'Statystyki skrzynki',
  'inbox add': 'Dodaj fakturę do skrzynki',
  'inbox get': 'Pobierz szczegóły faktury',
  'inbox process': 'Przetwórz fakturę (OCR + auto-opis)',
  'inbox approve': 'Zatwierdź fakturę',
  'inbox reject': 'Odrzuć fakturę',
  'inbox export': 'Eksportuj zatwierdzone faktury',
  'ksef auth': 'Autoryzacja tokenem KSeF',
  'ksef session open': 'Otwórz sesję online KSeF',
  'ksef session close': 'Zamknij sesję KSeF',
  'ksef poll': 'Pobierz nowe faktury z KSeF',
  'ksef send': 'Wyślij fakturę do KSeF',
  'ksef status': 'Sprawdź status faktury w KSeF',
  'ksef download': 'Pobierz fakturę z KSeF',
}

function printHelp() {
  console.log(`
exef - CLI do obsługi systemu faktur ExEF

UŻYCIE:
  exef <komenda> [opcje]

KOMENDY:
${Object.entries(COMMANDS).map(([cmd, desc]) => `  ${cmd.padEnd(22)} ${desc}`).join('\n')}

OPCJE GLOBALNE:
  --url <url>           URL API (domyślnie: ${DEFAULT_URL})
  --json                Wynik w formacie JSON
  --quiet, -q           Tryb cichy (tylko dane)
  --help, -h            Pomoc dla komendy

PRZYKŁADY:
  exef health
  exef inbox list
  exef inbox list --status pending
  exef inbox add --file faktura.pdf --source scanner
  exef inbox process <id>
  exef inbox approve <id> --category hosting --mpk IT-001
  exef inbox export --format csv --output faktury.csv
  exef ksef auth --token <token> --nip <nip>
  exef ksef poll --since 2026-01-01

ZMIENNE ŚRODOWISKOWE:
  EXEF_API_URL          URL API (alternatywa dla --url)
  EXEF_OUTPUT_FORMAT    Format wyjścia: json|text (domyślnie: text)

Więcej informacji: https://github.com/exef-pl/app
`)
}

function printVersion() {
  console.log(`exef version ${VERSION}`)
}

async function request(method, endpoint, options = {}) {
  const url = options.baseUrl || DEFAULT_URL
  const fullUrl = `${url}${endpoint}`

  const fetchOptions = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  try {
    const res = await fetch(fullUrl, fetchOptions)
    const contentType = res.headers.get('content-type') || ''

    let data
    if (contentType.includes('application/json')) {
      data = await res.json()
    } else {
      data = await res.text()
    }

    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

function parseArgs(args) {
  const result = { _: [], options: {} }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]

      if (next && !next.startsWith('-')) {
        result.options[key] = next
        i++
      } else {
        result.options[key] = true
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1)
      result.options[key] = true
    } else {
      result._.push(arg)
    }
  }

  return result
}

function output(data, options = {}) {
  const format = options.json || process.env.EXEF_OUTPUT_FORMAT === 'json' ? 'json' : 'text'

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2))
  } else if (typeof data === 'string') {
    console.log(data)
  } else if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('(brak wyników)')
    } else {
      console.table(data)
    }
  } else if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      console.log(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    }
  }
}

function error(msg, options = {}) {
  if (!options.quiet && !options.q) {
    console.error(`Błąd: ${msg}`)
  }
  process.exit(1)
}

async function cmdHealth(args, options) {
  const res = await request('GET', '/health', { baseUrl: options.url })
  if (!res.ok) {
    error(`Usługa niedostępna: ${res.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdInboxStats(args, options) {
  const res = await request('GET', '/inbox/stats', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania statystyk: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdInboxList(args, options) {
  let endpoint = '/inbox/invoices'
  const params = []

  if (options.status) params.push(`status=${options.status}`)
  if (options.source) params.push(`source=${options.source}`)
  if (options.since) params.push(`since=${options.since}`)

  if (params.length > 0) {
    endpoint += '?' + params.join('&')
  }

  const res = await request('GET', endpoint, { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania faktur: ${res.data?.error || res.status}`, options)
  }

  if (options.json) {
    output(res.data, options)
  } else {
    const invoices = res.data.invoices || []
    if (invoices.length === 0) {
      console.log('Brak faktur w skrzynce.')
    } else {
      const rows = invoices.map(inv => ({
        ID: inv.id.slice(0, 8) + '...',
        Numer: inv.invoiceNumber || '-',
        Kontrahent: (inv.contractorName || inv.sellerName || '-').slice(0, 20),
        Kwota: inv.grossAmount ? `${inv.grossAmount} ${inv.currency || 'PLN'}` : '-',
        Status: inv.status,
        Źródło: inv.source,
      }))
      console.table(rows)
      console.log(`\nRazem: ${invoices.length} faktur`)
    }
  }
}

async function cmdInboxGet(args, options) {
  const id = args[0]
  if (!id) {
    error('Podaj ID faktury: exef inbox get <id>', options)
  }

  const res = await request('GET', `/inbox/invoices/${id}`, { baseUrl: options.url })
  if (!res.ok) {
    error(`Faktura nie znaleziona: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdInboxAdd(args, options) {
  const body = {
    source: options.source || 'scanner',
    metadata: {},
  }

  if (options.file) {
    const filePath = path.resolve(options.file)
    if (!fs.existsSync(filePath)) {
      error(`Plik nie istnieje: ${filePath}`, options)
    }
    const content = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()

    body.metadata.fileName = path.basename(filePath)

    if (ext === '.xml') {
      body.source = options.source || 'ksef'
      body.file = content.toString('utf8')
      body.metadata.fileType = 'application/xml'
    } else if (ext === '.json') {
      const jsonData = JSON.parse(content.toString('utf8'))
      body.metadata = { ...body.metadata, ...jsonData }
    } else {
      body.file = content.toString('base64')
      body.metadata.fileType = ext === '.pdf' ? 'application/pdf' : 'image/jpeg'
    }
  }

  if (options.nip) body.metadata.contractorNip = options.nip
  if (options.name) body.metadata.contractorName = options.name
  if (options.amount) body.metadata.grossAmount = parseFloat(options.amount)
  if (options.number) body.metadata.invoiceNumber = options.number
  if (options.date) body.metadata.issueDate = options.date

  const res = await request('POST', '/inbox/invoices', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd dodawania faktury: ${res.data?.error || res.status}`, options)
  }

  if (!options.quiet && !options.q) {
    console.log(`Faktura dodana: ${res.data.id}`)
  }
  if (options.json) {
    output(res.data, options)
  }
}

async function cmdInboxProcess(args, options) {
  const id = args[0]
  if (!id) {
    error('Podaj ID faktury: exef inbox process <id>', options)
  }

  const res = await request('POST', `/inbox/invoices/${id}/process`, { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd przetwarzania: ${res.data?.error || res.status}`, options)
  }

  if (!options.quiet && !options.q) {
    console.log(`Faktura przetworzona: ${id}`)
    console.log(`Status: ${res.data.status}`)
    if (res.data.suggestion?.category) {
      console.log(`Sugestia: ${res.data.suggestion.category} (${res.data.suggestion.confidence}%)`)
    }
  }
  if (options.json) {
    output(res.data, options)
  }
}

async function cmdInboxApprove(args, options) {
  const id = args[0]
  if (!id) {
    error('Podaj ID faktury: exef inbox approve <id>', options)
  }

  const body = {}
  if (options.category) body.category = options.category
  if (options.mpk) body.mpk = options.mpk
  if (options.description) body.description = options.description

  const res = await request('POST', `/inbox/invoices/${id}/approve`, { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd zatwierdzania: ${res.data?.error || res.status}`, options)
  }

  if (!options.quiet && !options.q) {
    console.log(`Faktura zatwierdzona: ${id}`)
  }
  if (options.json) {
    output(res.data, options)
  }
}

async function cmdInboxReject(args, options) {
  const id = args[0]
  if (!id) {
    error('Podaj ID faktury: exef inbox reject <id>', options)
  }

  const body = { reason: options.reason || args[1] || 'Odrzucono przez użytkownika' }

  const res = await request('POST', `/inbox/invoices/${id}/reject`, { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd odrzucania: ${res.data?.error || res.status}`, options)
  }

  if (!options.quiet && !options.q) {
    console.log(`Faktura odrzucona: ${id}`)
  }
  if (options.json) {
    output(res.data, options)
  }
}

async function cmdInboxExport(args, options) {
  const body = {
    format: options.format || 'csv',
    options: {},
  }

  if (options.output) {
    body.options.filePath = path.resolve(options.output)
  }

  const res = await request('POST', '/inbox/export', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd eksportu: ${res.data?.error || res.status}`, options)
  }

  if (res.data.content && options.output) {
    fs.writeFileSync(options.output, res.data.content, 'utf8')
    console.log(`Wyeksportowano do: ${options.output}`)
  } else if (res.data.content) {
    console.log(res.data.content)
  } else {
    output(res.data, options)
  }
}

async function cmdKsefAuth(args, options) {
  if (!options.token || !options.nip) {
    error('Wymagane opcje: --token <token> --nip <nip>', options)
  }

  const body = { token: options.token, nip: options.nip }
  const res = await request('POST', '/ksef/auth/token', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd autoryzacji: ${res.data?.error || res.status}`, options)
  }

  if (!options.quiet && !options.q) {
    console.log('Autoryzacja pomyślna')
    console.log(`Token ważny do: ${res.data.expiresAt}`)
  }
  if (options.json) {
    output(res.data, options)
  }
}

async function cmdKsefSessionOpen(args, options) {
  const body = {}
  if (options.token) body.accessToken = options.token

  const res = await request('POST', '/ksef/sessions/online/open', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd otwierania sesji: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdKsefSessionClose(args, options) {
  const body = {}
  if (options.session) body.sessionId = options.session

  const res = await request('POST', '/ksef/sessions/online/close', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd zamykania sesji: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdKsefPoll(args, options) {
  const body = {}
  if (options.token) body.accessToken = options.token
  if (options.since) body.since = options.since

  const res = await request('POST', '/inbox/ksef/poll', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd pobierania faktur: ${res.data?.error || res.status}`, options)
  }

  if (!options.quiet && !options.q) {
    console.log(`Pobrano ${res.data.added} nowych faktur z KSeF`)
  }
  if (options.json) {
    output(res.data, options)
  }
}

async function cmdKsefSend(args, options) {
  if (!options.file) {
    error('Wymagana opcja: --file <ścieżka do XML>', options)
  }

  const filePath = path.resolve(options.file)
  if (!fs.existsSync(filePath)) {
    error(`Plik nie istnieje: ${filePath}`, options)
  }

  const xml = fs.readFileSync(filePath, 'utf8')
  const body = { invoiceXml: xml }
  if (options.session) body.sessionId = options.session

  const res = await request('POST', '/ksef/sessions/online/send', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd wysyłania: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdKsefStatus(args, options) {
  const ref = args[0] || options.ref
  if (!ref) {
    error('Podaj numer referencyjny: exef ksef status <ref>', options)
  }

  const body = { invoiceReference: ref }
  const res = await request('POST', '/ksef/invoices/status', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd pobierania statusu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdKsefDownload(args, options) {
  const ksefNumber = args[0] || options.ksef
  if (!ksefNumber) {
    error('Podaj numer KSeF: exef ksef download <numer>', options)
  }

  const body = { ksefReferenceNumber: ksefNumber }
  const res = await request('POST', '/ksef/invoices/download', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd pobierania: ${res.data?.error || res.status}`, options)
  }

  if (options.output && res.data.invoiceXml) {
    fs.writeFileSync(options.output, res.data.invoiceXml, 'utf8')
    console.log(`Zapisano do: ${options.output}`)
  } else {
    output(res.data, options)
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    return
  }

  if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
    printVersion()
    return
  }

  const parsed = parseArgs(args)
  const cmd = parsed._[0]
  const subcmd = parsed._[1]
  const restArgs = parsed._.slice(2)
  const options = parsed.options

  try {
    if (cmd === 'health') {
      await cmdHealth(restArgs, options)
    } else if (cmd === 'inbox') {
      if (subcmd === 'list' || !subcmd) {
        await cmdInboxList(restArgs, options)
      } else if (subcmd === 'stats') {
        await cmdInboxStats(restArgs, options)
      } else if (subcmd === 'get') {
        await cmdInboxGet(restArgs, options)
      } else if (subcmd === 'add') {
        await cmdInboxAdd(restArgs, options)
      } else if (subcmd === 'process') {
        await cmdInboxProcess(restArgs, options)
      } else if (subcmd === 'approve') {
        await cmdInboxApprove(restArgs, options)
      } else if (subcmd === 'reject') {
        await cmdInboxReject(restArgs, options)
      } else if (subcmd === 'export') {
        await cmdInboxExport(restArgs, options)
      } else {
        error(`Nieznana podkomenda inbox: ${subcmd}. Użyj: exef inbox --help`)
      }
    } else if (cmd === 'ksef') {
      if (subcmd === 'auth') {
        await cmdKsefAuth(restArgs, options)
      } else if (subcmd === 'session') {
        const action = restArgs[0]
        if (action === 'open') {
          await cmdKsefSessionOpen(restArgs.slice(1), options)
        } else if (action === 'close') {
          await cmdKsefSessionClose(restArgs.slice(1), options)
        } else {
          error('Użyj: exef ksef session open|close')
        }
      } else if (subcmd === 'poll') {
        await cmdKsefPoll(restArgs, options)
      } else if (subcmd === 'send') {
        await cmdKsefSend(restArgs, options)
      } else if (subcmd === 'status') {
        await cmdKsefStatus(restArgs, options)
      } else if (subcmd === 'download') {
        await cmdKsefDownload(restArgs, options)
      } else {
        error(`Nieznana podkomenda ksef: ${subcmd}. Użyj: exef ksef --help`)
      }
    } else {
      error(`Nieznana komenda: ${cmd}. Użyj: exef help`)
    }
  } catch (e) {
    error(e.message, options)
  }
}

main()
