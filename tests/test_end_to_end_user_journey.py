"""
Test End-to-End del Recorrido de Usuario Completo (User Journey & Security Boundary)
Valida:
1. Auto-registro de nuevo despacho profesional -> Rol ADMIN de su propio inquilino.
2. Login inmediato del nuevo despacho emitiendo JWT con rol ADMIN.
3. Aislamiento de permisos: El nuevo ADMIN recibe 403 Forbidden al intentar acceder al panel global (/api/v1/admin/companies y /stats).
4. Acceso SUPERADMIN (admin@findaffinity.com): Puede auditar todas las compañías, viendo la nueva empresa y su plan.
5. Estado limpio y libre de documentos fantasma: La nueva empresa cliente tiene 0 lotes y 0 transacciones.
6. Ingesta y conciliación aislada: La nueva empresa sube un extracto bancario/pasarela y genera asientos sin contaminar a otros inquilinos.
"""
import uuid
import pytest
from io import BytesIO
from fastapi.testclient import TestClient

from src.main import app
from src.database.connection import SessionLocal
from src.database.models import User, UserRole, Tenant, ClientCompany
from src.services.bootstrap_service import ensure_default_accounts, bootstrap_database_if_empty


@pytest.fixture(scope="module")
def api_client():
    with TestClient(app) as client:
        with SessionLocal() as db:
            bootstrap_database_if_empty(db)
            ensure_default_accounts(db)
        yield client


