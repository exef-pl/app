/**
 * KPiR Export Module
 * Eksport faktur do formatu KPiR 2026 zgodnego z popularnymi aplikacjami księgowymi
 * 
 * Obsługiwane formaty wyjściowe:
 * - KPiR 2026 (uniwersalny CSV/XLSX)
 * - wFirma (CSV)
 * - Comarch Optima (XML)
 * - Insert Subiekt (EPP/CSV)
 * - Symfonia (CSV)
 * - enova365 (XML)
 * - inFakt (CSV)
 * - iFirma (CSV)
 * - Fakturownia (CSV)
 * - JPK_PKPIR (XML) - wymagany od 2026
 */

const { parseStringPromise, Builder } = require('xml2js'); // npm install xml2js

/**
 * Kolumny KPiR 2026 (19 kolumn - nowe rozporządzenie)
 */
const KPIR_2026_COLUMNS = {
  1: 'lp',                    // Liczba porządkowa
  2: 'data_zdarzenia',        // Data zdarzenia gospodarczego
  3: 'nr_ksef',               // NOWA: Numer faktury w KSeF
  4: 'nr_dowodu',             // Inny numer dowodu księgowego
  5: 'nip_kontrahenta',       // NOWA: NIP kontrahenta
  6: 'nazwa_kontrahenta',     // Imię i nazwisko / Nazwa firmy
  7: 'adres_kontrahenta',     // Adres kontrahenta
  8: 'opis',                  // Opis zdarzenia gospodarczego
  9: 'przychod_sprzedaz',     // Przychód - wartość sprzedanych towarów i usług
  10: 'przychod_pozostaly',   // Przychód - pozostałe przychody
  11: 'razem_przychod',       // Razem przychód (9+10)
  12: 'zakup_towarow',        // Zakup towarów handlowych i materiałów
  13: 'koszty_uboczne',       // Koszty uboczne zakupu
  14: 'wynagrodzenia',        // Wynagrodzenia brutto + ZUS pracodawcy
  15: 'pozostale_wydatki',    // Pozostałe wydatki
  16: 'razem_wydatki',        // Razem wydatki (12+13+14+15)
  17: 'wydatki_przyszle',     // Wydatki dot. przychodów przyszłych okresów
  18: 'koszty_br',            // Koszty działalności B+R (ulga B+R)
  19: 'uwagi'                 // Uwagi (np. dotacje)
};

/**
 * Kategorie kosztów z mapowaniem na kolumny KPiR
 */
