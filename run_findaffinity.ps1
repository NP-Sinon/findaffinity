# Launcher PowerShell para FINDAFINITY
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "FINDAFINITY - Conciliacion Contable B2B2B"
Clear-Host

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "               FINDAFINITY - CONCILIACION CONTABLE B2B2B" -ForegroundColor Cyan
Write-Host "       Staging Area de Alta Precision - Cuadre Contable a Centimo Cero (0.00 EUR)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$PythonExe = "E:\Games\Python\python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "[AVISO] No se encontro $PythonExe, buscando python en el PATH..." -ForegroundColor Yellow
    $PythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($PythonCmd) {
        $PythonExe = "python"
    } else {
        Write-Host "[ERROR] No se encontro el interprete de Python en el sistema." -ForegroundColor Red
        Write-Host "Consulte E:\Games\ENVIRONMENT_GUIDE.md" -ForegroundColor Red
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
