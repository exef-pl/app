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
let projects = [];
let currentInvoice = null;

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
        <button onclick="showProjectAssignModal('${inv.id}')">Przypisz</button>
      `;
    } else if (inv.status === 'described') {
      actions = `
        <button class="success" onclick="approveInvoice('${inv.id}')">Zatwierdź</button>
        <button onclick="editInvoice('${inv.id}')">Edytuj</button>
        <button onclick="showProjectAssignModal('${inv.id}')">Przypisz</button>
        <button class="danger" onclick="rejectInvoice('${inv.id}')">Odrzuć</button>
      `;
    } else if (inv.status === 'approved') {
      actions = `
        <span style="color: #16a34a;">✓ Zatwierdzona</span>
        <button onclick="showProjectAssignModal('${inv.id}')">Przypisz</button>
      `;
    }

    const projectInfo = inv.projectId ? (() => {
      const project = projects.find(p => p.id === inv.projectId);
      return project ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">📁 Projekt: ${project.nazwa}</div>` : '';
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
        ${projectInfo}
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
  await loadProjects();
}

// Projects management functions
async function loadProjects() {
  try {
    const res = await fetch(`${url}/projects`);
    const data = await res.json();
    projects = data.projects || [];
    updateProjectSelects();
  } catch (e) {
    console.error('Failed to load projects:', e);
  }
}

function updateProjectSelects() {
  const selects = document.querySelectorAll('.project-select');
  selects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- wybierz projekt --</option>';
    
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = `${project.nazwa} (${project.klient || 'brak klienta'})`;
      select.appendChild(option);
    });
    
    if (currentValue) {
      select.value = currentValue;
    }
  });
}

async function assignInvoiceToProject(invoiceId, projectId) {
  try {
    const res = await fetch(`${url}/inbox/invoices/${invoiceId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });
    
    if (res.ok) {
      await loadInvoices();
      showNotification('Faktura przypisana do projektu', 'success');
    } else {
      const error = await res.json();
      throw new Error(error.error || 'Assignment failed');
    }
  } catch (e) {
    showNotification('Błąd przypisania: ' + e.message, 'error');
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

async function showProjectsManager() {
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
  
  // Close modal
  modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
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
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    loadInvoices();
  });
});

document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('exportBtn').addEventListener('click', exportApproved);
document.getElementById('projectsBtn').addEventListener('click', showProjectsManager);

// Project assignment modal
window.showProjectAssignModal = function(invoiceId) {
  const invoice = invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Przypisz fakturę do projektu</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="invoice-info">
          <h3>${invoice.invoiceNumber || invoice.fileName || 'Faktura'}</h3>
          <p>Kwota: ${invoice.grossAmount ? Number(invoice.grossAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' ' + (invoice.currency || 'PLN') : '—'}</p>
          <p>Kontrahent: ${invoice.contractorName || invoice.sellerName || '—'}</p>
        </div>
        <div class="form-group">
          <label>Wybierz projekt:</label>
          <select class="project-select" id="assignProjectSelect">
            <option value="">-- wybierz projekt --</option>
          </select>
        </div>
        <div class="form-actions">
          <button class="primary" id="assignBtn">Przypisz</button>
          <button class="cancel-btn">Anuluj</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Update project select
  updateProjectSelects();
  
  // Set current project if already assigned
  if (invoice.projectId) {
    document.getElementById('assignProjectSelect').value = invoice.projectId;
  }
  
  // Close modal
  modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
  modal.querySelector('.cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Assign project
  document.getElementById('assignBtn').addEventListener('click', async () => {
    const projectId = document.getElementById('assignProjectSelect').value;
    await assignInvoiceToProject(invoiceId, projectId);
    modal.remove();
  });
};

(async function init() {
  const connected = await checkConnection();
  if (connected) {
    await refresh();
  }
})();
