const url = window.exef?.localServiceBaseUrl ?? 'http://127.0.0.1:3030';

document.getElementById('url').textContent = url;

async function check() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'sprawdzanie...';

  try {
    const res = await fetch(`${url}/health`);
    const json = await res.json();
    statusEl.textContent = `OK: ${json.service}`;
  } catch (e) {
    statusEl.textContent = 'BŁĄD: lokalna usługa nie odpowiada';
  }
}

document.getElementById('check').addEventListener('click', check);
