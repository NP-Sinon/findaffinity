"""
Endpoints REST de Autenticación, Registro y Perfil de Usuario (Auth API)
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.models import User, UserRole, Tenant
from src.auth.security import hash_password, verify_password, create_access_token
from src.auth.dependencies import get_current_user

router = APIRouter(prefix="/v1/auth", tags=["Autenticación & RBAC"])


class UserRegisterDTO(BaseModel):
    email: str = Field(..., json_schema_extra={"example": "auditor@konigpartners.es"})
    password: str = Field(..., min_length=6, json_schema_extra={"example": "AuditPass2026!"})
    full_name: str = Field(..., json_schema_extra={"example": "Carlos Méndez (Auditor Senior)"})
    tenant_id: Optional[str] = Field(None, json_schema_extra={"example": "tenant-uuid"})
    role: str = Field(UserRole.AUDITOR, json_schema_extra={"example": "AUDITOR"})


class UserLoginDTO(BaseModel):
    email: str = Field(..., json_schema_extra={"example": "auditor@konigpartners.es"})
    password: str = Field(..., json_schema_extra={"example": "AuditPass2026!"})


class UserResponseDTO(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    tenant_id: Optional[str]
    is_active: bool


class TokenResponseDTO(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponseDTO


@router.post("/register", response_model=UserResponseDTO, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegisterDTO, db: Session = Depends(get_db)):
    """Registra un nuevo usuario en la plataforma o despacho."""
    existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario registrado con este correo electrónico.",
        )

    # Validar tenant si se proporciona
    if payload.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == payload.tenant_id).first()
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El despacho (tenant) especificado no existe.",
            )

    role_upper = payload.role.upper()
    valid_roles = [UserRole.ADMIN, UserRole.AUDITOR, UserRole.VIEWER]
    if role_upper not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rol no válido: '{payload.role}'. Roles permitidos: {valid_roles}",
        )

    new_user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        tenant_id=payload.tenant_id,
        role=role_upper,
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
    return UserResponseDTO(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        is_active=current_user.is_active,
    )
