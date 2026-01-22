let url = window.exef?.localServiceBaseUrl ?? (localStorage.getItem('exef_api_url') || 'http://127.0.0.1:3030');

function setApiUrl(nextUrl) {
  url = String(nextUrl || '').trim();
  if (!url) {
    url = 'http://127.0.0.1:3030';
  }
  localStorage.setItem('exef_api_url', url);
  const el = document.getElementById('url');
  if (el) {
    el.textContent = url;
  }
}

setApiUrl(url);

async function fetchJsonWithTimeout(fullUrl, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(fullUrl, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    return await res.json();
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function resolveApiBaseUrl() {
  if (window.exef?.localServiceBaseUrl) {
    setApiUrl(window.exef.localServiceBaseUrl);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api') || params.get('apiUrl');
  if (fromQuery) {
    setApiUrl(fromQuery);
    return;
  }

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    const origin = window.location.origin;
    if (origin && origin !== 'null') {
      const originHealth = await fetchJsonWithTimeout(`${origin}/health`, 600);
      if (originHealth?.service === 'exef-local-service') {
        setApiUrl(origin);
        return;
      }
    }
  }

  const currentHealth = await fetchJsonWithTimeout(`${url}/health`, 600);
  if (currentHealth?.service === 'exef-local-service') {
    return;
  }

  const hosts = Array.from(new Set([
    window.location.hostname,
    '127.0.0.1',
    'localhost',
  ].filter(Boolean)));

  const ports = [];
  for (let i = 0; i < 50; i++) {
    ports.push(3030 + i);
  }

  const candidates = [];
  for (const host of hosts) {
    for (const port of ports) {
      candidates.push(`http://${host}:${port}`);
    }
  }

  const startedAt = Date.now();
  const budgetMs = 5000;
  const batchSize = 8;

  for (let i = 0; i < candidates.length; i += batchSize) {
    if (Date.now() - startedAt > budgetMs) {
      return;
    }

    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const health = await fetchJsonWithTimeout(`${candidate}/health`, 450);
        return health?.service === 'exef-local-service' ? candidate : null;
      })
    );
    const found = results.find(Boolean);
    if (found) {
      setApiUrl(found);
      return;
    }
  }
}

const SOURCE_ICONS = {
  email: '📧',
  scanner: '📷',
  storage: '📁',
  ksef: '🔐',
};

const STATUS_LABELS = {
  pending: 'Oczekująca',
  ocr: 'Przetwarzanie OCR',
  described: 'Opisana',
  approved: 'Zatwierdzona',
  booked: 'Zaksięgowana',
  rejected: 'Odrzucona',
};

let currentFilter = '';
let invoices = [];
let projects = [];
let expenseTypes = [];
let labels = [];
let settings = null;
let currentInvoice = null;

let viewMode = localStorage.getItem('exef_invoice_view') || 'cards';

const THEMES = ['white', 'dark', 'warm'];
const storedTheme = localStorage.getItem('exef_theme');
let theme = storedTheme || 'white';

function applyTheme(nextTheme, options = {}) {
  const normalized = String(nextTheme || '').trim().toLowerCase();
  theme = THEMES.includes(normalized) ? normalized : 'white';

  const persist = options.persist !== false;

  document.body.dataset.theme = theme;
  if (persist) {
    localStorage.setItem('exef_theme', theme);
  }

  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.textContent = `Motyw: ${theme}`;
  }
}

async function persistThemeToApi(nextTheme) {
  try {
    await fetch(`${url}/ui/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: nextTheme }),
    });
  } catch (_e) {
  }
}

function cycleTheme() {
  const idx = THEMES.indexOf(theme);
  const next = THEMES[(idx + 1) % THEMES.length] || 'white';
  applyTheme(next);
  persistThemeToApi(next);
}

applyTheme(theme, { persist: !!storedTheme });

function readCssVar(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

function getComputedThemePalette() {
  return {
    bg: readCssVar('--bg'),
    surface: readCssVar('--surface'),
    surface2: readCssVar('--surface-2'),
    border: readCssVar('--border'),
    text: readCssVar('--text'),
    muted: readCssVar('--muted'),
    primary: readCssVar('--primary'),
    primaryContrast: readCssVar('--primary-contrast'),
    navActiveBg: readCssVar('--nav-active-bg'),
    navActiveText: readCssVar('--nav-active-text'),
    surfaceHover: readCssVar('--surface-hover'),
    codeBg: readCssVar('--code-bg'),
    suggestionBg: readCssVar('--suggestion-bg'),
    suggestionText: readCssVar('--suggestion-text'),
  };
}

async function runContrastReport() {
  const container = document.getElementById('contrastReport');
  if (!container) {
    return;
  }

  container.innerHTML = '<div class="subtle">Testuję kontrast…</div>';

  try {
    const palette = getComputedThemePalette();
    const res = await fetch(`${url}/ui/contrast/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palette }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Contrast report failed (${res.status})`);
    }

    const data = await res.json();
    const checks = Array.isArray(data.checks) ? data.checks : [];
    if (!checks.length) {
      container.innerHTML = '<div class="empty" style="padding: 12px;">Brak wyników</div>';
      return;
    }

    const rows = checks.map((c) => {
      const ok = c.passesAA ? 'OK' : 'FAIL';
      const okStyle = c.passesAA ? 'color:#16a34a; font-weight:600;' : 'color:#dc2626; font-weight:600;';
      return `
        <tr>
          <td>${c.name || ''}</td>
          <td><code>${c.fg}</code></td>
          <td><code>${c.bg}</code></td>
          <td>${typeof c.ratio === 'number' ? c.ratio.toFixed(2) : c.ratio}</td>
          <td><span style="${okStyle}">${ok}</span></td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="margin-top: 8px;" class="subtle">WCAG AA (tekst normalny): 4.5+</div>
      <div class="invoice-table-wrapper" style="margin-top: 10px;">
        <table class="invoices-table" style="min-width: 700px;">
          <thead>
            <tr>
              <th>Para</th>
              <th>FG</th>
              <th>BG</th>
              <th>Ratio</th>
              <th>AA</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty" style="padding: 12px;">Błąd testu kontrastu: ${e.message}</div>`;
  }
}

let activeUrlModal = null;
let pageMode = 'list';
let activePage = 'inbox';

function getUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get('view'),
    filter: params.get('filter'),
    page: params.get('page'),
    modal: params.get('modal'),
    invoice: params.get('invoice'),
    action: params.get('action'),
  };
}

function setUrlState(next, options = {}) {
  const replace = options.replace !== false;
  const params = new URLSearchParams(window.location.search);

  Object.entries(next || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  });

  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
  if (replace) {
    window.history.replaceState({}, '', nextUrl);
  } else {
    window.history.pushState({}, '', nextUrl);
  }
}

function updateToggleViewButton() {
  const btn = document.getElementById('toggleViewBtn');
  if (!btn) return;
  btn.textContent = viewMode === 'table' ? 'Widok: tabela' : 'Widok: karty';
}

function setViewMode(nextMode) {
  const syncUrl = arguments.length > 1 ? (arguments[1]?.syncUrl !== false) : true;
  viewMode = nextMode;
  localStorage.setItem('exef_invoice_view', viewMode);
  if (syncUrl) {
    setUrlState({ view: viewMode });
  }
  updateToggleViewButton();
  renderInvoices();
}

