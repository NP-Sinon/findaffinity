@echo off
chcp 65001 > nul
title FINDAFINITY - Conciliación Contable y Desambiguación B2B2B
cls

echo ===============================================================================
echo                FINDAFINITY - CONCILIACIÓN CONTABLE B2B2B
echo        Staging Area de Alta Precisión • Cuadre Contable a Céntimo Cero (0.00 €)
echo ===============================================================================
echo.

set PYTHON_EXE=E:\Games\Python\python.exe

if not exist "%PYTHON_EXE%" (
    echo [ERROR] No se encontró el intérprete de Python en %PYTHON_EXE%
    echo Verifique la instalación o consulte E:\Games\ENVIRONMENT_GUIDE.md
    pause
    exit /b 1
)

echo [1/3] Verificando entorno de base de datos y directorios...
if not exist "data" mkdir "data"
if not exist "output_pilot" mkdir "output_pilot"

echo [2/3] Iniciando Servidor FastAPI y Plataforma FINDAFINITY...
echo.
echo  - Aplicación Web: http://127.0.0.1:8000
echo  - Swagger API:    http://127.0.0.1:8000/docs
echo.
echo [3/3] Abriendo navegador predeterminado...
start http://127.0.0.1:8000

echo ===============================================================================
echo Servidor activo. Presione Ctrl+C para detener el servicio.
echo ===============================================================================
"%PYTHON_EXE%" -m uvicorn src.main:app --host 127.0.0.1 --port 8000
