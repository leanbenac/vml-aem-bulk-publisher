/**
 * Content Script para inyectar paths en el wizard de Manage Publication de AEM
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'INJECT_PATHS') {
        injectPathsIntoAemTable(request.paths)
            .then(result => sendResponse({ success: true, injectedCount: result.injectedCount, skippedCount: result.skippedCount }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        
        return true; // Keep message channel open for async response
    }
});

async function injectPathsIntoAemTable(paths) {
    // Detectar si el usuario está en el paso Preview/Publish del wizard
    const h1Text = document.querySelector('h1')?.textContent || '';
    const isReviewStep = h1Text.toLowerCase().includes('preview') || h1Text.toLowerCase().includes('publish');

    // Buscar el tbody directamente — funciona aunque el <table> esté dentro de Shadow DOM de Coral UI
    let tbody = 
        document.querySelector('table.cq-common-admin-sourcepages tbody') ||
        document.querySelector('tbody[is="coral-table-body"]') ||
        document.querySelector('.cq-common-admin-sourcepages tbody') ||
        document.querySelector('coral-table-body') ||
        document.querySelector('tbody');

    if (!tbody) {
        if (isReviewStep) {
            throw new Error('You are on the Preview/Publish review step. Click "Back" to return to Scope, then inject your paths.');
        }
        throw new Error('Manage Publication table not found. Ensure you are on the correct screen.');
    }

    // Compatibilidad: si encontramos el tbody, obtenemos también la tabla padre
    const table = tbody.closest('table');

    let injectedCount = 0;

    let skippedCount = 0;

    // Iterar y crear las filas
    for (const path of paths) {
        // Evitar duplicados (si el path ya está en la tabla)
        const existingRow = tbody.querySelector(`tr[data-foundation-collection-item-id="${path}"]`);
        if (existingRow) {
            skippedCount++;
            continue;
        }

        // Obtener el nombre del archivo/página del path
        const rawTitle = path.split('/').pop() || 'Item';

        // Sanitización para prevenir XSS (Cross-Site Scripting)
        const escapeHtml = (unsafe) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        const safePath = escapeHtml(path);
        const title = escapeHtml(rawTitle);

        // Limpiar la fila de "There is no item." si la tabla estaba vacía
        const emptyMessageRow = tbody.querySelector('tr.coral-Table-emptyMessage, tr.foundation-collection-empty');
        if (emptyMessageRow) {
            emptyMessageRow.remove();
        }

        // HTML mínimo requerido por Coral UI y AEM para reconocer el ítem
        const rowHtml = `
            <tr is="coral-table-row" class="foundation-collection-item _coral-Table-row" itemprop="item" data-foundation-collection-item-id="${safePath}" tabindex="0" aria-selected="true">
                <td is="coral-table-cell" class="select _coral-Table-cell _coral-Table-cell--check">
                    <coral-checkbox coral-table-rowselect="" class="_coral-Checkbox" checked>
                        <input type="checkbox" handle="input" class=" _coral-Checkbox-input" aria-label="Select" checked>
                        <span class=" _coral-Checkbox-box" handle="checkbox">
                            <svg focusable="false" aria-hidden="true" class="_coral-Icon--svg _coral-Icon _coral-Checkbox-checkmark _coral-UIIcon-CheckmarkSmall"><use xlink:href="#spectrum-css-icon-CheckmarkSmall"></use></svg>
                        </span>
                    </coral-checkbox>
                </td>
                <td is="coral-table-cell" class="foundation-collection-item-title _coral-Table-cell" alignment="column">
                    <span>${title} <span style="font-size:10px; color:#22c55e; margin-left:4px;">(Injected)</span></span>
                    <div class="foundation-layout-util-subtletext">${safePath}</div>
                </td>
                <td is="coral-table-cell" class="foundation-collection-item-modified _coral-Table-cell" alignment="column">
                    <div class="foundation-layout-util-subtletext">-</div>
                </td>
                <td is="coral-table-cell" class="foundation-collection-item-published _coral-Table-cell" alignment="column">
                    <div class="foundation-layout-util-subtletext">-</div>
                </td>
                <td is="coral-table-cell" class="foundation-collection-item-previewed _coral-Table-cell" alignment="column">
                    <div class="foundation-layout-util-subtletext">-</div>
                </td>
                <td is="coral-table-cell" class="foundation-collection-item-references _coral-Table-cell" alignment="column">
                    -
                </td>
                <td is="coral-table-cell" class="foundation-collection-item-publish-target _coral-Table-cell" alignment="column">
                    <span>AEM</span>
                </td>
            </tr>
            <input type="hidden" name="path" value="${safePath}">
        `;

        tbody.insertAdjacentHTML('beforeend', rowHtml);
        injectedCount++;
    }

    // Actualizar el contador de páginas de AEM si existe (el span de "X page(s)")
    const countSpan = document.querySelector('.cq-common-collectionstatus');
    if (countSpan) {
        // Obtenemos todos los items actuales para ser exactos
        const totalItems = tbody.querySelectorAll('tr[is="coral-table-row"]').length;
        countSpan.textContent = `${totalItems} page(s)`;
    }

    // Actualizar el estado del botón "Publish" nativo si es necesario
    // En AEM si no hay ítems el botón puede estar deshabilitado
    const publishButton = document.querySelector('.cq-sites-managepublication-wizard-step-scope-next'); // Este botón depende de AEM, a veces es automático.
    if (publishButton) {
        publishButton.disabled = false;
    }

    if (injectedCount === 0) {
        throw new Error('All entered paths were already in the table.');
    }

    return { injectedCount, skippedCount };
}
