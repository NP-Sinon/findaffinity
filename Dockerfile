# ==============================================================================
# FICHERO: Dockerfile
# Build Ultrarrápido de Producción para Render: Python 3.12 (FastAPI) + SPA Dist
# ==============================================================================
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    PORT=8000

WORKDIR /app

# Instalar dependencias del sistema mínimas para scipy/psycopg2/psycopg y curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY data/ ./data/
COPY frontend/dist ./frontend/dist

RUN mkdir -p /app/data /app/output_pilot

EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
