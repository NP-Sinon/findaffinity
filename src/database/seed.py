"""
FICHERO: src/database/seed.py
Inicialización Limpia de Producción: Crea únicamente la cuenta maestra SUPERADMIN
sin inyectar empresas ni lotes de demostración en las cuentas de clientes cuando SEED_DEMO_DATA=false.
"""
import os
import uuid
from sqlalchemy.orm import Session
from src.database.models import Tenant, User, UserRole
from src.auth.security import hash_password, get_password_hash


def seed_initial_data(db: Session) -> None:
    from sqlalchemy import func
    admin_email = os.getenv("ADMIN_EMAIL", "admin@findaffinity.com").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "AdminPass2026!")

    master_tenant = db.query(Tenant).filter(func.lower(Tenant.email) == admin_email).first()
    if not master_tenant:
        master_tenant = Tenant(
            id=str(uuid.uuid4()),
            name="FINDAFINITY GLOBAL ADMINISTRATION",
            fiscal_id="B-00000000",
            email=admin_email,
            plan="ENTERPRISE",
            extra_blocks=0,
        )
        db.add(master_tenant)
        db.flush()
    else:
        master_tenant.plan = "ENTERPRISE"

    existing_superadmin = db.query(User).filter(func.lower(User.email) == admin_email).first()
    if not existing_superadmin:
        superadmin_user = User(
            id=str(uuid.uuid4()),
            tenant_id=master_tenant.id,
            email=admin_email,
            full_name="Administrador Global",
            hashed_password=hash_password(admin_password),
            role=UserRole.SUPERADMIN,
            is_active=True,
        )
        db.add(superadmin_user)
        db.commit()
    else:
        existing_superadmin.hashed_password = hash_password(admin_password)
        existing_superadmin.role = UserRole.SUPERADMIN
        existing_superadmin.is_active = True
        if not existing_superadmin.tenant_id:
            existing_superadmin.tenant_id = master_tenant.id
        db.commit()

    # Si se solicita explícitamente sembrar datos de demo para testing/piloto
    seed_demo = os.getenv("SEED_DEMO_DATA", "false").strip().lower() in ("true", "1", "yes")
    if seed_demo:
        from src.services.bootstrap_service import bootstrap_database_if_empty, ensure_default_accounts
        bootstrap_database_if_empty(db)
        ensure_default_accounts(db)
