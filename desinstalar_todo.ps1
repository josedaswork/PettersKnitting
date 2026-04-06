# ============================================================
# Script de limpieza completa - Peter's Knitting
# Elimina dependencias locales y cache de npm
# Ejecutar en PowerShell
# ============================================================

Write-Host ""
Write-Host "=== SCRIPT DE LIMPIEZA - Peter's Knitting ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Este script eliminara:" -ForegroundColor Cyan
Write-Host "  1. Carpeta node_modules del proyecto"
Write-Host "  2. Cache global de npm"
Write-Host "  3. Node.js del sistema (requiere permisos de admin)"
Write-Host ""

$confirmacion = Read-Host "Deseas continuar? (S/N)"
if ($confirmacion -notin @("S", "s", "Si", "si", "SI")) {
    Write-Host "Operacion cancelada." -ForegroundColor Red
    exit
}

# --- 1. Eliminar node_modules del proyecto ---
Write-Host ""
Write-Host "[1/3] Eliminando node_modules..." -ForegroundColor Cyan
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeModulesPath = Join-Path $projectDir "node_modules"
$packageLockPath = Join-Path $projectDir "package-lock.json"

if (Test-Path $nodeModulesPath) {
    Remove-Item -Path $nodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  node_modules eliminado." -ForegroundColor Green
} else {
    Write-Host "  node_modules no encontrado, saltando." -ForegroundColor DarkGray
}

if (Test-Path $packageLockPath) {
    Remove-Item -Path $packageLockPath -Force -ErrorAction SilentlyContinue
    Write-Host "  package-lock.json eliminado." -ForegroundColor Green
}

# --- 2. Limpiar cache global de npm ---
Write-Host ""
Write-Host "[2/3] Limpiando cache de npm..." -ForegroundColor Cyan
$npmCachePath = Join-Path $env:USERPROFILE ".npm"

if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm cache clean --force 2>$null
    Write-Host "  Cache de npm limpiado." -ForegroundColor Green
} elseif (Test-Path $npmCachePath) {
    Remove-Item -Path $npmCachePath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Carpeta .npm eliminada manualmente." -ForegroundColor Green
} else {
    Write-Host "  No se encontro cache de npm." -ForegroundColor DarkGray
}

# --- 3. Desinstalar Node.js ---
Write-Host ""
Write-Host "[3/3] Desinstalando Node.js..." -ForegroundColor Cyan

if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget uninstall OpenJS.NodeJS --accept-source-agreements 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Node.js desinstalado." -ForegroundColor Green
    } else {
        Write-Host "  No se pudo desinstalar Node.js (puede que no este instalado via winget)." -ForegroundColor DarkGray
    }
} else {
    Write-Host "  winget no disponible. Desinstala Node.js manualmente." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Limpieza completada!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
