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
      showDuplicates: true,
      showExportWarning: true,
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
    tabs: { newLabel: 'Nowy', showDuplicates: true },
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
      showDuplicates: true,
      showExportWarning: true,
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
    tabs: { newLabel: 'Nowe zamówienie', showDuplicates: true },
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
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT TYPE → DOC TYPE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const PROJECT_TYPE_MAP = {
  // Bookkeeping types → invoice view
  ksiegowosc: 'invoice',
  jpk: 'invoice',
  zus: 'invoice',
  vat_ue: 'invoice',
  kpir: 'invoice',
  wplaty: 'invoice',
  dowody_platnosci: 'invoice',
  projekt_klienta: 'invoice',
  rd_ipbox: 'invoice',
  druki_przesylki: 'invoice',
  // Dedicated types
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

export { DOC_TYPE_CONFIGS, PROJECT_TYPE_MAP };
