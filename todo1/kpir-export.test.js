/**
 * Testy modułu KPiR Export
 */

const fs = require('fs');
const path = require('path');
const { 
  createKpirExportService, 
  EXPENSE_CATEGORIES, 
  EXPORT_FORMATS,
  KPIR_2026_COLUMNS 
} = require('../src/core/kpirExport');

const OUTPUT_DIR = path.join(__dirname, '../test-output');

// Przykładowe faktury testowe
const TEST_INVOICES = [
  // 1. Hosting (IT, projekt EXEF)
  {
    id: 'test_001',
    type: 'expense',
    ksef: { id: '1-1-1-2026-9876543210-20260115-HOSTING1' },
    extracted: {
      invoiceNumber: 'FV/2026/01/001',
      issueDate: '2026-01-15',
      ksefNumber: '1-1-1-2026-9876543210-20260115-HOSTING1',
      seller: { 
        name: 'OVH Hosting Sp. z o.o.', 
        nip: '9876543210',
        street: 'ul. Serwerowa 1',
        city: 'Warszawa',
        postalCode: '00-001'
      },
      amounts: { net: 200, vat: 46, gross: 246, currency: 'PLN' }
    },
    description: {
      category: 'hosting',
      project: 'EXEF',
      notes: 'Serwer VPS produkcyjny',
      tags: ['it', 'infrastruktura']
    }
  },
  
  // 2. Paliwo (samochód)
  {
    id: 'test_002',
    type: 'expense',
    ksef: { id: '1-1-1-2026-5261040828-20260118-ORLEN123' },
    extracted: {
      invoiceNumber: 'FV/123/01/2026',
      issueDate: '2026-01-18',
      seller: { 
        name: 'PKN Orlen S.A.', 
        nip: '5261040828',
        street: 'ul. Chemików 7',
        city: 'Płock',
        postalCode: '09-411'
      },
      amounts: { net: 162.60, vat: 37.40, gross: 200, currency: 'PLN' }
    },
    description: {
      category: 'paliwo',
      notes: 'Tankowanie służbowe - WE12345',
      tags: ['auto', 'pojazd_firmowy']
    }
  },
  
  // 3. Usługi B+R (ulga podatkowa)
  {
    id: 'test_003',
    type: 'expense',
    ksef: { id: '1-1-1-2026-1234567890-20260120-DEVTEAM1' },
    extracted: {
      invoiceNumber: 'FV/2026/01/015',
      issueDate: '2026-01-20',
      seller: { 
        name: 'DevTeam Sp. z o.o.', 
        nip: '1234567890',
        street: 'ul. Programistów 10',
        city: 'Kraków',
        postalCode: '30-001'
      },
      amounts: { net: 5000, vat: 1150, gross: 6150, currency: 'PLN' }
    },
    description: {
      category: 'br_uslugi',
      project: 'EXEF',
      notes: 'Prace rozwojowe - moduł KSeF parser',
      tags: ['br', 'development', 'ksef']
    }
  },
  
  // 4. Marketing (Google Ads)
  {
    id: 'test_004',
    type: 'expense',
    ksef: { id: '1-1-1-2026-IE6388047V-20260121-GOOGLE01' },
    extracted: {
      invoiceNumber: 'INV-2026-0042-PL',
      issueDate: '2026-01-21',
      seller: { 
        name: 'Google Ireland Limited', 
        nip: 'IE6388047V',
        street: 'Gordon House, Barrow Street',
        city: 'Dublin 4',
        postalCode: 'D04 E5W5'
      },
      amounts: { net: 500, vat: 115, gross: 615, currency: 'PLN' }
    },
    description: {
      category: 'marketing',
      project: 'EXEF',
      notes: 'Google Ads - kampania styczniowa',
      tags: ['marketing', 'ads', 'digital']
    }
  },
  
  // 5. Materiały biurowe
  {
    id: 'test_005',
    type: 'expense',
    ksef: { id: '1-1-1-2026-7791011327-20260122-BIURO001' },
    extracted: {
      invoiceNumber: 'FV/2026/0199',
      issueDate: '2026-01-22',
      seller: { 
        name: 'IKEA Retail Sp. z o.o.', 
        nip: '7791011327',
        street: 'ul. Malborska 47',
        city: 'Janki',
        postalCode: '05-090'
      },
      amounts: { net: 81.30, vat: 18.70, gross: 100, currency: 'PLN' }
    },
    description: {
      category: 'biuro',
      notes: 'Materiały biurowe - krzesło, lampka',
      tags: ['biuro', 'wyposazenie']
    }
  },
  
  // 6. Zakup towarów (kolumna 12)
  {
    id: 'test_006',
    type: 'expense',
    ksef: { id: '1-1-1-2026-5213609321-20260110-HURTOW01' },
    extracted: {
      invoiceNumber: 'FZ/2026/00123',
      issueDate: '2026-01-10',
      seller: { 
        name: 'AB S.A.', 
        nip: '5213609321',
        street: 'Magnice, ul. Europejska 4',
        city: 'Kobierzyce',
        postalCode: '55-040'
      },
      amounts: { net: 8500, vat: 1955, gross: 10455, currency: 'PLN' }
    },
    description: {
      category: 'towary',
      notes: 'Zakup towarów do odsprzedaży - sprzęt IT',
      tags: ['towary', 'magazyn']
    }
  },
  
  // 7. Transport (kolumna 13 - koszty uboczne)
  {
    id: 'test_007',
    type: 'expense',
    ksef: { id: '1-1-1-2026-9510004937-20260112-DHL00001' },
    extracted: {
      invoiceNumber: 'DHL/2026/PL/0004521',
      issueDate: '2026-01-12',
      seller: { 
        name: 'DHL Express (Poland) Sp. z o.o.', 
        nip: '9510004937',
        street: 'ul. Osmańska 2',
        city: 'Warszawa',
        postalCode: '02-823'
      },
      amounts: { net: 150, vat: 34.50, gross: 184.50, currency: 'PLN' }
    },
    description: {
      category: 'transport',
      notes: 'Dostawa towarów z hurtowni',
      tags: ['transport', 'logistyka']
    }
  }
];

