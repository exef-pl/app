/**
 * Centralized document type configuration.
 *
 * Each project type maps to a config that drives:
 *   - Table columns & widths  (TaskContentArea)
 *   - Detail panel fields      (DocumentViewPanel)
 *   - Status labels            (both)
 *   - Activity tab labels      (ActivityTabbedPanel)
 *
 * To add a new document type:
 *   1. Add an entry here
 *   2. Add enum value in backend models.py + schemas.py
 *   3. Add PROJECT_TYPES entry in constants.js
 *   4. Add template in seed_demo.py + sources in templates.py
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TYPE CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

const DOC_TYPE_CONFIGS = {

  // ── Faktura (default for all bookkeeping project types) ──────────────────
  invoice: {
    table: {
      colWidths: ['4%', '17%', '21%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Numer', align: 'left' },
        { key: 'contractor', label: 'Kontrahent', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Kategoria', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (numer, kontrahent, NIP, kategoria)...',
      emptyCategory: '⚠️ Brak',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Wyeksportowane' },
    detail: {
      icon: '📄',
      titleFn: (d) => d.number || 'Dokument',
      sectionLabel: 'Dane dokumentu',
      fields: (d) => [
        ['Numer', d.number || '—'],
        ['Kontrahent', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Kwota brutto', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Zatwierdzony', exported: 'Wyeksportowany' },
      categoryLabel: 'Kategoria',
      categoryPlaceholder: 'np. IT - Hosting, Biuro, Marketing...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Opis',
      descPlaceholder: 'Dodaj opis dokumentu...',
    },
    tabs: { newLabel: 'Nowy', showDuplicates: false },
    form: {
      submitLabel: 'Utwórz dokument',
      fields: [
        { key: 'number', label: 'Numer dokumentu', type: 'text' },
        { key: 'contractor_name', label: 'Kontrahent', type: 'text' },
        { key: 'contractor_nip', label: 'NIP kontrahenta', type: 'text' },
        { key: 'amount_net', label: 'Kwota netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Kwota brutto', type: 'number' },
        { key: 'document_date', label: 'Data dokumentu', type: 'date' },
      ],
    },
  },

  // ── Rekrutacja / CV ──────────────────────────────────────────────────────
  rekrutacja: {
    table: {
      colWidths: ['4%', '22%', '18%', '22%', '12%', '12%', '10%'],
      columns: [
        { key: 'contractor', label: 'Kandydat', align: 'left' },
        { key: 'category', label: 'Stanowisko', align: 'left' },
        { key: 'tags', label: 'Umiejętności', align: 'left' },
        { key: 'date', label: 'Data', align: 'center' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (kandydat, stanowisko, umiejętności)...',
      emptyCategory: 'Brak stanowiska',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: '',
    },
    stats: { new: 'Nowe', described: 'Ocenione', exported: 'Zatwierdzone' },
    detail: {
      icon: '👤',
      titleFn: (d) => d.contractor_name || d.number || 'Kandydat',
      sectionLabel: 'Dane kandydata',
      fields: (d) => [
        ['Kandydat', d.contractor_name || '—'],
        ['Email / Telefon', d.contractor_nip || '—'],
        ['Plik', d.number || '—'],
        ['Data otrzymania', d.document_date || '—'],
      ],
      status: { new: 'Nowe CV', described: 'Oceniony', approved: 'Zatwierdzony', exported: 'Zamknięty' },
      categoryLabel: 'Stanowisko',
      categoryPlaceholder: 'np. Frontend Developer, QA Engineer...',
      tagsLabel: 'Umiejętności',
      tagPlaceholder: 'Dodaj umiejętność...',
      descLabel: 'Notatki',
      descPlaceholder: 'Notatki o kandydacie, wrażenia z rozmowy...',
    },
    tabs: { newLabel: 'Nowy kandydat', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj kandydata',
      fields: [
        { key: 'contractor_name', label: 'Imię i nazwisko', type: 'text' },
        { key: 'contractor_nip', label: 'Email / Telefon', type: 'text' },
        { key: 'number', label: 'Nazwa pliku / Ref.', type: 'text' },
        { key: 'document_date', label: 'Data otrzymania', type: 'date' },
      ],
    },
  },

  // ── Umowy / Kontrakty ────────────────────────────────────────────────────
  umowy: {
    table: {
      colWidths: ['4%', '22%', '18%', '14%', '12%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Numer / Nazwa', align: 'left' },
        { key: 'contractor', label: 'Strona umowy', align: 'left' },
        { key: 'category', label: 'Typ umowy', align: 'left' },
        { key: 'date', label: 'Data', align: 'center' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nazwa, strona, typ, NIP)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Zarchiwizowane' },
    detail: {
      icon: '📝',
      titleFn: (d) => d.number || d.contractor_name || 'Umowa',
      sectionLabel: 'Dane umowy',
      fields: (d) => [
        ['Numer / Nazwa', d.number || '—'],
        ['Strona umowy', d.contractor_name || '—'],
        ['NIP / PESEL', d.contractor_nip || '—'],
        ['Data umowy', d.document_date || '—'],
      ],
      status: { new: 'Nowa', described: 'Opisana', approved: 'Zatwierdzona', exported: 'Zarchiwizowana' },
      categoryLabel: 'Typ umowy',
      categoryPlaceholder: 'np. B2B, Umowa o pracę, NDA...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Uwagi',
      descPlaceholder: 'Uwagi do umowy, kluczowe warunki...',
    },
    tabs: { newLabel: 'Nowa umowa', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj umowę',
      fields: [
        { key: 'number', label: 'Numer / Nazwa umowy', type: 'text' },
        { key: 'contractor_name', label: 'Strona umowy', type: 'text' },
        { key: 'contractor_nip', label: 'NIP / PESEL', type: 'text' },
        { key: 'document_date', label: 'Data umowy', type: 'date' },
        { key: 'amount_gross', label: 'Wartość umowy', type: 'number' },
      ],
    },
  },

  // ── Korespondencja ───────────────────────────────────────────────────────
  korespondencja: {
    table: {
      colWidths: ['4%', '20%', '20%', '14%', '12%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Sygnatura', align: 'left' },
        { key: 'contractor', label: 'Nadawca / Odbiorca', align: 'left' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'date', label: 'Data', align: 'center' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (sygnatura, nadawca, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: '',
    },
    stats: { new: 'Nowe', described: 'Zarejestrowane', exported: 'Zarchiwizowane' },
    detail: {
      icon: '✉️',
      titleFn: (d) => d.number || 'Pismo',
      sectionLabel: 'Dane korespondencji',
      fields: (d) => [
        ['Sygnatura', d.number || '—'],
        ['Nadawca / Odbiorca', d.contractor_name || '—'],
        ['Adres / Kontakt', d.contractor_nip || '—'],
        ['Data pisma', d.document_date || '—'],
      ],
      status: { new: 'Nowe', described: 'Zarejestrowane', approved: 'Obsłużone', exported: 'Zarchiwizowane' },
      categoryLabel: 'Typ korespondencji',
      categoryPlaceholder: 'np. Pismo urzędowe, Reklamacja, Wezwanie...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Treść / Streszczenie',
      descPlaceholder: 'Streszczenie korespondencji...',
    },
    tabs: { newLabel: 'Nowe pismo', showDuplicates: false },
    form: {
      submitLabel: 'Zarejestruj pismo',
      fields: [
        { key: 'number', label: 'Sygnatura / Nr pisma', type: 'text' },
        { key: 'contractor_name', label: 'Nadawca / Odbiorca', type: 'text' },
        { key: 'contractor_nip', label: 'Adres / Kontakt', type: 'text' },
        { key: 'document_date', label: 'Data pisma', type: 'date' },
      ],
    },
  },

  // ── Zamówienia ───────────────────────────────────────────────────────────
  zamowienia: {
    table: {
      colWidths: ['4%', '17%', '20%', '14%', '13%', '18%', '14%'],
      columns: [
        { key: 'number', label: 'Nr zamówienia', align: 'left' },
        { key: 'contractor', label: 'Klient / Dostawca', align: 'left' },
        { key: 'amount', label: 'Wartość', align: 'right' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nr zamówienia, klient, NIP)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'W realizacji', exported: 'Zrealizowane' },
    detail: {
      icon: '🛒',
      titleFn: (d) => d.number || 'Zamówienie',
      sectionLabel: 'Dane zamówienia',
      fields: (d) => [
        ['Nr zamówienia', d.number || '—'],
        ['Klient / Dostawca', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Wartość', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data zamówienia', d.document_date || '—'],
      ],
      status: { new: 'Nowe', described: 'W realizacji', approved: 'Potwierdzone', exported: 'Zrealizowane' },
      categoryLabel: 'Typ zamówienia',
      categoryPlaceholder: 'np. Zakup, Sprzedaż, Zwrot...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Uwagi',
      descPlaceholder: 'Uwagi do zamówienia, szczegóły dostawy...',
    },
    tabs: { newLabel: 'Nowe zamówienie', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj zamówienie',
      fields: [
        { key: 'number', label: 'Nr zamówienia', type: 'text' },
        { key: 'contractor_name', label: 'Klient / Dostawca', type: 'text' },
        { key: 'contractor_nip', label: 'NIP', type: 'text' },
        { key: 'amount_net', label: 'Wartość netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Wartość brutto', type: 'number' },
        { key: 'document_date', label: 'Data zamówienia', type: 'date' },
      ],
    },
  },

  // ── Protokoły ────────────────────────────────────────────────────────────
  protokoly: {
    table: {
      colWidths: ['4%', '22%', '20%', '14%', '12%', '16%', '12%'],
      columns: [
        { key: 'number', label: 'Numer', align: 'left' },
        { key: 'contractor', label: 'Sporządzony przez', align: 'left' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'date', label: 'Data', align: 'center' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (numer, autor, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: '',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Zatwierdzone' },
    detail: {
      icon: '📋',
      titleFn: (d) => d.number || 'Protokół',
      sectionLabel: 'Dane protokołu',
      fields: (d) => [
        ['Numer', d.number || '—'],
        ['Sporządzony przez', d.contractor_name || '—'],
        ['Uczestnicy', d.contractor_nip || '—'],
        ['Data sporządzenia', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Zatwierdzony', exported: 'Zarchiwizowany' },
      categoryLabel: 'Typ protokołu',
      categoryPlaceholder: 'np. Odbiór, Zebranie, Kontrola...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Treść / Ustalenia',
      descPlaceholder: 'Kluczowe ustalenia, decyzje, wnioski...',
    },
    tabs: { newLabel: 'Nowy protokół', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj protokół',
      fields: [
        { key: 'number', label: 'Numer protokołu', type: 'text' },
        { key: 'contractor_name', label: 'Sporządzony przez', type: 'text' },
        { key: 'contractor_nip', label: 'Uczestnicy', type: 'text' },
        { key: 'document_date', label: 'Data sporządzenia', type: 'date' },
      ],
    },
  },

  // ── Polisy / Ubezpieczenia ───────────────────────────────────────────────
  polisy: {
    table: {
      colWidths: ['4%', '18%', '18%', '14%', '14%', '18%', '14%'],
      columns: [
        { key: 'number', label: 'Nr polisy', align: 'left' },
        { key: 'contractor', label: 'Ubezpieczyciel', align: 'left' },
        { key: 'amount', label: 'Składka', align: 'right' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nr polisy, ubezpieczyciel, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Aktywne' },
    detail: {
      icon: '🛡️',
      titleFn: (d) => d.number || 'Polisa',
      sectionLabel: 'Dane polisy',
      fields: (d) => [
        ['Nr polisy', d.number || '—'],
        ['Ubezpieczyciel', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Składka', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data wystawienia', d.document_date || '—'],
      ],
      status: { new: 'Nowa', described: 'Opisana', approved: 'Aktywna', exported: 'Wygasła' },
      categoryLabel: 'Typ ubezpieczenia',
      categoryPlaceholder: 'np. OC, AC, Majątkowe, Zdrowotne...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Uwagi',
      descPlaceholder: 'Zakres ubezpieczenia, wyłączenia, limity...',
    },
    tabs: { newLabel: 'Nowa polisa', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj polisę',
      fields: [
        { key: 'number', label: 'Nr polisy', type: 'text' },
        { key: 'contractor_name', label: 'Ubezpieczyciel', type: 'text' },
        { key: 'contractor_nip', label: 'NIP ubezpieczyciela', type: 'text' },
        { key: 'amount_gross', label: 'Składka', type: 'number' },
        { key: 'document_date', label: 'Data wystawienia', type: 'date' },
      ],
    },
  },

  // ── Wnioski ──────────────────────────────────────────────────────────────
  wnioski: {
    table: {
      colWidths: ['4%', '20%', '20%', '14%', '12%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr wniosku', align: 'left' },
        { key: 'contractor', label: 'Wnioskodawca', align: 'left' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'date', label: 'Data', align: 'center' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nr wniosku, wnioskodawca, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: '',
    },
    stats: { new: 'Nowe', described: 'Rozpatrywane', exported: 'Rozpatrzone' },
    detail: {
      icon: '📨',
      titleFn: (d) => d.number || 'Wniosek',
      sectionLabel: 'Dane wniosku',
      fields: (d) => [
        ['Nr wniosku', d.number || '—'],
        ['Wnioskodawca', d.contractor_name || '—'],
        ['Kontakt', d.contractor_nip || '—'],
        ['Data złożenia', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Rozpatrywany', approved: 'Zaakceptowany', exported: 'Zamknięty' },
      categoryLabel: 'Typ wniosku',
      categoryPlaceholder: 'np. Urlop, Zakup, Reklamacja, Zmiana...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Uzasadnienie',
      descPlaceholder: 'Treść wniosku, uzasadnienie...',
    },
    tabs: { newLabel: 'Nowy wniosek', showDuplicates: false },
    form: {
      submitLabel: 'Złóż wniosek',
      fields: [
        { key: 'number', label: 'Nr wniosku', type: 'text' },
        { key: 'contractor_name', label: 'Wnioskodawca', type: 'text' },
        { key: 'contractor_nip', label: 'Kontakt', type: 'text' },
        { key: 'document_date', label: 'Data złożenia', type: 'date' },
      ],
    },
  },

  // ── Nieruchomości ────────────────────────────────────────────────────────
  nieruchomosci: {
    table: {
      colWidths: ['4%', '20%', '18%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Adres / Nr', align: 'left' },
        { key: 'contractor', label: 'Właściciel / Najemca', align: 'left' },
        { key: 'amount', label: 'Czynsz', align: 'right' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (adres, właściciel, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Aktywne' },
    detail: {
      icon: '🏠',
      titleFn: (d) => d.number || 'Nieruchomość',
      sectionLabel: 'Dane nieruchomości',
      fields: (d) => [
        ['Adres / Nr', d.number || '—'],
        ['Właściciel / Najemca', d.contractor_name || '—'],
        ['NIP / PESEL', d.contractor_nip || '—'],
        ['Czynsz', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data dokumentu', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Aktywny', exported: 'Zamknięty' },
      categoryLabel: 'Typ',
      categoryPlaceholder: 'np. Najem, Sprzedaż, Akt notarialny...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Opis',
      descPlaceholder: 'Opis nieruchomości, warunki...',
    },
    tabs: { newLabel: 'Nowy dokument', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj dokument',
      fields: [
        { key: 'number', label: 'Adres / Nr księgi', type: 'text' },
        { key: 'contractor_name', label: 'Właściciel / Najemca', type: 'text' },
        { key: 'contractor_nip', label: 'NIP / PESEL', type: 'text' },
        { key: 'amount_gross', label: 'Czynsz / Wartość', type: 'number' },
        { key: 'document_date', label: 'Data dokumentu', type: 'date' },
      ],
    },
  },

  // ── Księgowość (faktury — default) ─────────────────────────────────────
  // 'invoice' defined above is the default for ksiegowosc

  // ── JPK ────────────────────────────────────────────────────────────────
  jpk: {
    table: {
      colWidths: ['4%', '17%', '21%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr dokumentu', align: 'left' },
        { key: 'contractor', label: 'Kontrahent', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Typ JPK', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (numer, kontrahent, NIP, typ JPK)...',
      emptyCategory: '⚠️ Brak typu',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Wysłane do JPK' },
    detail: {
      icon: '📋',
      titleFn: (d) => d.number || 'Dokument JPK',
      sectionLabel: 'Dane dokumentu JPK',
      fields: (d) => [
        ['Nr dokumentu', d.number || '—'],
        ['Kontrahent', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Kwota brutto', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Zatwierdzony', exported: 'W JPK' },
      categoryLabel: 'Typ JPK',
      categoryPlaceholder: 'np. JPK_VAT, JPK_FA, JPK_KR...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Uwagi',
      descPlaceholder: 'Uwagi do pozycji JPK...',
    },
    tabs: { newLabel: 'Nowy dokument', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj dokument JPK',
      fields: [
        { key: 'number', label: 'Nr dokumentu', type: 'text' },
        { key: 'contractor_name', label: 'Kontrahent', type: 'text' },
        { key: 'contractor_nip', label: 'NIP kontrahenta', type: 'text' },
        { key: 'amount_net', label: 'Kwota netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Kwota brutto', type: 'number' },
        { key: 'document_date', label: 'Data dokumentu', type: 'date' },
      ],
    },
  },

  // ── ZUS ────────────────────────────────────────────────────────────────
  zus: {
    table: {
      colWidths: ['4%', '20%', '18%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Deklaracja', align: 'left' },
        { key: 'contractor', label: 'Płatnik', align: 'left' },
        { key: 'amount', label: 'Składka', align: 'right' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (deklaracja, płatnik, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Rozliczone' },
    detail: {
      icon: '🏥',
      titleFn: (d) => d.number || 'Deklaracja ZUS',
      sectionLabel: 'Dane deklaracji ZUS',
      fields: (d) => [
        ['Deklaracja', d.number || '—'],
        ['Płatnik', d.contractor_name || '—'],
        ['NIP / PESEL', d.contractor_nip || '—'],
        ['Składka', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} PLN` : '—'],
        ['Okres', d.document_date || '—'],
      ],
      status: { new: 'Nowa', described: 'Opisana', approved: 'Zatwierdzona', exported: 'Rozliczona' },
      categoryLabel: 'Typ deklaracji',
      categoryPlaceholder: 'np. DRA, RCA, RSA, ZUA...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Uwagi',
      descPlaceholder: 'Uwagi do deklaracji...',
    },
    tabs: { newLabel: 'Nowa deklaracja', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj deklarację',
      fields: [
        { key: 'number', label: 'Nr deklaracji / Okres', type: 'text' },
        { key: 'contractor_name', label: 'Płatnik', type: 'text' },
        { key: 'contractor_nip', label: 'NIP / PESEL', type: 'text' },
        { key: 'amount_gross', label: 'Kwota składki', type: 'number' },
        { key: 'document_date', label: 'Okres rozliczeniowy', type: 'date' },
      ],
    },
  },

  // ── VAT-UE ─────────────────────────────────────────────────────────────
  vat_ue: {
    table: {
      colWidths: ['4%', '17%', '21%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr faktury', align: 'left' },
        { key: 'contractor', label: 'Kontrahent UE', align: 'left' },
        { key: 'amount', label: 'Wartość', align: 'right' },
        { key: 'category', label: 'Typ transakcji', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (numer, kontrahent, NIP UE, kraj)...',
      emptyCategory: '⚠️ Brak typu',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP UE: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Wyeksportowane' },
    detail: {
      icon: '🇪🇺',
      titleFn: (d) => d.number || 'Faktura UE',
      sectionLabel: 'Dane transakcji VAT-UE',
      fields: (d) => [
        ['Nr faktury', d.number || '—'],
        ['Kontrahent UE', d.contractor_name || '—'],
        ['NIP UE', d.contractor_nip || '—'],
        ['Wartość', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'EUR'}` : '—'],
        ['Data transakcji', d.document_date || '—'],
      ],
      status: { new: 'Nowa', described: 'Opisana', approved: 'Zatwierdzona', exported: 'Wyeksportowana' },
      categoryLabel: 'Typ transakcji',
      categoryPlaceholder: 'np. WDT, WNT, Usługa UE, Import usług...',
      tagsLabel: 'Kraj',
      tagPlaceholder: 'Dodaj kraj...',
      descLabel: 'Uwagi',
      descPlaceholder: 'Uwagi do transakcji UE...',
    },
    tabs: { newLabel: 'Nowa transakcja', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj transakcję UE',
      fields: [
        { key: 'number', label: 'Nr faktury', type: 'text' },
        { key: 'contractor_name', label: 'Kontrahent UE', type: 'text' },
        { key: 'contractor_nip', label: 'NIP UE (z prefiksem kraju)', type: 'text' },
        { key: 'amount_net', label: 'Wartość netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Wartość brutto', type: 'number' },
        { key: 'document_date', label: 'Data transakcji', type: 'date' },
      ],
    },
  },

  // ── KPiR ───────────────────────────────────────────────────────────────
  kpir: {
    table: {
      colWidths: ['4%', '17%', '21%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'LP / Nr dowodu', align: 'left' },
        { key: 'contractor', label: 'Kontrahent', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Kolumna KPiR', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (LP, kontrahent, NIP, kolumna)...',
      emptyCategory: '⚠️ Brak kolumny',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Zaksięgowane', exported: 'W KPiR' },
    detail: {
      icon: '📒',
      titleFn: (d) => d.number || 'Wpis KPiR',
      sectionLabel: 'Dane wpisu KPiR',
      fields: (d) => [
        ['LP / Nr dowodu', d.number || '—'],
        ['Kontrahent', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Kwota', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} PLN` : '—'],
        ['Data zdarzenia', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Zaksięgowany', approved: 'Zatwierdzony', exported: 'W KPiR' },
      categoryLabel: 'Kolumna KPiR',
      categoryPlaceholder: 'np. Kol. 7 - Sprzedaż, Kol. 10 - Zakup...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Opis zdarzenia',
      descPlaceholder: 'Opis zdarzenia gospodarczego...',
    },
    tabs: { newLabel: 'Nowy wpis', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj wpis KPiR',
      fields: [
        { key: 'number', label: 'LP / Nr dowodu', type: 'text' },
        { key: 'contractor_name', label: 'Kontrahent', type: 'text' },
        { key: 'contractor_nip', label: 'NIP kontrahenta', type: 'text' },
        { key: 'amount_net', label: 'Kwota netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Kwota brutto', type: 'number' },
        { key: 'document_date', label: 'Data zdarzenia', type: 'date' },
      ],
    },
  },

  // ── Wpłaty / Bank ──────────────────────────────────────────────────────
  wplaty: {
    table: {
      colWidths: ['4%', '18%', '20%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr operacji', align: 'left' },
        { key: 'contractor', label: 'Nadawca / Odbiorca', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nr operacji, nadawca, kwota)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: 'Nr rachunku: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Zaksięgowane' },
    detail: {
      icon: '🏦',
      titleFn: (d) => d.number || 'Operacja bankowa',
      sectionLabel: 'Dane operacji bankowej',
      fields: (d) => [
        ['Nr operacji', d.number || '—'],
        ['Nadawca / Odbiorca', d.contractor_name || '—'],
        ['Nr rachunku', d.contractor_nip || '—'],
        ['Kwota', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data operacji', d.document_date || '—'],
      ],
      status: { new: 'Nowa', described: 'Opisana', approved: 'Potwierdzona', exported: 'Zaksięgowana' },
      categoryLabel: 'Typ operacji',
      categoryPlaceholder: 'np. Wpłata, Wypłata, Przelew, Prowizja...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Tytuł przelewu',
      descPlaceholder: 'Tytuł przelewu / opis operacji...',
    },
    tabs: { newLabel: 'Nowa operacja', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj operację',
      fields: [
        { key: 'number', label: 'Nr operacji / Ref.', type: 'text' },
        { key: 'contractor_name', label: 'Nadawca / Odbiorca', type: 'text' },
        { key: 'contractor_nip', label: 'Nr rachunku', type: 'text' },
        { key: 'amount_gross', label: 'Kwota', type: 'number' },
        { key: 'document_date', label: 'Data operacji', type: 'date' },
      ],
    },
  },

  // ── Dowody płatności ───────────────────────────────────────────────────
  dowody_platnosci: {
    table: {
      colWidths: ['4%', '18%', '20%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr dowodu', align: 'left' },
        { key: 'contractor', label: 'Kontrahent', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Forma płatności', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nr dowodu, kontrahent, kwota)...',
      emptyCategory: 'Brak formy',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Zaksięgowane' },
    detail: {
      icon: '💳',
      titleFn: (d) => d.number || 'Dowód płatności',
      sectionLabel: 'Dane dowodu płatności',
      fields: (d) => [
        ['Nr dowodu', d.number || '—'],
        ['Kontrahent', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Kwota', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data płatności', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Potwierdzony', exported: 'Zaksięgowany' },
      categoryLabel: 'Forma płatności',
      categoryPlaceholder: 'np. Przelew, Gotówka, Karta, BLIK...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Opis',
      descPlaceholder: 'Opis dowodu płatności...',
    },
    tabs: { newLabel: 'Nowy dowód', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj dowód płatności',
      fields: [
        { key: 'number', label: 'Nr dowodu', type: 'text' },
        { key: 'contractor_name', label: 'Kontrahent', type: 'text' },
        { key: 'contractor_nip', label: 'NIP kontrahenta', type: 'text' },
        { key: 'amount_gross', label: 'Kwota', type: 'number' },
        { key: 'document_date', label: 'Data płatności', type: 'date' },
      ],
    },
  },

  // ── Projekt klienta ────────────────────────────────────────────────────
  projekt_klienta: {
    table: {
      colWidths: ['4%', '17%', '21%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr dokumentu', align: 'left' },
        { key: 'contractor', label: 'Klient', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Kategoria', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (numer, klient, NIP, kategoria)...',
      emptyCategory: '⚠️ Brak',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Wyeksportowane' },
    detail: {
      icon: '🏢',
      titleFn: (d) => d.number || 'Dokument klienta',
      sectionLabel: 'Dane dokumentu klienta',
      fields: (d) => [
        ['Nr dokumentu', d.number || '—'],
        ['Klient', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Kwota brutto', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Zatwierdzony', exported: 'Wyeksportowany' },
      categoryLabel: 'Kategoria',
      categoryPlaceholder: 'np. Faktura, Nota, Rachunek...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Opis',
      descPlaceholder: 'Opis dokumentu klienta...',
    },
    tabs: { newLabel: 'Nowy dokument', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj dokument',
      fields: [
        { key: 'number', label: 'Nr dokumentu', type: 'text' },
        { key: 'contractor_name', label: 'Klient', type: 'text' },
        { key: 'contractor_nip', label: 'NIP klienta', type: 'text' },
        { key: 'amount_net', label: 'Kwota netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Kwota brutto', type: 'number' },
        { key: 'document_date', label: 'Data dokumentu', type: 'date' },
      ],
    },
  },

  // ── R&D / IP Box ───────────────────────────────────────────────────────
  rd_ipbox: {
    table: {
      colWidths: ['4%', '20%', '18%', '14%', '14%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr projektu / Koszt', align: 'left' },
        { key: 'contractor', label: 'Dostawca / Wykonawca', align: 'left' },
        { key: 'amount', label: 'Kwota', align: 'right' },
        { key: 'category', label: 'Typ kosztu', align: 'left' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (projekt, dostawca, typ kosztu)...',
      emptyCategory: '⚠️ Brak typu',
      emptyCategoryStyle: 'warning',
      showDuplicates: false,
      showExportWarning: true,
      nipPrefix: 'NIP: ',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Rozliczone' },
    detail: {
      icon: '🔬',
      titleFn: (d) => d.number || 'Koszt R&D',
      sectionLabel: 'Dane kosztu R&D / IP Box',
      fields: (d) => [
        ['Nr projektu / Faktury', d.number || '—'],
        ['Dostawca / Wykonawca', d.contractor_name || '—'],
        ['NIP', d.contractor_nip || '—'],
        ['Kwota', d.amount_gross ? `${d.amount_gross.toLocaleString('pl-PL')} ${d.currency || 'PLN'}` : '—'],
        ['Data', d.document_date || '—'],
      ],
      status: { new: 'Nowy', described: 'Opisany', approved: 'Kwalifikowany', exported: 'Rozliczony' },
      categoryLabel: 'Typ kosztu R&D',
      categoryPlaceholder: 'np. Wynagrodzenia, Materiały, Licencje, Amortyzacja...',
      tagsLabel: 'Projekt',
      tagPlaceholder: 'Dodaj projekt...',
      descLabel: 'Opis działalności B+R',
      descPlaceholder: 'Opis prac badawczo-rozwojowych...',
    },
    tabs: { newLabel: 'Nowy koszt', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj koszt R&D',
      fields: [
        { key: 'number', label: 'Nr projektu / Faktury', type: 'text' },
        { key: 'contractor_name', label: 'Dostawca / Wykonawca', type: 'text' },
        { key: 'contractor_nip', label: 'NIP', type: 'text' },
        { key: 'amount_net', label: 'Kwota netto', type: 'number' },
        { key: 'amount_vat', label: 'VAT', type: 'number' },
        { key: 'amount_gross', label: 'Kwota brutto', type: 'number' },
        { key: 'document_date', label: 'Data', type: 'date' },
      ],
    },
  },

  // ── Druki / Przesyłki ─────────────────────────────────────────────────
  druki_przesylki: {
    table: {
      colWidths: ['4%', '20%', '20%', '14%', '12%', '18%', '12%'],
      columns: [
        { key: 'number', label: 'Nr przesyłki', align: 'left' },
        { key: 'contractor', label: 'Odbiorca / Nadawca', align: 'left' },
        { key: 'category', label: 'Typ', align: 'left' },
        { key: 'date', label: 'Data', align: 'center' },
        { key: 'status', label: 'Status', align: 'center' },
        { key: 'source', label: 'Źródło', align: 'center' },
      ],
      searchPlaceholder: 'Szukaj (nr przesyłki, odbiorca, typ)...',
      emptyCategory: 'Brak typu',
      emptyCategoryStyle: 'muted',
      showDuplicates: false,
      showExportWarning: false,
      nipPrefix: '',
    },
    stats: { new: 'Nowe', described: 'Opisane', exported: 'Wysłane' },
    detail: {
      icon: '📦',
      titleFn: (d) => d.number || 'Przesyłka',
      sectionLabel: 'Dane przesyłki',
      fields: (d) => [
        ['Nr przesyłki', d.number || '—'],
        ['Odbiorca / Nadawca', d.contractor_name || '—'],
        ['Adres / Kontakt', d.contractor_nip || '—'],
        ['Data', d.document_date || '—'],
      ],
      status: { new: 'Nowa', described: 'Opisana', approved: 'W drodze', exported: 'Dostarczona' },
      categoryLabel: 'Typ przesyłki',
      categoryPlaceholder: 'np. List polecony, Paczka, Kurier, Paleta...',
      tagsLabel: 'Tagi',
      tagPlaceholder: 'Dodaj tag...',
      descLabel: 'Opis',
      descPlaceholder: 'Opis zawartości, uwagi...',
    },
    tabs: { newLabel: 'Nowa przesyłka', showDuplicates: false },
    form: {
      submitLabel: 'Dodaj przesyłkę',
      fields: [
        { key: 'number', label: 'Nr przesyłki / Nr nadania', type: 'text' },
        { key: 'contractor_name', label: 'Odbiorca / Nadawca', type: 'text' },
        { key: 'contractor_nip', label: 'Adres / Kontakt', type: 'text' },
        { key: 'document_date', label: 'Data nadania', type: 'date' },
      ],
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT TYPE → DOC TYPE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const PROJECT_TYPE_MAP = {
  ksiegowosc: 'invoice',
  jpk: 'jpk',
  zus: 'zus',
  vat_ue: 'vat_ue',
  kpir: 'kpir',
  wplaty: 'wplaty',
  dowody_platnosci: 'dowody_platnosci',
  projekt_klienta: 'projekt_klienta',
  rd_ipbox: 'rd_ipbox',
  druki_przesylki: 'druki_przesylki',
  rekrutacja: 'rekrutacja',
  umowy: 'umowy',
  korespondencja: 'korespondencja',
  zamowienia: 'zamowienia',
  protokoly: 'protokoly',
  polisy: 'polisy',
  wnioski: 'wnioski',
  nieruchomosci: 'nieruchomosci',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR & PHASE LABELS (per doc type)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TASK_STATUS = {
  pending: 'Oczekuje', in_progress: 'W trakcie', completed: 'Zakończone', exported: 'Wyeksportowane',
};
const DEFAULT_PHASE_LABELS = {
  completed: 'Zakończony', in_progress: 'W trakcie', not_started: 'Nie rozpoczęty',
};

const CONTEXT_LABELS = {
  invoice:          { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak dokumentów' },
  rekrutacja:       { countNew: 'do oceny',        countDescribed: 'ocenionych',       emptyLabel: 'Brak kandydatów',
                      taskStatus: { pending: 'Oczekuje', in_progress: 'W trakcie', completed: 'Zakończone', exported: 'Zatwierdzone' },
                      phaseLabels: { completed: 'Zakończony', in_progress: 'W trakcie', not_started: 'Nie rozpoczęty' } },
  umowy:            { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak umów' },
  korespondencja:   { countNew: 'do rejestracji',  countDescribed: 'zarejestrowanych', emptyLabel: 'Brak korespondencji' },
  zamowienia:       { countNew: 'do opisu',        countDescribed: 'w realizacji',     emptyLabel: 'Brak zamówień' },
  protokoly:        { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak protokołów' },
  polisy:           { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak polis' },
  wnioski:          { countNew: 'do rozpatrzenia', countDescribed: 'rozpatrywanych',   emptyLabel: 'Brak wniosków' },
  nieruchomosci:    { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak dokumentów' },
  jpk:              { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak dokumentów JPK' },
  zus:              { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak deklaracji' },
  vat_ue:           { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak transakcji' },
  kpir:             { countNew: 'do opisu',        countDescribed: 'zaksięgowanych',   emptyLabel: 'Brak wpisów KPiR' },
  wplaty:           { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak operacji' },
  dowody_platnosci: { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak dowodów' },
  projekt_klienta:  { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak dokumentów' },
  rd_ipbox:         { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak kosztów R&D' },
  druki_przesylki:  { countNew: 'do opisu',        countDescribed: 'opisanych',        emptyLabel: 'Brak przesyłek' },
};

const DEFAULT_CONTEXT = CONTEXT_LABELS.invoice;

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = DOC_TYPE_CONFIGS.invoice;

export function getDocTypeConfig(projectType) {
  const key = PROJECT_TYPE_MAP[projectType] || 'invoice';
  return DOC_TYPE_CONFIGS[key] || DEFAULT_CONFIG;
}

export function getTableConfig(projectType) {
  return getDocTypeConfig(projectType).table;
}

export function getDetailConfig(projectType) {
  return getDocTypeConfig(projectType).detail;
}

export function getStatsLabels(projectType) {
  return getDocTypeConfig(projectType).stats;
}

export function getTabsConfig(projectType) {
  return getDocTypeConfig(projectType).tabs;
}

export function getFormConfig(projectType) {
  return getDocTypeConfig(projectType).form;
}

export function getContextLabels(projectType) {
  const key = PROJECT_TYPE_MAP[projectType] || 'invoice';
  const ctx = CONTEXT_LABELS[key] || DEFAULT_CONTEXT;
  return {
    ...ctx,
    taskStatus: ctx.taskStatus || DEFAULT_TASK_STATUS,
    phaseLabels: ctx.phaseLabels || DEFAULT_PHASE_LABELS,
  };
}

export { DOC_TYPE_CONFIGS, PROJECT_TYPE_MAP };
