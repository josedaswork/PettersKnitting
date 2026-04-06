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

$nodePaths = @("C:\Program Files\nodejs", "$env:APPDATA\npm")
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
foreach ($p in $nodePaths) {
    if (($env:Path -split ";") -notcontains $p) {
        $env:Path = "$p;$env:Path"
    }
}

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
            foreach ($p in $nodePaths) {
                if (($env:Path -split ";") -notcontains $p) {
                    $env:Path = "$p;$env:Path"
                }
            }
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

# --- Asegurar que Node.js esta en el PATH permanente del usuario ---
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
foreach ($p in $nodePaths) {
    if ($userPath -notlike "*$p*") {
        $userPath = "$p;$userPath"
        Write-Host "  Anadido al PATH de usuario: $p" -ForegroundColor Yellow
    }
}
[System.Environment]::SetEnvironmentVariable("Path", $userPath, "User")
Write-Host "  PATH de usuario actualizado permanentemente." -ForegroundColor Green

# --- 2. Instalar dependencias ---
Write-Host ""
Write-Host "[2/2] Instalando dependencias del proyecto..." -ForegroundColor Cyan

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
foreach ($p in @("C:\Program Files\nodejs", "$env:APPDATA\npm")) {
    if (($env:Path -split ";") -notcontains $p) {
        $env:Path = "$p;$env:Path"
    }
}

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
