@echo off
chcp 65001 > nul
title FINDAFINITY - Conciliacion Contable y Desambiguacion B2B2B
cls

echo ===============================================================================
echo                FINDAFINITY - CONCILIACION CONTABLE B2B2B
echo        Staging Area de Alta Precision - Cuadre Contable a Centimo Cero (0.00 EUR)
echo ===============================================================================
echo.

set "PYTHON_EXE=E:\Games\Python\python.exe"

if not exist "%PYTHON_EXE%" (
    echo [AVISO] No se encontro %PYTHON_EXE%, buscando python en PATH...
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_EXE=python"
    ) else (
        echo [ERROR] No se encontro el interprete de Python.
        echo Verifique la instalacion en E:\Games\Python o consulte E:\Games\ENVIRONMENT_GUIDE.md
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
"%PYTHON_EXE%" -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
