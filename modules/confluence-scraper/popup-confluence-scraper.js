/**
 * VML Confluence Scraper — Popup UI Handler
 * Controla toda la interacción del usuario: detección de página,
 * configuración de profundidad, progreso en tiempo real y output.
 */

'use strict';

// ─── Referencias al DOM ────────────────────────────────────────────────────
const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');
const pageTitle       = document.getElementById('page-title');
const pageId          = document.getElementById('page-id');
const spaceKey        = document.getElementById('space-key');
const depthSlider     = document.getElementById('depth-slider');
const depthValue      = document.getElementById('depth-value');
const btnScrape       = document.getElementById('btn-scrape');
const btnDownload     = document.getElementById('btn-download');
const btnCopy         = document.getElementById('btn-copy');
const progressWrap    = document.getElementById('progress-wrap');
const progressBar     = document.getElementById('progress-bar');
const progressLabel   = document.getElementById('progress-label');
const statsWrap       = document.getElementById('stats-wrap');
const statPages       = document.getElementById('stat-pages');
const statWords       = document.getElementById('stat-words');
const statDepth       = document.getElementById('stat-depth');
const resultPreview   = document.getElementById('result-preview');
const errorBanner     = document.getElementById('error-banner');
const errorMsg        = document.getElementById('error-msg');

// ─── Estado interno ────────────────────────────────────────────────────────
let currentPageId  = null;
let currentTitle   = 'Untitled';
let scrapedMarkdown = '';
let pollInterval   = null;
let scrapeStartTime = null;

// ─── Helpers ───────────────────────────────────────────────────────────────

function showError(msg) {
  errorMsg.textContent = msg;
  errorBanner.style.display = 'flex';
}

function hideError() {
  errorBanner.style.display = 'none';
}

function setStatus(state) {
  // state: 'idle' | 'ready' | 'running' | 'done' | 'error'
  const configs = {
    idle:    { dot: '#555', text: 'Detectando página...' },
    ready:   { dot: '#00e5ff', text: 'Listo para scrapear' },
    running: { dot: '#f59e0b', text: 'Scraping en progreso...' },
    done:    { dot: '#22c55e', text: 'Completado ✓' },
    error:   { dot: '#ef4444', text: 'Error' }
  };
  const cfg = configs[state] || configs.idle;
  statusDot.style.background = cfg.dot;
  statusDot.style.boxShadow  = `0 0 8px ${cfg.dot}`;
  statusText.textContent = cfg.text;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatMarkdownWithMeta(markdown, title, spaceKeyVal, maxDepth) {
  const now = new Date();
  const dateStr = now.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const header = [
    `# ${title}`,
    ``,
    `> **Espacio:** ${spaceKeyVal || 'N/A'} | **Extraído:** ${dateStr} | **Profundidad máxima:** ${maxDepth}`,
    ``,
    `---`,
    ``
  ].join('\n');
  return header + markdown;
}

// ─── Detección de página activa ────────────────────────────────────────────

async function detectActivePage() {
  setStatus('idle');
  pageTitle.textContent = 'Detectando...';
  pageId.textContent    = '—';
  spaceKey.textContent  = '—';
  btnScrape.disabled    = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('confluence.uhub.biz')) {
      pageTitle.textContent = 'No estás en Confluence';
      setStatus('error');
      showError('Navegá a una página de confluence.uhub.biz y volvé a abrir la extensión.');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'DETECT_PAGE_INFO' });

    if (!response || !response.pageId) {
      pageTitle.textContent = 'Página no detectada';
      setStatus('error');
      showError('No se pudo detectar el Page ID. Asegurate de estar en una página de contenido (no en el dashboard de Confluence).');
      return;
    }

    currentPageId = response.pageId;
    currentTitle  = response.title || 'Página de Confluence';

    pageTitle.textContent = currentTitle;
    pageId.textContent    = `ID: ${currentPageId}`;
    spaceKey.textContent  = response.spaceKey ? `Espacio: ${response.spaceKey}` : '';

    // Guardar spaceKey para metadata
    window._spaceKey = response.spaceKey || '';

    setStatus('ready');
    hideError();
    btnScrape.disabled = false;

  } catch (err) {
    pageTitle.textContent = 'Error de conexión';
    setStatus('error');
    showError('Error al comunicarse con la página. Recargá Confluence y reintentá.');
  }
}

// ─── Inicio del Scraping ───────────────────────────────────────────────────

