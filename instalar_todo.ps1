# ============================================================
# Script de instalacion completa - Peter's Knitting
# Instala Node.js, dependencias del proyecto y arranca la app
# Ejecutar en PowerShell
# ============================================================

Write-Host ""
Write-Host "=== SCRIPT DE INSTALACION - Peter's Knitting ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Este script instalara:" -ForegroundColor Cyan
Write-Host "  1. Node.js (via winget)"
Write-Host "  2. Dependencias del proyecto - Expo SDK 54 (npm install)"
Write-Host ""

$confirmacion = Read-Host "Deseas continuar? (S/N)"
if ($confirmacion -notin @("S", "s", "Si", "si", "SI")) {
    Write-Host "Operacion cancelada." -ForegroundColor Red
    exit
}

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

# --- 1. Instalar Node.js ---
Write-Host ""
Write-Host "[1/2] Verificando Node.js..." -ForegroundColor Cyan

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  Node.js ya esta instalado: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  Instalando Node.js con winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install OpenJS.NodeJS --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Node.js instalado correctamente." -ForegroundColor Green
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        } else {
            Write-Host "  ERROR: No se pudo instalar Node.js." -ForegroundColor Red
            Write-Host "  Instalalo manualmente desde: https://nodejs.org/" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "  ERROR: winget no disponible." -ForegroundColor Red
        Write-Host "  Instalalo manualmente desde: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
}

# --- 2. Instalar dependencias ---
Write-Host ""
Write-Host "[2/2] Instalando dependencias del proyecto..." -ForegroundColor Cyan

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Dependencias instaladas correctamente." -ForegroundColor Green
    } else {
        Write-Host "  ERROR al instalar dependencias." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ERROR: npm no encontrado. Reinicia la terminal e intenta de nuevo." -ForegroundColor Red
    exit 1
}

# --- Listo ---
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Instalacion completada!" -ForegroundColor Green
Write-Host "  Para iniciar la app ejecuta:" -ForegroundColor Cyan
Write-Host "    npx expo start" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
