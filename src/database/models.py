"""
Modelos Relacionales SQLAlchemy 2.0 para FINDAFINITY
Arquitectura Multi-Inquilino (Despacho / Empresa Cliente), Lotes de Conciliación,
Asientos Certificados y Registro Legal Inmutable (Audit Trail con Hashes SHA-256).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    Float,
    Boolean,
    Date,
    DateTime,
    Text,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from src.database.connection import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Tenant(Base):
    """Despacho Profesional / Gestoría Contable (Inquilino Principal)."""
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(120), nullable=False)
    fiscal_id = Column(String(20), nullable=False, unique=True, index=True)
    email = Column(String(120), nullable=False)
    plan = Column(String(50), default="PROFESSIONAL", nullable=False)
    extra_blocks = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relaciones
    clients = relationship("ClientCompany", back_populates="tenant", cascade="all, delete-orphan")
    batches = relationship("ReconciliationBatch", back_populates="tenant")
    audit_logs = relationship("AuditLog", back_populates="tenant")
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tenant id={self.id} name='{self.name}' fiscal_id='{self.fiscal_id}'>"


class UserRole:
    SUPERADMIN = "SUPERADMIN"  # Administrador Global / Plataforma FINDAFINITY
    ADMIN = "ADMIN"            # Socio / Administrador del despacho
    AUDITOR = "AUDITOR"        # Contable / Auditor (conciliación y aprobación)
    VIEWER = "VIEWER"          # Cliente Pyme / Consulta solo lectura


class User(Base):
    """Usuario del Sistema con Control de Acceso por Roles (RBAC)."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    email = Column(String(120), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=False)
    role = Column(String(30), default=UserRole.AUDITOR, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relación
    tenant = relationship("Tenant", back_populates="users")

    def __repr__(self):
        return f"<User id={self.id} email='{self.email}' role='{self.role}'>"


class ClientCompany(Base):
    """Empresa Cliente del Despacho (Multi-Tenancy Secundario)."""
    __tablename__ = "client_companies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    fiscal_id = Column(String(20), nullable=False, index=True)
    default_erp = Column(String(20), default="A3", nullable=False)  # A3 | SAGE | CONTASOL
    account_length = Column(Integer, default=9, nullable=False)
    bank_account_code = Column(String(20), default="572000001", nullable=False)
    fee_account_code = Column(String(20), default="626000001", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relaciones
    tenant = relationship("Tenant", back_populates="clients")
    batches = relationship("ReconciliationBatch", back_populates="client", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="client")

    __table_args__ = (
        Index("ix_tenant_fiscal_id", "tenant_id", "fiscal_id", unique=True),
    )

    def __repr__(self):
        return f"<ClientCompany id={self.id} name='{self.name}' fiscal_id='{self.fiscal_id}'>"


class ReconciliationBatch(Base):
    """Lote Histórico de Conciliación y Staging de Asientos."""
    __tablename__ = "reconciliation_batches"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    client_id = Column(String(36), ForeignKey("client_companies.id"), nullable=False, index=True)
    period_year = Column(Integer, nullable=False, index=True)
    period_type = Column(String(20), default="ALL", nullable=False)  # ALL | Q1 | Q2 | Q3 | Q4 | CUSTOM
    start_month = Column(Integer, default=1, nullable=False)
    end_month = Column(Integer, default=12, nullable=False)
    status = Column(String(30), default="PROCESSED", nullable=False)  # PROCESSED | REVIEW_PENDING | APPROVED | EXPORTED
    total_movements = Column(Integer, default=0, nullable=False)
    total_volume_cents = Column(BigInteger, default=0, nullable=False)
    green_count = Column(Integer, default=0, nullable=False)
    yellow_count = Column(Integer, default=0, nullable=False)
    red_count = Column(Integer, default=0, nullable=False)
    imbalance_cents = Column(BigInteger, default=0, nullable=False)
    file_name = Column(String(255), nullable=True)
    file_hash_sha256 = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    tenant = relationship("Tenant", back_populates="batches")
    client = relationship("ClientCompany", back_populates="batches")
    transactions = relationship("BatchTransaction", back_populates="batch", cascade="all, delete-orphan")
    journal_entries = relationship("JournalEntryRecord", back_populates="batch", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="batch")

    def __repr__(self):
        return f"<ReconciliationBatch id={self.id} year={self.period_year} movements={self.total_movements}>"


class BatchTransaction(Base):
    """Partida Bancaria o de Pasarela dentro de un Lote de Conciliación."""
    __tablename__ = "batch_transactions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    batch_id = Column(String(36), ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    external_id = Column(String(80), nullable=True, index=True)
    source = Column(String(80), nullable=False)
    operation_date = Column(Date, nullable=False, index=True)
    value_date = Column(Date, nullable=False)
    concept = Column(Text, nullable=False)
    net_amount_cents = Column(BigInteger, nullable=False)
    gross_amount_cents = Column(BigInteger, nullable=False)
    fee_amount_cents = Column(BigInteger, default=0, nullable=False)
    status = Column(String(10), default="GREEN", nullable=False, index=True)  # GREEN | YELLOW | RED
    confidence_score = Column(Float, default=1.0, nullable=False)
    dimensions_json = Column(Text, nullable=True)  # JSON {s_importe, s_fecha, s_texto, s_fiscal}
    solver_used = Column(String(80), nullable=True)
    matched_count = Column(Integer, default=1, nullable=False)
    audit_explanation = Column(Text, nullable=True)
    is_approved = Column(Boolean, default=False, nullable=False)
    approved_by = Column(String(120), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    batch = relationship("ReconciliationBatch", back_populates="transactions")
    journal_entry = relationship("JournalEntryRecord", back_populates="transaction", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<BatchTransaction id={self.id} ext={self.external_id} net={self.net_amount_cents/100}€ status={self.status}>"


class JournalEntryRecord(Base):
    """Pre-Asiento Contable de Partida Doble PGC Certificado."""
    __tablename__ = "journal_entry_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    batch_id = Column(String(36), ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_id = Column(String(36), ForeignKey("batch_transactions.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_number = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    is_balanced = Column(Boolean, default=True, nullable=False)
    total_debit_cents = Column(BigInteger, nullable=False)
    total_credit_cents = Column(BigInteger, nullable=False)
    imbalance_cents = Column(BigInteger, default=0, nullable=False)
    lines_json = Column(Text, nullable=False)  # JSON de líneas contables
    entry_hash_sha256 = Column(String(64), nullable=False)  # Hash de inmutabilidad del asiento
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relaciones
    batch = relationship("ReconciliationBatch", back_populates="journal_entries")
    transaction = relationship("BatchTransaction", back_populates="journal_entry")

    def __repr__(self):
        return f"<JournalEntryRecord id={self.id} num={self.entry_number} balanced={self.is_balanced}>"


class AuditLog(Base):
    """Trazabilidad Legal Inmutable (Tamper-Proof Audit Trail con SHA-256)."""
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    client_id = Column(String(36), ForeignKey("client_companies.id"), nullable=False, index=True)
    batch_id = Column(String(36), ForeignKey("reconciliation_batches.id"), nullable=True, index=True)
    action = Column(String(50), nullable=False, index=True)
    actor = Column(String(120), nullable=False)
    details_json = Column(Text, nullable=True)
    prev_hash = Column(String(64), nullable=True)
    current_hash_sha256 = Column(String(64), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    # Relaciones
    tenant = relationship("Tenant", back_populates="audit_logs")
    client = relationship("ClientCompany", back_populates="audit_logs")
    batch = relationship("ReconciliationBatch", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog id={self.id} action='{self.action}' actor='{self.actor}' ts={self.timestamp}>"