function setActiveFilter(nextFilter) {
  const syncUrl = arguments.length > 1 ? (arguments[1]?.syncUrl !== false) : true;
  const shouldLoad = arguments.length > 1 ? (arguments[1]?.load !== false) : true;

  currentFilter = nextFilter || '';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.tab[data-filter="${currentFilter}"]`);
  if (tab) {
    tab.classList.add('active');
  }
  if (syncUrl) {
    setUrlState({ filter: currentFilter });
  }
  if (shouldLoad) {
    loadInvoices();
  }
}

function closeActiveUrlModal() {
  if (activeUrlModal && typeof activeUrlModal.remove === 'function') {
    activeUrlModal.remove();
  }
  activeUrlModal = null;
}

async function syncUiFromUrl() {
  const state = getUrlState();

  const nextPage = state.page || 'inbox';
  if (nextPage !== activePage) {
    setActivePage(nextPage, { syncUrl: false });
  }

  if ((state.invoice || state.modal) && activePage !== 'inbox') {
    setActivePage('inbox', { syncUrl: false });
  }

  const nextView = state.view === 'table' || state.view === 'cards' ? state.view : null;
  if (nextView && nextView !== viewMode) {
    setViewMode(nextView, { syncUrl: false });
  }

  const nextFilter = state.filter || '';
  const filterChanged = nextFilter !== currentFilter;
  if (filterChanged) {
    setActiveFilter(nextFilter, { syncUrl: false, load: false });
    await loadInvoices();
  }

  if (state.action && state.invoice) {
    await runActionFromUrl(state.action, state.invoice);
    return;
  }

  if (!state.modal && state.invoice) {
    await showInvoiceDetailsPage(state.invoice, { syncUrl: false });
    return;
  }

  if (!state.invoice && pageMode !== 'list') {
    showInvoiceListPage({ syncUrl: false });
  }

  closeActiveUrlModal();
  if (state.modal === 'assign' && state.invoice) {
    await showAssignModal(state.invoice, { syncUrl: false });
  } else if (state.modal === 'invoice' && state.invoice) {
    await showInvoiceDetailsModal(state.invoice, { syncUrl: false });
  }
}

function setActivePage(nextPage, options = {}) {
  const syncUrl = options.syncUrl !== false;
  const normalized = nextPage === 'projects' || nextPage === 'labels' || nextPage === 'settings' ? nextPage : 'inbox';
  activePage = normalized;

  const pages = {
    inbox: document.getElementById('pageInbox'),
    projects: document.getElementById('pageProjects'),
    labels: document.getElementById('pageLabels'),
    settings: document.getElementById('pageSettings'),
  };

  Object.entries(pages).forEach(([key, el]) => {
    if (!el) {
      return;
    }
    el.style.display = key === normalized ? '' : 'none';
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-btn[data-page="${normalized}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  closeActiveUrlModal();
  if (normalized !== 'inbox' && pageMode !== 'list') {
    showInvoiceListPage({ syncUrl: false });
  }

  if (syncUrl) {
    setUrlState({ page: normalized, invoice: null, modal: null }, { replace: false });
  }

  if (normalized === 'projects') {
    renderProjectsPage();
  } else if (normalized === 'labels') {
    renderLabelsPage();
  } else if (normalized === 'settings') {
    renderSettingsPage();
  }
}

async function runActionFromUrl(action, invoiceId) {
  const normalized = String(action || '').trim().toLowerCase();

  try {
    if (normalized === 'process') {
      const ok = confirm('Czy uruchomić przetwarzanie faktury?');
      if (ok) {
        await fetch(`${url}/inbox/invoices/${invoiceId}/process`, { method: 'POST' });
        await refresh();
      }
    }
    if (normalized === 'approve') {
      const ok = confirm('Czy zatwierdzić fakturę?');
      if (ok) {
        await fetch(`${url}/inbox/invoices/${invoiceId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        await refresh();
      }
    }
  } finally {
    const state = getUrlState();
    const clearInvoice = pageMode === 'list' && !state.modal;
    setUrlState({ action: null, ...(clearInvoice ? { invoice: null } : {}) }, { replace: true });
  }
}

async function checkConnection() {
  const connDot = document.getElementById('connDot');
  const connStatus = document.getElementById('connStatus');

  try {
    const data = await fetchJsonWithTimeout(`${url}/health`, 800);
    if (data?.service === 'exef-local-service') {
      connDot.className = 'connection-dot ok';
      connStatus.textContent = 'połączono';
      return true;
    }
  } catch (e) {}

  connDot.className = 'connection-dot error';
  connStatus.textContent = 'brak połączenia';
  return false;
}