// Dane firmy testowej
const COMPANY_DATA = {
  nip: '1234567890',
  name: 'Softreck Sp. z o.o.',
  regon: '123456789',
  address: {
    street: 'ul. Testowa 1',
    city: 'Gdańsk',
    postalCode: '80-001'
  }
};

// === TESTY ===

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           TESTY MODUŁU KPIR EXPORT 2026                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Utwórz katalog output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const kpirService = createKpirExportService({
    companyData: COMPANY_DATA
  });

  let passed = 0;
  let failed = 0;

  // Test 1: Mapowanie kategorii
  console.log('─── Test 1: Mapowanie kategorii na kolumny KPiR ───');
  try {
    const hostingEntry = kpirService.mapInvoiceToKpirEntry(TEST_INVOICES[0]);
    const paliwEntry = kpirService.mapInvoiceToKpirEntry(TEST_INVOICES[1]);
    const brEntry = kpirService.mapInvoiceToKpirEntry(TEST_INVOICES[2]);
    const towaryEntry = kpirService.mapInvoiceToKpirEntry(TEST_INVOICES[5]);
    const transportEntry = kpirService.mapInvoiceToKpirEntry(TEST_INVOICES[6]);

    console.log(`  hosting (kol.15):     ${hostingEntry.pozostale_wydatki > 0 ? '✅' : '❌'} (${hostingEntry.pozostale_wydatki})`);
    console.log(`  paliwo (kol.15):      ${paliwEntry.pozostale_wydatki > 0 ? '✅' : '❌'} (${paliwEntry.pozostale_wydatki})`);
    console.log(`  br_uslugi (kol.18):   ${brEntry.koszty_br > 0 ? '✅' : '❌'} (${brEntry.koszty_br})`);
    console.log(`  towary (kol.12):      ${towaryEntry.zakup_towarow > 0 ? '✅' : '❌'} (${towaryEntry.zakup_towarow})`);
    console.log(`  transport (kol.13):   ${transportEntry.koszty_uboczne > 0 ? '✅' : '❌'} (${transportEntry.koszty_uboczne})`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 2: Numery KSeF w eksporcie
  console.log('\n─── Test 2: Numery KSeF w wpisach ───');
  try {
    const entry = kpirService.mapInvoiceToKpirEntry(TEST_INVOICES[0]);
    const hasKsef = entry.nr_ksef && entry.nr_ksef.length > 10;
    const hasNip = entry.nip_kontrahenta && entry.nip_kontrahenta.length >= 10;
    
    console.log(`  Nr KSeF (kol.3):      ${hasKsef ? '✅' : '❌'} "${entry.nr_ksef}"`);
    console.log(`  NIP (kol.5):          ${hasNip ? '✅' : '❌'} "${entry.nip_kontrahenta}"`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 3: Eksport KPiR CSV
  console.log('\n─── Test 3: Eksport KPiR CSV ───');
  try {
    const result = await kpirService.exportInvoices(TEST_INVOICES, 'kpir_csv');
    
    const lines = result.content.split('\n');
    const headers = lines[0].split(';');
    
    console.log(`  Plik:                 ${result.filename}`);
    console.log(`  Liczba kolumn:        ${headers.length === 19 ? '✅' : '❌'} (${headers.length}/19)`);
    console.log(`  Liczba wierszy:       ${lines.length - 1} (nagłówek + ${TEST_INVOICES.length} faktur)`);
    console.log(`  Kolumna 3 (KSeF):     ${headers[2] === 'nr_ksef' ? '✅' : '❌'} "${headers[2]}"`);
    console.log(`  Kolumna 5 (NIP):      ${headers[4] === 'nip_kontrahenta' ? '✅' : '❌'} "${headers[4]}"`);
    
    // Zapisz plik
    const filePath = path.join(OUTPUT_DIR, result.filename);
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`  Zapisano:             ${filePath}`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 4: Eksport Excel (XLSX)
  console.log('\n─── Test 4: Eksport KPiR Excel (XLSX) ───');
  try {
    const result = await kpirService.exportInvoices(TEST_INVOICES, 'kpir_xlsx');
    
    console.log(`  Plik:                 ${result.filename}`);
    console.log(`  Rozmiar:              ${result.content.length} bajtów`);
    console.log(`  MIME:                 ${result.mimeType.includes('spreadsheet') ? '✅' : '❌'}`);
    
    const filePath = path.join(OUTPUT_DIR, result.filename);
    fs.writeFileSync(filePath, result.content);
    console.log(`  Zapisano:             ${filePath}`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 5: Eksport wFirma
  console.log('\n─── Test 5: Eksport wFirma CSV ───');
  try {
    const result = await kpirService.exportInvoices(TEST_INVOICES, 'wfirma');
    
    const lines = result.content.split('\n');
    const firstData = lines[1].split(';');
    
    console.log(`  Plik:                 ${result.filename}`);
    console.log(`  Zawiera Nr KSeF:      ${result.content.includes('1-1-1-2026') ? '✅' : '❌'}`);
    console.log(`  Zawiera schematy:     ${result.content.includes('KOSZTY') ? '✅' : '❌'}`);
    
    const filePath = path.join(OUTPUT_DIR, result.filename);
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`  Zapisano:             ${filePath}`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 6: Eksport Comarch Optima XML
  console.log('\n─── Test 6: Eksport Comarch Optima XML ───');
  try {
    const result = await kpirService.exportInvoices(TEST_INVOICES, 'optima_xml');
    
    const hasXmlHeader = result.content.includes('<?xml');
    const hasKsefTag = result.content.includes('NR_KSEF');
    const hasNipTag = result.content.includes('<NIP>');
    
    console.log(`  Plik:                 ${result.filename}`);
    console.log(`  Nagłówek XML:         ${hasXmlHeader ? '✅' : '❌'}`);
    console.log(`  Tag NR_KSEF:          ${hasKsefTag ? '✅' : '❌'}`);
    console.log(`  Tag NIP:              ${hasNipTag ? '✅' : '❌'}`);
    
    const filePath = path.join(OUTPUT_DIR, result.filename);
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`  Zapisano:             ${filePath}`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 7: Eksport Insert Subiekt EPP
  console.log('\n─── Test 7: Eksport Insert Subiekt EPP ───');
  try {
    const result = await kpirService.exportInvoices(TEST_INVOICES, 'subiekt_epp');
    
    const hasHeader = result.content.includes('[NAGLOWEK]');
    const hasDocSection = result.content.includes('[DOKUMENT_1]');
    const hasKsefField = result.content.includes('NR_KSEF=');
    
    console.log(`  Plik:                 ${result.filename}`);
    console.log(`  Sekcja NAGLOWEK:      ${hasHeader ? '✅' : '❌'}`);
    console.log(`  Sekcja DOKUMENT:      ${hasDocSection ? '✅' : '❌'}`);
    console.log(`  Pole NR_KSEF:         ${hasKsefField ? '✅' : '❌'}`);
    
    const filePath = path.join(OUTPUT_DIR, result.filename);
    fs.writeFileSync(filePath, result.content, 'latin1'); // Windows-1250
    console.log(`  Zapisano:             ${filePath}`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 8: Eksport JPK_PKPIR
  console.log('\n─── Test 8: Eksport JPK_PKPIR (dla US) ───');
  try {
    const result = await kpirService.exportInvoices(TEST_INVOICES, 'jpk_pkpir', {
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      purpose: 1
    });
    
    const hasJpkRoot = result.content.includes('<JPK');
    const hasKodFormularza = result.content.includes('JPK_PKPIR');
    const hasK3 = result.content.includes('<K_3>');  // Nr KSeF
    const hasK5 = result.content.includes('<K_5>');  // NIP
    const hasK18 = result.content.includes('<K_18>'); // Koszty B+R
    const hasPKPiRCtrl = result.content.includes('PKPiRCtrl');
    
    console.log(`  Plik:                 ${result.filename}`);
    console.log(`  Element JPK:          ${hasJpkRoot ? '✅' : '❌'}`);
    console.log(`  Kod JPK_PKPIR:        ${hasKodFormularza ? '✅' : '❌'}`);
    console.log(`  Kolumna K_3 (KSeF):   ${hasK3 ? '✅' : '❌'}`);
    console.log(`  Kolumna K_5 (NIP):    ${hasK5 ? '✅' : '❌'}`);
    console.log(`  Kolumna K_18 (B+R):   ${hasK18 ? '✅' : '❌'}`);
    console.log(`  Sekcja PKPiRCtrl:     ${hasPKPiRCtrl ? '✅' : '❌'}`);
    
    const filePath = path.join(OUTPUT_DIR, result.filename);
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`  Zapisano:             ${filePath}`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 9: Sumy kontrolne
  console.log('\n─── Test 9: Sumy kontrolne ───');
  try {
    const entries = TEST_INVOICES.map((inv, idx) => 
      kpirService.mapInvoiceToKpirEntry(inv, { lp: idx + 1 })
    );
    
    const sumPozostale = entries.reduce((s, e) => s + e.pozostale_wydatki, 0);
    const sumBR = entries.reduce((s, e) => s + e.koszty_br, 0);
    const sumTowary = entries.reduce((s, e) => s + e.zakup_towarow, 0);
    const sumTransport = entries.reduce((s, e) => s + e.koszty_uboczne, 0);
    const sumRazem = entries.reduce((s, e) => s + e.razem_wydatki, 0);
    
    console.log(`  Kol.12 (towary):      ${sumTowary.toFixed(2)} PLN`);
    console.log(`  Kol.13 (transport):   ${sumTransport.toFixed(2)} PLN`);
    console.log(`  Kol.15 (pozostałe):   ${sumPozostale.toFixed(2)} PLN`);
    console.log(`  Kol.18 (B+R):         ${sumBR.toFixed(2)} PLN`);
    console.log(`  Kol.16 (razem):       ${sumRazem.toFixed(2)} PLN`);
    
    // Weryfikacja sum
    const expectedTotal = 200 + 162.60 + 5000 + 500 + 81.30 + 8500 + 150;
    const isCorrect = Math.abs(sumRazem - expectedTotal) < 0.01;
    console.log(`  Weryfikacja sumy:     ${isCorrect ? '✅' : '❌'} (oczekiwano: ${expectedTotal.toFixed(2)})`);
    
    passed++;
  } catch (e) {
    console.log(`  ❌ BŁĄD: ${e.message}`);
    failed++;
  }

  // Test 10: Wszystkie formaty
  console.log('\n─── Test 10: Eksport wszystkich formatów ───');
  const formats = ['symfonia', 'enova', 'infakt', 'ifirma', 'fakturownia'];
  for (const format of formats) {
    try {
      const result = await kpirService.exportInvoices(TEST_INVOICES, format);
      const filePath = path.join(OUTPUT_DIR, result.filename);
      fs.writeFileSync(filePath, result.content, 'utf8');
      console.log(`  ${format.padEnd(15)} ✅ ${result.filename}`);
    } catch (e) {
      console.log(`  ${format.padEnd(15)} ❌ ${e.message}`);
    }
  }
  passed++;

  // Podsumowanie
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  WYNIKI: ${passed} testów OK, ${failed} błędów                            ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  console.log(`\n📁 Pliki testowe zapisano w: ${OUTPUT_DIR}`);
  
  // Lista wygenerowanych plików
  const files = fs.readdirSync(OUTPUT_DIR);
  console.log('\n📄 Wygenerowane pliki:');
  files.forEach(f => {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`   - ${f} (${stat.size} B)`);
  });

  return { passed, failed };
}

// Uruchom testy
if (require.main === module) {
  runTests()
    .then(({ passed, failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Błąd krytyczny:', err);
      process.exit(1);
    });
}

module.exports = { runTests, TEST_INVOICES, COMPANY_DATA };
