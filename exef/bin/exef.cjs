#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const VERSION = '0.1.15'
const DEFAULT_URL = process.env.EXEF_API_URL || 'http://127.0.0.1:3030'

const COMMANDS = {
  help: 'Wyświetl pomoc',
  version: 'Wyświetl wersję',
  health: 'Sprawdź status usługi',
  status: 'Podsumowanie stanu (health + stats + settings)',
  'data export': 'Eksport całej bazy danych (JSON bundle; SQLite backend)',
  'data import': 'Import całej bazy danych (JSON bundle; SQLite backend)',
  'data export-entity': 'Eksport encji (projects/labels/expense-types/invoices/contractors/settings)',
  'data import-entity': 'Import encji (projects/labels/expense-types/invoices/contractors/settings)',
  'db export': 'Eksport pliku SQLite (SQLite backend)',
  'db import': 'Import pliku SQLite (SQLite backend)',
  'contractors list': 'Lista kontrahentów (SQLite backend)',
  'inbox list': 'Lista faktur w skrzynce',
  'inbox stats': 'Statystyki skrzynki',
  'inbox add': 'Dodaj fakturę do skrzynki',
  'inbox get': 'Pobierz szczegóły faktury',
  'inbox process': 'Przetwórz fakturę (OCR + auto-opis)',
  'inbox approve': 'Zatwierdź fakturę',
  'inbox reject': 'Odrzuć fakturę',
  'inbox export': 'Eksportuj zatwierdzone faktury',
  'inbox export-files': 'Eksportuj pliki faktur do folderów: [typ wydatku]/[projekt]/[dokument]',
  'inbox assign': 'Przypisz projekt/typ/etykiety do faktury',
  'projects list': 'Lista projektów',
  'projects add': 'Dodaj projekt',
  'projects update': 'Aktualizuj projekt',
  'projects delete': 'Usuń projekt',
  'labels list': 'Lista etykiet',
  'labels add': 'Dodaj etykietę',
  'labels update': 'Aktualizuj etykietę',
  'labels delete': 'Usuń etykietę',
  'expense-types list': 'Lista typów wydatków',
  'expense-types add': 'Dodaj typ wydatku',
  'expense-types update': 'Aktualizuj typ wydatku',
  'expense-types delete': 'Usuń typ wydatku',
  'settings get': 'Pobierz konfigurację',
  'settings set': 'Zapisz konfigurację z pliku JSON',
  'settings set-ui': 'Ustaw preferencje UI (tabela: select/radio)',
  'ui theme get': 'Pobierz motyw UI (white/dark/warm)',
  'ui theme set': 'Ustaw motyw UI (white/dark/warm)',
  'ui contrast': 'Uruchom tester kontrastu (WCAG) na podanej palecie kolorów',
  'ksef auth': 'Autoryzacja tokenem KSeF',
  'ksef session open': 'Otwórz sesję online KSeF',
  'ksef session close': 'Zamknij sesję KSeF',
  'ksef poll': 'Pobierz nowe faktury z KSeF',
  'ksef send': 'Wyślij fakturę do KSeF',
  'ksef status': 'Sprawdź status faktury w KSeF',
  'ksef download': 'Pobierz fakturę z KSeF',
}

async function requestBinary(endpoint, options = {}) {
  const url = options.baseUrl || DEFAULT_URL
  const fullUrl = `${url}${endpoint}`
  try {
    const res = await fetch(fullUrl)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: txt || String(res.status) }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: true, status: res.status, data: buf }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
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
  exef status
  exef inbox list
  exef inbox list --status pending
  exef inbox add --file faktura.pdf --source scanner
  exef inbox assign <id> --project P-001 --expense-type T-01 --labels L-01,L-02
  exef inbox process <id>
  exef inbox approve <id> --category hosting --mpk IT-001
  exef inbox export --format csv --output faktury.csv
  exef projects list
  exef labels list
  exef settings get
  exef settings set-ui --project-selection select --expense-type-selection select
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

