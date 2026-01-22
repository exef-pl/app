/**
 * EXEF Invoice Workflow - Przykład użycia
 * Pokazuje jak zintegrować wszystkie moduły
 */

const { createInvoiceOrchestrator } = require('./src/core/orchestrator');
const { createKsefFacade } = require('./src/core/ksefFacade'); // istniejący moduł

async function main() {
  console.log('=== EXEF Invoice Workflow Demo ===\n');

  // 1. Utwórz orchestrator
  const orchestrator = createInvoiceOrchestrator({
    autoOcr: true,
    autoSuggest: true,
    ksefPollInterval: 15 * 60 * 1000, // 15 min
    
    // Opcjonalnie: KSeF facade
    // ksefFacade: createKsefFacade({ env: 'demo' }),
    
    // Opcjonalnie: OCR provider
    // ocrProvider: createTesseractProvider(),
  });

  // 2. Skonfiguruj źródła faktur

  // Email - monitoring skrzynki
  orchestrator.addEmailAccount('main-inbox', {
    user: 'faktury@firma.pl',
    password: process.env.EMAIL_PASSWORD,
    host: 'imap.firma.pl',
    port: 993,
    folders: ['INBOX', 'Faktury']
  });

  // Storage - lokalny folder
  orchestrator.addStorageFolder('faktury-folder', '/home/user/Faktury', {
    recursive: true
  });

  // Dropbox
  orchestrator.addDropbox('dropbox-faktury', {
    accessToken: process.env.DROPBOX_TOKEN,
    folderPath: '/Dokumenty/Faktury'
  });

  // 3. Dodaj reguły auto-opisu

  // Konkretny dostawca -> konkretna kategoria
  orchestrator.addDescriptionRule({
    name: 'OVH -> Hosting',
    conditions: { nameContains: 'ovh' },
    result: { category: 'hosting', mpk: 'IT-001' },
    priority: 90
  });

  orchestrator.addDescriptionRule({
    name: 'Orlen/BP -> Paliwo',
    conditions: { nameContains: 'orlen' },
    result: { category: 'fuel', mpk: 'FLEET-001' },
    priority: 90
  });

  orchestrator.addDescriptionRule({
    name: 'Małe kwoty -> Materiały biurowe',
    conditions: { amountMax: 100 },
    result: { category: 'office' },
    priority: 30
  });

  // 4. Nasłuchuj na eventy
  orchestrator.on('invoice:added', (invoice) => {
    console.log(`📥 Nowa faktura: ${invoice.originalFile.name} (źródło: ${invoice.source})`);
  });

  orchestrator.on('invoice:processed', (invoice) => {
    console.log(`🔍 OCR zakończony: ${invoice.extracted?.invoiceNumber || 'brak numeru'}`);
    console.log(`   Sprzedawca: ${invoice.extracted?.seller?.name}`);
    console.log(`   Kwota: ${invoice.extracted?.amounts?.gross} PLN`);
  });

  orchestrator.on('invoice:suggestions', (invoice) => {
    const s = invoice.suggestions;
    console.log(`💡 Sugestia: ${s.category} (pewność: ${s.confidence}%)`);
    if (s.basedOnHistory > 0) {
      console.log(`   Na podstawie ${s.basedOnHistory} poprzednich faktur`);
    }
  });

  orchestrator.on('invoice:approved', (invoice) => {
    console.log(`✅ Zatwierdzona: ${invoice.extracted?.invoiceNumber}`);
    console.log(`   Kategoria: ${invoice.description.category}`);
  });

  orchestrator.on('error', (err) => {
    console.error(`❌ Błąd [${err.source}]:`, err.error?.message || err);
  });

  // 5. Uruchom
  await orchestrator.initialize();

  // 6. Przykład interakcji użytkownika
  console.log('\n--- Symulacja użytkownika ---\n');

  // Czekaj na faktury (w realnej aplikacji to byłby UI)
  await sleep(2000);

  // Pobierz faktury do opisania
  const pending = orchestrator.getPendingInvoices();
  console.log(`\n📋 Faktury do opisania: ${pending.length}`);

  for (const invoice of pending) {
    console.log(`\n--- Faktura: ${invoice.id.slice(0, 8)}... ---`);
    console.log(`Plik: ${invoice.originalFile.name}`);
    console.log(`Źródło: ${invoice.source}`);
    
    if (invoice.extracted) {
      console.log(`Sprzedawca: ${invoice.extracted.seller?.name}`);
      console.log(`Kwota: ${invoice.extracted.amounts?.gross} PLN`);
    }
    
    if (invoice.suggestions) {
      console.log(`\nSugestia: ${invoice.suggestions.category} (${invoice.suggestions.confidence}%)`);
      
      if (invoice.suggestions.confidence >= 80) {
        // Automatyczne zatwierdzenie przy wysokiej pewności
        console.log('→ Auto-zatwierdzam (wysoka pewność)');
        await orchestrator.approveWithSuggestion(invoice.id);
      } else {
        // Wymaga ręcznej akceptacji
        console.log('→ Wymaga ręcznego potwierdzenia');
      }
    }
  }

  // 7. Statystyki
  console.log('\n--- Statystyki ---');
  const stats = orchestrator.getStats();
  console.log('Inbox:', stats.inbox);
  console.log('Kategorie:', stats.categories);

  // 8. Eksport zatwierdzonych (dla księgowego)
  const approved = orchestrator.getApprovedInvoices();
  console.log(`\n📤 Gotowe do eksportu: ${approved.length} faktur`);

  // W realnej aplikacji: eksport do CSV/wFirma API
  // await exportToAccountant(approved);

  // Cleanup
  await orchestrator.shutdown();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Uruchom demo
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