def test_complete_user_journey_and_security_isolation(api_client):
    suffix = uuid.uuid4().hex[:6]
    test_email = f"laura_{suffix}@gomez-auditores.es"
    test_fiscal = f"B{uuid.uuid4().hex[:8].upper()}"
    test_company = f"Gómez & Asociados Auditores {suffix.upper()} SLP"

    # -------------------------------------------------------------
    # PASO 1: Registro de un nuevo despacho profesional
    # -------------------------------------------------------------
    new_user_payload = {
        "email": test_email,
        "password": "PasswordGomez2026!",
        "full_name": f"Laura Gómez {suffix}",
        "company_name": test_company,
        "fiscal_id": test_fiscal,
        "plan": "STARTER",
    }
    reg_res = api_client.post("/api/v1/auth/register", json=new_user_payload)
    assert reg_res.status_code == 201, f"Fallo al registrar usuario: {reg_res.text}"
    reg_data = reg_res.json()
    assert reg_data["email"] == test_email
    assert reg_data["role"] == UserRole.ADMIN
    assert reg_data["tenant_id"] is not None

    gomez_tenant_id = reg_data["tenant_id"]

    # Login inmediato del usuario registrado
    login_res = api_client.post("/api/v1/auth/login", json={
        "email": test_email,
        "password": "PasswordGomez2026!",
    })
    assert login_res.status_code == 200, f"Fallo al iniciar sesión: {login_res.text}"
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["user"]["role"] == UserRole.ADMIN

    gomez_token = login_data["access_token"]
    gomez_headers = {"Authorization": f"Bearer {gomez_token}"}

    # -------------------------------------------------------------
    # PASO 2: Intento del nuevo ADMIN de acceder al panel global SUPERADMIN
    # Debe recibir estrictamente 403 Forbidden
    # -------------------------------------------------------------
    admin_probe = api_client.get("/api/v1/admin/companies", headers=gomez_headers)
    assert admin_probe.status_code == 403, (
        f"Un Tenant ADMIN no debe tener acceso a /api/v1/admin/companies: {admin_probe.status_code}"
    )

    stats_probe = api_client.get("/api/v1/admin/stats", headers=gomez_headers)
    assert stats_probe.status_code == 403, (
        f"Un Tenant ADMIN no debe tener acceso a /api/v1/admin/stats: {stats_probe.status_code}"
    )

    # -------------------------------------------------------------
    # PASO 3: Login del SUPERADMIN oficial de FINDAFINITY
    # Accede al panel global y ve la nueva empresa registrada
    # -------------------------------------------------------------
    sa_login = api_client.post("/api/v1/auth/login", json={
        "email": "admin@findaffinity.com",
        "password": "AdminPass2026!",
    })
    assert sa_login.status_code == 200, sa_login.text
    sa_token = sa_login.json()["access_token"]
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    sa_companies = api_client.get("/api/v1/admin/companies", headers=sa_headers)
    assert sa_companies.status_code == 200, sa_companies.text
    company_list = sa_companies.json()
    assert isinstance(company_list, list)

    gomez_in_list = next((c for c in company_list if c["id"] == gomez_tenant_id), None)
    assert gomez_in_list is not None, "El despacho recién registrado debe figurar en el panel de SUPERADMIN"
    assert gomez_in_list["name"] == test_company
    assert gomez_in_list["fiscal_id"] == test_fiscal
    assert gomez_in_list["plan"] == "STARTER"

    # -------------------------------------------------------------
    # PASO 4: Consulta de clientes del nuevo despacho
    # Verificación de CERO empresas cliente fantasma tras registrarse
    # -------------------------------------------------------------
    existing_clients_res = api_client.get(
        f"/api/v1/clients?tenant_id={gomez_tenant_id}",
        headers=gomez_headers,
    )
    assert existing_clients_res.status_code == 200, existing_clients_res.text
    existing_clients = existing_clients_res.json()
    assert len(existing_clients) == 0, "Un despacho recién registrado debe iniciar con exactamente 0 empresas cliente fantasma"

    # El despacho crea explícitamente su primera Empresa Cliente vía modal/API
    client_payload = {
        "tenant_id": gomez_tenant_id,
        "name": f"Restaurante El Faro {suffix.upper()} SL",
        "fiscal_id": f"B{uuid.uuid4().hex[:8].upper()}",
        "default_erp": "A3",
        "account_length": 9,
        "bank_account_code": "572000001",
        "fee_account_code": "626000001",
    }
    create_client_res = api_client.post(
        "/api/v1/clients",
        json=client_payload,
        headers=gomez_headers,
    )
    assert create_client_res.status_code == 201, create_client_res.text
    created_client = create_client_res.json()
    client_id = created_client["id"]
    assert created_client["name"] == client_payload["name"]

    # Consulta de lotes existentes para este nuevo cliente (debe ser lista vacía [])
    batches_res = api_client.get(
        f"/api/v1/batches?client_id={client_id}",
        headers=gomez_headers,
    )
    assert batches_res.status_code == 200, batches_res.text
    batches = batches_res.json()
    assert batches == [], "Un cliente recién creado debe tener exactamente 0 lotes (cero documentos fantasma)"

    # -------------------------------------------------------------
    # PASO 5: Subida de fichero real por el nuevo despacho y conciliación aislada
    # -------------------------------------------------------------
    stripe_csv_content = (
        "id,Type,Gross,Fee,Net,Created (UTC),Description\n"
        f"ch_{suffix}_001,charge,120.00,3.50,116.50,2026-05-10 12:00:00,Cobro Degustacion La Bahia\n"
        f"ch_{suffix}_002,charge,80.00,2.50,77.50,2026-05-10 14:30:00,Cobro Terraza La Bahia\n"
    ).encode("utf-8")

    upload_res = api_client.post(
        "/api/v1/batches",
        headers=gomez_headers,
        data={
            "tenant_id": gomez_tenant_id,
            "client_id": client_id,
            "period_year": 2026,
            "period_type": "MONTH",
            "start_month": 5,
            "end_month": 5,
        },
        files={
            "file": (f"stripe_{suffix}.csv", BytesIO(stripe_csv_content), "text/csv")
        }
    )
    assert upload_res.status_code == 201, upload_res.text
    batch_data = upload_res.json()
    batch_id = batch_data["id"]
    assert batch_data["total_movements"] >= 1
    assert batch_data["tenant_id"] == gomez_tenant_id
    assert batch_data["client_id"] == client_id

    # Comprobar que los lotes ahora contienen este lote
    batches_after = api_client.get(
        f"/api/v1/batches?client_id={client_id}",
        headers=gomez_headers,
    ).json()
    assert len(batches_after) == 1
    assert batches_after[0]["id"] == batch_id

    # Comprobar detalle del lote
    batch_detail = api_client.get(
        f"/api/v1/batches/{batch_id}",
        headers=gomez_headers,
    )
    assert batch_detail.status_code == 200
    txs = batch_detail.json()["transactions"]
    assert len(txs) >= 1
    for tx in txs:
        assert tx["status"] in ["GREEN", "YELLOW", "RED"]

    # -------------------------------------------------------------
    # PASO 6: Eliminación granular de partidas y vaciado de lote
    # -------------------------------------------------------------
    target_tx = txs[0]
    initial_movements = len(txs)

    # Eliminar una partida individual
    del_tx_res = api_client.delete(
        f"/api/v1/batches/{batch_id}/transactions/{target_tx['id']}",
        headers=gomez_headers,
    )
    assert del_tx_res.status_code == 200, del_tx_res.text
    assert del_tx_res.json()["success"] is True

    # Comprobar que la partida ya no está en el lote
    batch_detail_after = api_client.get(
        f"/api/v1/batches/{batch_id}",
        headers=gomez_headers,
    ).json()
    remaining_txs = batch_detail_after["transactions"]
    assert len(remaining_txs) == initial_movements - 1
    assert not any(t["id"] == target_tx["id"] for t in remaining_txs)

    # Vaciar/eliminar el lote completo
    del_batch_res = api_client.delete(
        f"/api/v1/batches/{batch_id}",
        headers=gomez_headers,
    )
    assert del_batch_res.status_code == 200, del_batch_res.text
    assert del_batch_res.json()["success"] is True

    # Verificar que el cliente vuelve a tener 0 lotes
    batches_empty = api_client.get(
        f"/api/v1/batches?client_id={client_id}",
        headers=gomez_headers,
    ).json()
    assert len(batches_empty) == 0

    # -------------------------------------------------------------
    # PASO 7: Eliminación de empresa cliente
    # -------------------------------------------------------------
    del_client_res = api_client.delete(
        f"/api/v1/clients/{client_id}",
        headers=gomez_headers,
    )
    assert del_client_res.status_code == 200, del_client_res.text
    assert del_client_res.json()["success"] is True

    clients_after_del = api_client.get(
        f"/api/v1/clients?tenant_id={gomez_tenant_id}",
        headers=gomez_headers,
    ).json()
    assert len(clients_after_del) == 0

    # -------------------------------------------------------------
    # PASO 8: Eliminación de compañía en panel ADMIN con seguridad
    # -------------------------------------------------------------
    # Un ADMIN corriente no puede borrar compañías (403)
    unauthorized_del = api_client.delete(
        f"/api/v1/admin/companies/{gomez_tenant_id}",
        headers=gomez_headers,
    )
    assert unauthorized_del.status_code == 403

    # SUPERADMIN no puede borrar la cuenta maestra (400)
    master_comp = next((c for c in company_list if c["email"] == "admin@findaffinity.com"), None)
    if master_comp:
        master_del = api_client.delete(
            f"/api/v1/admin/companies/{master_comp['id']}",
            headers=sa_headers,
        )
        assert master_del.status_code == 400

    # SUPERADMIN borra definitivamente el tenant Gómez
    sa_del_res = api_client.delete(
        f"/api/v1/admin/companies/{gomez_tenant_id}",
        headers=sa_headers,
    )
    assert sa_del_res.status_code == 200, sa_del_res.text
    assert sa_del_res.json()["success"] is True

    # Verificar que ya no figura en la lista global de SUPERADMIN
    sa_companies_final = api_client.get("/api/v1/admin/companies", headers=sa_headers).json()
    assert not any(c["id"] == gomez_tenant_id for c in sa_companies_final)


