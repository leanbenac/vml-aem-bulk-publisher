/**
 * Content Script para inyectar paths en el wizard de Manage Publication de AEM
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'INJECT_PATHS') {
        injectPathsIntoAemTable(request.paths)
            .then(result => {
                sendResponse({ success: true, injectedCount: result.injectedCount, skippedCount: result.skippedCount });
            })
            .catch(err => {
                if (err.message === 'IGNORED') {
                    // Do not call sendResponse! Let another valid iframe respond.
                    return;
                }
                sendResponse({ success: false, error: err.message });
            });
        
        return true; // Keep message channel open for async response
    }
});

async function injectPathsIntoAemTable(paths) {
    // Detectar si el usuario está en el paso Preview/Publish del wizard
    const titleElement = document.querySelector('h1, coral-panel-title, .cq-sites-managepublication-wizard-step-title, coral-step[selected] coral-step-label');
    const h1Text = titleElement ? titleElement.textContent : (document.title || '');
    const isReviewStep = h1Text.toLowerCase().includes('preview') || h1Text.toLowerCase().includes('publish');

    // Buscar el tbody directamente — funciona aunque el <table> esté dentro de Shadow DOM de Coral UI o sin clases estandar.
    let tbody = 
        document.querySelector('table.cq-common-admin-sourcepages tbody') ||
        document.querySelector('tbody[is="coral-table-body"]') ||
        document.querySelector('.cq-common-admin-sourcepages tbody') ||
        document.querySelector('coral-table-body') ||
        document.querySelector('.foundation-collection-body') ||
        document.querySelector('table.coral-Table tbody') ||
        document.querySelector('coral-table tbody') ||
        document.querySelector('tbody');

    if (!tbody) {
        // En escenarios con multiples iframes (all_frames: true), los iframes ocultos no tendrán la tabla.
        // Hacemos una pausa de 500ms antes de lanzar el error.
        await new Promise(resolve => setTimeout(resolve, 500));
        
        tbody = 
            document.querySelector('table.cq-common-admin-sourcepages tbody') ||
            document.querySelector('tbody[is="coral-table-body"]') ||
            document.querySelector('.cq-common-admin-sourcepages tbody') ||
            document.querySelector('coral-table-body') ||
            document.querySelector('.foundation-collection-body') ||
            document.querySelector('table.coral-Table tbody') ||
            document.querySelector('coral-table tbody') ||
            document.querySelector('tbody');

        if (!tbody) {
            // Throw an IGNORED error so this specific frame doesn't hijack the sendResponse callback.
            throw new Error('IGNORED');
        }
    }

    let table = tbody.closest('table') || tbody.closest('coral-table');
    if (!table) {
        throw new Error('Parent table not found for the selected body.');
    }

    let injectedCount = 0;

    let skippedCount = 0;

    // Format date utility (Full ISO)
    const formatDate = (timestamp) => {
        if (!timestamp) return '-';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '-';
            return date.toISOString();
        } catch (e) {
            return '-';
        }
    };

    // Format date utility (Short string like "May 29, 2026")
    const formatShortDate = (timestamp) => {
        if (!timestamp) return '-';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return '-';
        }
    };

    // Iterar y crear las filas
    for (const path of paths) {
        // Evitar duplicados (si el path ya está en la tabla)
        const existingRow = tbody.querySelector(`tr[data-foundation-collection-item-id="${path}"]`);
        if (existingRow) {
            skippedCount++;
            continue;
        }

        // Obtener el nombre del archivo/página por defecto
        let titleText = path.split('/').pop() || 'Item';
        
        let modifiedRaw = null;
        let publishedRaw = null;
        let previewedRaw = null;

        // Fetch AEM metadata safely (Sling GET API)
        try {
            const response = await fetch(`${path}.1.json`);
            if (response.ok) {
                const data = await response.json();
                
                // Extraer título real si existe
                if (data['jcr:content'] && data['jcr:content']['jcr:title']) {
                    titleText = data['jcr:content']['jcr:title'];
                } else if (data['jcr:title']) {
                    titleText = data['jcr:title'];
                }

                // Extraer modified
                if (data['jcr:content'] && data['jcr:content']['cq:lastModified']) {
                    modifiedRaw = data['jcr:content']['cq:lastModified'];
                } else if (data['jcr:lastModified']) {
                    modifiedRaw = data['jcr:lastModified'];
                }

                // Extraer published
                if (data['jcr:content'] && data['jcr:content']['cq:lastReplicated']) {
                    publishedRaw = data['jcr:content']['cq:lastReplicated'];
                }

                // Extraer previewed
                // Try specific AEM properties for preview across different versions/setups
                const previewKeys = [
                    'cq:lastPreviewed',
                    'cq:lastReplicated_preview',
                    'cq:lastRolledout',
                    'previewDate'
                ];
                
                for (const key of previewKeys) {
                    if (data['jcr:content'] && data['jcr:content'][key]) {
                        previewedRaw = data['jcr:content'][key];
                        break;
                    } else if (data[key]) {
                        previewedRaw = data[key];
                        break;
                    }
                }
            }
        } catch (err) {
            console.warn(`Could not fetch metadata for ${path}`, err);
        }

        const modifiedText = formatDate(modifiedRaw);
        const publishedText = formatShortDate(publishedRaw);
        const previewedText = formatShortDate(previewedRaw);

        // Limpiar la fila de "There is no item." si la tabla estaba vacía
        const emptyMessageRow = tbody.querySelector('tr.coral-Table-emptyMessage, tr.foundation-collection-empty');
        if (emptyMessageRow) {
            emptyMessageRow.remove();
        }

        // ==========================================
        // XSS SAFE DOM INJECTION (.antigravityrules)
        // ==========================================
        const tr = document.createElement('tr');
        tr.setAttribute('is', 'coral-table-row');
        tr.className = 'foundation-collection-item _coral-Table-row';
        tr.setAttribute('itemprop', 'item');
        tr.setAttribute('data-foundation-collection-item-id', path);
        tr.setAttribute('tabindex', '0');
        tr.setAttribute('aria-selected', 'true');

        // Checkbox Cell
        const tdCheck = document.createElement('td');
        tdCheck.setAttribute('is', 'coral-table-cell');
        tdCheck.className = 'select _coral-Table-cell _coral-Table-cell--check';
        
        const coralCheck = document.createElement('coral-checkbox');
        coralCheck.setAttribute('coral-table-rowselect', '');
        coralCheck.className = '_coral-Checkbox';
        coralCheck.setAttribute('checked', '');

        const inputCheck = document.createElement('input');
        inputCheck.type = 'checkbox';
        inputCheck.setAttribute('handle', 'input');
        inputCheck.className = '_coral-Checkbox-input';
        inputCheck.setAttribute('aria-label', 'Select');
        inputCheck.checked = true;

        const spanBox = document.createElement('span');
        spanBox.className = '_coral-Checkbox-box';
        spanBox.setAttribute('handle', 'checkbox');
        spanBox.innerHTML = '<svg focusable="false" aria-hidden="true" class="_coral-Icon--svg _coral-Icon _coral-Checkbox-checkmark _coral-UIIcon-CheckmarkSmall"><use xlink:href="#spectrum-css-icon-CheckmarkSmall"></use></svg>';
        
        coralCheck.appendChild(inputCheck);
        coralCheck.appendChild(spanBox);
        tdCheck.appendChild(coralCheck);

        // Title Cell
        const tdTitle = document.createElement('td');
        tdTitle.setAttribute('is', 'coral-table-cell');
        tdTitle.className = 'foundation-collection-item-title _coral-Table-cell';
        tdTitle.setAttribute('alignment', 'column');

        const spanTitleContainer = document.createElement('span');
        spanTitleContainer.textContent = titleText + ' ';
        
        const spanInjected = document.createElement('span');
        spanInjected.style.fontSize = '10px';
        spanInjected.style.color = '#22c55e';
        spanInjected.style.marginLeft = '4px';
        spanInjected.textContent = '(Injected)';
        spanTitleContainer.appendChild(spanInjected);

        const divPath = document.createElement('div');
        divPath.className = 'foundation-layout-util-subtletext';
        divPath.textContent = path;

        tdTitle.appendChild(spanTitleContainer);
        tdTitle.appendChild(divPath);

        // Modified Cell
        const tdModified = document.createElement('td');
        tdModified.setAttribute('is', 'coral-table-cell');
        tdModified.className = 'foundation-collection-item-modified _coral-Table-cell';
        tdModified.setAttribute('alignment', 'column');
        const divModified = document.createElement('div');
        divModified.className = 'foundation-layout-util-subtletext';
        divModified.textContent = modifiedText;
        tdModified.appendChild(divModified);

        // Published Cell
        const tdPublished = document.createElement('td');
        tdPublished.setAttribute('is', 'coral-table-cell');
        tdPublished.className = 'foundation-collection-item-published _coral-Table-cell';
        tdPublished.setAttribute('alignment', 'column');
        const divPublished = document.createElement('div');
        divPublished.className = 'foundation-layout-util-subtletext';
        divPublished.textContent = publishedText;
        tdPublished.appendChild(divPublished);

        // Previewed Cell
        const tdPreviewed = document.createElement('td');
        tdPreviewed.setAttribute('is', 'coral-table-cell');
        tdPreviewed.className = 'foundation-collection-item-previewed _coral-Table-cell';
        tdPreviewed.setAttribute('alignment', 'column');
        const divPreviewed = document.createElement('div');
        divPreviewed.className = 'foundation-layout-util-subtletext';
        divPreviewed.textContent = previewedText;
        tdPreviewed.appendChild(divPreviewed);

        // References Cell
        const tdReferences = document.createElement('td');
        tdReferences.setAttribute('is', 'coral-table-cell');
        tdReferences.className = 'foundation-collection-item-references _coral-Table-cell';
        tdReferences.setAttribute('alignment', 'column');
        tdReferences.textContent = 'all';

        // Target Cell
        const tdTarget = document.createElement('td');
        tdTarget.setAttribute('is', 'coral-table-cell');
        tdTarget.className = 'foundation-collection-item-publish-target _coral-Table-cell';
        tdTarget.setAttribute('alignment', 'column');
        const spanTarget = document.createElement('span');
        spanTarget.textContent = 'AEM';
        tdTarget.appendChild(spanTarget);

        // Hidden input required by AEM form submission
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'path';
        hiddenInput.value = path;

        // Assemble Row
        tr.appendChild(tdCheck);
        tr.appendChild(tdTitle);
        tr.appendChild(tdModified);
        tr.appendChild(tdPublished);
        tr.appendChild(tdPreviewed);
        tr.appendChild(tdReferences);
        tr.appendChild(tdTarget);

        // Insert into table
        tbody.appendChild(tr);
        tbody.appendChild(hiddenInput);

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
