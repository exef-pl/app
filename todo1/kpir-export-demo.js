/**
 * Przykład integracji KPiR Export z EXEF Workflow
 * 
 * Scenariusz:
 * 1. Przedsiębiorca opisuje faktury w EXEF (kategoria, projekt, tagi)
 * 2. Po zatwierdzeniu eksportuje do formatu dla swojego księgowego
 * 3. Księgowy importuje gotowe dane do swojego systemu (wFirma/Optima/etc)
 */

// const { createInvoiceWorkflow } = require('./src/core/invoiceWorkflow');
const { createKpirExportService, EXPENSE_CATEGORIES, EXPORT_FORMATS } = require('../src/core/kpirExport');

async function demonstrateKpirExport() {
  console.log('=== EXEF: Demo Eksportu KPiR 2026 ===\n');

  // 1. Inicjalizacja
  const kpirService = createKpirExportService({
    companyData: {
      nip: '1234567890',
      name: 'Softreck Sp. z o.o.'
    }
  });

  // 2. Symulacja faktur z różnymi kategoriami
  const sampleInvoices = [
    // Faktura za hosting (projekt EXEF)
    {
      id: 'inv_001',
      ksef: { id: '1-1-1-2026-9876543210-20260115-ABC123' },
      extracted: {
        invoiceNumber: 'FV/2026/01/001',
        issueDate: '2026-01-15',
        seller: { name: 'OVH Hosting', nip: '9876543210' },
        amounts: { net: 200, vat: 46, gross: 246, currency: 'PLN' }
      },
      description: {
        category: 'hosting',
        project: 'EXEF',
        notes: 'Serwer VPS produkcyjny',
        tags: ['it', 'infrastruktura']
      }
    },
    
    // Faktura za paliwo (koszty samochodu)
    {
      id: 'inv_002',
      ksef: { id: '1-1-1-2026-1111111111-20260118-DEF456' },
      extracted: {
        invoiceNumber: 'FV/123/01/2026',
        issueDate: '2026-01-18',
        seller: { name: 'PKN Orlen S.A.', nip: '1111111111' },
        amounts: { net: 162.60, vat: 37.40, gross: 200, currency: 'PLN' }
      },
      description: {
        category: 'paliwo',
        notes: 'Tankowanie służbowe',
        tags: ['auto']
      }
    },
    
    // Faktura za usługi programistyczne (B+R)
    {
      id: 'inv_003',
      ksef: { id: '1-1-1-2026-2222222222-20260120-GHI789' },
      extracted: {
        invoiceNumber: 'FV/2026/01/015',
        issueDate: '2026-01-20',
        seller: { name: 'DevTeam Sp. z o.o.', nip: '2222222222' },
        amounts: { net: 5000, vat: 1150, gross: 6150, currency: 'PLN' }
      },
      description: {
        category: 'br_uslugi',
        project: 'EXEF',
        notes: 'Prace rozwojowe - moduł KSeF',
        tags: ['br', 'development']
      }
    },
    
    // Faktura za marketing
    {
      id: 'inv_004',
      ksef: { id: '1-1-1-2026-3333333333-20260121-JKL012' },
      extracted: {
        invoiceNumber: 'INV-2026-0042',
        issueDate: '2026-01-21',
        seller: { name: 'Google Ireland Ltd', nip: 'IE6388047V' },
        amounts: { net: 500, vat: 115, gross: 615, currency: 'PLN' }
      },
      description: {
        category: 'marketing',
        project: 'EXEF',
        notes: 'Google Ads - kampania styczniowa',
        tags: ['marketing', 'ads']
      }
    }
  ];

  // 3. Pokaż dostępne kategorie
  console.log('📋 Dostępne kategorie kosztów:\n');
  const categories = kpirService.getExpenseCategories();
  const groupedByColumn = {};
  categories.forEach(cat => {
    const col = cat.column;
    if (!groupedByColumn[col]) groupedByColumn[col] = [];
    groupedByColumn[col].push(cat);
  });
  
  Object.entries(groupedByColumn).forEach(([col, cats]) => {
    console.log(`  Kolumna ${col}:`);
    cats.forEach(c => {
      const tags = c.tags ? ` [${c.tags.join(', ')}]` : '';
      console.log(`    - ${c.id}: ${c.name}${tags}`);
    });
  });

  // 4. Pokaż dostępne formaty eksportu
  console.log('\n📤 Dostępne formaty eksportu:\n');
  const formats = kpirService.getAvailableFormats();
  formats.forEach(f => {
    console.log(`  ${f.id} (${f.extension})`);
    console.log(`    ${f.name}`);
    console.log(`    Aplikacje: ${f.applications.join(', ')}\n`);
  });

  // 5. Eksport do różnych formatów
  console.log('─'.repeat(60));
  console.log('\n🔄 Eksport faktur do różnych formatów:\n');

  // KPiR CSV (uniwersalny)
  const csvResult = await kpirService.exportInvoices(sampleInvoices, 'kpir_csv');
  console.log(`✅ ${csvResult.filename}`);
  console.log('   Podgląd pierwszych linii:');
  console.log(csvResult.content.split('\n').slice(0, 3).map(l => '   ' + l.substring(0, 80) + '...').join('\n'));

  // wFirma
  const wfirmaResult = await kpirService.exportInvoices(sampleInvoices, 'wfirma');
  console.log(`\n✅ ${wfirmaResult.filename}`);

  // Comarch Optima XML
  const optimaResult = await kpirService.exportInvoices(sampleInvoices, 'optima_xml');
  console.log(`✅ ${optimaResult.filename}`);

  // JPK_PKPIR (dla Urzędu Skarbowego)
  const jpkResult = await kpirService.exportInvoices(sampleInvoices, 'jpk_pkpir', {
    periodFrom: '2026-01-01',
    periodTo: '2026-01-31',
    purpose: 1
  });
  console.log(`✅ ${jpkResult.filename}`);

  // 6. Podsumowanie
  console.log('\n─'.repeat(60));
  console.log('\n📊 Podsumowanie eksportu:\n');

  const totals = {
    przychody: 0,
    pozostale_wydatki: 0,
    koszty_br: 0,
    razem_wydatki: 0
  };

  sampleInvoices.forEach(inv => {
    const entry = kpirService.mapInvoiceToKpirEntry(inv);
    totals.pozostale_wydatki += entry.pozostale_wydatki;
    totals.koszty_br += entry.koszty_br;
    totals.razem_wydatki += entry.razem_wydatki;
  });

  console.log(`  Faktury:           ${sampleInvoices.length}`);
  console.log(`  Pozostałe wydatki: ${totals.pozostale_wydatki.toFixed(2)} PLN (kolumna 15)`);
  console.log(`  Koszty B+R:        ${totals.koszty_br.toFixed(2)} PLN (kolumna 18)`);
  console.log(`  Razem koszty:      ${totals.razem_wydatki.toFixed(2)} PLN`);

  // 7. Przykład wpisu w KPiR
  console.log('\n─'.repeat(60));
  console.log('\n📝 Przykładowy wpis KPiR 2026 (faktura B+R):\n');

  const brInvoice = sampleInvoices[2];
  const brEntry = kpirService.mapInvoiceToKpirEntry(brInvoice, { lp: 3 });

  console.log(`  Kol. 1  (Lp):           ${brEntry.lp}`);
  console.log(`  Kol. 2  (Data):         ${brEntry.data_zdarzenia}`);
  console.log(`  Kol. 3  (Nr KSeF):      ${brEntry.nr_ksef}`);
  console.log(`  Kol. 4  (Nr dowodu):    ${brEntry.nr_dowodu}`);
  console.log(`  Kol. 5  (NIP):          ${brEntry.nip_kontrahenta}`);
  console.log(`  Kol. 6  (Nazwa):        ${brEntry.nazwa_kontrahenta}`);
  console.log(`  Kol. 8  (Opis):         ${brEntry.opis}`);
  console.log(`  Kol. 18 (Koszty B+R):   ${brEntry.koszty_br.toFixed(2)} PLN`);
  console.log(`  Kol. 19 (Uwagi):        ${brEntry.uwagi}`);

  console.log('\n✨ Demo zakończone!\n');
}

// Uruchom demo
if (require.main === module) {
  demonstrateKpirExport().catch(console.error);
}

module.exports = { demonstrateKpirExport };
