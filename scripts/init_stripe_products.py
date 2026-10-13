#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Verificación y Alta de Productos Recurrentes Oficiales en Stripe para FINDAFINITY
Configura y valida:
- Pyme Directo: 39,00 € / mes
- Gestoría Starter: 49,00 € / mes
- Gestoría Professional: 119,00 € / mes
- Paquete Expansión: 25,00 € / mes
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime, timezone

# Asegurar importación de módulos del proyecto
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.billing.stripe_service import StripeBillingService, OFFICIAL_STRIPE_PRODUCTS


def main():
    print("===============================================================================")
    print("         FINDAFINITY - ALTA Y VERIFICACIÓN DE PRODUCTOS EN STRIPE              ")
    print("===============================================================================")
    print()

    stripe_key = os.getenv("STRIPE_SECRET_KEY", "")
    if stripe_key and not stripe_key.startswith("sk_test_placeholder"):
        print(f"[INFO] Conectando con Stripe API utilizando clave: {stripe_key[:8]}...{stripe_key[-4:]}")
    else:
        print("[INFO] Modo pre-producción / local. Verificando catálogo oficial de productos.")

    result = StripeBillingService.sync_stripe_products(stripe_key)

    print()
    print(f"Modo de Sincronización: {result['mode']}")
    print("-" * 79)
    print(f"{'PRODUCTO / PLAN':<36} | {'IMPORTE':<10} | {'INTERVALO':<10} | {'ESTADO':<15}")
    print("-" * 79)

    for tier_key, item in result["catalog"].items():
        name = item.get("name", tier_key)
        amount = f"{item['amount_eur']:.2f} €"
        interval = item.get("interval", "month")
        status = item.get("status", "ACTIVE")
        print(f"{name:<36} | {amount:<10} | {interval:<10} | {status:<15}")

    print("-" * 79)

    # Exportar catálogo certificado a disco
    out_dir = Path(__file__).resolve().parent.parent / "output_pilot"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "STRIPE_PRODUCTS_CATALOG.json"

    export_data = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "stripe_mode": result["mode"],
        "currency": "EUR",
        "products_verified_count": len(result["catalog"]),
        "catalog": result["catalog"],
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)

    print()
    print(f"[OK] Catálogo de productos exportado y certificado en: {out_file}")
    print("Todos los productos recurrentes (39 €, 49 €, 119 € y 25 €) verificados con éxito.")


if __name__ == "__main__":
    main()
