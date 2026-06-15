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
    chrome.tabs.create({ url: 'https://author-p154363-e1620826.adobeaemcloud.com/ui#/aem/assets.html/content/dam/own/ford' });
  });

  pathsInput.addEventListener('input', () => {
    const text = pathsInput.value;
    const paths = getValidPaths(text);
    pathsCounter.textContent = paths.length;
    btnInject.disabled = paths.length === 0;
    
    // Hide messages when user starts typing again
    errorBanner.style.display = 'none';
    warningBanner.style.display = 'none';
  });

  btnInject.addEventListener('click', async () => {
    const text = pathsInput.value;
    const paths = getValidPaths(text);
    if (paths.length === 0) return;

    // Hide any previous messages
    errorBanner.style.display = 'none';
    warningBanner.style.display = 'none';

    btnInject.disabled = true;
    btnInject.innerHTML = '<span class="spinner"></span> INJECTING...';

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
        if (response.skippedCount > 0) {
          warningMsg.textContent = `${response.injectedCount} paths injected. ${response.skippedCount} skipped (already in table).`;
          warningBanner.style.display = 'flex';
        }

        // Clear textarea and hide previous errors
        errorBanner.style.display = 'none';
        pathsInput.value = '';
        pathsCounter.textContent = '0';

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
      showError('Please ensure you are on the AEM Manage Publication page and reload.');
      resetButton();
    }
  });

  function getValidPaths(text) {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.includes('/content/'))
      .map(line => {
        const index = line.indexOf('/content/');
        // Extract from /content/ onwards, and clean any trailing spaces or hidden characters
        return line.substring(index).trim();
      })
      .filter(path => path.length > 10);
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