def test_deletion_routes_and_slash_variants_never_return_405(api_client):
    """
    Verifica que ninguna variante de ruta DELETE (con o sin barra final, o con query param)
    genere 405 Method Not Allowed.
    """
    suffix = uuid.uuid4().hex[:6]
    # Crear tenant temporal
    reg_res = api_client.post("/api/v1/auth/register", json={
        "email": f"delete_test_{suffix}@test.es",
        "password": "PasswordTest2026!",
        "full_name": "Test Delete",
        "company_name": f"Test Delete {suffix} SL",
        "fiscal_id": f"B{uuid.uuid4().hex[:8].upper()}",
        "plan": "PROFESSIONAL",
    })
    tenant_id = reg_res.json()["tenant_id"]

    # Crear cliente 1 para probar DELETE sin slash
    c1_res = api_client.post("/api/v1/clients", json={
        "tenant_id": tenant_id,
        "name": "Cliente Slash 1",
        "fiscal_id": f"B{uuid.uuid4().hex[:8].upper()}",
    })
    c1_id = c1_res.json()["id"]

    # Crear cliente 2 para probar DELETE con slash
    c2_res = api_client.post("/api/v1/clients", json={
        "tenant_id": tenant_id,
        "name": "Cliente Slash 2",
        "fiscal_id": f"B{uuid.uuid4().hex[:8].upper()}",
    })
    c2_id = c2_res.json()["id"]

    # Crear cliente 3 para probar DELETE con query param
    c3_res = api_client.post("/api/v1/clients", json={
        "tenant_id": tenant_id,
        "name": "Cliente Query 3",
        "fiscal_id": f"B{uuid.uuid4().hex[:8].upper()}",
    })
    c3_id = c3_res.json()["id"]

    # 1. DELETE sin barra
    del1 = api_client.delete(f"/api/v1/clients/{c1_id}")
    assert del1.status_code == 200, f"DELETE sin barra falló: {del1.status_code}"
    assert del1.status_code != 405

    # 2. DELETE con barra
    del2 = api_client.delete(f"/api/v1/clients/{c2_id}/")
    assert del2.status_code == 200, f"DELETE con barra falló: {del2.status_code}"
    assert del2.status_code != 405

    # 3. DELETE con query parameter
    del3 = api_client.delete(f"/api/v1/clients?client_id={c3_id}")
    assert del3.status_code == 200, f"DELETE con query param falló: {del3.status_code}"
    assert del3.status_code != 405