function parseCsv(value) {
  if (!value) {
    return []
  }
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

async function cmdStatus(args, options) {
  const baseUrl = options.url

  const health = await request('GET', '/health', { baseUrl })
  if (!health.ok) {
    error(`Usługa niedostępna: ${health.error || health.status}`, options)
  }

  const stats = await request('GET', '/inbox/stats', { baseUrl })
  const settings = await request('GET', '/settings', { baseUrl })

  if (options.json) {
    output({ health: health.data, stats: stats.data, settings: settings.data }, options)
    return
  }

  console.log(`Service: ${health.data?.service || 'exef'} (${health.data?.status || 'unknown'})`)
  if (stats.ok) {
    console.log(`Invoices total: ${stats.data?.total || 0}`)
    console.log(`By status: ${JSON.stringify(stats.data?.byStatus || {})}`)
    console.log(`By source: ${JSON.stringify(stats.data?.bySource || {})}`)
  }
  if (settings.ok) {
    const paths = settings.data?.channels?.localFolders?.paths || []
    console.log(`Watch paths: ${paths.length ? paths.join(', ') : '(brak)'}`)
    const ui = settings.data?.ui?.invoicesTable || {}
    console.log(`UI invoices table: project=${ui.projectSelection || 'select'} expenseType=${ui.expenseTypeSelection || 'select'}`)
  }
}

async function cmdHealth(args, options) {
  const res = await request('GET', '/health', { baseUrl: options.url })
  if (!res.ok) {
    error(`Usługa niedostępna: ${res.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdUiThemeGet(_args, options) {
  const res = await request('GET', '/ui/theme', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania motywu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdUiThemeSet(_args, options) {
  const theme = options.theme || options.t
  if (!theme) {
    error('Użyj: exef ui theme set --theme white|dark|warm', options)
  }

  const res = await request('PUT', '/ui/theme', { baseUrl: options.url, body: { theme } })
  if (!res.ok) {
    error(`Błąd ustawiania motywu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdUiContrast(_args, options) {
  const paletteFile = options.palette || options.p
  if (!paletteFile) {
    error('Użyj: exef ui contrast --palette <plik.json>', options)
  }
  const abs = path.resolve(process.cwd(), paletteFile)
  if (!fs.existsSync(abs)) {
    error(`Nie znaleziono pliku: ${abs}`, options)
  }
  const raw = fs.readFileSync(abs, 'utf8')
  const parsed = JSON.parse(raw)
  const palette = parsed.palette || parsed

  const res = await request('POST', '/ui/contrast/report', { baseUrl: options.url, body: { palette } })
  if (!res.ok) {
    error(`Błąd testu kontrastu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdDataExport(_args, options) {
  const res = await request('GET', '/data/export', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd eksportu: ${res.data?.error || res.status}`, options)
  }

  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), JSON.stringify(res.data, null, 2), 'utf8')
    if (!options.quiet && !options.q) {
      console.log(`Wyeksportowano do: ${options.output}`)
    }
    return
  }

  output(res.data, options)
}

async function cmdDataImport(args, options) {
  const file = options.file || options.input || args[0]
  if (!file) {
    error('Użyj: exef data import --file <exef-data.json>', options)
  }
  const filePath = path.resolve(file)
  if (!fs.existsSync(filePath)) {
    error(`Plik nie istnieje: ${filePath}`, options)
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const res = await request('POST', '/data/import', { baseUrl: options.url, body: parsed })
  if (!res.ok) {
    error(`Błąd importu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdDataExportEntity(args, options) {
  const entity = options.entity || args[0]
  if (!entity) {
    error('Użyj: exef data export-entity <projects|labels|expense-types|invoices|contractors|settings> [--output plik.json]', options)
  }
  const res = await request('GET', `/data/export/${entity}`, { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd eksportu encji: ${res.data?.error || res.status}`, options)
  }
  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), JSON.stringify(res.data, null, 2), 'utf8')
    if (!options.quiet && !options.q) {
      console.log(`Wyeksportowano do: ${options.output}`)
    }
    return
  }
  output(res.data, options)
}