async function loadStats() {
  try {
    const res = await fetch(`${url}/inbox/stats`);
    const stats = await res.json();

    document.getElementById('statTotal').textContent = stats.total || 0;

    const pending = (stats.byStatus?.pending || 0) + (stats.byStatus?.ocr || 0);
    document.getElementById('statPending').textContent = pending;

    const describedEl = document.getElementById('statDescribed');
    if (describedEl) {
      describedEl.textContent = stats.byStatus?.described || 0;
    }

    document.getElementById('statApproved').textContent = stats.byStatus?.approved || 0;

    const badge = document.getElementById('newBadge');
    if (pending > 0) {
      badge.textContent = pending;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

window.assignInvoiceToProjectFromTable = async function(invoiceId, projectId) {
  await assignInvoiceToProject(invoiceId, projectId);
};

window.assignInvoiceToExpenseTypeFromTable = async function(invoiceId, expenseTypeId) {
  await assignInvoiceToExpenseType(invoiceId, expenseTypeId);
};

async function getInvoiceById(invoiceId) {
  const fromList = invoices.find(inv => inv.id === invoiceId);
  if (fromList) {
    return fromList;
  }
  try {
    const res = await fetch(`${url}/inbox/invoices/${invoiceId}`);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (_e) {
    return null;
  }
}

async function loadInvoices() {
  try {
    const filterParam = currentFilter ? `?status=${currentFilter}` : '';
    const res = await fetch(`${url}/inbox/invoices${filterParam}`);
    if (!res.ok) {
      throw new Error('Failed to load invoices');
    }
    const data = await res.json();
    invoices = data.invoices || [];
    renderInvoices();
  } catch (e) {
    console.error('Failed to load invoices:', e);
    invoices = [];
    renderInvoices();
  }
}

function renderInvoices() {
  const container = document.getElementById('invoiceList');

  if (pageMode !== 'list') {
    return;
  }

  updateToggleViewButton();

  if (viewMode === 'table') {
    renderInvoicesTable(container);
    return;
  }

  if (invoices.length === 0) {
    container.innerHTML = '<div class="empty">Brak faktur do wyświetlenia</div>';
    return;
  }

  container.innerHTML = invoices.map(inv => {
    const projectSelectionMode = settings?.ui?.invoicesTable?.projectSelection || 'select';
    const expenseTypeSelectionMode = settings?.ui?.invoicesTable?.expenseTypeSelection || 'select';

    const icon = SOURCE_ICONS[inv.source] || '📄';
    const statusLabel = STATUS_LABELS[inv.status] || inv.status;
    const statusClass = `status-${inv.status}`;

    const amount = inv.grossAmount
      ? `${Number(inv.grossAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${inv.currency || 'PLN'}`
      : '—';

    const suggestion = inv.suggestion && inv.suggestion.category
      ? `<span class="suggestion">${inv.suggestion.category} (${inv.suggestion.confidence}%)</span>`
      : '';

    const sourceLabel = inv.source === 'ksef' ? 'z KSeF' : inv.source === 'email' ? 'z email' : inv.source === 'scanner' ? 'ze skanera' : 'z pliku';

    let actions = '';
    if (inv.status === 'pending' || inv.status === 'ocr') {
      actions = `
        <button onclick="processInvoice('${inv.id}')">Przetwórz</button>
        <button onclick="openInvoiceDetails('${inv.id}')">Otwórz</button>
      `;
    } else if (inv.status === 'described') {
      actions = `
        <button class="success" onclick="approveInvoice('${inv.id}')">Zatwierdź</button>
        <button onclick="editInvoice('${inv.id}')">Edytuj</button>
        <button onclick="openInvoiceDetails('${inv.id}')">Otwórz</button>
        <button class="danger" onclick="rejectInvoice('${inv.id}')">Odrzuć</button>
      `;
    } else if (inv.status === 'approved') {
      actions = `
        <span style="color: #16a34a;">✓ Zatwierdzona</span>
        <button onclick="openInvoiceDetails('${inv.id}')">Otwórz</button>
      `;
    }

    let projectControl = '';
    if (projectSelectionMode === 'select') {
      const projectOptions = [`<option value="">—</option>`].concat(
        projects.map((p) => {
          const selected = inv.projectId && p?.id && inv.projectId === p.id ? 'selected' : '';
          return `<option value="${p.id}" ${selected}>${p.nazwa || p.id}</option>`;
        })
      ).join('');

      projectControl = `
        <div style="flex:1; min-width: 240px;">
          <div class="subtle" style="margin-bottom: 6px;">📁 Projekt</div>
          <select onchange="assignInvoiceToProjectFromTable('${inv.id}', this.value)">${projectOptions}</select>
        </div>
      `;
    } else {
      const list = projects.map((p) => {
        const checked = inv.projectId && p?.id && inv.projectId === p.id ? 'checked' : '';
        const disabled = p?.id ? '' : 'disabled';
        const label = (p && (p.nazwa || p.id)) ? (p.nazwa || p.id) : '';
        return `
          <label style="display:flex; align-items:center; gap:8px; margin:4px 0; font-size: 13px;">
            <input type="radio" name="card-project-${inv.id}" value="${p?.id || ''}" ${checked} ${disabled}
              onchange="assignInvoiceToProjectFromTable('${inv.id}','${p?.id || ''}')" />
            <span>${label}</span>
          </label>
        `;
      }).join('');

      projectControl = `
        <div style="flex:1; min-width: 240px;">
          <div class="subtle" style="margin-bottom: 6px;">📁 Projekt</div>
          <div style="max-height: 120px; overflow:auto; padding-right: 6px;">
            ${list}
          </div>
        </div>
      `;
    }

    let expenseTypeControl = '';
    if (expenseTypeSelectionMode === 'select') {
      const expenseTypeOptions = [`<option value="">—</option>`].concat(
        expenseTypes.map((t) => {
          const selected = inv.expenseTypeId && t?.id && inv.expenseTypeId === t.id ? 'selected' : '';
          return `<option value="${t.id}" ${selected}>${t.nazwa}</option>`;
        })
      ).join('');

      expenseTypeControl = `
        <div style="flex:1; min-width: 240px;">
          <div class="subtle" style="margin-bottom: 6px;">🏷️ Typ wydatku</div>
          <select onchange="assignInvoiceToExpenseTypeFromTable('${inv.id}', this.value)">${expenseTypeOptions}</select>
        </div>
      `;
    } else {
      const list = expenseTypes.map((t) => {
        const checked = inv.expenseTypeId && t?.id && inv.expenseTypeId === t.id ? 'checked' : '';
        return `
          <label style="display:flex; align-items:center; gap:8px; margin:4px 0; font-size: 13px;">
            <input type="radio" name="card-expense-${inv.id}" value="${t.id}" ${checked}
              onchange="assignInvoiceToExpenseTypeFromTable('${inv.id}', '${t.id}')" />
            <span>${t.nazwa}</span>
          </label>
        `;
      }).join('');

      expenseTypeControl = `
        <div style="flex:1; min-width: 240px;">
          <div class="subtle" style="margin-bottom: 6px;">🏷️ Typ wydatku</div>
          <div style="max-height: 120px; overflow:auto; padding-right: 6px;">
            ${list}
          </div>
        </div>
      `;
    }

    const labelsInfo = Array.isArray(inv.labelIds) && inv.labelIds.length ? (() => {
      const chips = inv.labelIds.map((labelId) => {
        const label = labels.find((l) => l.id === labelId);
        const name = label?.nazwa || labelId;
        const color = label?.kolor || '#e5e7eb';
        return `<span class="label-chip"><span class="label-dot" style="background:${color}"></span>${name}</span>`;
      }).join('');
      return `<div style="margin-top: 6px;">${chips}</div>`;
    })() : '';

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">
              <span class="source-icon">${icon}</span>
              ${inv.invoiceNumber || inv.fileName || 'Faktura'}
              <span class="${statusClass}">[${statusLabel}]</span>
            </div>
            <div class="card-meta">
              ${inv.contractorName || inv.sellerName || '???'} • ${sourceLabel}
              ${inv.issueDate ? ` • ${inv.issueDate}` : ''}
            </div>
          </div>
          <div class="card-amount">${amount}</div>
        </div>
        ${suggestion ? `<div style="margin-bottom: 8px;">${suggestion}</div>` : ''}
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; margin-top: 10px;">
          ${expenseTypeControl}
          ${projectControl}
        </div>
        ${labelsInfo}
        <div class="card-actions">${actions}</div>
      </div>
    `;
  }).join('');
}

function renderInvoicesTable(container) {
  if (invoices.length === 0) {
    container.innerHTML = '<div class="empty">Brak faktur do wyświetlenia</div>';
    return;
  }

  const projectSelectionMode = settings?.ui?.invoicesTable?.projectSelection || 'select';
  const expenseTypeSelectionMode = settings?.ui?.invoicesTable?.expenseTypeSelection || 'select';

  const configLink = `<a href="?page=settings" onclick="window.navigateToSettings(); return false;" style="text-decoration:none; margin-left:6px;" title="Konfiguracja">⚙</a>`;

  const projectHeaders = projectSelectionMode === 'radio'
    ? projects.map((p, idx) => {
      const label = p?.nazwa || p?.id || '';
      const link = idx === 0 ? configLink : '';
      return `<th class="project-col" title="${label}">${label}${link}</th>`;
    }).join('')
    : '';

  const rows = invoices.map((inv) => {
    const icon = SOURCE_ICONS[inv.source] || '📄';
    const statusLabel = STATUS_LABELS[inv.status] || inv.status;
    const statusClass = `status-${inv.status}`;
    const amount = inv.grossAmount
      ? `${Number(inv.grossAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${inv.currency || 'PLN'}`
      : '—';

    let projectCell = '';
    if (projectSelectionMode === 'select') {
      const projectOptions = [`<option value="">—</option>`].concat(
        projects.map((p) => {
          const selected = inv.projectId && p?.id && inv.projectId === p.id ? 'selected' : '';
          return `<option value="${p.id}" ${selected}>${p.nazwa || p.id}</option>`;
        })
      ).join('');

      projectCell = `
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <select onchange="assignInvoiceToProjectFromTable('${inv.id}', this.value)">${projectOptions}</select>
            ${configLink}
          </div>
        </td>
      `;
    } else {
      projectCell = projects.map((p) => {
        const checked = inv.projectId && p?.id && inv.projectId === p.id ? 'checked' : '';
        const disabled = p?.id ? '' : 'disabled';
        return `
          <td class="center project-col">
            <div class="project-radio">
              <input type="radio" name="project-${inv.id}" value="${p?.id || ''}" ${checked} ${disabled}
                onchange="assignInvoiceToProjectFromTable('${inv.id}','${p?.id || ''}')" />
            </div>
          </td>
        `;
      }).join('');
    }

    let expenseTypeCell = '';
    if (expenseTypeSelectionMode === 'select') {
      const expenseTypeOptions = [`<option value="">—</option>`].concat(
        expenseTypes.map((t) => {
          const selected = inv.expenseTypeId && t?.id && inv.expenseTypeId === t.id ? 'selected' : '';
          return `<option value="${t.id}" ${selected}>${t.nazwa}</option>`;
        })
      ).join('');

      expenseTypeCell = `
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <select onchange="assignInvoiceToExpenseTypeFromTable('${inv.id}', this.value)">${expenseTypeOptions}</select>
            ${configLink}
          </div>
        </td>
      `;
    } else {
      const list = expenseTypes.map((t) => {
        const checked = inv.expenseTypeId && t?.id && inv.expenseTypeId === t.id ? 'checked' : '';
        return `
          <label style="display:flex; align-items:center; gap:6px; margin:4px 0;">
            <input type="radio" name="expense-${inv.id}" value="${t.id}" ${checked}
              onchange="assignInvoiceToExpenseTypeFromTable('${inv.id}', '${t.id}')" />
            <span>${t.nazwa}</span>
          </label>
        `;
      }).join('');

      expenseTypeCell = `
        <td>
          <div style="display:flex; align-items:flex-start; gap:6px;">
            <div style="max-height: 96px; overflow:auto; padding-right:6px;">${list}</div>
            ${configLink}
          </div>
        </td>
      `;
    }

    let actions = '';
    if (inv.status === 'pending' || inv.status === 'ocr') {
      actions = `<button onclick="processInvoice('${inv.id}')">Przetwórz</button>`;
    } else if (inv.status === 'described') {
      actions = `
        <button class="success" onclick="approveInvoice('${inv.id}')">Zatwierdź</button>
        <button class="danger" onclick="rejectInvoice('${inv.id}')">Odrzuć</button>
      `;
    } else if (inv.status === 'approved') {
      actions = `<span style="color: #16a34a;">✓ Zatwierdzona</span>`;
    }

    return `
      <tr>
        <td class="muted">${icon}</td>
        <td>
          <div style="font-weight: 600;">${inv.invoiceNumber || inv.fileName || 'Faktura'}</div>
          <div class="muted">${inv.contractorName || inv.sellerName || '???'}</div>
        </td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td>${amount}</td>
        <td class="muted">${inv.issueDate || '—'}</td>
        ${expenseTypeCell}
        ${projectCell}
        <td>${actions}</td>
      </tr>
    `;
  }).join('');

  const projectHeaderCells = projectSelectionMode === 'select'
    ? `<th>Projekt</th>`
    : projectHeaders;

  container.innerHTML = `
    <div class="invoice-table-wrapper">
      <table class="invoices-table">
        <thead>
          <tr>
            <th></th>
            <th>Faktura</th>
            <th>Status</th>
            <th>Kwota</th>
            <th>Data</th>
            <th>Typ wydatku</th>
            ${projectHeaderCells}
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

window.processInvoice = async function(id) {
  try {
    setUrlState({ action: 'process', invoice: id }, { replace: false });
    await runActionFromUrl('process', id);
  } catch (e) {
    alert('Błąd przetwarzania: ' + e.message);
  }
};

window.approveInvoice = async function(id) {
  try {
    setUrlState({ action: 'approve', invoice: id }, { replace: false });
    await runActionFromUrl('approve', id);
  } catch (e) {
    alert('Błąd zatwierdzania: ' + e.message);
  }
};

window.rejectInvoice = async function(id) {
  const reason = prompt('Podaj powód odrzucenia:');
  if (!reason) return;

  try {
    await fetch(`${url}/inbox/invoices/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    await refresh();
  } catch (e) {
    alert('Błąd odrzucania: ' + e.message);
  }
};

window.editInvoice = function(id) {
  alert('Edycja faktury ' + id + ' - funkcja w przygotowaniu');
};

function exportApproved() {
  const link = document.createElement('a');
  link.href = `${url}/inbox/export.csv`;
  link.download = 'faktury_zatwierdzone.csv';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function refresh() {
  await loadStats();
  await loadProjects();
  await loadExpenseTypes();
  await loadLabels();
  await loadInvoices();
}

// Projects management functions
async function loadProjects() {
  try {
    const res = await fetch(`${url}/projects`);
    if (!res.ok) {
      throw new Error('Failed to load projects');
    }
    const data = await res.json();
    projects = data.projects || [];
    updateProjectSelects();
    renderInvoices();
  } catch (e) {
    console.error('Failed to load projects:', e);
  }
}

async function loadExpenseTypes() {
  try {
    const res = await fetch(`${url}/expense-types`);
    if (!res.ok) {
      throw new Error('Failed to load expense types');
    }
    const data = await res.json();
    expenseTypes = data.expenseTypes || [];
    renderInvoices();
  } catch (e) {
    console.error('Failed to load expense types:', e);
    expenseTypes = [];
  }
}

function updateProjectSelects() {
  const selects = Array.from(document.querySelectorAll('select.project-select'));
  if (!selects.length) {
    return;
  }

  const optionsHtml = [`<option value="">—</option>`].concat(
    projects.map((p) => `<option value="${p.id}">${p.nazwa || p.id}</option>`)
  ).join('');

  selects.forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = optionsHtml;
    if (current) {
      sel.value = current;
    }
  });
}

async function loadLabels() {
  try {
    const res = await fetch(`${url}/labels`);
    if (!res.ok) {
      throw new Error('Failed to load labels');
    }
    const data = await res.json();
    labels = data.labels || [];
    renderInvoices();
  } catch (e) {
    console.error('Failed to load labels:', e);
    labels = [];
  }
}

async function createLabel(data) {
  const res = await fetch(`${url}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create label');
  }

  return await res.json();
}

async function updateLabel(id, data) {
  const res = await fetch(`${url}/labels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update label');
  }

  return await res.json();
}

async function deleteLabel(id) {
  const res = await fetch(`${url}/labels/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete label');
  }

  await loadLabels();
  showNotification('Etykieta usunięta', 'success');
}

async function assignInvoiceToLabels(invoiceId, labelIds) {
  try {
    const res = await fetch(`${url}/inbox/invoices/${invoiceId}/assign-labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelIds: Array.isArray(labelIds) ? labelIds : [] })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Assignment failed');
    }

    await loadInvoices();
  } catch (e) {
    showNotification('Błąd przypisania etykiet: ' + e.message, 'error');
  }

}

async function loadSettings() {
  const res = await fetch(`${url}/settings`);
  if (!res.ok) {
    throw new Error(`Failed to load settings (${res.status})`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Failed to load settings (invalid_response)');
  }
  settings = await res.json();
  return settings;
}

function downloadBlob(filename, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(filename, blob);
}

async function selectFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      resolve(file || null);
    };
    input.click();
  });
}

async function readFileAsText(file) {
  return file.text();
}

async function readFileAsArrayBuffer(file) {
  return file.arrayBuffer();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function exportDataBundle() {
  const res = await fetch(`${url}/data/export`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `export_failed_${res.status}`);
  }
  return data;
}

async function importDataBundle(bundle) {
  const res = await fetch(`${url}/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `import_failed_${res.status}`);
  }
  return data;
}

async function exportEntity(entity) {
  const res = await fetch(`${url}/data/export/${entity}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `export_failed_${res.status}`);
  }
  return data;
}

async function importEntity(entity, payload) {
  const res = await fetch(`${url}/data/import/${entity}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `import_failed_${res.status}`);
  }
  return data;
}

async function exportSqliteFile() {
  const link = document.createElement('a');
  link.href = `${url}/db/export.sqlite`;
  link.download = 'exef.sqlite';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function importSqliteFile(file) {
  const buffer = await readFileAsArrayBuffer(file);
  const base64 = arrayBufferToBase64(buffer);
  const res = await fetch(`${url}/db/import.sqlite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64 }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `import_failed_${res.status}`);
  }
  return data;
}

async function saveSettings(nextSettings) {
  const res = await fetch(`${url}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextSettings)
  });

  if (!res.ok) {
    try {
      const err = await res.json();
      throw new Error(err.error || `Failed to save settings (${res.status})`);
    } catch (_e) {
      throw new Error(`Failed to save settings (${res.status})`);
    }
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    settings = await res.json();
  }
  return settings;
}

async function renderSettingsPage() {
  const container = document.getElementById('settingsPageContent');
  if (!container) {
    return;
  }

  try {
    await loadSettings();
  } catch (e) {
    container.innerHTML = `<div class="empty">Błąd wczytania konfiguracji: ${e.message}</div>`;
    return;
  }

  const localPaths = settings?.channels?.localFolders?.paths || [];
  const projectSelection = settings?.ui?.invoicesTable?.projectSelection || 'select';
  const expenseTypeSelection = settings?.ui?.invoicesTable?.expenseTypeSelection || 'select';
  const uiTheme = settings?.ui?.theme || 'white';
  const emailAccounts = settings?.channels?.email?.accounts || [];
  const ksefAccounts = settings?.channels?.ksef?.accounts || [];
  const remoteConnections = settings?.channels?.remoteStorage?.connections || [];
  const printers = settings?.channels?.devices?.printers || [];
  const scanners = settings?.channels?.devices?.scanners || [];
  const otherSources = settings?.channels?.other?.sources || [];

  if (!projects.length) {
    await loadProjects();
  }
  if (!labels.length) {
    await loadLabels();
  }

  const projectsHtml = projects.length
    ? `<div class="subtle" style="margin-bottom:8px;">Liczba projektów: ${projects.length}</div>` +
      `<div>${projects.map((p) => `<span class="label-chip">📁 ${p.nazwa || p.id}</span>`).join('')}</div>`
    : '<div class="empty" style="padding: 12px;">Brak projektów</div>';

  const labelsHtml = labels.length
    ? `<div class="subtle" style="margin-bottom:8px;">Liczba etykiet: ${labels.length}</div>` +
      `<div>${labels.map((l) => {
        const color = l.kolor || '#e5e7eb';
        return `<span class="label-chip"><span class="label-dot" style="background:${color}"></span>${l.nazwa || l.id}</span>`;
      }).join('')}</div>`
    : '<div class="empty" style="padding: 12px;">Brak etykiet</div>';

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div>
          <div class="page-title" style="margin-bottom:0;">Import / eksport danych</div>
          <div class="subtle">Pełna baza (SQLite/JSON) oraz import/export poszczególnych encji.</div>
        </div>
      </div>

      <div class="form-actions" style="flex-wrap: wrap;">
        <button id="settingsExportBundleBtn" class="primary">Eksport JSON (całość)</button>
        <button id="settingsImportBundleBtn">Import JSON (całość)</button>
        <button id="settingsExportSqliteBtn">Eksport SQLite</button>
        <button id="settingsImportSqliteBtn">Import SQLite</button>
      </div>

      <div class="form-group">
        <label>Encja:</label>
        <select id="settingsEntitySelect">
          <option value="projects">projekty</option>
          <option value="labels">etykiety</option>
          <option value="expense-types">typy wydatków</option>
          <option value="invoices">faktury</option>
          <option value="contractors">kontrahenci</option>
          <option value="settings">konfiguracja</option>
        </select>
      </div>
      <div class="form-actions" style="flex-wrap: wrap;">
        <button id="settingsExportEntityBtn">Eksport encji</button>
        <button id="settingsImportEntityBtn">Import encji</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div>
          <div class="page-title" style="margin-bottom:0;">Listy</div>
          <div class="subtle">Szybki podgląd i edycja list używanych do przypisywania dokumentów.</div>
        </div>
      </div>

      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        <div style="flex:1; min-width: 280px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:600;">Projekty</div>
            <div>
              <button id="settingsGoProjectsBtn">Otwórz</button>
            </div>
          </div>
          ${projectsHtml}
        </div>

        <div style="flex:1; min-width: 280px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:600;">Etykiety</div>
            <div>
              <button id="settingsGoLabelsBtn">Otwórz</button>
            </div>
          </div>
          ${labelsHtml}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="page-title" style="margin-bottom:0;">Kanały dostępu do dokumentów</div>
          <div class="subtle">Poniżej możesz skonfigurować źródła dokumentów. Na tym etapie część integracji to stuby w backendzie (Email/Dropbox/GDrive).</div>
        </div>
      </div>

    <div class="form-group">
      <label>Wybór projektu w tabeli:</label>
      <select id="settingsProjectSelection">
        <option value="select" ${projectSelection === 'select' ? 'selected' : ''}>Select (kompaktowy)</option>
        <option value="radio" ${projectSelection === 'radio' ? 'selected' : ''}>Radio</option>
      </select>
    </div>

    <div class="form-group">
      <label>Wybór typu wydatku w tabeli:</label>
      <select id="settingsExpenseTypeSelection">
        <option value="select" ${expenseTypeSelection === 'select' ? 'selected' : ''}>Select (kompaktowy)</option>
        <option value="radio" ${expenseTypeSelection === 'radio' ? 'selected' : ''}>Radio</option>
      </select>
    </div>

    <div class="form-group">
      <label>Motyw UI:</label>
      <select id="settingsTheme">
        <option value="white" ${uiTheme === 'white' ? 'selected' : ''}>white</option>
        <option value="dark" ${uiTheme === 'dark' ? 'selected' : ''}>dark</option>
        <option value="warm" ${uiTheme === 'warm' ? 'selected' : ''}>warm</option>
      </select>
      <div class="subtle" style="margin-top:6px;">Motyw możesz też przełączać w headerze.</div>
    </div>

    <div class="form-group">
      <label>Tester kontrastu (WCAG):</label>
      <button id="contrastRunBtn" type="button">Uruchom test</button>
      <div id="contrastReport"></div>
    </div>

    <div class="form-group">
      <label>Lokalne foldery (1 linia = 1 ścieżka):</label>
      <textarea id="settingsLocalFolders" rows="4">${localPaths.join('\n')}</textarea>
    </div>

    <div class="form-group">
      <label>Email accounts (JSON):</label>
      <textarea id="settingsEmailAccounts" rows="5">${JSON.stringify(emailAccounts, null, 2)}</textarea>
    </div>

    <div class="form-group">
      <label>KSeF accounts (JSON):</label>
      <textarea id="settingsKsefAccounts" rows="5">${JSON.stringify(ksefAccounts, null, 2)}</textarea>
    </div>

    <div class="form-group">
      <label>Zdalny storage connections (JSON):</label>
      <textarea id="settingsRemoteStorage" rows="5">${JSON.stringify(remoteConnections, null, 2)}</textarea>
    </div>

    <div class="form-group">
      <label>Drukarki (JSON):</label>
      <textarea id="settingsPrinters" rows="4">${JSON.stringify(printers, null, 2)}</textarea>
    </div>

    <div class="form-group">
      <label>Skanery (JSON):</label>
      <textarea id="settingsScanners" rows="4">${JSON.stringify(scanners, null, 2)}</textarea>
    </div>

    <div class="form-group">
      <label>Inne źródła (JSON):</label>
      <textarea id="settingsOtherSources" rows="4">${JSON.stringify(otherSources, null, 2)}</textarea>
    </div>
    </div>
  `;

  const goProjectsBtn = document.getElementById('settingsGoProjectsBtn');
  if (goProjectsBtn) {
    goProjectsBtn.addEventListener('click', () => setActivePage('projects'));
  }
  const goLabelsBtn = document.getElementById('settingsGoLabelsBtn');
  if (goLabelsBtn) {
    goLabelsBtn.addEventListener('click', () => setActivePage('labels'));
  }

  const themeSelect = document.getElementById('settingsTheme');
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      applyTheme(themeSelect.value);
    });
  }

  const contrastBtn = document.getElementById('contrastRunBtn');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', runContrastReport);
  }

  const exportBundleBtn = document.getElementById('settingsExportBundleBtn');
  if (exportBundleBtn) {
    exportBundleBtn.addEventListener('click', async () => {
      try {
        const bundle = await exportDataBundle();
        downloadJson('exef-data.json', bundle);
        showNotification('Wyeksportowano JSON', 'success');
      } catch (e) {
        showNotification('Błąd eksportu: ' + e.message, 'error');
      }
    });
  }

  const importBundleBtn = document.getElementById('settingsImportBundleBtn');
  if (importBundleBtn) {
    importBundleBtn.addEventListener('click', async () => {
      try {
        const file = await selectFile('.json,application/json');
        if (!file) {
          return;
        }
        const raw = await readFileAsText(file);
        const parsed = JSON.parse(raw);
        await importDataBundle(parsed);
        await refresh();
        await renderSettingsPage();
        showNotification('Zaimportowano JSON', 'success');
      } catch (e) {
        showNotification('Błąd importu: ' + e.message, 'error');
      }
    });
  }

  const exportSqliteBtn = document.getElementById('settingsExportSqliteBtn');
  if (exportSqliteBtn) {
    exportSqliteBtn.addEventListener('click', async () => {
      try {
        await exportSqliteFile();
      } catch (e) {
        showNotification('Błąd eksportu SQLite: ' + e.message, 'error');
      }
    });
  }

  const importSqliteBtn = document.getElementById('settingsImportSqliteBtn');
  if (importSqliteBtn) {
    importSqliteBtn.addEventListener('click', async () => {
      try {
        const file = await selectFile('.sqlite,application/x-sqlite3');
        if (!file) {
          return;
        }
        await importSqliteFile(file);
        await refresh();
        await renderSettingsPage();
        showNotification('Zaimportowano SQLite', 'success');
      } catch (e) {
        showNotification('Błąd importu SQLite: ' + e.message, 'error');
      }
    });
  }

  const exportEntityBtn = document.getElementById('settingsExportEntityBtn');
  if (exportEntityBtn) {
    exportEntityBtn.addEventListener('click', async () => {
      try {
        const entity = document.getElementById('settingsEntitySelect')?.value || 'projects';
        const data = await exportEntity(entity);
        downloadJson(`exef-${entity}.json`, data);
        showNotification('Wyeksportowano encję', 'success');
      } catch (e) {
        showNotification('Błąd eksportu encji: ' + e.message, 'error');
      }
    });
  }

  const importEntityBtn = document.getElementById('settingsImportEntityBtn');
  if (importEntityBtn) {
    importEntityBtn.addEventListener('click', async () => {
      try {
        const entity = document.getElementById('settingsEntitySelect')?.value || 'projects';
        const file = await selectFile('.json,application/json');
        if (!file) {
          return;
        }
        const raw = await readFileAsText(file);
        const parsed = JSON.parse(raw);
        if (entity === 'settings') {
          const item = parsed?.item && typeof parsed.item === 'object' ? parsed.item : parsed;
          await importEntity(entity, { item });
        } else {
          const items = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
          await importEntity(entity, { items });
        }
        await refresh();
        await renderSettingsPage();
        showNotification('Zaimportowano encję', 'success');
      } catch (e) {
        showNotification('Błąd importu encji: ' + e.message, 'error');
      }
    });
  }
}

async function assignInvoiceToExpenseType(invoiceId, expenseTypeId) {
  try {
    const res = await fetch(`${url}/inbox/invoices/${invoiceId}/assign-expense-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenseTypeId: expenseTypeId || null })
    });

    if (res.ok) {
      await loadInvoices();
      showNotification('Typ wydatku przypisany', 'success');
    } else {
      const error = await res.json();
      throw new Error(error.error || 'Assignment failed');
    }
  } catch (e) {
    showNotification('Błąd przypisania typu wydatku: ' + e.message, 'error');
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    background: ${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb'};
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

async function assignInvoiceToProject(invoiceId, projectId) {
  try {
    const res = await fetch(`${url}/inbox/invoices/${invoiceId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectId || null })
    });

    if (res.ok) {
      await loadInvoices();
      showNotification('Faktura przypisana do projektu', 'success');
    } else {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Assignment failed');
    }
  } catch (e) {
    showNotification('Błąd przypisania: ' + e.message, 'error');
  }
}

async function renderProjectsPage() {
  await loadProjects();
  const container = document.getElementById('projectsPageList');
  if (!container) {
    return;
  }
  await renderProjectsList(container);
}

async function renderLabelsPage() {
  await loadLabels();
  const container = document.getElementById('labelsPageList');
  if (!container) {
    return;
  }

  if (!labels.length) {
    container.innerHTML = '<p class="empty">Brak etykiet</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'projects-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Nazwa</th>
        <th>Kolor</th>
        <th>Opis</th>
        <th>Akcje</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  labels.forEach((label) => {
    const row = document.createElement('tr');
    const color = label.kolor || '';
    row.innerHTML = `
      <td>${label.id}</td>
      <td>${label.nazwa}</td>
      <td><span class="label-chip"><span class="label-dot" style="background:${color || '#e5e7eb'}"></span>${color || '-'}</span></td>
      <td>${label.opis || '-'}</td>
      <td>
        <button class="edit-label-btn" data-id="${label.id}">Edytuj</button>
        <button class="delete-label-btn danger" data-id="${label.id}">Usuń</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(table);

  container.querySelectorAll('.edit-label-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const label = labels.find((l) => l.id === id);
      showLabelForm(label);
    });
  });

  container.querySelectorAll('.delete-label-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (confirm('Czy na pewno usunąć tę etykietę?')) {
        await deleteLabel(id);
        await renderLabelsPage();
      }
    });
  });
}

function showLabelForm(label = null) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${label ? 'Edytuj etykietę' : 'Dodaj etykietę'}</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <form class="label-form">
          <div class="form-group">
            <label>ID etykiety:</label>
            <input type="text" name="id" value="${label?.id || ''}" ${label ? 'readonly' : ''} required>
          </div>
          <div class="form-group">
            <label>Nazwa:</label>
            <input type="text" name="nazwa" value="${label?.nazwa || ''}" required>
          </div>
          <div class="form-group">
            <label>Kolor (np. #22c55e):</label>
            <input type="text" name="kolor" value="${label?.kolor || ''}">
          </div>
          <div class="form-group">
            <label>Opis:</label>
            <textarea name="opis" rows="3">${label?.opis || ''}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="primary">${label ? 'Zapisz zmiany' : 'Dodaj etykietę'}</button>
            <button type="button" class="cancel-btn">Anuluj</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.close-btn').addEventListener('click', close);
  modal.querySelector('.cancel-btn').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('.label-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      if (label) {
        await updateLabel(label.id, data);
        showNotification('Etykieta zaktualizowana', 'success');
      } else {
        await createLabel(data);
        showNotification('Etykieta dodana', 'success');
      }
      close();
      await loadLabels();
      await renderLabelsPage();
    } catch (err) {
      showNotification('Błąd: ' + (err?.message || err), 'error');
    }
  });
}

