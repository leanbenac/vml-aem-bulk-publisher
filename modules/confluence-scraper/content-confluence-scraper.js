/**
 * VML Confluence Scraper — Content Script
 * Ejecuta en: https://confluence.uhub.biz/*
 *
 * Responsabilidades:
 * - Detectar el Page ID de la página activa
 * - Recorrer recursivamente todas las subpáginas via Confluence Server REST API
 * - Extraer texto limpio del contenido HTML de cada página
 * - Ensamblar el árbol jerárquico en formato Markdown
 */

'use strict';

// ─── Confluence Server REST API base ───────────────────────────────────────
const API_BASE = `${location.origin}/rest/api/content`;

// ─── Delay entre requests para no saturar el servidor ──────────────────────
const REQUEST_DELAY_MS = 120;

// ─── Resultado en memoria (sin pasar por chrome.storage — sin límite de tamaño) ──
let _scrapeResult = null; // { markdown, stats, completedAt }

// ─── Utilidades ────────────────────────────────────────────────────────────

/**
 * Pausa la ejecución N milisegundos.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detecta el Page ID de la página activa en Confluence.
 * Estrategia 1: meta tag `ajs-page-id` (estándar de Confluence Server)
 * Estrategia 2: data-page-id del elemento marcado como current en RefinedWiki
 * Estrategia 3: URL pattern /pages/{id}
 * @returns {string|null}
 */
function detectCurrentPageId() {
  // Estrategia 1 — meta tag (más confiable en Confluence Server)
  const metaPageId = document.querySelector('meta[name="ajs-page-id"]');
  if (metaPageId && metaPageId.content) return metaPageId.content.trim();

  // Estrategia 2 — RefinedWiki sidebar: elemento con clase rw_current_page_item
  const rwCurrentLink = document.querySelector('.rw_current_page_item');
  if (rwCurrentLink) {
    const li = rwCurrentLink.closest('li[id^="rw_pagetree_item_"]');
    if (li) {
      const iconDiv = li.querySelector('[data-page-id]');
      if (iconDiv) return iconDiv.getAttribute('data-page-id').trim();
    }
  }

  // Estrategia 3 — URL pattern: /pages/{id}
  const pagesMatch = location.pathname.match(/\/pages\/(\d+)/);
  if (pagesMatch) return pagesMatch[1];

  return null;
}

/**
 * Detecta el Space Key de la página activa.
 * Estrategia 1: meta tag `ajs-space-key`
 * Estrategia 2: URL pattern /display/{SPACE_KEY}/
 * @returns {string|null}
 */
