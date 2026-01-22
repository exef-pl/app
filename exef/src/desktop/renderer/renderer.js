const url = window.exef?.localServiceBaseUrl ?? 'http://127.0.0.1:3030';

document.getElementById('url').textContent = url;

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

async function checkConnection() {
  const connDot = document.getElementById('connDot');
  const connStatus = document.getElementById('connStatus');

  try {
    const res = await fetch(`${url}/health`);
    if (res.ok) {
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

async function loadInvoices() {
  try {
    const filterParam = currentFilter ? `?status=${currentFilter}` : '';
    const res = await fetch(`${url}/inbox/invoices${filterParam}`);
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

  if (invoices.length === 0) {
    container.innerHTML = '<div class="empty">Brak faktur do wyświetlenia</div>';
    return;
  }

  container.innerHTML = invoices.map(inv => {
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
      `;
    } else if (inv.status === 'described') {
      actions = `
        <button class="success" onclick="approveInvoice('${inv.id}')">Zatwierdź</button>
        <button onclick="editInvoice('${inv.id}')">Edytuj</button>
        <button class="danger" onclick="rejectInvoice('${inv.id}')">Odrzuć</button>
      `;
    } else if (inv.status === 'approved') {
      actions = `<span style="color: #16a34a;">✓ Zatwierdzona</span>`;
    }

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
        <div class="card-actions">${actions}</div>
      </div>
    `;
  }).join('');
}

window.processInvoice = async function(id) {
  try {
    await fetch(`${url}/inbox/invoices/${id}/process`, { method: 'POST' });
    await refresh();
  } catch (e) {
    alert('Błąd przetwarzania: ' + e.message);
  }
};

window.approveInvoice = async function(id) {
  try {
    await fetch(`${url}/inbox/invoices/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await refresh();
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

async function exportApproved() {
  try {
    const res = await fetch(`${url}/inbox/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });
    const result = await res.json();
    if (result.content) {
      const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'faktury_zatwierdzone.csv';
      link.click();
    } else if (result.filePath) {
      alert('Wyeksportowano do: ' + result.filePath);
    } else {
      alert('Eksport zakończony');
    }
  } catch (e) {
    alert('Błąd eksportu: ' + e.message);
  }
}

async function refresh() {
  await loadStats();
  await loadInvoices();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    loadInvoices();
  });
});

document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('exportBtn').addEventListener('click', exportApproved);

(async function init() {
  const connected = await checkConnection();
  if (connected) {
    await refresh();
  }
})();