async function showProjectsManager(options = {}) {
  if (options && typeof options.preventDefault === 'function') {
    options = {};
  }
  const syncUrl = options.syncUrl !== false;
  if (syncUrl) {
    setUrlState({ modal: 'projects', invoice: null }, { replace: false });
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Zarządzanie projektami</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="projects-toolbar">
          <button class="add-project-btn primary">+ Dodaj projekt</button>
          <button class="import-projects-btn">Importuj CSV</button>
        </div>
        <div class="projects-list"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  activeUrlModal = modal;

  const close = () => {
    modal.remove();
    if (activeUrlModal === modal) {
      activeUrlModal = null;
    }
    if (syncUrl) {
      setUrlState({ modal: null }, { replace: false });
    }
  };
  
  // Close modal
  modal.querySelector('.close-btn').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  
  // Load projects
  await renderProjectsList(modal.querySelector('.projects-list'));
  
  // Add project button
  modal.querySelector('.add-project-btn').addEventListener('click', () => {
    showProjectForm();
  });
  
  // Import CSV button
  modal.querySelector('.import-projects-btn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await importProjectsFromCSV(file);
        await renderProjectsList(modal.querySelector('.projects-list'));
      }
    };
    input.click();
  });
}

async function renderProjectsList(container) {
  container.innerHTML = '';
  
  if (projects.length === 0) {
    container.innerHTML = '<p class="empty">Brak projektów</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'projects-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Nazwa</th>
        <th>Klient</th>
        <th>NIP</th>
        <th>Budżet</th>
        <th>Status</th>
        <th>Akcje</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  projects.forEach(project => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${project.id}</td>
      <td>${project.nazwa}</td>
      <td>${project.klient || '-'}</td>
      <td>${project.nip || '-'}</td>
      <td>${project.budzet ? parseFloat(project.budzet).toFixed(2) + ' zł' : '-'}</td>
      <td><span class="status-badge status-${project.status}">${project.status}</span></td>
      <td>
        <button class="edit-project-btn" data-id="${project.id}">Edytuj</button>
        <button class="delete-project-btn danger" data-id="${project.id}">Usuń</button>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  container.appendChild(table);
  
  // Event listeners
  container.querySelectorAll('.edit-project-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const projectId = e.target.dataset.id;
      const project = projects.find(p => p.id === projectId);
      showProjectForm(project);
    });
  });
  
  container.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const projectId = e.target.dataset.id;
      if (confirm('Czy na pewno usunąć ten projekt?')) {
        await deleteProject(projectId);
        await renderProjectsList(container);
      }
    });
  });
}

