# VML AEM Bulk Publisher

![Version](https://img.shields.io/badge/version-1.0-brightgreen.svg)
![Type](https://img.shields.io/badge/type-Chrome%20Extension-blue)
A premium Chrome Extension designed for the VML Automation Squad to accelerate content publishing workflows in **Adobe Experience Manager (AEM) as a Cloud Service**.

## ✨ Features

- **Bulk Injection:** Paste a raw list of paths or full URLs and instantly inject them into the AEM `Manage Publication` wizard.
- **Smart Parsing & Suffixes:** Automatically extracts clean `/content/...` paths. Supports appending components to multiple URLs simultaneously by appending `>> Component` inline or at the end of the list.
- **Live Metadata Integration:** Fetches real-time publication, modification, and preview dates directly from AEM's JCR API (`.1.json`) and renders them using native `<foundation-time>` formatting.
- **Duplicate Prevention:** Skips paths that are already present in the publication list.
- **Multi-Frame Architecture:** Intelligently handles AEM's complex multi-iframe `Manage Publication` wizards without race conditions.
- **Shadow DOM Support:** Seamlessly interacts with AEM's Coral UI components to ensure native-like behavior.
- **Premium UI:** Features a custom dark mode interface aligned with VML internal tooling aesthetics with interactive success animations.
- **Secure by Design:** Completely local execution. No tracking. Uses strict `document.createElement()` DOM construction to entirely prevent DOM-based XSS vulnerabilities.

## 🚀 How to Use

1. **Install the Extension:** Load the extension into Google Chrome via `chrome://extensions` -> `Load unpacked`.
2. **Navigate to AEM:** Log in to your AEM as a Cloud Service author instance.
3. **Open Manage Publication:** Select your initial assets/pages and click `Manage Publication`.
4. **Go to Scope (Step 2):** Proceed to the `Scope` step in the wizard.
5. **Inject Paths:** 
   - Click the **AEM Bulk Publisher** extension icon.
   - Paste your list of paths (e.g., from a Jira ticket or Excel sheet) into the textarea.
   - Click **INJECT PATHS**.
6. **Publish:** Review the newly added paths in the wizard and continue to the final step to Publish.

## 🛠️ Development & Packaging

To package the extension for distribution, a PowerShell script is included. This script automatically zips the required files while ignoring development and system files.

Run from PowerShell:
```powershell
.\pack.ps1
```
This will generate `vml-aem-bulk-publisher-v1.0.zip` on your Desktop, ready to be shared or uploaded to the Chrome Web Store.

## 🛡️ Security & Architecture

This project strictly follows AppSec guidelines defined in `.antigravityrules`. 
- `innerHTML` and `insertAdjacentHTML` are **strictly prohibited** for rendering user input.
- All injected rows are built programmatically using `document.createElement()` and `textContent` to ensure absolute XSS prevention.
- The extension runs entirely in the context of the active tab (`activeTab` permission) without persistent background scripts or cross-origin requests.

---
**Developed by:** VML Argentina - Automation Squad