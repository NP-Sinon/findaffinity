# Multi-Stage Dockerfile para FINDAFINITY Micro-SaaS
# Stage 1: Construcción del Frontend React + Vite
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
RUN npm run build

# Stage 2: Entorno Python de Producción
FROM python:3.12-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Dependencias de sistema requeridas para librerías de optimización
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente del backend y datos piloto
COPY src/ ./src/
COPY data/ ./data/

# Copiar artefactos compilados del frontend al directorio estático
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Exponer puerto 8000
EXPOSE 8000

# Healthcheck institucional
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Comando de arranque con servidor ASGI Uvicorn
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