function showProjectForm(project = null) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${project ? 'Edytuj projekt' : 'Dodaj projekt'}</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <form class="project-form">
          <div class="form-group">
            <label>ID projektu:</label>
            <input type="text" name="id" value="${project?.id || ''}" ${project ? 'readonly' : ''} required>
          </div>
          <div class="form-group">
            <label>Nazwa:</label>
            <input type="text" name="nazwa" value="${project?.nazwa || ''}" required>
          </div>
          <div class="form-group">
            <label>Klient:</label>
            <input type="text" name="klient" value="${project?.klient || ''}">
          </div>
          <div class="form-group">
            <label>NIP:</label>
            <input type="text" name="nip" value="${project?.nip || ''}">
          </div>
          <div class="form-group">
            <label>Budżet:</label>
            <input type="number" name="budzet" value="${project?.budzet || ''}" step="0.01">
          </div>
          <div class="form-group">
            <label>Status:</label>
            <select name="status">
              <option value="aktywny" ${project?.status === 'aktywny' ? 'selected' : ''}>Aktywny</option>
              <option value="w_trakcie" ${project?.status === 'w_trakcie' ? 'selected' : ''}>W trakcie</option>
              <option value="zakończony" ${project?.status === 'zakończony' ? 'selected' : ''}>Zakończony</option>
              <option value="planowanie" ${project?.status === 'planowanie' ? 'selected' : ''}>Planowanie</option>
            </select>
          </div>
          <div class="form-group">
            <label>Opis:</label>
            <textarea name="opis" rows="3">${project?.opis || ''}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="primary">${project ? 'Zapisz zmiany' : 'Dodaj projekt'}</button>
            <button type="button" class="cancel-btn">Anuluj</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal
  modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
  modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Submit form
  modal.querySelector('.project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      if (project) {
        await updateProject(project.id, data);
        showNotification('Projekt zaktualizowany', 'success');
      } else {
        await createProject(data);
        showNotification('Projekt dodany', 'success');
      }
      modal.remove();
      await loadProjects();
    } catch (e) {
      showNotification('Błąd: ' + e.message, 'error');
    }
  });
}

