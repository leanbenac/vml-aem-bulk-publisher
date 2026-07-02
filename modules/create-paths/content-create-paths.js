/**
 * Content Script para inyectar paths en el wizard de Manage Publication de AEM
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'INJECT_PATHS') {
        injectPathsIntoAemTable(request.paths)
            .then(result => {
                const progressUi = document.getElementById('vml-aem-progress-ui');
                if (progressUi) {
                    const title = progressUi.querySelector('div');
                    if (title) title.innerHTML = 'VML Bulk Publisher <span style="font-weight:normal; color:#22c55e;">| Done!</span>';
                    setTimeout(() => { progressUi.style.display = 'none'; }, 3000);
                }
                sendResponse({ 
                    success: true, 
                    injectedCount: result.injectedCount, 
                    skippedCount: result.skippedCount,
                    notFoundCount: result.notFoundCount
                });
            })
            .catch(err => {
                if (err.message === 'IGNORED') {
                    // Do not call sendResponse! Let another valid iframe respond.
                    return;
                }
                const progressUi = document.getElementById('vml-aem-progress-ui');
                if (progressUi) progressUi.style.display = 'none';
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

    // --- Create Floating Progress UI ---
    let progressUi = document.getElementById('vml-aem-progress-ui');
    if (!progressUi) {
        progressUi = document.createElement('div');
        progressUi.id = 'vml-aem-progress-ui';
        progressUi.style.position = 'fixed';
        progressUi.style.bottom = '24px';
        progressUi.style.right = '24px';
        progressUi.style.backgroundColor = '#1e293b';
        progressUi.style.color = '#fff';
        progressUi.style.padding = '16px 20px';
        progressUi.style.borderRadius = '8px';
        progressUi.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
        progressUi.style.zIndex = '999999';
        progressUi.style.fontFamily = 'Inter, sans-serif';
        progressUi.style.display = 'flex';
        progressUi.style.flexDirection = 'column';
        progressUi.style.gap = '10px';
        progressUi.style.minWidth = '260px';

        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.innerHTML = 'VML Bulk Publisher <span style="font-weight:normal; opacity:0.8;">| Injecting...</span>';
        progressUi.appendChild(title);

        const progressContainer = document.createElement('div');
        progressContainer.style.width = '100%';
        progressContainer.style.backgroundColor = 'rgba(255,255,255,0.2)';
        progressContainer.style.height = '6px';
        progressContainer.style.borderRadius = '3px';
        progressContainer.style.overflow = 'hidden';

        const progressBar = document.createElement('div');
        progressBar.id = 'vml-aem-progress-bar';
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = '#22c55e';
        progressBar.style.height = '100%';
        progressBar.style.transition = 'width 0.2s ease';
        progressContainer.appendChild(progressBar);
        progressUi.appendChild(progressContainer);

        const statusText = document.createElement('div');
        statusText.id = 'vml-aem-progress-text';
        statusText.style.fontSize = '12px';
        statusText.style.opacity = '0.9';
        statusText.textContent = `0 / ${paths.length} paths processed`;
        progressUi.appendChild(statusText);

        document.body.appendChild(progressUi);
    } else {
        progressUi.style.display = 'flex';
        const title = progressUi.querySelector('div');
        if (title) title.innerHTML = 'VML Bulk Publisher <span style="font-weight:normal; opacity:0.8;">| Injecting...</span>';
        const pb = document.getElementById('vml-aem-progress-bar');
        if (pb) pb.style.width = '0%';
        const pt = document.getElementById('vml-aem-progress-text');
        if (pt) pt.textContent = `0 / ${paths.length} paths processed`;
    }
    // -----------------------------------

    let injectedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

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
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        
        // Report progress to popup
        try {
            chrome.runtime.sendMessage({
                action: 'INJECT_PROGRESS',
                current: i + 1,
                total: paths.length
            });
        } catch(e) {
            // Ignore if popup is closed
        }
        
        // Report progress to DOM UI
        const pb = document.getElementById('vml-aem-progress-bar');
        const pt = document.getElementById('vml-aem-progress-text');
        if (pb && pt) {
            pb.style.width = `${((i + 1) / paths.length) * 100}%`;
            pt.textContent = `${i + 1} / ${paths.length} paths processed`;
        }

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
        let pathExists = false;
        try {
            const response = await fetch(`${path}.1.json`);
            if (response.ok) {
                pathExists = true;
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
            } else {
                console.warn(`Path does not exist in AEM: ${path}`);
            }
        } catch (err) {
            console.warn(`Could not fetch metadata for ${path}`, err);
        }

        if (!pathExists) {
            notFoundCount++;
            continue; // Skip this path because it does not exist
        }

        const modifiedText = formatDate(modifiedRaw);
        const publishedText = formatShortDate(publishedRaw);
        const previewedText = formatShortDate(previewedRaw);

        // Limpiar la fila de "There is no item." si la tabla estaba vacía
        const emptyMessageRow = tbody.querySelector('tr.coral-Table-emptyMessage, tr.foundation-collection-empty');
        if (emptyMessageRow) {
            emptyMessageRow.remove();
        }

        // Enviar evento al Main World para que construya la fila con acceso a los prototipos de Coral UI
        const eventData = {
            path: path,
            titleText: titleText,
            modifiedText: modifiedText,
            publishedText: publishedText,
            previewedText: previewedText
        };
        
        document.dispatchEvent(new CustomEvent('VML_AEM_INJECT_ROW', { detail: eventData }));

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

    if (injectedCount === 0 && notFoundCount === 0) {
        throw new Error('All entered paths were already in the table.');
    } else if (injectedCount === 0 && notFoundCount > 0) {
        throw new Error(`All paths were invalid. ${notFoundCount} path(s) not found in AEM.`);
    }

    return { injectedCount, skippedCount, notFoundCount };
}
