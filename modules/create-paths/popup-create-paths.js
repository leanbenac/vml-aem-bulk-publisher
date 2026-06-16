document.addEventListener('DOMContentLoaded', () => {
  const btnInject = document.getElementById('btn-inject');
  const pathsInput = document.getElementById('paths-input');
  const pathsCounter = document.getElementById('paths-counter');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const errorBanner = document.getElementById('error-banner');
  const errorMsg = document.getElementById('error-msg');
  const warningBanner = document.getElementById('warning-banner');
  const warningMsg = document.getElementById('warning-msg');
  const btnOpenAem = document.getElementById('btn-open-aem');
  const btnSettings = document.getElementById('btn-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const aemUrlInput = document.getElementById('aem-url-input');
  const progressFill = document.getElementById('progress-fill');

  let defaultAemUrl = 'https://author-p154363-e1620826.adobeaemcloud.com/ui#/aem/assets.html/content/dam/own/ford';

  // Restore saved paths and settings
  chrome.storage.local.get(['savedPaths', 'aemBaseUrl'], (result) => {
    if (result.savedPaths) {
      pathsInput.value = result.savedPaths;
      const { paths, invalidCount, duplicateCount } = getValidPaths(result.savedPaths);
      pathsCounter.textContent = paths.length;
      btnInject.disabled = paths.length === 0;
      
      if (result.savedPaths.trim().length > 0 && (invalidCount > 0 || duplicateCount > 0)) {
        const msgs = [];
        if (invalidCount > 0) msgs.push(`${invalidCount} invalid lines ignored`);
        if (duplicateCount > 0) msgs.push(`${duplicateCount} duplicates removed`);
        warningMsg.textContent = msgs.join(' | ');
        warningBanner.style.display = 'flex';
      }
    }
    if (result.aemBaseUrl) {
      defaultAemUrl = result.aemBaseUrl;
    }
    aemUrlInput.value = defaultAemUrl;
  });

  btnSettings.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
  });

  btnSaveSettings.addEventListener('click', () => {
    const newUrl = aemUrlInput.value.trim();
    if (newUrl) {
      try {
        // Validate URL format
        new URL(newUrl);
        if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
          throw new Error('Must be http/https');
        }

        defaultAemUrl = newUrl;
        chrome.storage.local.set({ aemBaseUrl: newUrl });
        btnSaveSettings.textContent = 'SAVED!';
        btnSaveSettings.classList.add('btn-success');
        setTimeout(() => {
          btnSaveSettings.textContent = 'SAVE';
          btnSaveSettings.classList.remove('btn-success');
          settingsPanel.classList.remove('open');
        }, 1000);
      } catch (e) {
        btnSaveSettings.textContent = 'INVALID URL';
        btnSaveSettings.style.background = 'rgba(239, 68, 68, 0.15)';
        btnSaveSettings.style.borderColor = 'var(--error)';
        btnSaveSettings.style.color = 'var(--error)';
        setTimeout(() => {
          btnSaveSettings.textContent = 'SAVE';
          btnSaveSettings.style.background = '';
          btnSaveSettings.style.borderColor = '';
          btnSaveSettings.style.color = '';
        }, 1500);
      }
    }
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'INJECT_PROGRESS') {
      const percentage = (request.current / request.total) * 100;
      progressFill.style.width = `${percentage}%`;
    }
  });

  // Verify we are on an AEM Manage Publication page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0]?.url || '';
    if (currentUrl.includes('managepublicationwizard.html') || currentUrl.includes('.adobeaemcloud.com')) {
      statusDot.style.background = 'var(--success)';
      statusDot.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.4)';
      statusText.textContent = 'AEM Detected';
      btnOpenAem.style.display = 'none';
    } else {
      statusDot.style.background = 'var(--warning)';
      statusText.textContent = 'Not on AEM';
      btnOpenAem.style.display = 'flex';
    }
  });

  btnOpenAem.addEventListener('click', () => {
    chrome.tabs.create({ url: defaultAemUrl });
  });

  pathsInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (!btnInject.disabled) {
        btnInject.click();
      }
    }
  });

  pathsInput.addEventListener('input', () => {
    const text = pathsInput.value;
    
    // Save paths to storage so they are not lost if popup closes
    chrome.storage.local.set({ savedPaths: text });
    
    const { paths, invalidCount, duplicateCount } = getValidPaths(text);
    pathsCounter.textContent = paths.length;
    btnInject.disabled = paths.length === 0;
    
    errorBanner.style.display = 'none';
    warningBanner.style.display = 'none';

    if (text.trim().length > 0 && (invalidCount > 0 || duplicateCount > 0)) {
      const msgs = [];
      if (invalidCount > 0) msgs.push(`${invalidCount} invalid lines ignored`);
      if (duplicateCount > 0) msgs.push(`${duplicateCount} duplicates removed`);
      warningMsg.textContent = msgs.join(' | ');
      warningBanner.style.display = 'flex';
    }
  });

  btnInject.addEventListener('click', async () => {
    const text = pathsInput.value;
    const { paths } = getValidPaths(text);
    if (paths.length === 0) return;

    // Hide any previous messages
    errorBanner.style.display = 'none';
    warningBanner.style.display = 'none';

    btnInject.disabled = true;
    btnInject.innerHTML = '<span class="spinner"></span> INJECTING...';
    
    progressFill.style.transition = 'none';
    progressFill.style.width = '0%';
    progressFill.style.opacity = '1';
    // Allow browser to apply the 0% before re-enabling transition
    setTimeout(() => { progressFill.style.transition = 'width 0.2s ease, opacity 0.3s ease'; }, 10);

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showError('Could not find the active tab.');
      resetButton();
      return;
    }

    try {
      // Enviar mensaje al content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'INJECT_PATHS',
        paths: paths
      });

      if (response && response.success) {
        btnInject.classList.add('btn-success');
        btnInject.innerHTML = `<span class="btn-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></span> ${response.injectedCount} PATHS INJECTED!`;
        
        // Handle skipped paths warning
        if (response.skippedCount > 0 || response.notFoundCount > 0) {
          const warnMsgs = [];
          if (response.skippedCount > 0) warnMsgs.push(`${response.skippedCount} skipped (already in table)`);
          if (response.notFoundCount > 0) warnMsgs.push(`${response.notFoundCount} skipped (not found in AEM)`);
          
          warningMsg.textContent = `${response.injectedCount} injected. ` + warnMsgs.join(' | ');
          warningBanner.style.display = 'flex';
        }

        // Clear textarea and hide previous errors
        errorBanner.style.display = 'none';
        pathsInput.value = '';
        pathsCounter.textContent = '0';
        chrome.storage.local.remove('savedPaths');

        setTimeout(() => {
          btnInject.classList.remove('btn-success');
          resetButton();
        }, 5000);
      } else {
        showError(response ? response.error : 'Injection script failed.');
        resetButton();
      }
    } catch (err) {
      console.error(err);
      if (err.message && err.message.includes('port closed')) {
         showError('Manage Publication table not found. Ensure you are on the correct screen.');
      } else {
         showError('Please ensure you are on the AEM Manage Publication page and reload.');
      }
      resetButton();
    } finally {
      progressFill.style.opacity = '0';
      setTimeout(() => { progressFill.style.width = '0%'; }, 300);
    }
  });

  function getValidPaths(text) {
    const lines = text.split('\n').map(line => line.trim());
    const validPaths = [];
    let pendingPaths = [];
    let invalidCount = 0;
    
    for (const line of lines) {
      if (!line) continue;
      
      if (line.includes('/content/')) {
        const index = line.indexOf('/content/');
        let pathPart = line.substring(index).trim();
        
        if (pathPart.includes('>')) {
          const parts = pathPart.split(/>+/);
          const cleanPath = parts[0].trim();
          if (parts.length > 1 && parts[1].trim() !== '') {
             const suffix = '/' + parts[1].trim().toLowerCase().replace(/\s+/g, '-');
             validPaths.push(cleanPath.endsWith(suffix) ? cleanPath : cleanPath + suffix);
          } else {
             validPaths.push(cleanPath);
          }
        } else {
          pendingPaths.push(pathPart);
        }
      } else if (line.startsWith('>')) {
        const suffix = '/' + line.replace(/>+/g, '').trim().toLowerCase().replace(/\s+/g, '-');
        pendingPaths.forEach(p => {
          validPaths.push(p.endsWith(suffix) ? p : p + suffix);
        });
        pendingPaths = [];
      } else {
        invalidCount++;
      }
    }
    
    pendingPaths.forEach(p => validPaths.push(p));

    const finalPaths = validPaths.filter(path => path.length > 10);
    const uniquePaths = [...new Set(finalPaths)];
    const duplicateCount = finalPaths.length - uniquePaths.length;

    return { paths: uniquePaths, invalidCount, duplicateCount };
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function resetButton() {
    btnInject.disabled = pathsInput.value.trim().length === 0;
    btnInject.innerHTML = '<span class="btn-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span> INJECT PATHS';
  }
});
