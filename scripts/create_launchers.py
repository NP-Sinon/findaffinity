import os

bat_content = """@echo off
chcp 65001 > nul
title FINDAFINITY - Conciliacion Contable y Desambiguacion B2B2B
cls

echo ===============================================================================
echo                FINDAFINITY - CONCILIACION CONTABLE B2B2B
echo        Staging Area de Alta Precision - Cuadre Contable a Centimo Cero (0.00 EUR)
echo ===============================================================================
echo.

set "PYTHON_EXE=E:\\Games\\Python\\python.exe"

if not exist "%PYTHON_EXE%" (
    echo [AVISO] No se encontro %PYTHON_EXE%, buscando python en PATH...
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_EXE=python"
    ) else (
        echo [ERROR] No se encontro el interprete de Python.
        echo Verifique la instalacion en E:\\Games\\Python o consulte E:\\Games\\ENVIRONMENT_GUIDE.md
        pause
        exit /b 1
    )
)

echo [1/3] Verificando entorno de base de datos y directorios...
if not exist "data" mkdir "data"
if not exist "output_pilot" mkdir "output_pilot"

echo [2/3] Iniciando Servidor FastAPI y Plataforma FINDAFINITY...
echo.
echo  - Aplicacion Web: http://127.0.0.1:8000
echo  - Swagger API:    http://127.0.0.1:8000/docs
echo.
echo [3/3] Abriendo navegador predeterminado...
start http://127.0.0.1:8000

echo ===============================================================================
echo Servidor activo en http://127.0.0.1:8000. Presione Ctrl+C para detener.
echo ===============================================================================
"%PYTHON_EXE%" -m uvicorn src.main:app --host 127.0.0.1 --port 8000
"""

# Force CRLF for Windows CMD parser compatibility
crlf_content = bat_content.replace("\r\n", "\n").replace("\n", "\r\n")

bat_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "run_findaffinity.bat")
with open(bat_path, "wb") as f:
    f.write(crlf_content.encode("utf-8"))

print(f"[OK] run_findaffinity.bat guardado con CRLF estricto ({len(crlf_content)} bytes)")

ps1_content = """# Launcher PowerShell para FINDAFINITY
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "FINDAFINITY - Conciliacion Contable B2B2B"
Clear-Host

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "               FINDAFINITY - CONCILIACION CONTABLE B2B2B" -ForegroundColor Cyan
Write-Host "       Staging Area de Alta Precision - Cuadre Contable a Centimo Cero (0.00 EUR)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$PythonExe = "E:\\Games\\Python\\python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "[AVISO] No se encontro $PythonExe, buscando python en el PATH..." -ForegroundColor Yellow
    $PythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($PythonCmd) {
        $PythonExe = "python"
    } else {
        Write-Host "[ERROR] No se encontro el interprete de Python en el sistema." -ForegroundColor Red
        Write-Host "Consulte E:\\Games\\ENVIRONMENT_GUIDE.md" -ForegroundColor Red
        Read-Host "Presione Enter para salir"
        exit 1
    }
}

Write-Host "[1/3] Verificando directorios..." -ForegroundColor Green
if (-not (Test-Path "data")) { New-Item -ItemType Directory -Path "data" | Out-Null }
if (-not (Test-Path "output_pilot")) { New-Item -ItemType Directory -Path "output_pilot" | Out-Null }

Write-Host "[2/3] Iniciando Servidor FastAPI..." -ForegroundColor Green
Write-Host " - Aplicacion Web: http://127.0.0.1:8000" -ForegroundColor White
Write-Host " - Swagger API:    http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host ""

Write-Host "[3/3] Abriendo navegador predeterminado..." -ForegroundColor Green
Start-Process "http://127.0.0.1:8000"

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Servidor activo en http://127.0.0.1:8000. Presione Ctrl+C para detener." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

& $PythonExe -m uvicorn src.main:app --host 127.0.0.1 --port 8000
"""

ps1_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "run_findaffinity.ps1")
with open(ps1_path, "wb") as f:
    f.write(ps1_content.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8-sig"))

print(f"[OK] run_findaffinity.ps1 guardado con exito ({len(ps1_content)} bytes)")
