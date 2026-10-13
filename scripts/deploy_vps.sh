#!/usr/bin/env bash
# ==============================================================================
# SCRIPT DE DESPLIEGUE EN PRODUCCIÓN PARA FINDAFINITY MICRO-SAAS (VPS UBUNTU/DEBIAN)
# Configura Docker, PostgreSQL 16, Nginx Reverse Proxy, Certbot SSL Let's Encrypt
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}===============================================================================${NC}"
echo -e "${BLUE}        FINDAFINITY - DESPLIEGUE AUTOMATIZADO EN PRODUCCIÓN (VPS Linux)        ${NC}"
echo -e "${BLUE}===============================================================================${NC}"

# 1. Comprobar permisos de superusuario (root)
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Este script debe ejecutarse como root o con sudo.${NC}"
  exit 1
fi

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
  read -rp "Introduce tu dominio oficial (ej. app.findaffinity.com): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
  read -rp "Introduce tu email para renovación de SSL Let's Encrypt: " EMAIL
fi

echo -e "\n${YELLOW}[1/6] Actualizando paquetes del sistema e instalando dependencias base...${NC}"
apt-get update -qq
apt-get install -y -qq curl git ufw openssl ca-certificates gnupg lsb-release

# 2. Instalar Docker y Docker Compose si no están instalados
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}[2/6] Instalando Docker Engine y Docker Compose...${NC}"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
else
  echo -e "${GREEN}[OK] Docker ya está instalado.${NC}"
fi

# 3. Configurar Cortafuegos UFW
echo -e "${YELLOW}[3/6] Configurando reglas de cortafuegos UFW...${NC}"
ufw allow 22/tcp > /dev/null 2>&1 || true
ufw allow 80/tcp > /dev/null 2>&1 || true
ufw allow 443/tcp > /dev/null 2>&1 || true
ufw --force enable > /dev/null 2>&1 || true

# 4. Generar configuración de entorno de producción (.env)
echo -e "${YELLOW}[4/6] Generando archivo de configuración seguro (.env)...${NC}"
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)

cat <<EOF > .env
# Configuración de Producción FINDAFINITY
APP_DOMAIN=${DOMAIN}
DB_USER=findaffinity
DB_PASSWORD=${DB_PASS}
DB_NAME=findaffinity_prod
JWT_SECRET_KEY=${JWT_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Pasarela Stripe (Producción / Test)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

ENVIRONMENT=production
EOF

chmod 600 .env
echo -e "${GREEN}[OK] Archivo .env generado con contraseñas criptográficas seguras.${NC}"

# 5. Generar certificados SSL autofirmados temporales para permitir arranque de Nginx
echo -e "${YELLOW}[5/6] Preparando certificados SSL y desafíos Let's Encrypt...${NC}"
CERT_DIR="/var/lib/docker/volumes/findaffinity_certbot_conf/_data/live"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "Generando certificado SSL temporal para inicializar Nginx..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=${DOMAIN}" > /dev/null 2>&1 || true
fi

# 6. Levantar la pila de producción con Docker Compose
echo -e "${YELLOW}[6/6] Construyendo contenedores y levantando la infraestructura...${NC}"
docker compose -f docker-compose.prod.yml down > /dev/null 2>&1 || true
docker compose -f docker-compose.prod.yml up -d --build

# Esperar a que Nginx responda en el puerto 80
echo "Esperando arranque del servidor web..."
sleep 8

# Solicitar certificado real Let's Encrypt si el dominio está apuntando al VPS
echo -e "\n${YELLOW}¿Deseas solicitar el certificado oficial Let's Encrypt para ${DOMAIN} ahora? (s/n)${NC}"
read -rp "(Asegúrate de que el registro DNS A apunta a esta IP): " EMIT_SSL

if [[ "$EMIT_SSL" =~ ^[sSyY]$ ]]; then
  echo "Solicitando certificado SSL a Let's Encrypt..."
  docker compose -f docker-compose.prod.yml run --rm certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" || {
      echo -e "${RED}[AVISO] No se pudo emitir el certificado inmediatamente. Verifique que el DNS apunte a este servidor.${NC}"
    }

  # Recargar Nginx con el nuevo certificado
  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload > /dev/null 2>&1 || true
fi

echo -e "\n${GREEN}===============================================================================${NC}"
echo -e "${GREEN}             DESPLIEGUE EN PRODUCCIÓN COMPLETADO CON ÉXITO                     ${NC}"
echo -e "${GREEN}===============================================================================${NC}"
echo -e "• Dominio Oficial:       https://${DOMAIN}"
echo -e "• API Swagger Docs:      https://${DOMAIN}/docs"
echo -e "• Base de Datos:         PostgreSQL 16 (Contenedor 'findaffinity-postgres')"
echo -e "• Proxy Inverso:         Nginx con HTTP/2 y TLS 1.3"
echo -e "• Renovación SSL:        Certbot automático cada 12 horas"
echo -e "• Comandos útiles:"
echo -e "    - Ver logs en vivo:  docker compose -f docker-compose.prod.yml logs -f web"
echo -e "    - Reiniciar stack:   docker compose -f docker-compose.prod.yml restart"
echo -e "${GREEN}===============================================================================${NC}"
