# VML AEM Bulk Publisher

![Version](https://img.shields.io/badge/version-1.0-brightgreen.svg)
![Type](https://img.shields.io/badge/type-Extensi%C3%B3n%20de%20Chrome-blue)
Una Extensión de Chrome premium diseñada para el VML Automation Squad, creada para acelerar los flujos de publicación de contenido en **Adobe Experience Manager (AEM) as a Cloud Service**.

## ✨ Características (Features)

- **Inyección Masiva:** Pega una lista cruda de rutas (paths) o URLs completas e inyéctalas instantáneamente en el wizard de `Manage Publication` de AEM. Usa `Ctrl + Enter` (o `Cmd + Enter`) para inyectar rápidamente.
- **Parseo Inteligente y Sufijos:** Extrae automáticamente las rutas limpias (`/content/...`). Permite agregar componentes a múltiples URLs simultáneamente añadiendo `>> Componente` en la misma línea o al final de la lista.
- **Persistencia de Sesión:** El texto ingresado se guarda automáticamente en `chrome.storage.local`, asegurando que no se pierdan datos si el popup se cierra antes de inyectar.
- **Configuración de URL Destino:** Cuenta con un panel de configuración minimalista (⚙️) para personalizar la URL base de AEM a la que apunta el botón "OPEN AEM", evitando entornos fijos (hardcodeados).
- **Validación en Tiempo Real y Metadata:** Obtiene datos en tiempo real desde la API Sling de AEM (`.1.json`). No solo renderiza las fechas de publicación y modificación de forma nativa, sino que también **valida activamente si la ruta existe**, omitiendo e ignorando automáticamente las rutas 404/inexistentes para prevenir inyecciones inválidas.
- **Prevención de Duplicados:** Elimina automáticamente las rutas duplicadas del input y omite las rutas que ya están presentes en la lista de publicación de AEM.
- **Arquitectura Multi-Frame:** Maneja de forma inteligente los complejos wizards de múltiples iframes de AEM sin problemas de sincronización (race conditions).
- **UI Premium:** Presenta una interfaz personalizada en modo oscuro alineada con la estética de las herramientas internas de VML, alertas detalladas mediante banners y una **barra de progreso animada** conectada al ciclo de inyección.
- **Seguridad por Diseño (Secure by Design):** Ejecución completamente local. Sin rastreo (tracking). Utiliza construcción de DOM estricta mediante `document.createElement()` para prevenir por completo vulnerabilidades de tipo DOM-based XSS.

## 🚀 Cómo usar

1. **Instalar la extensión:** Carga la extensión en Google Chrome desde `chrome://extensions` -> `Cargar descomprimida` (Load unpacked).
2. **Navegar a AEM:** Inicia sesión en tu instancia de autor de AEM as a Cloud Service.
3. **Abrir Manage Publication:** Selecciona tus assets/páginas iniciales y haz clic en `Manage Publication`.
4. **Ir a Scope (Paso 2):** Avanza hasta el paso `Scope` en el wizard.
5. **Inyectar Rutas:** 
   - Haz clic en el ícono de la extensión **AEM Bulk Publisher**.
   - Pega tu lista de rutas (ej. desde un ticket de Jira o Excel) en el cuadro de texto.
   - Haz clic en **INJECT PATHS**.
6. **Publicar:** Revisa las rutas recién añadidas en el wizard y continúa al paso final para Publicar.

## 🛠️ Desarrollo y Empaquetado

Para empaquetar la extensión para su distribución, se incluye un script de PowerShell. Este script comprime (zipea) automáticamente los archivos necesarios ignorando archivos de desarrollo y de sistema.

Ejecutar desde PowerShell:
```powershell
.\pack.ps1
```
Esto generará el archivo `vml-aem-bulk-publisher-v1.0.zip` en tu Escritorio, listo para ser compartido o subido a la Chrome Web Store.

## 🛡️ Seguridad y Arquitectura

Este proyecto sigue estrictamente las directrices de AppSec (Seguridad de Aplicaciones) definidas en `.antigravityrules`. 
- El uso de `innerHTML` e `insertAdjacentHTML` está **estrictamente prohibido** para renderizar inputs del usuario.
- Todas las filas inyectadas se construyen de forma programática utilizando `document.createElement()` y `textContent` para asegurar una prevención absoluta contra ataques XSS.
- La extensión se ejecuta enteramente en el contexto de la pestaña activa (permiso `activeTab`) sin scripts de fondo persistentes ni peticiones cruzadas (cross-origin).

---
**Desarrollado por:** VML Argentina - Automation Squad