function detectSpaceKey() {
  const metaSpaceKey = document.querySelector('meta[name="ajs-space-key"]');
  if (metaSpaceKey && metaSpaceKey.content) return metaSpaceKey.content.trim();

  const displayMatch = location.pathname.match(/\/display\/([^/]+)\//);
  if (displayMatch) return displayMatch[1];

  return null;
}

/**
 * Convierte HTML de Confluence a texto limpio y legible.
 * Maneja párrafos, headings, listas, tablas y links.
 * @param {string} html
 * @returns {string}
 */
function htmlToCleanText(html) {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Eliminar elementos no deseados: scripts, styles, macros Confluence, etc.
  const unwanted = doc.querySelectorAll(
    'script, style, .conf-macro, .confluence-information-macro, ' +
    '.expand-control, .panel-header, [data-macro-name], ' +
    '.toc-macro, .status-macro, nav, .breadcrumb-section'
  );
  unwanted.forEach(el => el.remove());

  // Convertir elementos estructurales a texto legible
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(processNode).join('');
    const text = children.trim();

    if (!text) return '';

    switch (tag) {
      case 'h1': return `\n# ${text}\n`;
      case 'h2': return `\n## ${text}\n`;
      case 'h3': return `\n### ${text}\n`;
      case 'h4': return `\n#### ${text}\n`;
      case 'h5': return `\n##### ${text}\n`;
      case 'h6': return `\n###### ${text}\n`;
      case 'p':  return `\n${text}\n`;
      case 'br': return '\n';
      case 'li': return `\n- ${text}`;
      case 'ul':
      case 'ol': return `\n${text}\n`;
      case 'th': return `| ${text} `;
      case 'td': return `| ${text} `;
      case 'tr': return `${children}|\n`;
      case 'table': return `\n${text}\n`;
      case 'strong':
      case 'b': return `**${text}**`;
      case 'em':
      case 'i': return `*${text}*`;
      case 'code': return `\`${text}\``;
      case 'pre': return `\n\`\`\`\n${text}\n\`\`\`\n`;
      case 'blockquote': return `\n> ${text}\n`;
      case 'a': {
        const href = node.getAttribute('href') || '';
        return href && !href.startsWith('#') ? `[${text}](${href})` : text;
      }
      case 'hr': return '\n---\n';
      case 'div':
      case 'section':
      case 'article':
      case 'main': return `\n${text}\n`;
      default: return text;
    }
  }

  let result = processNode(doc.body);

  // Limpiar líneas vacías excesivas (máx 2 consecutivas)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * Obtiene los datos de una página via REST API.
 * @param {string} pageId
 * @returns {Promise<{id: string, title: string, text: string}|null>}
 */
async function fetchPageContent(pageId) {
  try {
    const url = `${API_BASE}/${pageId}?expand=body.view,title&os_authType=basic`;
    const response = await fetch(url, {
      credentials: 'include', // usa cookies de sesión del browser
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const html = data?.body?.view?.value || '';
    const text = htmlToCleanText(html);

    return {
      id: data.id,
      title: data.title,
      text
    };
  } catch {
    return null;
  }
}

/**
 * Obtiene los IDs de las páginas hijas directas de una página.
 * @param {string} pageId
 * @returns {Promise<Array<{id: string, title: string}>>}
 */
async function fetchChildPages(pageId) {
  const children = [];
  let start = 0;
  const limit = 50;

  try {
    while (true) {
      const url = `${API_BASE}/${pageId}/child/page?limit=${limit}&start=${start}`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) break;

      const data = await response.json();
      const results = data?.results || [];

      results.forEach(page => children.push({ id: page.id, title: page.title }));

      // Si hay más páginas, continuar paginando
      if (results.length < limit) break;
      start += limit;
    }
  } catch {
    // Fail silently
  }

  return children;
}

/**
 * Recorre recursivamente el árbol de páginas a partir de una raíz.
 * Construye el texto Markdown con la jerarquía preservada.
 *
 * @param {string} pageId - ID de la página raíz
 * @param {number} depth - Nivel de profundidad actual (1 = raíz)
 * @param {number} maxDepth - Profundidad máxima permitida
 * @param {object} stats - Objeto de estadísticas {found, processed, errors}
 * @param {function} onProgress - Callback de progreso (stats) => void
 * @returns {Promise<string>} - Texto Markdown del árbol
 */
async function scrapePageTree(pageId, depth, maxDepth, stats, onProgress) {
  if (depth > maxDepth) return '';

  // Obtener contenido de la página actual
  const page = await fetchPageContent(pageId);
  await sleep(REQUEST_DELAY_MS);

  if (!page) {
    stats.errors++;
    return '';
  }

  stats.processed++;
  if (onProgress) onProgress({ ...stats });

  // Encabezado Markdown según profundidad
  const headingLevel = '#'.repeat(Math.min(depth, 6));
  let output = `\n\n${headingLevel} ${page.title}\n`;

  if (page.text) {
    // Indentar el contenido de subpáginas para mayor claridad visual
    output += `\n${page.text}\n`;
  } else {
    output += '\n*(Sin contenido)*\n';
  }

  // Obtener hijos y continuar recursión
  if (depth < maxDepth) {
    const children = await fetchChildPages(pageId);
    stats.found += children.length;

    for (const child of children) {
      const childOutput = await scrapePageTree(
        child.id, depth + 1, maxDepth, stats, onProgress
      );
      output += childOutput;
    }
  }

  return output;
}

// ─── Listener de mensajes desde el Popup ───────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'DETECT_PAGE_INFO') {
    // El popup pregunta qué página está activa
    const pageId = detectCurrentPageId();
    const spaceKey = detectSpaceKey();

    // Obtener título de la página actual
    const titleEl = document.querySelector('meta[name="ajs-page-title"]') ||
                    document.querySelector('h1#title-heading .page-title') ||
                    document.querySelector('#title-text') ||
                    document.querySelector('h1');

    const title = titleEl
      ? (titleEl.content || titleEl.textContent || '').trim()
      : document.title.replace(' - Confluence', '').trim();

    sendResponse({ pageId, spaceKey, title });
    return false; // Síncrono
  }

  if (message.action === 'START_SCRAPE') {
    const { rootPageId, maxDepth } = message;

    // Resetear resultado previo
    _scrapeResult = null;
    const stats = { found: 1, processed: 0, errors: 0 };

    // Notificar inicio
    sendResponse({ status: 'started' });

    // Ejecutar scraping de forma asíncrona
    (async () => {
      try {
        const markdown = await scrapePageTree(
          rootPageId,
          1,
          maxDepth,
          stats,
          (currentStats) => {
            // Solo el progreso (datos pequeños) va a storage
            chrome.storage.local.set({
              scrape_progress: {
                ...currentStats,
                running: true,
                timestamp: Date.now()
              }
            });
          }
        );

        // ✅ Resultado en memoria — sin límite de tamaño, sin pasar por storage
        _scrapeResult = {
          markdown: markdown.trim(),
          stats,
          completedAt: new Date().toISOString()
        };

        // Solo señal de completado en storage (sin el markdown)
        chrome.storage.local.set({
          scrape_progress: {
            ...stats,
            running: false,
            done: true,
            timestamp: Date.now()
          }
        });

      } catch (err) {
        chrome.storage.local.set({
          scrape_progress: {
            running: false,
            error: err.message || 'Error desconocido',
            timestamp: Date.now()
          }
        });
      }
    })();

    return false;
  }

  if (message.action === 'GET_RESULT') {
    // El popup pide el resultado — se entrega directo desde memoria
    // sendResponse puede manejar payloads grandes sin límite de storage
    if (_scrapeResult) {
      sendResponse({ ok: true, result: _scrapeResult });
    } else {
      sendResponse({ ok: false });
    }
    return false;
  }
});
