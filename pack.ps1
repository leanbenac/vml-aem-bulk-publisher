$manifest = Get-Content -Raw -Path manifest.json | ConvertFrom-Json
$version = $manifest.version
$zipName = "vml-aem-bulk-publisher-v$version.zip"

Write-Host "Creando empaquetado para la versión $version..."

if (Test-Path $zipName) {
    Remove-Item $zipName
}

# Archivos y carpetas a incluir
$items = "assets", "core", "modules", "manifest.json", "Readme.md"

Compress-Archive -Path $items -DestinationPath $zipName

Write-Host "¡Completado! Se generó el archivo: $zipName" -ForegroundColor Green
