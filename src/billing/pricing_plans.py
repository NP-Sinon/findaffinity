"""
Configuración Oficial de Planes de Suscripción y Paywall Freemium (PLG)
Incluye Plan FREE (hasta 25 facturas/transacciones mensuales) y planes B2B/B2B2B.
"""
from enum import Enum
from typing import Dict, Any, List

FREE_TIER_MAX_TRANSACTIONS = 25

class PlanTier(str, Enum):
    FREE = "FREE"                    # 0 € / mes, 1 cliente, 25 tx/mes
    PYME_DIRECTO = "PYME_DIRECTO"    # 39 € / mes por entidad, 1 cliente, 2.000 tx/mes
    STARTER = "STARTER"              # 49 € / mes, hasta 10 clientes, 2.500 tx/mes
    PROFESSIONAL = "PROFESSIONAL"    # 119 € / mes, hasta 30 clientes, 12.000 tx/mes
    ENTERPRISE = "ENTERPRISE"        # 249 € / mes, hasta 100 clientes, 50.000 tx/mes


PLAN_CONFIGS: Dict[str, Dict[str, Any]] = {
    "FREE": {
        "code": "FREE",
        "tier": "FREE",
        "name": "Plan Gratuito (Evaluación)",
        "price_eur_month": 0.0,
        "max_clients": 1,
        "max_monthly_transactions": FREE_TIER_MAX_TRANSACTIONS,
        "supported_gateways": ["Norma43", "Stripe", "Redsys"],
        "supported_erps": ["CONTASOL", "A3", "SAGE"],
        "has_sha256_audit": False,
        "description": "Hasta 25 facturas o transacciones conciliadas al mes con vista previa y prueba libre de riesgo.",
        "features": [
            "Hasta 25 facturas o transacciones conciliadas al mes",
            "1 empresa cliente activa",
            "Conciliación Norma 43, Stripe y Redsys",
            "Vista previa de asientos PGC en Staging Radar",
        ],
    },
    "PYME_DIRECTO": {
        "code": "PYME_DIRECTO",
        "tier": "PYME_DIRECTO",
        "name": "Plan Pyme Directo",
        "price_eur_month": 39.0,
        "max_clients": 1,
        "max_monthly_transactions": 2000,
        "supported_gateways": ["Norma43", "Stripe", "Redsys"],
        "supported_erps": ["A3", "SAGE", "CONTASOL"],
        "has_sha256_audit": True,
        "description": "Acceso directo para empresas individuales que gestionan su propia administración antes de remitir datos al gestor.",
        "features": [
            "Hasta 2.000 transacciones mensuales",
            "1 sociedad mercantil",
            "Sincronización directa con API de Stripe",
            "Exportación ilimitada a A3, Sage 50 y Contasol",
        ],
    },
    "STARTER": {
        "code": "STARTER",
        "tier": "STARTER",
        "name": "Plan Gestoría Starter",
        "price_eur_month": 49.0,
        "max_clients": 10,
        "max_monthly_transactions": 2500,
        "supported_gateways": ["Norma43"],
        "supported_erps": ["CONTASOL", "A3"],
        "has_sha256_audit": False,
        "description": "Conciliación bancaria Norma 43, resolución determinista de transferencias y exportación a Contasol y A3.",
        "features": [
            "Hasta 10 empresas cliente activas",
            "Hasta 2.500 transacciones agregadas al mes",
            "Exportación nativa a Contasol, Sage 50 y A3",
            "Mapeo inteligente de carteras de facturas",
        ],
    },
    "PROFESSIONAL": {
        "code": "PROFESSIONAL",
        "tier": "PROFESSIONAL",
        "name": "Plan Gestoría Professional",
        "price_eur_month": 119.0,
        "max_clients": 30,
        "max_monthly_transactions": 12000,
        "supported_gateways": ["Norma43", "Stripe", "Redsys", "PayPal", "SumUp"],
        "supported_erps": ["A3", "SAGE", "CONTASOL"],
        "has_sha256_audit": True,
        "description": "Descomposición algorítmica de Stripe, Redsys y PayPal; auditoría criptográfica SHA-256; exportación completa a los 3 ERPs.",
        "features": [
            "Hasta 30 empresas cliente activas",
            "Hasta 12.000 transacciones agregadas al mes",
            "Sincronización API Stripe multi-cliente",
            "Certificado Legal de Auditoría SHA-256",
        ],
    },
    "ENTERPRISE": {
        "code": "ENTERPRISE",
        "tier": "ENTERPRISE",
        "name": "Plan Despacho Scale / Enterprise",
        "price_eur_month": 249.0,
        "max_clients": 100,
        "max_monthly_transactions": 50000,
        "supported_gateways": ["Norma43", "Stripe", "Redsys", "PayPal", "SumUp"],
        "supported_erps": ["A3", "SAGE", "CONTASOL"],
        "has_sha256_audit": True,
        "description": "Capacidad ilimitada para grandes firmas de auditoría y despachos de alto volumen transaccional.",
        "features": [
            "Hasta 100 empresas cliente activas",
            "Hasta 50.000 transacciones agregadas al mes",
            "Auditoría avanzada de recargos y devoluciones",
            "Soporte prioritario y modo efímero RAM",
        ],
    },
}

EXTRA_BLOCK_PRICE_EUR = 25.0
EXTRA_BLOCK_CLIENTS = 10
EXTRA_BLOCK_TRANSACTIONS = 5000


class QuotaManager:
    @staticmethod
    def evaluate_tenant_quota(
        plan_code: str,
        extra_blocks: int,
        current_clients_count: int,
        current_month_transactions: int,
        incoming_transactions: int = 0,
    ) -> Dict[str, Any]:
        plan_key = (plan_code or "FREE").upper()
        spec = PLAN_CONFIGS.get(plan_key, PLAN_CONFIGS["FREE"])
        extra = max(0, int(extra_blocks or 0))

        # Los bloques extra solo aplican a planes de pago
        max_clients = spec["max_clients"] + (extra * 10 if plan_key != "FREE" else 0)
        max_tx = spec["max_monthly_transactions"] + (extra * 5000 if plan_key != "FREE" else 0)

        projected_tx = current_month_transactions + incoming_transactions
        remaining_tx = max(0, max_tx - current_month_transactions)
        paywall_triggered = projected_tx > max_tx

        return {
            "plan": plan_key,
            "plan_name": spec["name"],
            "price_eur_month": spec["price_eur_month"] + (extra * 25.0 if plan_key != "FREE" else 0.0),
            "current_clients": current_clients_count,
            "max_clients": max_clients,
            "current_month_transactions": current_month_transactions,
            "max_monthly_transactions": max_tx,
            "remaining_transactions": remaining_tx,
            "usage_percent": round(min(100.0, (current_month_transactions / max(1, max_tx)) * 100.0), 1),
            "paywall_triggered": paywall_triggered,
            "can_export": not (plan_key == "FREE" and (current_month_transactions >= max_tx or paywall_triggered)),
        }