async function startScrape() {
  if (!currentPageId) return;

  // Reset UI
  hideError();
  scrapedMarkdown    = '';
  scrapeStartTime    = Date.now();
  btnScrape.disabled = true;
  btnDownload.style.display = 'none';
  btnCopy.style.display     = 'none';
  statsWrap.style.display   = 'none';
  resultPreview.textContent = '';
  progressWrap.style.display = 'flex';
  progressBar.style.width    = '5%';
  progressLabel.textContent  = 'Iniciando...';
  setStatus('running');

  const maxDepth = parseInt(depthSlider.value, 10);

  // Limpiar progress previo de storage (solo el progreso, no el resultado)
  await chrome.storage.local.remove(['scrape_progress']);

  // Enviar mensaje al content script para iniciar
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, {
    action: 'START_SCRAPE',
    rootPageId: currentPageId,
    maxDepth
  });

  // Iniciar polling de progreso desde storage
  startProgressPolling(maxDepth);
}

// ─── Polling de progreso ───────────────────────────────────────────────────

function startProgressPolling(maxDepth) {
  if (pollInterval) clearInterval(pollInterval);

  // Guardar referencia al tab activo para el GET_RESULT
  let activeTabId = null;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab) activeTabId = tab.id;
  });

  pollInterval = setInterval(async () => {
    const data = await chrome.storage.local.get(['scrape_progress']);
    const progress = data.scrape_progress;

    if (!progress) return;

    // Actualizar progress bar (estimación visual)
    const processed = progress.processed || 0;
    const found     = Math.max(progress.found || 1, processed);
    const pct       = Math.min(Math.round((processed / found) * 100), 95);
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = `${processed} de ~${found} páginas procesadas`;

    if (progress.error) {
      clearInterval(pollInterval);
      progressWrap.style.display = 'none';
      setStatus('error');
      showError(`Error durante el scraping: ${progress.error}`);
      btnScrape.disabled = false;
      return;
    }

    if (progress.done) {
      clearInterval(pollInterval);

      // ✅ Pedir el resultado directo desde la memoria del content script
      // (sin pasar por storage — sin límite de tamaño)
      if (!activeTabId) {
        showError('No se pudo obtener el tab activo para recuperar el resultado.');
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(activeTabId, { action: 'GET_RESULT' });
        if (response && response.ok) {
          onScrapeComplete(response.result, maxDepth);
        } else {
          showError('El scraping terminó pero no se pudo recuperar el resultado.');
          btnScrape.disabled = false;
        }
      } catch {
        showError('Error al recuperar el resultado del scraping.');
        btnScrape.disabled = false;
      }
    }

  }, 400);
}

// ─── Scraping completado ───────────────────────────────────────────────────

function onScrapeComplete(result, maxDepth) {
  progressBar.style.width   = '100%';
  progressLabel.textContent = '¡Completado!';

  setTimeout(() => {
    progressWrap.style.display = 'none';

    const { markdown, stats } = result;
    scrapedMarkdown = formatMarkdownWithMeta(
      markdown, currentTitle, window._spaceKey, maxDepth
    );

    // Stats
    const words = countWords(scrapedMarkdown);
    statPages.textContent = stats.processed;
    statWords.textContent = words.toLocaleString('es-AR');
    statDepth.textContent = maxDepth;
    statsWrap.style.display = 'grid';

    // Preview (primeros 800 chars)
    resultPreview.textContent = scrapedMarkdown.slice(0, 800) +
      (scrapedMarkdown.length > 800 ? '\n\n[...]' : '');

    // Mostrar botones de output
    btnDownload.style.display = 'flex';
    btnCopy.style.display     = 'flex';

    setStatus('done');
    btnScrape.disabled = false;
  }, 600);
}

// ─── Download .md ──────────────────────────────────────────────────────────

function downloadMarkdown() {
  if (!scrapedMarkdown) return;

  const blob = new Blob([scrapedMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  const safeTitle = currentTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const date = new Date().toISOString().slice(0, 10);
  a.download = `confluence-${safeTitle}-${date}.md`;
  a.href     = url;
  a.click();
  URL.revokeObjectURL(url);

  // Feedback visual
  const original = btnDownload.textContent;
  btnDownload.textContent = '✓ Descargado';
  btnDownload.classList.add('btn-success');
  setTimeout(() => {
    btnDownload.textContent = original;
    btnDownload.classList.remove('btn-success');
  }, 2000);
}

// ─── Copy to Clipboard ─────────────────────────────────────────────────────

async function copyToClipboard() {
  if (!scrapedMarkdown) return;

  try {
    await navigator.clipboard.writeText(scrapedMarkdown);

    const original = btnCopy.textContent;
    btnCopy.textContent = '✓ Copiado!';
    btnCopy.classList.add('btn-success');
    setTimeout(() => {
      btnCopy.textContent = original;
      btnCopy.classList.remove('btn-success');
    }, 2000);
  } catch {
    showError('No se pudo copiar al portapapeles.');
  }
}

// ─── Event Listeners ───────────────────────────────────────────────────────

depthSlider.addEventListener('input', () => {
  depthValue.textContent = depthSlider.value;
});

btnScrape.addEventListener('click', startScrape);
btnDownload.addEventListener('click', downloadMarkdown);
btnCopy.addEventListener('click', copyToClipboard);

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  detectActivePage();
});