async function createProject(data) {
  const res = await fetch(`${url}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create project');
  }
  
  return await res.json();
}

async function updateProject(id, data) {
  const res = await fetch(`${url}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update project');
  }
  
  return await res.json();
}

async function deleteProject(id) {
  const res = await fetch(`${url}/projects/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete project');
  }
  
  await loadProjects();
  showNotification('Projekt usunięty', 'success');
}

async function importProjectsFromCSV(file) {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    showNotification('Plik CSV jest pusty', 'error');
    return;
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  let imported = 0;
  let errors = 0;
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length >= 2 && values[0]) {
        const project = {
          id: values[0],
          nazwa: values[1],
          klient: values[2] || '',
          nip: values[3] || '',
          budzet: values[4] || 0,
          status: values[5] || 'aktywny',
          opis: values[6] || ''
        };
        
        await createProject(project);
        imported++;
      }
    } catch (e) {
      errors++;
    }
  }
  
  showNotification(`Zaimportowano ${imported} projektów${errors > 0 ? ` (${errors} błędów)` : ''}`, errors > 0 ? 'warning' : 'success');
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setActiveFilter(tab.dataset.filter);
  });
});

document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('toggleViewBtn').addEventListener('click', () => {
  setViewMode(viewMode === 'table' ? 'cards' : 'table');
});
document.getElementById('exportBtn').addEventListener('click', exportApproved);
document.getElementById('projectsBtn').addEventListener('click', () => setActivePage('projects'));

const themeBtn = document.getElementById('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', cycleTheme);
}

const expenseTypesBtn = document.getElementById('expenseTypesBtn');
if (expenseTypesBtn) {
  expenseTypesBtn.addEventListener('click', () => showExpenseTypesManager());
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    setActivePage(page);
  });
});

const projectsAddBtn = document.getElementById('projectsAddBtn');
if (projectsAddBtn) {
  projectsAddBtn.addEventListener('click', () => showProjectForm());
}

const labelsAddBtn = document.getElementById('labelsAddBtn');
if (labelsAddBtn) {
  labelsAddBtn.addEventListener('click', () => showLabelForm());
}

const settingsReloadBtn = document.getElementById('settingsReloadBtn');
if (settingsReloadBtn) {
  settingsReloadBtn.addEventListener('click', () => renderSettingsPage());
}

const settingsSaveBtn = document.getElementById('settingsSaveBtn');
if (settingsSaveBtn) {
  settingsSaveBtn.addEventListener('click', async () => {
    try {
      const uiTheme = document.getElementById('settingsTheme')?.value || 'white';
      const projectSelection = document.getElementById('settingsProjectSelection')?.value || 'select';
      const expenseTypeSelection = document.getElementById('settingsExpenseTypeSelection')?.value || 'select';

      const localFoldersRaw = document.getElementById('settingsLocalFolders')?.value || '';
      const paths = localFoldersRaw.split('\n').map((v) => v.trim()).filter(Boolean);

      const parseJson = (id) => {
        const raw = document.getElementById(id)?.value || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : parsed;
      };

      const emailAccounts = parseJson('settingsEmailAccounts');
      const ksefAccounts = parseJson('settingsKsefAccounts');
      const remoteConnections = parseJson('settingsRemoteStorage');
      const printers = parseJson('settingsPrinters');
      const scanners = parseJson('settingsScanners');
      const otherSources = parseJson('settingsOtherSources');

      await saveSettings({
        ui: {
          theme: uiTheme,
          invoicesTable: {
            projectSelection,
            expenseTypeSelection,
          },
        },
        channels: {
          localFolders: { paths },
          email: { accounts: emailAccounts },
          ksef: { accounts: ksefAccounts, activeAccountId: settings?.channels?.ksef?.activeAccountId || null },
          remoteStorage: { connections: remoteConnections },
          devices: { printers, scanners },
          other: { sources: otherSources },
        },
      });

      showNotification('Konfiguracja zapisana', 'success');
      await renderSettingsPage();

      if (!storedTheme) {
        applyTheme(uiTheme, { persist: false });
      }
    } catch (e) {
      showNotification('Błąd zapisu konfiguracji: ' + e.message, 'error');
    }
  });
}

window.showAssignModal = async function(invoiceId, options = {}) {
  const syncUrl = options.syncUrl !== false;
  if (syncUrl) {
    setUrlState({ modal: 'assign', invoice: invoiceId }, { replace: false });
  }

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Przypisz</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="invoice-info">
          <h3>${invoice.invoiceNumber || invoice.fileName || 'Faktura'}</h3>
          <p>Kwota: ${invoice.grossAmount ? Number(invoice.grossAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' ' + (invoice.currency || 'PLN') : '—'}</p>
          <p>Kontrahent: ${invoice.contractorName || invoice.sellerName || '—'}</p>
        </div>
        <div class="form-group">
          <label>Projekt:</label>
          <select class="project-select" id="assignProjectSelect">
            <option value="">-- wybierz projekt --</option>
          </select>
        </div>
        <div class="form-group">
          <label>Typ wydatku:</label>
          <select id="assignExpenseTypeSelect"></select>
        </div>
        <div class="form-group">
          <label>Etykiety:</label>
          <div id="assignLabelsList"></div>
        </div>
        <div class="form-actions">
          <button class="primary" id="assignBtn">Zapisz</button>
          <button class="cancel-btn">Anuluj</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  activeUrlModal = modal;

  updateProjectSelects();
  if (invoice.projectId) {
    document.getElementById('assignProjectSelect').value = invoice.projectId;
  }

  const expenseSelect = document.getElementById('assignExpenseTypeSelect');
  expenseSelect.innerHTML = [`<option value="">—</option>`].concat(
    expenseTypes.map((t) => `<option value="${t.id}">${t.nazwa}</option>`)
  ).join('');
  if (invoice.expenseTypeId) {
    expenseSelect.value = invoice.expenseTypeId;
  }

  const labelsContainer = document.getElementById('assignLabelsList');
  if (labelsContainer) {
    if (!labels.length) {
      await loadLabels();
    }
    const selected = Array.isArray(invoice.labelIds) ? invoice.labelIds : [];
    if (!labels.length) {
      labelsContainer.innerHTML = '<div class="subtle">Brak etykiet</div>';
    } else {
      labelsContainer.innerHTML = labels.map((l) => {
        const checked = selected.includes(l.id) ? 'checked' : '';
        const color = l.kolor || '#e5e7eb';
        return `
          <label style="display:flex; align-items:center; gap:8px; margin:6px 0; font-size: 14px;">
            <input type="checkbox" class="assign-label-checkbox" value="${l.id}" ${checked} />
            <span class="label-dot" style="background:${color}"></span>
            <span>${l.nazwa}</span>
          </label>
        `;
      }).join('');
    }
  }

  const close = () => {
    modal.remove();
    if (activeUrlModal === modal) {
      activeUrlModal = null;
    }
    if (syncUrl) {
      setUrlState({ modal: null, ...(pageMode === 'list' ? { invoice: null } : {}) }, { replace: false });
    }
  };

  modal.querySelector('.close-btn').addEventListener('click', close);
  modal.querySelector('.cancel-btn').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.getElementById('assignBtn').addEventListener('click', async () => {
    const projectId = document.getElementById('assignProjectSelect').value;
    const expenseTypeId = document.getElementById('assignExpenseTypeSelect').value;

    const labelIds = Array.from(document.querySelectorAll('.assign-label-checkbox'))
      .filter((el) => el.checked)
      .map((el) => el.value);

    await assignInvoiceToProject(invoiceId, projectId);
    await assignInvoiceToExpenseType(invoiceId, expenseTypeId);
    await assignInvoiceToLabels(invoiceId, labelIds);
    close();
  });
};

window.showProjectAssignModal = function(invoiceId) {
  return window.showAssignModal(invoiceId);
};

window.openInvoiceDetails = function(invoiceId, options = {}) {
  const syncUrl = options.syncUrl !== false;
  if (syncUrl) {
    setUrlState({ invoice: invoiceId, modal: null }, { replace: false });
  }
  return showInvoiceDetailsPage(invoiceId, { syncUrl: false });
};

function showInvoiceListPage(options = {}) {
  pageMode = 'list';
  currentInvoice = null;
  if (options.syncUrl !== false) {
    setUrlState({ invoice: null, modal: null }, { replace: false });
  }
  renderInvoices();
}

async function showInvoiceDetailsPage(invoiceId, options = {}) {
  pageMode = 'invoice';

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    showInvoiceListPage({ syncUrl: options.syncUrl !== false });
    return;
  }

  currentInvoice = invoice;
  const container = document.getElementById('invoiceList');

  const amount = invoice.grossAmount
    ? `${Number(invoice.grossAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${invoice.currency || 'PLN'}`
    : '—';

  const projectOptions = ['<option value="">-- wybierz projekt --</option>'].concat(
    projects.map((p) => `<option value="${p.id}">${p.nazwa}</option>`)
  ).join('');
  const expenseOptions = ['<option value="">—</option>'].concat(
    expenseTypes.map((t) => `<option value="${t.id}">${t.nazwa}</option>`)
  ).join('');

  if (!labels.length) {
    await loadLabels();
  }
  const selectedLabels = Array.isArray(invoice.labelIds) ? invoice.labelIds : [];
  const labelsOptions = labels.length
    ? labels.map((l) => {
      const checked = selectedLabels.includes(l.id) ? 'checked' : '';
      const color = l.kolor || '#e5e7eb';
      return `
        <label style="display:flex; align-items:center; gap:8px; margin:6px 0; font-size: 14px;">
          <input type="checkbox" class="details-label-checkbox" value="${l.id}" ${checked} />
          <span class="label-dot" style="background:${color}"></span>
          <span>${l.nazwa}</span>
        </label>
      `;
    }).join('')
    : '<div class="subtle">Brak etykiet</div>';

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${invoice.invoiceNumber || invoice.fileName || 'Faktura'}</div>
          <div class="card-meta">${invoice.contractorName || invoice.sellerName || '???'}${invoice.issueDate ? ` • ${invoice.issueDate}` : ''}</div>
        </div>
        <div class="card-actions">
          <button id="backToListBtn">← Wróć</button>
        </div>
      </div>

      <div class="invoice-info">
        <p>Kwota: ${amount}</p>
        <p>Status: ${STATUS_LABELS[invoice.status] || invoice.status}</p>
      </div>

      <div class="form-group">
        <label>Projekt:</label>
        <select class="project-select" id="detailsProjectSelect">${projectOptions}</select>
      </div>
      <div class="form-group">
        <label>Typ wydatku:</label>
        <select id="detailsExpenseTypeSelect">${expenseOptions}</select>
      </div>

      <div class="form-group">
        <label>Etykiety:</label>
        <div id="detailsLabelsList">${labelsOptions}</div>
      </div>

      <div class="form-actions">
        <button id="saveDetailsAssignmentsBtn" class="primary">Zapisz</button>
        <button id="openAssignModalBtn">Otwórz w modalu</button>
      </div>
    </div>
  `;

  document.getElementById('detailsProjectSelect').value = invoice.projectId || '';
  document.getElementById('detailsExpenseTypeSelect').value = invoice.expenseTypeId || '';

  document.getElementById('backToListBtn').addEventListener('click', () => {
    showInvoiceListPage({ syncUrl: true });
  });

  document.getElementById('openAssignModalBtn').addEventListener('click', () => {
    window.showAssignModal(invoiceId);
  });

  document.getElementById('saveDetailsAssignmentsBtn').addEventListener('click', async () => {
    const projectId = document.getElementById('detailsProjectSelect').value;
    const expenseTypeId = document.getElementById('detailsExpenseTypeSelect').value;

    const labelIds = Array.from(document.querySelectorAll('.details-label-checkbox'))
      .filter((el) => el.checked)
      .map((el) => el.value);

    await assignInvoiceToProject(invoiceId, projectId);
    await assignInvoiceToExpenseType(invoiceId, expenseTypeId);
    await assignInvoiceToLabels(invoiceId, labelIds);
    await refresh();
    await showInvoiceDetailsPage(invoiceId, { syncUrl: false });
  });

  if (options.syncUrl !== false) {
    setUrlState({ invoice: invoiceId, modal: null }, { replace: false });
  }
}

async function showInvoiceDetailsModal(invoiceId, options = {}) {
  const syncUrl = options.syncUrl !== false;
  if (syncUrl) {
    setUrlState({ modal: 'invoice', invoice: invoiceId }, { replace: false });
  }

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${invoice.invoiceNumber || invoice.fileName || 'Faktura'}</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="invoice-info">
          <p>Status: ${STATUS_LABELS[invoice.status] || invoice.status}</p>
          <p>Kontrahent: ${invoice.contractorName || invoice.sellerName || '—'}</p>
        </div>
        <div class="form-actions">
          <button id="openInvoicePageBtn" class="primary">Otwórz stronę</button>
          <button class="cancel-btn">Zamknij</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  activeUrlModal = modal;

  const close = () => {
    modal.remove();
    if (activeUrlModal === modal) {
      activeUrlModal = null;
    }
    if (syncUrl) {
      setUrlState({ modal: null }, { replace: false });
    }
  };

  modal.querySelector('.close-btn').addEventListener('click', close);
  modal.querySelector('.cancel-btn').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.getElementById('openInvoicePageBtn').addEventListener('click', () => {
    close();
    window.openInvoiceDetails(invoiceId);
  });
}

(async function init() {
  await resolveApiBaseUrl();
  const connected = await checkConnection();
  if (connected) {
    const state = getUrlState();
    if (state.page) {
      setActivePage(state.page, { syncUrl: false });
    }
    if (state.view === 'table' || state.view === 'cards') {
      setViewMode(state.view, { syncUrl: false });
    }
    if (state.filter !== null) {
      setActiveFilter(state.filter || '', { syncUrl: false, load: false });
    }
    try {
      await loadSettings();
      if (!storedTheme && settings?.ui?.theme) {
        applyTheme(settings.ui.theme, { persist: false });
      }
    } catch (_e) {
      settings = null;
    }
    await loadStats();
    await loadProjects();
    await loadExpenseTypes();
    await loadLabels();
    await loadInvoices();
    await syncUiFromUrl();
  }
})();

window.addEventListener('popstate', () => {
  syncUiFromUrl();
});

window.navigateToSettings = function() {
  setActivePage('settings');
};
