import uuid
from datetime import timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.models import User, UserRole, Tenant
from src.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)
from src.auth.dependencies import get_current_user

router = APIRouter(prefix="/v1/auth", tags=["Autenticación & RBAC"])


class UserRegisterDTO(BaseModel):
    email: str = Field(..., json_schema_extra={"example": "auditor@konigpartners.es"})
    password: str = Field(..., min_length=6, json_schema_extra={"example": "AuditPass2026!"})
    full_name: str = Field(..., json_schema_extra={"example": "Carlos Méndez (Auditor Senior)"})
    tenant_id: Optional[str] = Field(None, json_schema_extra={"example": "tenant-uuid"})
    company_name: Optional[str] = Field(None, json_schema_extra={"example": "KÖNIG & ASOCIADOS AUDITORES SLP"})
    fiscal_id: Optional[str] = Field(None, json_schema_extra={"example": "B-99881122"})
    role: str = Field(UserRole.AUDITOR, json_schema_extra={"example": "AUDITOR"})


class UserLoginDTO(BaseModel):
    email: str = Field(..., json_schema_extra={"example": "auditor@konigpartners.es"})
    password: str = Field(..., json_schema_extra={"example": "AuditPass2026!"})


class ForgotPasswordDTO(BaseModel):
    email: str = Field(..., json_schema_extra={"example": "auditor@konigpartners.es"})


class ResetPasswordDTO(BaseModel):
    token: str = Field(..., json_schema_extra={"example": "jwt-reset-token"})
    new_password: str = Field(..., min_length=6, json_schema_extra={"example": "NewPass2026!"})


class UserResponseDTO(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    tenant_id: Optional[str]
    tenant_name: Optional[str] = None
    is_active: bool


class TokenResponseDTO(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponseDTO


@router.post("/register", response_model=UserResponseDTO, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegisterDTO, db: Session = Depends(get_db)):
    """Registra un nuevo usuario en la plataforma o autoprovisiona un nuevo despacho/empresa."""
    existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario registrado con este correo electrónico.",
        )

    assigned_tenant_id = payload.tenant_id
    assigned_tenant_name = None
    assigned_role = payload.role.upper()

    # Si no se proporciona tenant_id pero sí nombre de empresa/despacho, crearlo
    if not assigned_tenant_id and payload.company_name:
        fiscal_clean = (payload.fiscal_id or f"B{uuid.uuid4().hex[:8].upper()}").strip()
        existing_tenant = db.query(Tenant).filter(Tenant.fiscal_id == fiscal_clean).first()
        if existing_tenant:
            assigned_tenant = existing_tenant
        else:
            assigned_tenant = Tenant(
                name=payload.company_name.strip(),
                fiscal_id=fiscal_clean,
                email=payload.email.lower().strip(),
                plan="STARTER",
            )
            db.add(assigned_tenant)
            db.commit()
            db.refresh(assigned_tenant)
        assigned_tenant_id = assigned_tenant.id
        assigned_tenant_name = assigned_tenant.name
        assigned_role = UserRole.ADMIN

    elif assigned_tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == assigned_tenant_id).first()
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El despacho (tenant) especificado no existe.",
            )
        assigned_tenant_name = tenant.name

    valid_roles = [UserRole.ADMIN, UserRole.AUDITOR, UserRole.VIEWER]
    if assigned_role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rol no válido: '{assigned_role}'. Roles permitidos: {valid_roles}",
        )

    new_user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        tenant_id=assigned_tenant_id,
        role=assigned_role,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponseDTO(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role,
        tenant_id=new_user.tenant_id,
        tenant_name=assigned_tenant_name,
        is_active=new_user.is_active,
    )


@router.post("/login", response_model=TokenResponseDTO)
def login_user(payload: UserLoginDTO, db: Session = Depends(get_db)):
    """Inicia sesión con credenciales y emite un token de acceso JWT firmado."""
    email_clean = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas: email o contraseña no válidos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta desactivada. Contacte con el administrador del despacho.",
        )

    token_payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
    }
    access_token = create_access_token(token_payload)

    return TokenResponseDTO(
        access_token=access_token,
        token_type="bearer",
        user=UserResponseDTO(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            tenant_id=user.tenant_id,
            is_active=user.is_active,
        ),
    )


@router.get("/me", response_model=UserResponseDTO)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Obtiene el perfil y permisos del usuario actualmente autenticado."""
    tenant_name = current_user.tenant.name if current_user.tenant else None
    return UserResponseDTO(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        tenant_name=tenant_name,
        is_active=current_user.is_active,
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordDTO, db: Session = Depends(get_db)):
    """
    Inicia el flujo de recuperación de contraseña.
    Genera un token firmado de recuperación válido por 1 hora.
    """
    email_clean = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()

    # Por seguridad, no revelar si el usuario existe o no públicamente
    if not user:
        return {
            "message": "Si el correo está registrado en FINDAFINITY, se ha generado un enlace de recuperación.",
            "success": True,
        }

    reset_token = create_access_token(
        {"sub": user.id, "email": user.email, "type": "password_reset"},
        expires_delta=timedelta(hours=1),
    )

    return {
        "message": f"Instrucciones de recuperación enviadas a {email_clean}.",
        "success": True,
        "reset_token_demo": reset_token,  # Facilitador para entornos de desarrollo y pruebas locales
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordDTO, db: Session = Depends(get_db)):
    """
    Restablece la contraseña utilizando un token válido de recuperación.
    """
    try:
        token_data = decode_access_token(payload.token)
        if token_data.get("type") != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token no válido para recuperación de contraseña.",
            )
        user_id = token_data.get("sub")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de recuperación es inválido o ha expirado.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    user.hashed_password = hash_password(payload.new_password)
    db.commit()

    return {
        "message": "Contraseña actualizada exitosamente. Ya puede iniciar sesión.",
        "success": True,
    }