const EXPENSE_CATEGORIES = {
  // Kolumna 12 - Zakup towarów
  'towary': { column: 12, name: 'Zakup towarów handlowych', kpir: 'zakup_towarow' },
  'materialy': { column: 12, name: 'Zakup materiałów', kpir: 'zakup_towarow' },
  
  // Kolumna 13 - Koszty uboczne
  'transport': { column: 13, name: 'Koszty transportu', kpir: 'koszty_uboczne' },
  'clo': { column: 13, name: 'Cło i opłaty celne', kpir: 'koszty_uboczne' },
  
  // Kolumna 14 - Wynagrodzenia
  'wynagrodzenia': { column: 14, name: 'Wynagrodzenia', kpir: 'wynagrodzenia' },
  'zus': { column: 14, name: 'Składki ZUS pracodawcy', kpir: 'wynagrodzenia' },
  
  // Kolumna 15 - Pozostałe wydatki (większość kosztów firmowych)
  'paliwo': { column: 15, name: 'Paliwo', kpir: 'pozostale_wydatki', tags: ['auto'] },
  'auto_eksploatacja': { column: 15, name: 'Eksploatacja samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  'auto_ubezpieczenie': { column: 15, name: 'Ubezpieczenie samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  'auto_serwis': { column: 15, name: 'Serwis samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  'auto_leasing': { column: 15, name: 'Leasing samochodu', kpir: 'pozostale_wydatki', tags: ['auto'] },
  
  'hosting': { column: 15, name: 'Hosting i domeny', kpir: 'pozostale_wydatki', tags: ['it'] },
  'oprogramowanie': { column: 15, name: 'Oprogramowanie', kpir: 'pozostale_wydatki', tags: ['it'] },
  'sprzet_it': { column: 15, name: 'Sprzęt IT', kpir: 'pozostale_wydatki', tags: ['it'] },
  
  'marketing': { column: 15, name: 'Marketing i reklama', kpir: 'pozostale_wydatki' },
  'biuro': { column: 15, name: 'Materiały biurowe', kpir: 'pozostale_wydatki' },
  'telefon': { column: 15, name: 'Telefon i internet', kpir: 'pozostale_wydatki' },
  'ksiegowosc': { column: 15, name: 'Usługi księgowe', kpir: 'pozostale_wydatki' },
  'uslugi': { column: 15, name: 'Usługi obce', kpir: 'pozostale_wydatki' },
  'szkolenia': { column: 15, name: 'Szkolenia', kpir: 'pozostale_wydatki' },
  'podroze': { column: 15, name: 'Podróże służbowe', kpir: 'pozostale_wydatki' },
  'reprezentacja': { column: 15, name: 'Reprezentacja', kpir: 'pozostale_wydatki' },
  'inne': { column: 15, name: 'Inne koszty', kpir: 'pozostale_wydatki' },
  
  // Kolumna 17 - Wydatki przyszłe (RMK)
  'rmk': { column: 17, name: 'Rozliczenia międzyokresowe', kpir: 'wydatki_przyszle' },
  
  // Kolumna 18 - B+R (ulga podatkowa)
  'br_wynagrodzenia': { column: 18, name: 'B+R: Wynagrodzenia', kpir: 'koszty_br', tags: ['br'] },
  'br_materialy': { column: 18, name: 'B+R: Materiały', kpir: 'koszty_br', tags: ['br'] },
  'br_uslugi': { column: 18, name: 'B+R: Usługi', kpir: 'koszty_br', tags: ['br'] },
  'br_amortyzacja': { column: 18, name: 'B+R: Amortyzacja', kpir: 'koszty_br', tags: ['br'] }
};

/**
 * Formaty eksportu dla różnych aplikacji
 */
const EXPORT_FORMATS = {
  'kpir_csv': {
    name: 'KPiR 2026 (CSV)',
    extension: 'csv',
    description: 'Uniwersalny format CSV zgodny z wzorem KPiR 2026',
    applications: ['Excel', 'LibreOffice', 'Google Sheets']
  },
  'kpir_xlsx': {
    name: 'KPiR 2026 (Excel)',
    extension: 'xlsx',
    description: 'Format Excel z formatowaniem i formułami',
    applications: ['Excel', 'LibreOffice']
  },
  'wfirma': {
    name: 'wFirma',
    extension: 'csv',
    description: 'Import kosztów do wFirma.pl',
    applications: ['wFirma']
  },
  'optima_xml': {
    name: 'Comarch Optima (XML)',
    extension: 'xml',
    description: 'Import rejestrów VAT do Comarch ERP Optima',
    applications: ['Comarch Optima', 'Comarch ERP']
  },
  'subiekt_epp': {
    name: 'Insert Subiekt (EPP)',
    extension: 'epp',
    description: 'Format EDI++ dla Insert Subiekt GT/nexo',
    applications: ['Subiekt GT', 'Subiekt nexo']
  },
  'symfonia': {
    name: 'Symfonia',
    extension: 'csv',
    description: 'Import do Symfonia Handel/FK',
    applications: ['Symfonia Handel', 'Symfonia FK']
  },
  'enova': {
    name: 'enova365 (XML)',
    extension: 'xml',
    description: 'Import do enova365',
    applications: ['enova365']
  },
  'infakt': {
    name: 'inFakt',
    extension: 'csv',
    description: 'Import wydatków do inFakt',
    applications: ['inFakt']
  },
  'ifirma': {
    name: 'iFirma',
    extension: 'csv',
    description: 'Import do iFirma',
    applications: ['iFirma']
  },
  'fakturownia': {
    name: 'Fakturownia',
    extension: 'csv',
    description: 'Import do Fakturownia.pl',
    applications: ['Fakturownia']
  },
  'jpk_pkpir': {
    name: 'JPK_PKPIR',
    extension: 'xml',
    description: 'Jednolity Plik Kontrolny KPiR (wymagany od 2026)',
    applications: ['e-Deklaracje', 'Urząd Skarbowy']
  }
};

class KpirExportService {
  constructor(options = {}) {
    this.companyData = options.companyData || {};
    this.defaultCategory = options.defaultCategory || 'inne';
  }

  /**
   * Mapuj fakturę na wpis KPiR
   */
  mapInvoiceToKpirEntry(invoice, options = {}) {
    const category = EXPENSE_CATEGORIES[invoice.description?.category] || EXPENSE_CATEGORIES[this.defaultCategory];
    const isIncome = invoice.type === 'income' || invoice.type === 'sprzedaz';
    
    const entry = {
      lp: options.lp || 1,
      data_zdarzenia: this._formatDate(invoice.extracted?.issueDate || invoice.createdAt),
      nr_ksef: invoice.ksef?.id || invoice.extracted?.ksefNumber || '',
      nr_dowodu: invoice.extracted?.invoiceNumber || '',
      nip_kontrahenta: invoice.extracted?.seller?.nip || '',
      nazwa_kontrahenta: invoice.extracted?.seller?.name || '',
      adres_kontrahenta: this._formatAddress(invoice.extracted?.seller),
      opis: this._buildDescription(invoice, category),
      
      // Przychody (kolumny 9-11)
      przychod_sprzedaz: isIncome ? (invoice.extracted?.amounts?.net || 0) : 0,
      przychod_pozostaly: 0,
      razem_przychod: isIncome ? (invoice.extracted?.amounts?.net || 0) : 0,
      
      // Koszty (kolumny 12-16)
      zakup_towarow: category.column === 12 ? (invoice.extracted?.amounts?.net || 0) : 0,
      koszty_uboczne: category.column === 13 ? (invoice.extracted?.amounts?.net || 0) : 0,
      wynagrodzenia: category.column === 14 ? (invoice.extracted?.amounts?.net || 0) : 0,
      pozostale_wydatki: category.column === 15 ? (invoice.extracted?.amounts?.net || 0) : 0,
      razem_wydatki: !isIncome ? (invoice.extracted?.amounts?.net || 0) : 0,
      
      // Specjalne (kolumny 17-18)
      wydatki_przyszle: category.column === 17 ? (invoice.extracted?.amounts?.net || 0) : 0,
      koszty_br: category.column === 18 ? (invoice.extracted?.amounts?.net || 0) : 0,
      
      // Uwagi (kolumna 19)
      uwagi: this._buildUwagi(invoice, options),
      
      // Dodatkowe metadane (nie w KPiR, ale przydatne dla systemów)
      _meta: {
        invoiceId: invoice.id,
        category: invoice.description?.category,
        categoryName: category.name,
        project: invoice.description?.project || options.project || null,
        tags: [
          ...(category.tags || []),
          ...(invoice.description?.tags || [])
        ],
        vatAmount: invoice.extracted?.amounts?.vat || 0,
        grossAmount: invoice.extracted?.amounts?.gross || 0,
        currency: invoice.extracted?.amounts?.currency || 'PLN',
        isAuto: category.tags?.includes('auto') || false,
        isBR: category.tags?.includes('br') || false
      }
    };
    
    return entry;
  }

  /**
   * Eksportuj faktury do wybranego formatu
   */
  async exportInvoices(invoices, format, options = {}) {
    const formatConfig = EXPORT_FORMATS[format];
    if (!formatConfig) {
      throw new Error(`Unknown export format: ${format}. Available: ${Object.keys(EXPORT_FORMATS).join(', ')}`);
    }
    
    // Mapuj faktury na wpisy KPiR
    const entries = invoices.map((inv, idx) => 
      this.mapInvoiceToKpirEntry(inv, { lp: idx + 1, ...options })
    );
    
    // Generuj wyjście w odpowiednim formacie
    switch (format) {
      case 'kpir_csv':
        return this._toKpirCsv(entries);
      case 'kpir_xlsx':
        return this._toKpirXlsx(entries);
      case 'wfirma':
        return this._toWfirmaCsv(entries);
      case 'optima_xml':
        return this._toOptimaXml(entries);
      case 'subiekt_epp':
        return this._toSubiektEpp(entries);
      case 'symfonia':
        return this._toSymfoniaCsv(entries);
      case 'enova':
        return this._toEnovaXml(entries);
      case 'infakt':
        return this._toInfaktCsv(entries);
      case 'ifirma':
        return this._toIfirmaCsv(entries);
      case 'fakturownia':
        return this._toFakturowniaCsv(entries);
      case 'jpk_pkpir':
        return this._toJpkPkpir(entries, options);
      default:
        throw new Error(`Format ${format} not implemented yet`);
    }
  }

  /**
   * Pobierz listę dostępnych formatów
   */
  getAvailableFormats() {
    return Object.entries(EXPORT_FORMATS).map(([key, config]) => ({
      id: key,
      ...config
    }));
  }

  /**
   * Pobierz listę kategorii kosztów
   */
  getExpenseCategories() {
    return Object.entries(EXPENSE_CATEGORIES).map(([key, config]) => ({
      id: key,
      ...config
    }));
  }

  // === FORMATY EKSPORTU ===

  /**
   * KPiR 2026 - uniwersalny CSV
   */
  _toKpirCsv(entries) {
    const headers = Object.values(KPIR_2026_COLUMNS);
    const rows = entries.map(e => [
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
      e.uwagi
    ]);
    
    return {
      content: this._toCsv([headers, ...rows]),
      filename: `kpir_${this._getDateSuffix()}.csv`,
      mimeType: 'text/csv;charset=utf-8'
    };
  }

  /**
   * KPiR 2026 - Excel z formatowaniem
   */
  async _toKpirXlsx(entries) {
    const ExcelJS = require('exceljs'); // npm install exceljs
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('KPiR 2026');
    
    // Nagłówki
    const headers = Object.values(KPIR_2026_COLUMNS);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Dane
    for (const e of entries) {
      sheet.addRow([
        e.lp,
        e.data_zdarzenia,
        e.nr_ksef,
        e.nr_dowodu,
        e.nip_kontrahenta,
        e.nazwa_kontrahenta,
        e.adres_kontrahenta,
        e.opis,
        e.przychod_sprzedaz,
        e.przychod_pozostaly,
        { formula: `I${sheet.rowCount}+J${sheet.rowCount}` }, // razem_przychod
        e.zakup_towarow,
        e.koszty_uboczne,
        e.wynagrodzenia,
        e.pozostale_wydatki,
        { formula: `L${sheet.rowCount}+M${sheet.rowCount}+N${sheet.rowCount}+O${sheet.rowCount}` }, // razem_wydatki
        e.wydatki_przyszle,
        e.koszty_br,
        e.uwagi
      ]);
    }
    
    // Formatowanie kolumn numerycznych
    [9, 10, 11, 12, 13, 14, 15, 16, 17, 18].forEach(col => {
      sheet.getColumn(col).numFmt = '#,##0.00 "zł"';
      sheet.getColumn(col).width = 15;
    });
    
    // Szerokości kolumn
    sheet.getColumn(3).width = 40; // nr_ksef
    sheet.getColumn(6).width = 30; // nazwa
    sheet.getColumn(8).width = 40; // opis
    
    const buffer = await workbook.xlsx.writeBuffer();
    
    return {
      content: buffer,
      filename: `kpir_${this._getDateSuffix()}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  /**
   * wFirma - import wydatków
   */
  _toWfirmaCsv(entries) {
    // Format wFirma dla wydatków
    const headers = [
      'Data', 'Numer dokumentu', 'Nr KSeF', 'NIP', 'Kontrahent',
      'Opis', 'Netto', 'VAT', 'Brutto', 'Schemat księgowy', 'Uwagi'
    ];
    
    const rows = entries.map(e => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      this._formatAmount(e._meta.grossAmount - e._meta.vatAmount),
      this._formatAmount(e._meta.vatAmount),
      this._formatAmount(e._meta.grossAmount),
      this._mapToWfirmaSchema(e),
      e.uwagi
    ]);
    
    return {
      content: this._toCsv([headers, ...rows], ';'),
      filename: `wfirma_wydatki_${this._getDateSuffix()}.csv`,
      mimeType: 'text/csv;charset=utf-8'
    };
  }

  /**
   * Comarch Optima - XML rejestrów VAT
   */
  _toOptimaXml(entries) {
    const builder = new Builder({ headless: false, renderOpts: { pretty: true } });
    
    const xml = {
      REJESTRY_VAT: {
        $: { xmlns: 'http://www.comarch.pl/optima/rejestr' },
        REJESTR: entries.map(e => ({
          TYP: 'ZAKUP',
          DOKUMENT: {
            DATA_WYSTAWIENIA: e.data_zdarzenia,
            DATA_WPLYWU: e.data_zdarzenia,
            NUMER: e.nr_dowodu,
            NR_KSEF: e.nr_ksef,
            KONTRAHENT: {
              NIP: e.nip_kontrahenta,
              NAZWA: e.nazwa_kontrahenta,
              ADRES: e.adres_kontrahenta
            },
            OPIS: e.opis,
            NETTO: e.razem_wydatki,
            VAT: e._meta.vatAmount,
            BRUTTO: e._meta.grossAmount,
            KATEGORIA: this._mapToOptimaCategory(e),
            UWAGI: e.uwagi
          }
        }))
      }
    };
    
    return {
      content: builder.buildObject(xml),
      filename: `optima_rejestry_${this._getDateSuffix()}.xml`,
      mimeType: 'application/xml'
    };
  }

  /**
   * Insert Subiekt - EPP (EDI++)
   */
  _toSubiektEpp(entries) {
    // Format EPP to specyficzny format Insert
    const lines = [];
    
    lines.push('[NAGLOWEK]');
    lines.push(`WERSJA=3.0`);
    lines.push(`DATA_WYSTAWIENIA=${this._formatDate(new Date())}`);
    lines.push(`ILOSC_DOKUMENTOW=${entries.length}`);
    lines.push('');
    
    entries.forEach((e, idx) => {
      lines.push(`[DOKUMENT_${idx + 1}]`);
      lines.push(`TYP=FZ`); // Faktura zakupu
      lines.push(`NUMER=${e.nr_dowodu}`);
      lines.push(`NR_KSEF=${e.nr_ksef}`);
      lines.push(`DATA_WYSTAWIENIA=${e.data_zdarzenia}`);
      lines.push(`KONTRAHENT_NIP=${e.nip_kontrahenta}`);
      lines.push(`KONTRAHENT_NAZWA=${e.nazwa_kontrahenta}`);
      lines.push(`KONTRAHENT_ADRES=${e.adres_kontrahenta}`);
      lines.push(`OPIS=${e.opis}`);
      lines.push(`NETTO=${e.razem_wydatki}`);
      lines.push(`VAT=${e._meta.vatAmount}`);
      lines.push(`BRUTTO=${e._meta.grossAmount}`);
      lines.push(`UWAGI=${e.uwagi}`);
      lines.push('');
    });
    
    return {
      content: lines.join('\r\n'),
      filename: `subiekt_${this._getDateSuffix()}.epp`,
      mimeType: 'text/plain;charset=windows-1250'
    };
  }

  /**
   * Symfonia - CSV
   */
  _toSymfoniaCsv(entries) {
    const headers = [
      'Lp', 'Data', 'Nr dokumentu', 'Nr KSeF', 'NIP', 'Nazwa kontrahenta',
      'Opis', 'Kwota netto', 'Kwota VAT', 'Kwota brutto', 'Konto', 'MPK'
    ];
    
    const rows = entries.map(e => [
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
      this._mapToSymphonyAccount(e),
      e._meta.project || ''
    ]);
    
    return {
      content: this._toCsv([headers, ...rows], ';'),
      filename: `symfonia_${this._getDateSuffix()}.csv`,
      mimeType: 'text/csv;charset=windows-1250'
    };
  }

  /**
   * enova365 - XML
   */
  _toEnovaXml(entries) {
    const builder = new Builder({ headless: false, renderOpts: { pretty: true } });
    
    const xml = {
      enova: {
        $: { version: '2026.1' },
        dokumenty: {
          dokument: entries.map(e => ({
            typ: 'FZ',
            numer: e.nr_dowodu,
            nrKsef: e.nr_ksef,
            data: e.data_zdarzenia,
            kontrahent: {
              nip: e.nip_kontrahenta,
              nazwa: e.nazwa_kontrahenta,
              adres: e.adres_kontrahenta
            },
            pozycje: {
              pozycja: {
                opis: e.opis,
                netto: e.razem_wydatki,
                vat: e._meta.vatAmount,
                brutto: e._meta.grossAmount,
                kategoria: e._meta.category
              }
            },
            uwagi: e.uwagi,
            projekt: e._meta.project
          }))
        }
      }
    };
    
    return {
      content: builder.buildObject(xml),
      filename: `enova_${this._getDateSuffix()}.xml`,
      mimeType: 'application/xml'
    };
  }

  /**
   * inFakt - CSV wydatków
   */
  _toInfaktCsv(entries) {
    const headers = [
      'Data wystawienia', 'Numer faktury', 'Numer KSeF', 'NIP sprzedawcy',
      'Nazwa sprzedawcy', 'Kwota netto', 'Kwota VAT', 'Kwota brutto',
      'Kategoria', 'Opis', 'Projekt'
    ];
    
    const rows = entries.map(e => [
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
      e._meta.project || ''
    ]);
    
    return {
      content: this._toCsv([headers, ...rows], ';'),
      filename: `infakt_wydatki_${this._getDateSuffix()}.csv`,
      mimeType: 'text/csv;charset=utf-8'
    };
  }

  /**
   * iFirma - CSV
   */
  _toIfirmaCsv(entries) {
    const headers = [
      'Data', 'Nr dokumentu', 'Nr KSeF', 'NIP', 'Kontrahent',
      'Opis', 'Netto', 'Stawka VAT', 'VAT', 'Brutto', 'Rodzaj kosztu'
    ];
    
    const rows = entries.map(e => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      this._formatAmount(e.razem_wydatki),
      '23%', // domyślna stawka
      this._formatAmount(e._meta.vatAmount),
      this._formatAmount(e._meta.grossAmount),
      this._mapToIfirmaCategory(e)
    ]);
    
    return {
      content: this._toCsv([headers, ...rows], ';'),
      filename: `ifirma_${this._getDateSuffix()}.csv`,
      mimeType: 'text/csv;charset=utf-8'
    };
  }

  /**
   * Fakturownia - CSV
   */
  _toFakturowniaCsv(entries) {
    const headers = [
      'issue_date', 'number', 'ksef_number', 'seller_tax_no', 'seller_name',
      'description', 'price_net', 'price_tax', 'price_gross', 'category', 'tags'
    ];
    
    const rows = entries.map(e => [
      e.data_zdarzenia,
      e.nr_dowodu,
      e.nr_ksef,
      e.nip_kontrahenta,
      e.nazwa_kontrahenta,
      e.opis,
      e.razem_wydatki,
      e._meta.vatAmount,
      e._meta.grossAmount,
      e._meta.categoryName,
      e._meta.tags.join(',')
    ]);
    
    return {
      content: this._toCsv([headers, ...rows], ','),
      filename: `fakturownia_${this._getDateSuffix()}.csv`,
      mimeType: 'text/csv;charset=utf-8'
    };
  }

  /**
   * JPK_PKPIR - format wymagany od 2026
   */
  _toJpkPkpir(entries, options = {}) {
    const builder = new Builder({ 
      headless: false, 
      renderOpts: { pretty: true },
      xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true }
    });
    
    const now = new Date();
    const periodFrom = options.periodFrom || `${now.getFullYear()}-01-01`;
    const periodTo = options.periodTo || `${now.getFullYear()}-12-31`;
    
    const xml = {
      JPK: {
        $: {
          'xmlns': 'http://jpk.mf.gov.pl/wzor/2025/12/01/12011/',
          'xmlns:etd': 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/09/13/eD/DefinicjeTypy/'
        },
        Naglowek: {
          KodFormularza: {
            $: { kodSystemowy: 'JPK_PKPIR (3)', wersjaSchemy: '3-0' },
            _: 'JPK_PKPIR'
          },
          WariantFormularza: 3,
          CelZlozenia: options.purpose || 1, // 1 = złożenie, 2 = korekta
          DataWytworzeniaJPK: now.toISOString(),
          DataOd: periodFrom,
          DataDo: periodTo,
          NazwaSystemu: 'EXEF/opisz.pl'
        },
        Podmiot1: {
          'etd:NIP': this.companyData.nip || '',
          'etd:PelnaNazwa': this.companyData.name || ''
        },
        PKPiR: entries.map(e => ({
          K_1: e.lp,
          K_2: e.data_zdarzenia,
          K_3: e.nr_ksef || '',
          K_4: e.nr_dowodu,
          K_5: e.nip_kontrahenta,
          K_6: e.nazwa_kontrahenta,
          K_7: e.adres_kontrahenta,
          K_8: e.opis,
          K_9: this._formatAmountXml(e.przychod_sprzedaz),
          K_10: this._formatAmountXml(e.przychod_pozostaly),
          K_11: this._formatAmountXml(e.razem_przychod),
          K_12: this._formatAmountXml(e.zakup_towarow),
          K_13: this._formatAmountXml(e.koszty_uboczne),
          K_14: this._formatAmountXml(e.wynagrodzenia),
          K_15: this._formatAmountXml(e.pozostale_wydatki),
          K_16: this._formatAmountXml(e.razem_wydatki),
          K_17: this._formatAmountXml(e.wydatki_przyszle),
          K_18: this._formatAmountXml(e.koszty_br),
          K_19: e.uwagi || ''
        })),
        PKPiRCtrl: {
          LiczbaWierszy: entries.length,
          SumaPrzychodow: this._formatAmountXml(entries.reduce((sum, e) => sum + e.razem_przychod, 0)),
          SumaKosztow: this._formatAmountXml(entries.reduce((sum, e) => sum + e.razem_wydatki, 0))
        }
      }
    };
    
    return {
      content: builder.buildObject(xml),
      filename: `JPK_PKPIR_${periodFrom.replace(/-/g, '')}_${periodTo.replace(/-/g, '')}.xml`,
      mimeType: 'application/xml'
    };
  }

  // === HELPERY ===

  _formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  _formatAddress(entity) {
    if (!entity) return '';
    const parts = [entity.street, entity.city, entity.postalCode].filter(Boolean);
    return parts.join(', ');
  }

  _formatAmount(amount) {
    if (amount === 0 || amount === null || amount === undefined) return '0,00';
    return amount.toFixed(2).replace('.', ',');
  }

  _formatAmountXml(amount) {
    if (amount === 0 || amount === null || amount === undefined) return '0.00';
    return amount.toFixed(2);
  }

  _buildDescription(invoice, category) {
    const parts = [];
    
    // Kategoria
    parts.push(category.name);
    
    // Opis z faktury
    if (invoice.description?.notes) {
      parts.push(invoice.description.notes);
    }
    
    // Projekt
    if (invoice.description?.project) {
      parts.push(`[Projekt: ${invoice.description.project}]`);
    }
    
    // Tagi specjalne
    if (category.tags?.includes('auto')) {
      parts.push('[SAMOCHÓD]');
    }
    if (category.tags?.includes('br')) {
      parts.push('[B+R]');
    }
    
    return parts.join(' - ');
  }

  _buildUwagi(invoice, options) {
    const uwagi = [];
    
    if (invoice.description?.project) {
      uwagi.push(`Projekt: ${invoice.description.project}`);
    }
    
    if (invoice._meta?.isBR) {
      uwagi.push('Ulga B+R');
    }
    
    if (invoice._meta?.isAuto) {
      uwagi.push('Koszty samochodu');
    }
    
    if (invoice.description?.tags?.length) {
      uwagi.push(`Tagi: ${invoice.description.tags.join(', ')}`);
    }
    
    return uwagi.join('; ');
  }

  _toCsv(rows, separator = ';') {
    return rows.map(row => 
      row.map(cell => {
        const str = String(cell ?? '');
        if (str.includes(separator) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(separator)
    ).join('\r\n');
  }

  _getDateSuffix() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  // Mapowania na schematy księgowe konkretnych aplikacji

  _mapToWfirmaSchema(entry) {
    const mapping = {
      'paliwo': 'KOSZTY_AUTA',
      'auto_eksploatacja': 'KOSZTY_AUTA',
      'auto_ubezpieczenie': 'KOSZTY_AUTA',
      'hosting': 'KOSZTY_IT',
      'oprogramowanie': 'KOSZTY_IT',
      'marketing': 'MARKETING',
      'biuro': 'KOSZTY_BIURA',
      'telefon': 'TELEKOMUNIKACJA',
      'uslugi': 'USLUGI_OBCE'
    };
    return mapping[entry._meta.category] || 'POZOSTALE_KOSZTY';
  }

  _mapToOptimaCategory(entry) {
    const mapping = {
      'paliwo': 'PALIWO',
      'auto_eksploatacja': 'EKSPLOATACJA_POJ',
      'hosting': 'USLUGI_INFORMATYCZNE',
      'marketing': 'REKLAMA',
      'biuro': 'MAT_BIUROWE'
    };
    return mapping[entry._meta.category] || 'POZOSTALE';
  }

  _mapToSymphonyAccount(entry) {
    const mapping = {
      'paliwo': '402-01',
      'auto_eksploatacja': '402-02',
      'hosting': '403-01',
      'marketing': '405-01',
      'biuro': '401-01'
    };
    return mapping[entry._meta.category] || '409-99';
  }

  _mapToIfirmaCategory(entry) {
    const mapping = {
      'paliwo': 'Paliwo',
      'auto_eksploatacja': 'Eksploatacja samochodu',
      'hosting': 'Usługi informatyczne',
      'marketing': 'Reklama i marketing',
      'biuro': 'Materiały biurowe'
    };
    return mapping[entry._meta.category] || 'Pozostałe koszty';
  }
}

function createKpirExportService(options) {
  return new KpirExportService(options);
}

module.exports = {
  KpirExportService,
  createKpirExportService,
  KPIR_2026_COLUMNS,
  EXPENSE_CATEGORIES,
  EXPORT_FORMATS
};
