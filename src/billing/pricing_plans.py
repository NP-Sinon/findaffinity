"""
Definición de Planes de Suscripción, Cuotas y Reglas de Monetización SaaS (Sección 4 del PDF)
"""
from enum import Enum
from typing import Dict, Any, List


class PlanTier(str, Enum):
    STARTER = "STARTER"              # 49 € / mes, hasta 10 clientes, 2.500 tx/mes
    PROFESSIONAL = "PROFESSIONAL"    # 119 € / mes, hasta 30 clientes, 12.000 tx/mes
    PYME_DIRECTO = "PYME_DIRECTO"    # 39 € / mes por entidad, 1 cliente, 2.000 tx/mes
    ENTERPRISE = "ENTERPRISE"        # 249 € / mes, hasta 100 clientes, 50.000 tx/mes


PLAN_CONFIGS: Dict[str, Dict[str, Any]] = {
    PlanTier.STARTER.value: {
        "name": "Plan Gestoría Starter",
        "tier": PlanTier.STARTER.value,
        "price_eur_month": 49.0,
        "max_clients": 10,
        "max_monthly_transactions": 2500,
        "supported_gateways": ["Norma43"],
        "supported_erps": ["CONTASOL", "A3"],
        "has_sha256_audit": False,
        "description": "Conciliación bancaria Norma 43, resolución determinista de transferencias y exportación a Contasol y A3.",
    },
    PlanTier.PROFESSIONAL.value: {
        "name": "Plan Gestoría Professional",
        "tier": PlanTier.PROFESSIONAL.value,
        "price_eur_month": 119.0,
        "max_clients": 30,
        "max_monthly_transactions": 12000,
        "supported_gateways": ["Norma43", "Stripe", "Redsys", "PayPal", "SumUp"],
        "supported_erps": ["A3", "SAGE", "CONTASOL"],
        "has_sha256_audit": True,
        "description": "Descomposición algorítmica de Stripe, Redsys y PayPal; auditoría criptográfica SHA-256; exportación completa a los 3 ERPs.",
    },
    PlanTier.PYME_DIRECTO.value: {
        "name": "Plan Pyme Directo",
        "tier": PlanTier.PYME_DIRECTO.value,
        "price_eur_month": 39.0,
        "max_clients": 1,
        "max_monthly_transactions": 2000,
        "supported_gateways": ["Norma43", "Stripe", "Redsys"],
        "supported_erps": ["A3", "SAGE", "CONTASOL"],
        "has_sha256_audit": True,
        "description": "Acceso directo para empresas individuales que gestionan su propia administración antes de remitir datos al gestor.",
    },
    PlanTier.ENTERPRISE.value: {
        "name": "Plan Despacho Enterprise",
        "tier": PlanTier.ENTERPRISE.value,
        "price_eur_month": 249.0,
        "max_clients": 100,
        "max_monthly_transactions": 50000,
        "supported_gateways": ["Norma43", "Stripe", "Redsys", "PayPal", "SumUp"],
        "supported_erps": ["A3", "SAGE", "CONTASOL"],
        "has_sha256_audit": True,
        "description": "Capacidad ilimitada para grandes firmas de auditoría y despachos de alto volumen transaccional.",
    },
}

EXTRA_BLOCK_PRICE_EUR = 25.0
EXTRA_BLOCK_CLIENTS = 10
EXTRA_BLOCK_TRANSACTIONS = 5000
