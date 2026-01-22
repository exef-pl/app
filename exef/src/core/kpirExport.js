const { PassThrough } = require('node:stream')

const KPIR_2026_COLUMNS = {
  1: 'lp',
  2: 'data_zdarzenia',
  3: 'nr_ksef',
  4: 'nr_dowodu',
  5: 'nip_kontrahenta',
  6: 'nazwa_kontrahenta',
  7: 'adres_kontrahenta',
  8: 'opis',
  9: 'przychod_sprzedaz',
  10: 'przychod_pozostaly',
  11: 'razem_przychod',
  12: 'zakup_towarow',
  13: 'koszty_uboczne',
  14: 'wynagrodzenia',
  15: 'pozostale_wydatki',
  16: 'razem_wydatki',
  17: 'wydatki_przyszle',
  18: 'koszty_br',
  19: 'uwagi',
}

const EXPENSE_CATEGORIES = {
  towary: { column: 12, name: 'Zakup towarów handlowych', kpir: 'zakup_towarow' },
  materialy: { column: 12, name: 'Zakup materiałów', kpir: 'zakup_towarow' },
  transport: { column: 13, name: 'Koszty transportu', kpir: 'koszty_uboczne' },
  clo: { column: 13, name: 'Cło i opłaty celne', kpir: 'koszty_uboczne' },
  wynagrodzenia: { column: 14, name: 'Wynagrodzenia', kpir: 'wynagrodzenia' },
  zus: { column: 14, name: 'Składki ZUS pracodawcy', kpir: 'wynagrodzenia' },
  paliwo: { column: 15, name: 'Paliwo', kpir: 'pozostale_wydatki', tags: ['auto'] },
  auto_eksploatacja: { column: 15, name: 'Eksploatacja samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  auto_ubezpieczenie: { column: 15, name: 'Ubezpieczenie samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  auto_serwis: { column: 15, name: 'Serwis samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  auto_leasing: { column: 15, name: 'Leasing samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  hosting: { column: 15, name: 'Hosting i domeny', kpir: 'pozostale_wydatki', tags: ['it'] },
  oprogramowanie: { column: 15, name: 'Oprogramowanie', kpir: 'pozostale_wydatki', tags: ['it'] },
  sprzet_it: { column: 15, name: 'Sprzęt IT', kpir: 'pozostale_wydatki', tags: ['it'] },
  marketing: { column: 15, name: 'Marketing i reklama', kpir: 'pozostale_wydatki' },
  biuro: { column: 15, name: 'Materiały biurowe', kpir: 'pozostale_wydatki' },
  telefon: { column: 15, name: 'Telefon i internet', kpir: 'pozostale_wydatki' },
  ksiegowosc: { column: 15, name: 'Usługi księgowe', kpir: 'pozostale_wydatki' },
  uslugi: { column: 15, name: 'Usługi obce', kpir: 'pozostale_wydatki' },
  szkolenia: { column: 15, name: 'Szkolenia', kpir: 'pozostale_wydatki' },
  podroze: { column: 15, name: 'Podróże służbowe', kpir: 'pozostale_wydatki' },
  reprezentacja: { column: 15, name: 'Reprezentacja', kpir: 'pozostale_wydatki' },
  inne: { column: 15, name: 'Inne koszty', kpir: 'pozostale_wydatki' },
  rmk: { column: 17, name: 'Rozliczenia międzyokresowe', kpir: 'wydatki_przyszle' },
  br_wynagrodzenia: { column: 18, name: 'B+R: Wynagrodzenia', kpir: 'koszty_br', tags: ['br'] },
  br_materialy: { column: 18, name: 'B+R: Materiały', kpir: 'koszty_br', tags: ['br'] },
  br_uslugi: { column: 18, name: 'B+R: Usługi', kpir: 'koszty_br', tags: ['br'] },
  br_amortyzacja: { column: 18, name: 'B+R: Amortyzacja', kpir: 'koszty_br', tags: ['br'] },
}

const EXPORT_FORMATS = {
  kpir_csv: {
    name: 'KPiR 2026 (CSV)',
    extension: 'csv',
    description: 'Uniwersalny format CSV zgodny z wzorem KPiR 2026',
    applications: ['Excel', 'LibreOffice', 'Google Sheets'],
    mimeType: 'text/csv;charset=utf-8',
  },
  kpir_xlsx: {
    name: 'KPiR 2026 (Excel)',
    extension: 'xlsx',
    description: 'Format Excel z formułami',
    applications: ['Excel', 'LibreOffice'],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    binary: true,
  },
  wfirma_wydatki: {
    name: 'wFirma (wydatki)',
    extension: 'csv',
    description: 'Import kosztów do wFirma.pl',
    applications: ['wFirma'],
    mimeType: 'text/csv;charset=utf-8',
  },
  optima_xml: {
    name: 'Comarch Optima (XML)',
    extension: 'xml',
    description: 'Import rejestrów VAT do Comarch ERP Optima',
    applications: ['Comarch Optima', 'Comarch ERP'],
    mimeType: 'application/xml',
  },
  subiekt_epp: {
    name: 'Insert Subiekt (EPP)',
    extension: 'epp',
    description: 'Format EDI++ dla Insert Subiekt GT/nexo',
    applications: ['Subiekt GT', 'Subiekt nexo'],
    mimeType: 'text/plain;charset=windows-1250',
    binary: true,
  },
  symfonia: {
    name: 'Symfonia',
    extension: 'csv',
    description: 'Import do Symfonia Handel/FK',
    applications: ['Symfonia Handel', 'Symfonia FK'],
    mimeType: 'text/csv;charset=windows-1250',
    binary: true,
  },
  enova: {
    name: 'enova365 (XML)',
    extension: 'xml',
    description: 'Import do enova365',
    applications: ['enova365'],
    mimeType: 'application/xml',
  },
  infakt: {
    name: 'inFakt',
    extension: 'csv',
    description: 'Import wydatków do inFakt',
    applications: ['inFakt'],
    mimeType: 'text/csv;charset=utf-8',
  },
  ifirma: {
    name: 'iFirma',
    extension: 'csv',
    description: 'Import do iFirma',
    applications: ['iFirma'],
    mimeType: 'text/csv;charset=utf-8',
  },
  fakturownia: {
    name: 'Fakturownia',
    extension: 'csv',
    description: 'Import do Fakturownia.pl',
    applications: ['Fakturownia'],
    mimeType: 'text/csv;charset=utf-8',
  },
  jpk_pkpir: {
    name: 'JPK_PKPIR',
    extension: 'xml',
    description: 'Jednolity Plik Kontrolny KPiR',
    applications: ['e-Deklaracje', 'Urząd Skarbowy'],
    mimeType: 'application/xml',
  },
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function columnLetter(idx1) {
  let n = idx1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

async function buildXlsxBuffer({ sheetName, rows }) {
  let archiver
  try {
    archiver = require('archiver')
  } catch (_e) {
    throw new Error('xlsx_zip_unavailable')
  }

  const safeSheetName = String(sheetName || 'Sheet1').slice(0, 31) || 'Sheet1'
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

  const contentTypes = `${xmlHeader}\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n  <Default Extension="xml" ContentType="application/xml"/>\n  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n</Types>\n`

  const rels = `${xmlHeader}\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n</Relationships>\n`

  const workbook = `${xmlHeader}\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n  <sheets>\n    <sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/>\n  </sheets>\n</workbook>\n`

  const workbookRels = `${xmlHeader}\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\n</Relationships>\n`

  const sheetRows = []
  for (let r = 0; r < rows.length; r++) {
    const row = Array.isArray(rows[r]) ? rows[r] : []
    const rowNum = r + 1
    const cells = []
    for (let c = 0; c < row.length; c++) {
      const colNum = c + 1
      const ref = `${columnLetter(colNum)}${rowNum}`

      if (r > 0 && (colNum === 11 || colNum === 16)) {
        const formula = colNum === 11
          ? `I${rowNum}+J${rowNum}`
          : `L${rowNum}+M${rowNum}+N${rowNum}+O${rowNum}`
        cells.push(`<c r="${ref}"><f>${escapeXml(formula)}</f><v>0</v></c>`)
        continue
      }

      const value = row[c]
      if (typeof value === 'number') {
        cells.push(`<c r="${ref}" t="n"><v>${String(value)}</v></c>`)
        continue
      }
      const s = String(value ?? '')
      cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(s)}</t></is></c>`)
    }
    sheetRows.push(`<row r="${rowNum}">${cells.join('')}</row>`)
  }

  const sheet1 = `${xmlHeader}\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n  <sheetData>\n    ${sheetRows.join('\n    ')}\n  </sheetData>\n</worksheet>\n`

  const out = new PassThrough()
  const chunks = []
  out.on('data', (d) => chunks.push(d))

  return await new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('warning', (_e) => {
    })
    archive.on('error', (e) => reject(e))
    out.on('error', (e) => reject(e))
    out.on('end', () => resolve(Buffer.concat(chunks)))

    archive.pipe(out)
    archive.append(contentTypes, { name: '[Content_Types].xml' })
    archive.append(rels, { name: '_rels/.rels' })
    archive.append(workbook, { name: 'xl/workbook.xml' })
    archive.append(workbookRels, { name: 'xl/_rels/workbook.xml.rels' })
    archive.append(sheet1, { name: 'xl/worksheets/sheet1.xml' })
    Promise.resolve(archive.finalize()).catch(reject)
  })
}

function encodeWindows1250(content) {
  try {
    const iconv = require('iconv-lite')
    return iconv.encode(String(content ?? ''), 'windows-1250')
  } catch (_e) {
    return Buffer.from(String(content ?? ''), 'utf8')
  }
}

class KpirExportService {
  constructor(options = {}) {
    this.companyData = options.companyData || {}
    this.defaultCategory = options.defaultCategory || 'inne'
  }

  getAvailableFormats() {
    return Object.entries(EXPORT_FORMATS).map(([id, cfg]) => ({ id, ...cfg }))
  }

  getExpenseCategories() {
    return Object.entries(EXPENSE_CATEGORIES).map(([id, cfg]) => ({ id, ...cfg }))
  }

  mapInvoiceToKpirEntry(invoice, options = {}) {
    const inv = invoice || {}
    const categoryId = inv.category || this.defaultCategory
    const category = EXPENSE_CATEGORIES[categoryId] || EXPENSE_CATEGORIES[this.defaultCategory]

    const issueDate = inv.issueDate || inv.createdAt
    const net = toNumber(inv.netAmount)
    const vat = toNumber(inv.vatAmount)
    const gross = toNumber(inv.grossAmount)

    const entry = {
      lp: options.lp || 1,
      data_zdarzenia: this._formatDate(issueDate),
      nr_ksef: inv.ksefReferenceNumber || inv.ksefId || '',
      nr_dowodu: inv.invoiceNumber || '',
      nip_kontrahenta: inv.contractorNip || inv.sellerNip || '',
      nazwa_kontrahenta: inv.contractorName || inv.sellerName || '',
      adres_kontrahenta: '',
      opis: this._buildOpis(inv, category),

      przychod_sprzedaz: 0,
      przychod_pozostaly: 0,
      razem_przychod: 0,

      zakup_towarow: category.column === 12 ? net : 0,
      koszty_uboczne: category.column === 13 ? net : 0,
      wynagrodzenia: category.column === 14 ? net : 0,
      pozostale_wydatki: category.column === 15 ? net : 0,
      razem_wydatki: net,

      wydatki_przyszle: category.column === 17 ? net : 0,
      koszty_br: category.column === 18 ? net : 0,

      uwagi: this._buildUwagi(inv, options),

      _meta: {
        invoiceId: inv.id || null,
        category: categoryId,
        categoryName: category.name,
        vatAmount: vat,
        grossAmount: gross,
        currency: inv.currency || 'PLN',
        projectId: inv.projectId || null,
        mpk: inv.mpk || null,
      },
    }

    return entry
  }

  async exportInvoices(invoices, format, options = {}) {
    if (!EXPORT_FORMATS[format]) {
      throw new Error(`Unknown export format: ${format}`)
    }

    const list = Array.isArray(invoices) ? invoices : []
    const entries = list.map((inv, idx) => this.mapInvoiceToKpirEntry(inv, { lp: idx + 1, ...options }))

    switch (format) {
      case 'kpir_csv':
        return this._toKpirCsv(entries)
      case 'kpir_xlsx':
        return await this._toKpirXlsx(entries)
      case 'wfirma_wydatki':
        return this._toWfirmaWydatkiCsv(entries)
      case 'optima_xml':
        return this._toOptimaXml(entries)
      case 'subiekt_epp':
        return this._toSubiektEpp(entries)
      case 'symfonia':
        return this._toSymfoniaCsv(entries)
      case 'enova':
        return this._toEnovaXml(entries)
      case 'infakt':
        return this._toInfaktCsv(entries)
      case 'ifirma':
        return this._toIfirmaCsv(entries)
      case 'fakturownia':
        return this._toFakturowniaCsv(entries)
      case 'jpk_pkpir':
        return this._toJpkPkpir(entries, options)
      default:
        throw new Error(`Format not implemented: ${format}`)
    }
  }

  _toKpirCsv(entries) {
    const headers = Object.values(KPIR_2026_COLUMNS)
    const rows = entries.map((e) => [
      e.lp,
      e.data_zdarzenia,
      e.nr_ksef,
      e.nr_dowodu,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.adres_kontrahenta,
      e.opis,
      this._formatAmount(e.przychod_sprzedaz),
      this._formatAmount(e.przychod_pozostaly),
      this._formatAmount(e.razem_przychod),
      this._formatAmount(e.zakup_towarow),
      this._formatAmount(e.koszty_uboczne),
      this._formatAmount(e.wynagrodzenia),
      this._formatAmount(e.pozostale_wydatki),
      this._formatAmount(e.razem_wydatki),
      this._formatAmount(e.wydatki_przyszle),
      this._formatAmount(e.koszty_br),
      e.uwagi,
    ])
    const content = this._toCsv([headers, ...rows], ';')
    return {
      content,
      filename: `kpir_${this._getDateSuffix()}.csv`,
      mimeType: EXPORT_FORMATS.kpir_csv.mimeType,
    }
  }

  async _toKpirXlsx(entries) {
    const headers = Object.values(KPIR_2026_COLUMNS)
    const rows = [headers]
    for (const e of entries) {
      rows.push([
        e.lp,
        e.data_zdarzenia,
        e.nr_ksef,
        e.nr_dowodu,
        e.nip_kontrahenta,
        e.nazwa_kontrahenta,
        e.adres_kontrahenta,
        e.opis,
        toNumber(e.przychod_sprzedaz),
        toNumber(e.przychod_pozostaly),
        0,
        toNumber(e.zakup_towarow),
        toNumber(e.koszty_uboczne),
        toNumber(e.wynagrodzenia),
        toNumber(e.pozostale_wydatki),
        0,
        toNumber(e.wydatki_przyszle),
        toNumber(e.koszty_br),
        e.uwagi,
      ])
    }
    const buf = await buildXlsxBuffer({ sheetName: 'KPiR 2026', rows })
    return {
      content: buf,
      filename: `kpir_${this._getDateSuffix()}.xlsx`,
      mimeType: EXPORT_FORMATS.kpir_xlsx.mimeType,
    }
  }

  _toWfirmaWydatkiCsv(entries) {
    const headers = ['Data', 'Numer dokumentu', 'Nr KSeF', 'NIP', 'Kontrahent', 'Opis', 'Netto', 'VAT', 'Brutto', 'Schemat księgowy', 'Uwagi']
    const rows = entries.map((e) => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      this._formatAmount(toNumber(e._meta.grossAmount) - toNumber(e._meta.vatAmount)),
      this._formatAmount(e._meta.vatAmount),
      this._formatAmount(e._meta.grossAmount),
      this._mapToWfirmaSchema(e),
      e.uwagi,
    ])
    const content = this._toCsv([headers, ...rows], ';')
    return {
      content,
      filename: `wfirma_wydatki_${this._getDateSuffix()}.csv`,
      mimeType: EXPORT_FORMATS.wfirma_wydatki.mimeType,
    }
  }

  _toOptimaXml(entries) {
    const parts = []
    parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    parts.push('<REJESTRY_VAT>')
    for (const e of entries) {
      parts.push('  <REJESTR>')
      parts.push('    <TYP>ZAKUP</TYP>')
      parts.push(`    <DATA_WYSTAWIENIA>${escapeXml(e.data_zdarzenia)}</DATA_WYSTAWIENIA>`)
      parts.push(`    <NUMER>${escapeXml(e.nr_dowodu)}</NUMER>`)
      parts.push(`    <NR_KSEF>${escapeXml(e.nr_ksef)}</NR_KSEF>`)
      parts.push(`    <KONTRAHENT_NIP>${escapeXml(e.nip_kontrahenta)}</KONTRAHENT_NIP>`)
      parts.push(`    <KONTRAHENT_NAZWA>${escapeXml(e.nazwa_kontrahenta)}</KONTRAHENT_NAZWA>`)
      parts.push(`    <OPIS>${escapeXml(e.opis)}</OPIS>`)
      parts.push(`    <NETTO>${escapeXml(String(toNumber(e.razem_wydatki).toFixed(2)))}</NETTO>`)
      parts.push(`    <VAT>${escapeXml(String(toNumber(e._meta.vatAmount).toFixed(2)))}</VAT>`)
      parts.push(`    <BRUTTO>${escapeXml(String(toNumber(e._meta.grossAmount).toFixed(2)))}</BRUTTO>`)
      parts.push(`    <UWAGI>${escapeXml(e.uwagi)}</UWAGI>`)
      parts.push('  </REJESTR>')
    }
    parts.push('</REJESTRY_VAT>')
    return {
      content: parts.join('\n'),
      filename: `optima_rejestry_${this._getDateSuffix()}.xml`,
      mimeType: EXPORT_FORMATS.optima_xml.mimeType,
    }
  }

  _toSubiektEpp(entries) {
    const lines = []
    lines.push('[NAGLOWEK]')
    lines.push('WERSJA=3.0')
    lines.push(`DATA_WYSTAWIENIA=${this._formatDate(new Date())}`)
    lines.push(`ILOSC_DOKUMENTOW=${entries.length}`)
    lines.push('')
    entries.forEach((e, idx) => {
      lines.push(`[DOKUMENT_${idx + 1}]`)
      lines.push('TYP=FZ')
      lines.push(`NUMER=${e.nr_dowodu}`)
      lines.push(`NR_KSEF=${e.nr_ksef}`)
      lines.push(`DATA_WYSTAWIENIA=${e.data_zdarzenia}`)
      lines.push(`KONTRAHENT_NIP=${e.nip_kontrahenta}`)
      lines.push(`KONTRAHENT_NAZWA=${e.nazwa_kontrahenta}`)
      lines.push(`OPIS=${e.opis}`)
      lines.push(`NETTO=${String(toNumber(e.razem_wydatki).toFixed(2))}`)
      lines.push(`VAT=${String(toNumber(e._meta.vatAmount).toFixed(2))}`)
      lines.push(`BRUTTO=${String(toNumber(e._meta.grossAmount).toFixed(2))}`)
      lines.push(`UWAGI=${e.uwagi}`)
      lines.push('')
    })
    const content = lines.join('\r\n')
    return {
      content: encodeWindows1250(content),
      filename: `subiekt_${this._getDateSuffix()}.epp`,
      mimeType: EXPORT_FORMATS.subiekt_epp.mimeType,
    }
  }

  _toSymfoniaCsv(entries) {
    const headers = ['Lp', 'Data', 'Nr dokumentu', 'Nr KSeF', 'NIP', 'Nazwa kontrahenta', 'Opis', 'Kwota netto', 'Kwota VAT', 'Kwota brutto', 'Konto', 'MPK']
    const rows = entries.map((e) => [
      e.lp,
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      this._formatAmount(e.razem_wydatki),
      this._formatAmount(e._meta.vatAmount),
      this._formatAmount(e._meta.grossAmount),
      this._mapToSymfoniaAccount(e),
      e._meta.mpk || '',
    ])
    const content = this._toCsv([headers, ...rows], ';')
    return {
      content: encodeWindows1250(content),
      filename: `symfonia_${this._getDateSuffix()}.csv`,
      mimeType: EXPORT_FORMATS.symfonia.mimeType,
    }
  }

  _toEnovaXml(entries) {
    const parts = []
    parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    parts.push('<enova>')
    parts.push('  <dokumenty>')
    for (const e of entries) {
      parts.push('    <dokument>')
      parts.push('      <typ>FZ</typ>')
      parts.push(`      <numer>${escapeXml(e.nr_dowodu)}</numer>`)
      parts.push(`      <nrKsef>${escapeXml(e.nr_ksef)}</nrKsef>`)
      parts.push(`      <data>${escapeXml(e.data_zdarzenia)}</data>`)
      parts.push(`      <nip>${escapeXml(e.nip_kontrahenta)}</nip>`)
      parts.push(`      <kontrahent>${escapeXml(e.nazwa_kontrahenta)}</kontrahent>`)
      parts.push(`      <netto>${escapeXml(String(toNumber(e.razem_wydatki).toFixed(2)))}</netto>`)
      parts.push(`      <vat>${escapeXml(String(toNumber(e._meta.vatAmount).toFixed(2)))}</vat>`)
      parts.push(`      <brutto>${escapeXml(String(toNumber(e._meta.grossAmount).toFixed(2)))}</brutto>`)
      parts.push(`      <opis>${escapeXml(e.opis)}</opis>`)
      parts.push(`      <uwagi>${escapeXml(e.uwagi)}</uwagi>`)
      parts.push('    </dokument>')
    }
    parts.push('  </dokumenty>')
    parts.push('</enova>')
    return {
      content: parts.join('\n'),
      filename: `enova_${this._getDateSuffix()}.xml`,
      mimeType: EXPORT_FORMATS.enova.mimeType,
    }
  }

  _toInfaktCsv(entries) {
    const headers = ['Data wystawienia', 'Numer faktury', 'Numer KSeF', 'NIP sprzedawcy', 'Nazwa sprzedawcy', 'Kwota netto', 'Kwota VAT', 'Kwota brutto', 'Kategoria', 'Opis']
    const rows = entries.map((e) => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      this._formatAmount(e.razem_wydatki),
      this._formatAmount(e._meta.vatAmount),
      this._formatAmount(e._meta.grossAmount),
      e._meta.categoryName,
      e.opis,
    ])
    const content = this._toCsv([headers, ...rows], ';')
    return {
      content,
      filename: `infakt_wydatki_${this._getDateSuffix()}.csv`,
      mimeType: EXPORT_FORMATS.infakt.mimeType,
    }
  }

  _toIfirmaCsv(entries) {
    const headers = ['Data', 'Nr dokumentu', 'Nr KSeF', 'NIP', 'Kontrahent', 'Opis', 'Netto', 'VAT', 'Brutto', 'Rodzaj kosztu']
    const rows = entries.map((e) => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      this._formatAmount(e.razem_wydatki),
      this._formatAmount(e._meta.vatAmount),
      this._formatAmount(e._meta.grossAmount),
      e._meta.categoryName,
    ])
    const content = this._toCsv([headers, ...rows], ';')
    return {
      content,
      filename: `ifirma_${this._getDateSuffix()}.csv`,
      mimeType: EXPORT_FORMATS.ifirma.mimeType,
    }
  }

  _toFakturowniaCsv(entries) {
    const headers = ['issue_date', 'number', 'ksef_number', 'seller_tax_no', 'seller_name', 'description', 'price_net', 'price_tax', 'price_gross', 'category']
    const rows = entries.map((e) => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      String(toNumber(e.razem_wydatki).toFixed(2)),
      String(toNumber(e._meta.vatAmount).toFixed(2)),
      String(toNumber(e._meta.grossAmount).toFixed(2)),
      e._meta.categoryName,
    ])
    const content = this._toCsv([headers, ...rows], ',')
    return {
      content,
      filename: `fakturownia_${this._getDateSuffix()}.csv`,
      mimeType: EXPORT_FORMATS.fakturownia.mimeType,
    }
  }

  _toJpkPkpir(entries, options = {}) {
    const now = new Date()
    const year = now.getFullYear()
    const periodFrom = options.periodFrom || `${year}-01-01`
    const periodTo = options.periodTo || `${year}-12-31`
    const purpose = options.purpose || 1

    const rows = entries.map((e) => {
      return [
        '  <PKPiR>',
        `    <K_1>${escapeXml(e.lp)}</K_1>`,
        `    <K_2>${escapeXml(e.data_zdarzenia)}</K_2>`,
        `    <K_3>${escapeXml(e.nr_ksef || '')}</K_3>`,
        `    <K_4>${escapeXml(e.nr_dowodu || '')}</K_4>`,
        `    <K_5>${escapeXml(e.nip_kontrahenta || '')}</K_5>`,
        `    <K_6>${escapeXml(e.nazwa_kontrahenta || '')}</K_6>`,
        `    <K_7>${escapeXml(e.adres_kontrahenta || '')}</K_7>`,
        `    <K_8>${escapeXml(e.opis || '')}</K_8>`,
        `    <K_9>${escapeXml(String(toNumber(e.przychod_sprzedaz).toFixed(2)))}</K_9>`,
        `    <K_10>${escapeXml(String(toNumber(e.przychod_pozostaly).toFixed(2)))}</K_10>`,
        `    <K_11>${escapeXml(String(toNumber(e.razem_przychod).toFixed(2)))}</K_11>`,
        `    <K_12>${escapeXml(String(toNumber(e.zakup_towarow).toFixed(2)))}</K_12>`,
        `    <K_13>${escapeXml(String(toNumber(e.koszty_uboczne).toFixed(2)))}</K_13>`,
        `    <K_14>${escapeXml(String(toNumber(e.wynagrodzenia).toFixed(2)))}</K_14>`,
        `    <K_15>${escapeXml(String(toNumber(e.pozostale_wydatki).toFixed(2)))}</K_15>`,
        `    <K_16>${escapeXml(String(toNumber(e.razem_wydatki).toFixed(2)))}</K_16>`,
        `    <K_17>${escapeXml(String(toNumber(e.wydatki_przyszle).toFixed(2)))}</K_17>`,
        `    <K_18>${escapeXml(String(toNumber(e.koszty_br).toFixed(2)))}</K_18>`,
        `    <K_19>${escapeXml(e.uwagi || '')}</K_19>`,
        '  </PKPiR>',
      ].join('\n')
    })

    const sumaPrzychodow = entries.reduce((sum, e) => sum + toNumber(e.razem_przychod), 0)
    const sumaKosztow = entries.reduce((sum, e) => sum + toNumber(e.razem_wydatki), 0)

    const xml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<JPK>',
      '  <Naglowek>',
      '    <KodFormularza>JPK_PKPIR</KodFormularza>',
      `    <CelZlozenia>${escapeXml(purpose)}</CelZlozenia>`,
      `    <DataWytworzeniaJPK>${escapeXml(now.toISOString())}</DataWytworzeniaJPK>`,
      `    <DataOd>${escapeXml(periodFrom)}</DataOd>`,
      `    <DataDo>${escapeXml(periodTo)}</DataDo>`,
      '  </Naglowek>',
      '  <Podmiot1>',
      `    <NIP>${escapeXml(this.companyData.nip || '')}</NIP>`,
      `    <PelnaNazwa>${escapeXml(this.companyData.name || '')}</PelnaNazwa>`,
      '  </Podmiot1>',
      rows.join('\n'),
      '  <PKPiRCtrl>',
      `    <LiczbaWierszy>${escapeXml(entries.length)}</LiczbaWierszy>`,
      `    <SumaPrzychodow>${escapeXml(String(sumaPrzychodow.toFixed(2)))}</SumaPrzychodow>`,
      `    <SumaKosztow>${escapeXml(String(sumaKosztow.toFixed(2)))}</SumaKosztow>`,
      '  </PKPiRCtrl>',
      '</JPK>',
      '',
    ].join('\n')

    return {
      content: xml,
      filename: `JPK_PKPIR_${periodFrom.replace(/-/g, '')}_${periodTo.replace(/-/g, '')}.xml`,
      mimeType: EXPORT_FORMATS.jpk_pkpir.mimeType,
    }
  }

  _formatDate(date) {
    if (!date) return ''
    const d = new Date(date)
    return d.toISOString().slice(0, 10)
  }

  _formatAmount(amount) {
    const n = toNumber(amount)
    return n.toFixed(2).replace('.', ',')
  }

  _toCsv(rows, separator = ';') {
    return rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? '')
            if (str.includes(separator) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(separator)
      )
      .join('\r\n')
  }

  _getDateSuffix() {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  }

  _buildOpis(inv, category) {
    const parts = []
    parts.push(category.name)
    if (inv.description) {
      parts.push(String(inv.description))
    }
    return parts.join(' - ')
  }

  _buildUwagi(inv) {
    const parts = []
    if (inv.projectId) {
      parts.push(`Project: ${String(inv.projectId)}`)
    }
    if (inv.mpk) {
      parts.push(`MPK: ${String(inv.mpk)}`)
    }
    return parts.join('; ')
  }

  _mapToWfirmaSchema(entry) {
    const mapping = {
      paliwo: 'KOSZTY_AUTA',
      auto_eksploatacja: 'KOSZTY_AUTA',
      auto_ubezpieczenie: 'KOSZTY_AUTA',
      auto_serwis: 'KOSZTY_AUTA',
      auto_leasing: 'KOSZTY_AUTA',
      hosting: 'KOSZTY_IT',
      oprogramowanie: 'KOSZTY_IT',
      sprzet_it: 'KOSZTY_IT',
      marketing: 'MARKETING',
      biuro: 'KOSZTY_BIURA',
      telefon: 'TELEKOMUNIKACJA',
      uslugi: 'USLUGI_OBCE',
    }
    return mapping[entry._meta.category] || 'POZOSTALE_KOSZTY'
  }

  _mapToSymfoniaAccount(entry) {
    const mapping = {
      paliwo: '402-01',
      auto_eksploatacja: '402-02',
      hosting: '403-01',
      marketing: '405-01',
      biuro: '401-01',
    }
    return mapping[entry._meta.category] || '409-99'
  }
}

function createKpirExportService(options = {}) {
  return new KpirExportService(options)
}

module.exports = {
  KpirExportService,
  createKpirExportService,
  KPIR_2026_COLUMNS,
  EXPENSE_CATEGORIES,
  EXPORT_FORMATS,
}
