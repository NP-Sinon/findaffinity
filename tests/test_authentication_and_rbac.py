"""
Test Suite: Módulo de Autenticación JWT y Control de Acceso Basado en Roles (RBAC)
Verifica hashing seguro PBKDF2, emisión de tokens JWT, login, protección de rutas y aislamiento multi-tenant.
"""
import pytest
from datetime import timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from fastapi import Depends, HTTPException

from src.main import app
from src.database.connection import Base, get_db
from src.database.models import User, UserRole, Tenant
from src.database.repository import ReconciliationRepository
from src.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)
from src.auth.dependencies import get_current_user, require_roles, assert_tenant_access

TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=TEST_ENGINE)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def client_api(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_password_hashing_and_verification():
    """Verifica que el hashing PBKDF2 HMAC-SHA256 sea criptográficamente seguro y con salt aleatorio."""
    pwd = "AuditSecretPassword2026!"
    hashed1 = hash_password(pwd)
    hashed2 = hash_password(pwd)

    # Dos hashes con la misma clave deben ser distintos debido al salt aleatorio
    assert hashed1 != hashed2
    assert ":" in hashed1
    assert verify_password(pwd, hashed1) is True
    assert verify_password(pwd, hashed2) is True
    assert verify_password("WrongPassword123", hashed1) is False


def test_jwt_creation_and_decoding():
    """Verifica la generación y decodificación de tokens JWT con claims y expiración."""
    data = {
        "sub": "user-uuid-123",
        "email": "auditor@konigpartners.es",
        "role": UserRole.AUDITOR,
        "tenant_id": "tenant-uuid-456",
    }
    token = create_access_token(data, expires_delta=timedelta(minutes=60))
    assert isinstance(token, str)

    payload = decode_access_token(token)
    assert payload["sub"] == "user-uuid-123"
    assert payload["email"] == "auditor@konigpartners.es"
    assert payload["role"] == UserRole.AUDITOR
    assert payload["tenant_id"] == "tenant-uuid-456"
    assert "exp" in payload


def test_user_registration_and_duplicate_prevention(client_api, db_session):
    """Verifica el endpoint POST /api/v1/auth/register y la prevención de duplicados."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="König Partners SLP",
        fiscal_id="B-99881122",
        email="info@konig.es",
    )

    # Registro exitoso
    res = client_api.post(
        "/api/v1/auth/register",
        json={
            "email": "carlos.auditor@konig.es",
            "password": "PasswordSegura123!",
            "full_name": "Carlos Méndez",
            "tenant_id": tenant.id,
            "role": "AUDITOR",
        },
    )
    assert res.status_code == 201
    user_data = res.json()
    assert user_data["email"] == "carlos.auditor@konig.es"
    assert user_data["role"] == "AUDITOR"
    assert user_data["tenant_id"] == tenant.id

    # Intento de registro duplicado con el mismo correo debe ser 400 Bad Request
    res_dup = client_api.post(
        "/api/v1/auth/register",
        json={
            "email": "carlos.auditor@konig.es",
            "password": "PasswordSegura123!",
            "full_name": "Carlos Duplicado",
            "tenant_id": tenant.id,
            "role": "AUDITOR",
        },
    )
    assert res_dup.status_code == 400
    assert "Ya existe un usuario" in res_dup.json()["detail"]


def test_user_login_and_auth_me_endpoint(client_api, db_session):
    """Verifica el flujo de Login y consulta de perfil /me con cabecera Bearer."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Despacho Contable Sur SLP",
        fiscal_id="B-11223344",
        email="sur@despacho.es",
    )

    # Registrar usuario
    client_api.post(
        "/api/v1/auth/register",
        json={
            "email": "laura.socia@despacho.es",
            "password": "AdminPassword2026!",
            "full_name": "Laura Gómez",
            "tenant_id": tenant.id,
            "role": "ADMIN",
        },
    )

    # Login con contraseña errónea debe devolver 401 Unauthorized
    res_bad = client_api.post(
        "/api/v1/auth/login",
        json={
            "email": "laura.socia@despacho.es",
            "password": "PasswordIncorrecta",
        },
    )
    assert res_bad.status_code == 401

    # Login exitoso
    res_ok = client_api.post(
        "/api/v1/auth/login",
        json={
            "email": "laura.socia@despacho.es",
            "password": "AdminPassword2026!",
        },
    )
    assert res_ok.status_code == 200
    token_data = res_ok.json()
    token = token_data["access_token"]
    assert token_data["token_type"] == "bearer"
    assert token_data["user"]["role"] == "ADMIN"

    # Consultar /api/v1/auth/me con el token emitido
    res_me = client_api.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_me.status_code == 200
    profile = res_me.json()
    assert profile["email"] == "laura.socia@despacho.es"
    assert profile["role"] == "ADMIN"
    assert profile["tenant_id"] == tenant.id


def test_rbac_role_enforcement_and_isolation(db_session):
    """Verifica que las funciones de RBAC y aislamiento multi-tenant restrinjan permisos correctamente."""
    t1 = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Despacho 1",
        fiscal_id="B-11111111",
        email="d1@despacho.es",
    )
    t2 = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Despacho 2",
        fiscal_id="B-22222222",
        email="d2@despacho.es",
    )

    user_admin = User(
        email="admin@d1.es",
        hashed_password="hash",
        full_name="Admin D1",
        tenant_id=t1.id,
        role=UserRole.ADMIN,
    )
    user_auditor = User(
        email="auditor@d1.es",
        hashed_password="hash",
        full_name="Auditor D1",
        tenant_id=t1.id,
        role=UserRole.AUDITOR,
    )

    # 1. Verificar require_roles
    admin_checker = require_roles([UserRole.ADMIN])
    assert admin_checker(user_admin) == user_admin

    # Un auditor intentando acceder a ruta de ADMIN recibe 403
    with pytest.raises(HTTPException) as exc_role:
        admin_checker(user_auditor)
    assert exc_role.value.status_code == 403
    assert "Permisos insuficientes" in exc_role.value.detail

    # 2. Verificar aislamiento multi-tenant
    assert_tenant_access(t1.id, user_admin)  # Pertenece a t1 -> OK

    # Intentar acceder a t2 siendo usuario de t1 recibe 403
    with pytest.raises(HTTPException) as exc_tenant:
        assert_tenant_access(t2.id, user_admin)
    assert exc_tenant.value.status_code == 403
    assert "Acceso denegado" in exc_tenant.value.detail
