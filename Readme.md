# VML AEM Bulk Publisher

![Version](https://img.shields.io/badge/version-1.0-brightgreen.svg)
![Type](https://img.shields.io/badge/type-Chrome%20Extension-blue)

A premium Chrome Extension designed for the VML Engineering Team to accelerate content publishing workflows in **Adobe Experience Manager (AEM) as a Cloud Service**.

## ✨ Features

- **Bulk Injection:** Paste a raw list of paths or full URLs and instantly inject them into the AEM `Manage Publication` wizard.
- **Smart Parsing:** Automatically extracts clean `/content/...` paths from raw text, stripping out hostnames, parameters, or Jira text.
- **Duplicate Prevention:** Skips paths that are already present in the publication list.
- **Shadow DOM Support:** Seamlessly interacts with AEM's Coral UI components to ensure native-like behavior.
- **Premium UI:** Features a custom dark mode interface aligned with VML internal tooling aesthetics.
- **Secure:** Completely local execution. No external APIs, no tracking, and strict HTML sanitization (XSS prevention) on all user inputs.

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
- `innerHTML` is never used for user input.
- All injected paths are escaped to prevent DOM-based XSS.
- The extension runs entirely in the context of the active tab (`activeTab` permission) without persistent background scripts or cross-origin requests.

---
**Developed by:** VML Argentina - Engineering Team