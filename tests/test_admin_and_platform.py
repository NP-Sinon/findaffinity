"""
Tests Unitarios y de Integración para el Panel de Administrador Global (FINDAFINITY SUPERADMIN)
Verifica la consulta de compañías registradas, sus tipos de licencia, actualización de planes y RBAC.
"""
import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.database.connection import SessionLocal
from src.database.models import User, UserRole, Tenant
from src.services.bootstrap_service import ensure_default_accounts, bootstrap_database_if_empty


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        with SessionLocal() as db:
            bootstrap_database_if_empty(db)
            ensure_default_accounts(db)
        yield test_client


def test_admin_login_and_token(client):
    """Verifica que la cuenta SUPERADMIN preconfigurada inicia sesión y emite token válido."""
    res = client.post("/api/v1/auth/login", json={
        "email": "admin@findaffinity.com",
        "password": "AdminPass2026!",
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "admin@findaffinity.com"
    assert data["user"]["role"] == UserRole.SUPERADMIN


def test_list_all_registered_companies_as_admin(client):
    """El administrador puede listar todas las compañías registradas y ver sus licencias."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@findaffinity.com",
        "password": "AdminPass2026!",
    })
    token = login_res.json()["access_token"]

    res = client.get("/api/v1/admin/companies", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    companies = res.json()
    assert isinstance(companies, list)
    assert len(companies) >= 1

    first = companies[0]
    assert "id" in first
    assert "name" in first
    assert "fiscal_id" in first
    assert "plan" in first
    assert "monthly_price_eur" in first
    assert "clients_count" in first
    assert "batches_count" in first
    assert "status" in first
    assert first["status"] == "ACTIVE"


def test_get_platform_stats_as_admin(client):
    """El administrador puede consultar las estadísticas agregadas de la plataforma."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@findaffinity.com",
        "password": "AdminPass2026!",
    })
    token = login_res.json()["access_token"]

    res = client.get("/api/v1/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    stats = res.json()
    assert "total_companies" in stats
    assert stats["total_companies"] >= 1
    assert "total_users" in stats
    assert "plan_distribution" in stats


def test_update_company_plan_as_admin(client):
    """El administrador puede cambiar la licencia de una compañía."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@findaffinity.com",
        "password": "AdminPass2026!",
    })
    token = login_res.json()["access_token"]

    # Obtener primera compañía
    companies = client.get("/api/v1/admin/companies", headers={"Authorization": f"Bearer {token}"}).json()
    target_tenant_id = companies[0]["id"]

    # Cambiar a ENTERPRISE
    res = client.put(
        f"/api/v1/admin/companies/{target_tenant_id}/plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan": "ENTERPRISE", "extra_blocks": 2},
    )
    assert res.status_code == 200, res.text
    updated = res.json()
    assert updated["plan"] == "ENTERPRISE"
    assert updated["extra_blocks"] == 2
    assert updated["monthly_price_eur"] == 249.0 + (2 * 25.0)

    # Restaurar a PROFESSIONAL
    client.put(
        f"/api/v1/admin/companies/{target_tenant_id}/plan",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan": "PROFESSIONAL", "extra_blocks": 0},
    )


def test_non_admin_cannot_access_admin_panel(client):
    """Un usuario con rol no administrativo no puede acceder al listado de compañías."""
    # Login auditor normal
    login_res = client.post("/api/v1/auth/login", json={
        "email": "auditor@konigpartners.es",
        "password": "AuditPass2026!",
    })
    token = login_res.json()["access_token"]

    res = client.get("/api/v1/admin/companies", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403, res.text


def test_unauthenticated_request_rejected(client):
    """Peticiones sin token a /api/v1/admin/* son rechazadas con 401."""
    res = client.get("/api/v1/admin/companies")
    assert res.status_code == 401