async function cmdDataImportEntity(args, options) {
  const entity = options.entity || args[0]
  const file = options.file || options.input || args[1]
  if (!entity || !file) {
    error('Użyj: exef data import-entity <entity> --file <plik.json>', options)
  }
  const filePath = path.resolve(file)
  if (!fs.existsSync(filePath)) {
    error(`Plik nie istnieje: ${filePath}`, options)
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const res = await request('POST', `/data/import/${entity}`, { baseUrl: options.url, body: parsed })
  if (!res.ok) {
    error(`Błąd importu encji: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdDbExport(_args, options) {
  const outputPath = options.output || 'exef.sqlite'
  const res = await requestBinary('/db/export.sqlite', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd eksportu sqlite: ${res.error || res.status}`, options)
  }
  fs.writeFileSync(path.resolve(outputPath), res.data)
  if (!options.quiet && !options.q) {
    console.log(`Wyeksportowano do: ${outputPath}`)
  }
}

async function cmdDbImport(args, options) {
  const file = options.file || options.input || args[0]
  if (!file) {
    error('Użyj: exef db import --file <exef.sqlite>', options)
  }
  const filePath = path.resolve(file)
  if (!fs.existsSync(filePath)) {
    error(`Plik nie istnieje: ${filePath}`, options)
  }
  const base64 = fs.readFileSync(filePath).toString('base64')
  const res = await request('POST', '/db/import.sqlite', { baseUrl: options.url, body: { base64 } })
  if (!res.ok) {
    error(`Błąd importu sqlite: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdContractorsList(_args, options) {
  const res = await request('GET', '/contractors', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania kontrahentów: ${res.data?.error || res.status}`, options)
  }
  const items = res.data.contractors || []
  output(options.json ? items : items, options)
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

async function cmdInboxExportFiles(args, options) {
  const outputDir = options['output-dir'] || options.outputDir || options.output
  if (!outputDir) {
    error('Podaj katalog wyjściowy: exef inbox export-files --output-dir <katalog>', options)
  }

  const status = options.status || 'approved'
  const source = options.source || null
  const since = options.since || null
  const ids = parseCsv(options.ids)
  const projectIds = parseCsv(options.project)
  const expenseTypeIds = parseCsv(options['expense-type'] ?? options.expenseType)

  const res = await request('POST', '/inbox/export/files', {
    baseUrl: options.url,
    body: {
      outputDir: path.resolve(String(outputDir)),
      status,
      ...(source ? { source } : {}),
      ...(since ? { since } : {}),
      ...(ids.length ? { ids } : {}),
      ...(projectIds.length ? { projectIds } : {}),
      ...(expenseTypeIds.length ? { expenseTypeIds } : {}),
    },
  })

  if (!res.ok) {
    error(`Błąd eksportu plików: ${res.data?.error || res.status}`, options)
  }

  output(res.data, options)
}

async function cmdInboxAssign(args, options) {
  const id = args[0]
  if (!id) {
    error('Podaj ID faktury: exef inbox assign <id>', options)
  }

  const projectRaw = options.project
  const projectId = projectRaw && ['none', 'null', '-'].includes(String(projectRaw).toLowerCase())
    ? null
    : (projectRaw ?? undefined)

  const expenseTypeId = options['expense-type'] ?? options.expenseType
  const labelIds = parseCsv(options.labels)

  if (projectId !== undefined) {
    const res = await request('POST', `/inbox/invoices/${id}/assign`, {
      baseUrl: options.url,
      body: { projectId },
    })
    if (!res.ok) {
      error(`Błąd przypisania projektu: ${res.data?.error || res.status}`, options)
    }
  }

  if (expenseTypeId !== undefined) {
    const res = await request('POST', `/inbox/invoices/${id}/assign-expense-type`, {
      baseUrl: options.url,
      body: { expenseTypeId: expenseTypeId || null },
    })
    if (!res.ok) {
      error(`Błąd przypisania typu wydatku: ${res.data?.error || res.status}`, options)
    }
  }

  if (options.labels !== undefined) {
    const res = await request('POST', `/inbox/invoices/${id}/assign-labels`, {
      baseUrl: options.url,
      body: { labelIds },
    })
    if (!res.ok) {
      error(`Błąd przypisania etykiet: ${res.data?.error || res.status}`, options)
    }
  }

  if (!options.quiet && !options.q) {
    console.log('Zapisano przypisania.')
  }
}

async function cmdProjectsList(_args, options) {
  const res = await request('GET', '/projects', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania projektów: ${res.data?.error || res.status}`, options)
  }
  const items = res.data.projects || []
  output(options.json ? items : items, options)
}

async function cmdProjectsAdd(_args, options) {
  if (!options.id || !options.nazwa) {
    error('Wymagane opcje: --id <id> --nazwa <nazwa>', options)
  }
  const body = {
    id: options.id,
    nazwa: options.nazwa,
    klient: options.klient || '',
    nip: options.nip || '',
    budzet: options.budzet || 0,
    status: options.status || 'aktywny',
    opis: options.opis || '',
  }
  const res = await request('POST', '/projects', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd dodawania projektu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdProjectsUpdate(args, options) {
  const id = args[0] || options.id
  if (!id) {
    error('Podaj ID projektu: exef projects update <id> [--nazwa ...]', options)
  }
  const body = {}
  ;['nazwa', 'klient', 'nip', 'budzet', 'status', 'opis'].forEach((k) => {
    if (options[k] !== undefined) body[k] = options[k]
  })
  const res = await request('PUT', `/projects/${id}`, { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd aktualizacji projektu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdProjectsDelete(args, options) {
  const id = args[0] || options.id
  if (!id) {
    error('Podaj ID projektu: exef projects delete <id>', options)
  }
  const res = await request('DELETE', `/projects/${id}`, { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd usuwania projektu: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdLabelsList(_args, options) {
  const res = await request('GET', '/labels', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania etykiet: ${res.data?.error || res.status}`, options)
  }
  const items = res.data.labels || []
  output(options.json ? items : items, options)
}

async function cmdLabelsAdd(_args, options) {
  if (!options.id || !options.nazwa) {
    error('Wymagane opcje: --id <id> --nazwa <nazwa>', options)
  }
  const body = {
    id: options.id,
    nazwa: options.nazwa,
    kolor: options.kolor || '',
    opis: options.opis || '',
  }
  const res = await request('POST', '/labels', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd dodawania etykiety: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdLabelsUpdate(args, options) {
  const id = args[0] || options.id
  if (!id) {
    error('Podaj ID etykiety: exef labels update <id> [--nazwa ...]', options)
  }
  const body = {}
  ;['nazwa', 'kolor', 'opis'].forEach((k) => {
    if (options[k] !== undefined) body[k] = options[k]
  })
  const res = await request('PUT', `/labels/${id}`, { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd aktualizacji etykiety: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdLabelsDelete(args, options) {
  const id = args[0] || options.id
  if (!id) {
    error('Podaj ID etykiety: exef labels delete <id>', options)
  }
  const res = await request('DELETE', `/labels/${id}`, { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd usuwania etykiety: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdExpenseTypesList(_args, options) {
  const res = await request('GET', '/expense-types', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania typów wydatków: ${res.data?.error || res.status}`, options)
  }
  const items = res.data.expenseTypes || []
  output(options.json ? items : items, options)
}

async function cmdExpenseTypesAdd(_args, options) {
  if (!options.id || !options.nazwa) {
    error('Wymagane opcje: --id <id> --nazwa <nazwa>', options)
  }
  const body = { id: options.id, nazwa: options.nazwa, opis: options.opis || '' }
  const res = await request('POST', '/expense-types', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd dodawania typu wydatku: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdExpenseTypesUpdate(args, options) {
  const id = args[0] || options.id
  if (!id) {
    error('Podaj ID typu: exef expense-types update <id> [--nazwa ...]', options)
  }
  const body = {}
  ;['nazwa', 'opis'].forEach((k) => {
    if (options[k] !== undefined) body[k] = options[k]
  })
  const res = await request('PUT', `/expense-types/${id}`, { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd aktualizacji typu wydatku: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdExpenseTypesDelete(args, options) {
  const id = args[0] || options.id
  if (!id) {
    error('Podaj ID typu: exef expense-types delete <id>', options)
  }
  const res = await request('DELETE', `/expense-types/${id}`, { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd usuwania typu wydatku: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdSettingsGet(_args, options) {
  const res = await request('GET', '/settings', { baseUrl: options.url })
  if (!res.ok) {
    error(`Błąd pobierania konfiguracji: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdSettingsSet(args, options) {
  const file = options.file || args[0]
  if (!file) {
    error('Użyj: exef settings set --file <settings.json>', options)
  }
  const filePath = path.resolve(file)
  if (!fs.existsSync(filePath)) {
    error(`Plik nie istnieje: ${filePath}`, options)
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const res = await request('PUT', '/settings', { baseUrl: options.url, body: parsed })
  if (!res.ok) {
    error(`Błąd zapisu konfiguracji: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
}

async function cmdSettingsSetUi(_args, options) {
  const projectSelection = options['project-selection']
  const expenseTypeSelection = options['expense-type-selection']
  if (!projectSelection && !expenseTypeSelection) {
    error('Użyj: exef settings set-ui --project-selection select|radio --expense-type-selection select|radio', options)
  }
  const body = {
    ui: {
      invoicesTable: {
        ...(projectSelection ? { projectSelection } : {}),
        ...(expenseTypeSelection ? { expenseTypeSelection } : {}),
      },
    },
  }
  const res = await request('PUT', '/settings', { baseUrl: options.url, body })
  if (!res.ok) {
    error(`Błąd zapisu konfiguracji UI: ${res.data?.error || res.status}`, options)
  }
  output(res.data, options)
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
    } else if (cmd === 'status') {
      await cmdStatus(restArgs, options)
    } else if (cmd === 'data') {
      if (subcmd === 'export') {
        await cmdDataExport(restArgs, options)
      } else if (subcmd === 'import') {
        await cmdDataImport(restArgs, options)
      } else if (subcmd === 'export-entity') {
        await cmdDataExportEntity(restArgs, options)
      } else if (subcmd === 'import-entity') {
        await cmdDataImportEntity(restArgs, options)
      } else {
        error(`Nieznana podkomenda data: ${subcmd}. Użyj: exef data export|import|export-entity|import-entity`, options)
      }
    } else if (cmd === 'db') {
      if (subcmd === 'export') {
        await cmdDbExport(restArgs, options)
      } else if (subcmd === 'import') {
        await cmdDbImport(restArgs, options)
      } else {
        error('Użyj: exef db export|import', options)
      }
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
      } else if (subcmd === 'export-files') {
        await cmdInboxExportFiles(restArgs, options)
      } else if (subcmd === 'assign') {
        await cmdInboxAssign(restArgs, options)
      } else {
        error(`Nieznana podkomenda inbox: ${subcmd}. Użyj: exef inbox --help`, options)
      }
    } else if (cmd === 'projects') {
      if (subcmd === 'list' || !subcmd) {
        await cmdProjectsList(restArgs, options)
      } else if (subcmd === 'add') {
        await cmdProjectsAdd(restArgs, options)
      } else if (subcmd === 'update') {
        await cmdProjectsUpdate(restArgs, options)
      } else if (subcmd === 'delete') {
        await cmdProjectsDelete(restArgs, options)
      } else {
        error(`Nieznana podkomenda projects: ${subcmd}`)
      }
    } else if (cmd === 'labels') {
      if (subcmd === 'list' || !subcmd) {
        await cmdLabelsList(restArgs, options)
      } else if (subcmd === 'add') {
        await cmdLabelsAdd(restArgs, options)
      } else if (subcmd === 'update') {
        await cmdLabelsUpdate(restArgs, options)
      } else if (subcmd === 'delete') {
        await cmdLabelsDelete(restArgs, options)
      } else {
        error(`Nieznana podkomenda labels: ${subcmd}`)
      }
    } else if (cmd === 'expense-types') {
      if (subcmd === 'list' || !subcmd) {
        await cmdExpenseTypesList(restArgs, options)
      } else if (subcmd === 'add') {
        await cmdExpenseTypesAdd(restArgs, options)
      } else if (subcmd === 'update') {
        await cmdExpenseTypesUpdate(restArgs, options)
      } else if (subcmd === 'delete') {
        await cmdExpenseTypesDelete(restArgs, options)
      } else {
        error(`Nieznana podkomenda expense-types: ${subcmd}`)
      }
    } else if (cmd === 'contractors') {
      if (subcmd === 'list' || !subcmd) {
        await cmdContractorsList(restArgs, options)
      } else {
        error(`Nieznana podkomenda contractors: ${subcmd}`)
      }
    } else if (cmd === 'settings') {
      if (subcmd === 'get' || !subcmd) {
        await cmdSettingsGet(restArgs, options)
      } else if (subcmd === 'set') {
        await cmdSettingsSet(restArgs, options)
      } else if (subcmd === 'set-ui') {
        await cmdSettingsSetUi(restArgs, options)
      } else {
        error(`Nieznana podkomenda settings: ${subcmd}`)
      }
    } else if (cmd === 'ui') {
      if (subcmd === 'theme') {
        const action = restArgs[0]
        if (action === 'get' || !action) {
          await cmdUiThemeGet(restArgs.slice(1), options)
        } else if (action === 'set') {
          await cmdUiThemeSet(restArgs.slice(1), options)
        } else {
          error('Użyj: exef ui theme get|set', options)
        }
      } else if (subcmd === 'contrast') {
        await cmdUiContrast(restArgs, options)
      } else {
        error('Użyj: exef ui theme|contrast', options)
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
