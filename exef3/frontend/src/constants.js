export const API_URL = 'http://localhost:8003/api/v1';

export const COLORS = {
  bg: '#0a0a0f',
  bgSecondary: '#111116',
  bgTertiary: '#1a1a22',
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.15)',
  text: '#e4e4e7',
  textMuted: '#71717a',
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

export const STATUS_CONFIG = {
  new: { label: 'Nowy', color: COLORS.warning, icon: '🕐' },
  described: { label: 'Opisany', color: COLORS.primary, icon: '📝' },
  approved: { label: 'Zatwierdzony', color: COLORS.success, icon: '✅' },
  exported: { label: 'Wyeksportowany', color: COLORS.textMuted, icon: '📤' },
};

export const TASK_STATUS = {
  pending: { label: 'Oczekuje', color: COLORS.warning, icon: '⏳' },
  in_progress: { label: 'W trakcie', color: COLORS.primary, icon: '🔄' },
  completed: { label: 'Zakończone', color: COLORS.success, icon: '✅' },
};

export const ENTITY_TYPES = {
  jdg: { label: 'JDG', icon: '👤' },
  malzenstwo: { label: 'Małżeństwo', icon: '💑' },
  spolka: { label: 'Spółka', icon: '🏢' },
  organizacja: { label: 'Organizacja', icon: '🏛️' },
};

export const PROJECT_TYPES = {
  ksiegowosc: { label: 'Księgowość', icon: '📊' },
  jpk: { label: 'JPK', icon: '📋' },
  zus: { label: 'ZUS', icon: '🏥' },
  vat_ue: { label: 'VAT-UE', icon: '🇪🇺' },
  projekt_klienta: { label: 'Projekt klienta', icon: '🏢' },
  rd_ipbox: { label: 'R&D / IP Box', icon: '🔬' },
  kpir: { label: 'KPiR', icon: '📒' },
  wplaty: { label: 'Wpłaty / Bank', icon: '🏦' },
  dowody_platnosci: { label: 'Dowody płatności', icon: '💳' },
  druki_przesylki: { label: 'Druki / Przesyłki', icon: '📦' },
  rekrutacja: { label: 'Rekrutacja / CV', icon: '👥' },
};
