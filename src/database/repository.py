"""
Capa de Acceso a Datos (Repository Pattern) para FINDAFINITY
Operaciones CRUD tipadas, sellado criptográfico SHA-256 y trazabilidad legal.
"""
import hashlib
import json
from datetime import datetime, timezone, date
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from src.database.models import (
    Tenant,
    ClientCompany,
    ReconciliationBatch,
    BatchTransaction,
    JournalEntryRecord,
    AuditLog,
)


def compute_sha256(data: str) -> str:
    """Calcula el hash SHA-256 hexadecimal de una cadena."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_journal_entry_hash(entry_number: int, date_val: date, lines: list) -> str:
    """Calcula el hash inmutable de un asiento contable."""
    payload = {
        "entry_number": entry_number,
        "date": date_val.isoformat() if isinstance(date_val, date) else str(date_val),
        "lines": lines,
    }
    serialized = json.dumps(payload, sort_keys=True)
    return compute_sha256(serialized)


class ReconciliationRepository:
    """Repositorio unificado de persistencia para el sistema FINDAFINITY."""

    # -------------------------------------------------------------------------
    # GESTIÓN DE TENANTS Y EMPRESAS CLIENTES
    # -------------------------------------------------------------------------
    @staticmethod
    def create_tenant(
        db: Session,
        name: str,
        fiscal_id: str,
        email: str,
        plan: str = "PROFESSIONAL",
    ) -> Tenant:
        tenant = Tenant(name=name, fiscal_id=fiscal_id, email=email, plan=plan)
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        return tenant

    @staticmethod
    def get_tenant(db: Session, tenant_id: str) -> Optional[Tenant]:
        return db.query(Tenant).filter(Tenant.id == tenant_id).first()

    @staticmethod
    def get_tenant_by_fiscal_id(db: Session, fiscal_id: str) -> Optional[Tenant]:
        return db.query(Tenant).filter(Tenant.fiscal_id == fiscal_id).first()

    @staticmethod
    def list_tenants(db: Session) -> List[Tenant]:
        return db.query(Tenant).order_by(Tenant.name).all()

    @staticmethod
    def create_client(
        db: Session,
        tenant_id: str,
        name: str,
        fiscal_id: str,
        default_erp: str = "A3",
        account_length: int = 9,
        bank_account_code: str = "572000001",
        fee_account_code: str = "626000001",
    ) -> ClientCompany:
        client = ClientCompany(
            tenant_id=tenant_id,
            name=name,
            fiscal_id=fiscal_id,
            default_erp=default_erp,
            account_length=account_length,
            bank_account_code=bank_account_code,
            fee_account_code=fee_account_code,
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    @staticmethod
    def get_client(db: Session, client_id: str) -> Optional[ClientCompany]:
        return db.query(ClientCompany).filter(ClientCompany.id == client_id).first()

    @staticmethod
    def list_clients_by_tenant(db: Session, tenant_id: str) -> List[ClientCompany]:
        return db.query(ClientCompany).filter(ClientCompany.tenant_id == tenant_id).order_by(ClientCompany.name).all()

    # -------------------------------------------------------------------------
    # GESTIÓN DE LOTES (RECONCILIATION BATCHES)
    # -------------------------------------------------------------------------
    @staticmethod
    def create_batch(
        db: Session,
        tenant_id: str,
        client_id: str,
        period_year: int,
        period_type: str = "ALL",
        start_month: int = 1,
        end_month: int = 12,
        file_name: Optional[str] = None,
        file_hash_sha256: Optional[str] = None,
    ) -> ReconciliationBatch:
        batch = ReconciliationBatch(
            tenant_id=tenant_id,
            client_id=client_id,
            period_year=period_year,
            period_type=period_type,
            start_month=start_month,
            end_month=end_month,
            status="PROCESSED",
            file_name=file_name,
            file_hash_sha256=file_hash_sha256,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)

        # Registrar en el audit trail inmutable
        ReconciliationRepository.append_audit_log(
            db=db,
            tenant_id=tenant_id,
            client_id=client_id,
            batch_id=batch.id,
            action="BATCH_CREATED",
            actor="system",
            details={
                "batch_id": batch.id,
                "file_name": file_name,
                "period": f"{period_year} ({start_month}-{end_month})",
            },
        )
        return batch

    @staticmethod
    def get_batch(db: Session, batch_id: str) -> Optional[ReconciliationBatch]:
        return db.query(ReconciliationBatch).filter(ReconciliationBatch.id == batch_id).first()

    @staticmethod
    def list_batches(
        db: Session,
        client_id: str,
        period_year: Optional[int] = None,
        start_month: Optional[int] = None,
        end_month: Optional[int] = None,
    ) -> List[ReconciliationBatch]:
        query = db.query(ReconciliationBatch).filter(ReconciliationBatch.client_id == client_id)
        if period_year is not None:
            query = query.filter(ReconciliationBatch.period_year == period_year)
        if start_month is not None:
            query = query.filter(ReconciliationBatch.start_month >= start_month)
        if end_month is not None:
            query = query.filter(ReconciliationBatch.end_month <= end_month)
        return query.order_by(desc(ReconciliationBatch.created_at)).all()

    # -------------------------------------------------------------------------
    # GESTIÓN DE PARTIDAS Y ASIENTOS
    # -------------------------------------------------------------------------
    @staticmethod
    def add_transaction(
        db: Session,
        batch_id: str,
        external_id: str,
        source: str,
        operation_date: date,
        value_date: date,
        concept: str,
        net_amount_cents: int,
        gross_amount_cents: int,
        fee_amount_cents: int,
        status: str,
        confidence_score: float,
        dimensions: Optional[dict] = None,
        solver_used: Optional[str] = None,
        matched_count: int = 1,
        audit_explanation: Optional[str] = None,
    ) -> BatchTransaction:
        tx = BatchTransaction(
            batch_id=batch_id,
            external_id=external_id,
            source=source,
            operation_date=operation_date,
            value_date=value_date,
            concept=concept,
            net_amount_cents=net_amount_cents,
            gross_amount_cents=gross_amount_cents,
            fee_amount_cents=fee_amount_cents,
            status=status,
            confidence_score=confidence_score,
            dimensions_json=json.dumps(dimensions or {}),
            solver_used=solver_used,
            matched_count=matched_count,
            audit_explanation=audit_explanation,
            is_approved=(status == "GREEN"),
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    @staticmethod
    def add_journal_entry(
        db: Session,
        batch_id: str,
        transaction_id: str,
        entry_number: int,
        entry_date: date,
        total_debit_cents: int,
        total_credit_cents: int,
        lines: list,
        is_balanced: bool = True,
    ) -> JournalEntryRecord:
        imbalance_cents = abs(total_debit_cents - total_credit_cents)
        entry_hash = compute_journal_entry_hash(entry_number, entry_date, lines)

        record = JournalEntryRecord(
            batch_id=batch_id,
            transaction_id=transaction_id,
            entry_number=entry_number,
            date=entry_date,
            is_balanced=is_balanced,
            total_debit_cents=total_debit_cents,
            total_credit_cents=total_credit_cents,
            imbalance_cents=imbalance_cents,
            lines_json=json.dumps(lines),
            entry_hash_sha256=entry_hash,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def update_batch_statistics(db: Session, batch_id: str) -> ReconciliationBatch:
        """Recalcula las métricas estadísticas globales del lote."""
        batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.id == batch_id).first()
        if not batch:
            raise ValueError(f"Batch {batch_id} no encontrado.")

        txs = db.query(BatchTransaction).filter(BatchTransaction.batch_id == batch_id).all()
        green = sum(1 for t in txs if t.status == "GREEN")
        yellow = sum(1 for t in txs if t.status == "YELLOW")
        red = sum(1 for t in txs if t.status == "RED")
        total_vol = sum(t.net_amount_cents for t in txs)

        batch.total_movements = len(txs)
        batch.total_volume_cents = total_vol
        batch.green_count = green
        batch.yellow_count = yellow
        batch.red_count = red
        batch.imbalance_cents = 0  # Los asientos cuadrados son 0.00 €
        db.commit()
        db.refresh(batch)
        return batch

    # -------------------------------------------------------------------------
    # APROBACIÓN DE ASIENTOS Y TRAZABILIDAD (ZERO-LIABILITY)
    # -------------------------------------------------------------------------
    @staticmethod
    def approve_transaction(
        db: Session,
        transaction_id: str,
        approved_by: str = "auditor@gestoria.es",
        note: Optional[str] = None,
    ) -> BatchTransaction:
        tx = db.query(BatchTransaction).filter(BatchTransaction.id == transaction_id).first()
        if not tx:
            raise ValueError(f"Transaction {transaction_id} no encontrada.")

        now = datetime.now(timezone.utc)
        tx.status = "GREEN"
        tx.is_approved = True
        tx.approved_by = approved_by
        tx.approved_at = now
        if note:
            tx.audit_explanation = f"{tx.audit_explanation or ''} [Aprobación: {note}]"

        batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.id == tx.batch_id).first()
        db.commit()
        db.refresh(tx)

        # Actualizar contadores del lote
        ReconciliationRepository.update_batch_statistics(db, tx.batch_id)

        # Registrar en el audit trail inmutable
        if batch:
            ReconciliationRepository.append_audit_log(
                db=db,
                tenant_id=batch.tenant_id,
                client_id=batch.client_id,
                batch_id=batch.id,
                action="TRANSACTION_APPROVED",
                actor=approved_by,
                details={
                    "transaction_id": tx.id,
                    "external_id": tx.external_id,
                    "net_eur": tx.net_amount_cents / 100.0,
                    "note": note,
                },
            )
        return tx

    @staticmethod
    def bulk_approve_yellows(
        db: Session,
        batch_id: str,
        approved_by: str = "auditor@gestoria.es",
    ) -> int:
        batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.id == batch_id).first()
        if not batch:
            raise ValueError(f"Batch {batch_id} no encontrado.")

        yellows = db.query(BatchTransaction).filter(
            BatchTransaction.batch_id == batch_id,
            BatchTransaction.status == "YELLOW",
        ).all()

        now = datetime.now(timezone.utc)
        count = 0
        for tx in yellows:
            tx.status = "GREEN"
            tx.is_approved = True
            tx.approved_by = approved_by
            tx.approved_at = now
            tx.audit_explanation = f"{tx.audit_explanation or ''} [Aprobado en lote por Auditor]."
            count += 1

        db.commit()
        ReconciliationRepository.update_batch_statistics(db, batch_id)

        ReconciliationRepository.append_audit_log(
            db=db,
            tenant_id=batch.tenant_id,
            client_id=batch.client_id,
            batch_id=batch_id,
            action="BULK_APPROVED",
            actor=approved_by,
            details={"approved_count": count},
        )
        return count

    # -------------------------------------------------------------------------
    # AUDIT TRAIL LEGAL INMUTABLE (SHA-256 HASH CHAIN)
    # -------------------------------------------------------------------------
    @staticmethod
    def append_audit_log(
        db: Session,
        tenant_id: str,
        client_id: str,
        action: str,
        actor: str,
        details: dict,
        batch_id: Optional[str] = None,
    ) -> AuditLog:
        # Obtener el hash del último registro para mantener la cadena inmutable
        last_log = (
            db.query(AuditLog)
            .filter(AuditLog.tenant_id == tenant_id)
            .order_by(desc(AuditLog.timestamp))
            .first()
        )
        prev_hash = last_log.current_hash_sha256 if last_log else "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000"

        now = datetime.now(timezone.utc)
        details_str = json.dumps(details, sort_keys=True)
        chain_payload = f"{prev_hash}|{action}|{actor}|{now.isoformat()}|{details_str}"
        current_hash = compute_sha256(chain_payload)

        log = AuditLog(
            tenant_id=tenant_id,
            client_id=client_id,
            batch_id=batch_id,
            action=action,
            actor=actor,
            details_json=details_str,
            prev_hash=prev_hash,
            current_hash_sha256=current_hash,
            timestamp=now,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def get_audit_trail(db: Session, tenant_id: str, batch_id: Optional[str] = None) -> List[AuditLog]:
        query = db.query(AuditLog).filter(AuditLog.tenant_id == tenant_id)
        if batch_id:
            query = query.filter(AuditLog.batch_id == batch_id)
        return query.order_by(AuditLog.timestamp).all()
