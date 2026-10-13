"""
Endpoints REST de FastAPI para Multi-Tenancy, Persistencia de Lotes y Trazabilidad Legal
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.repository import ReconciliationRepository
from src.services.batch_service import BatchReconciliationService

router = APIRouter(prefix="/v1", tags=["Multi-Tenancy & Batches"])


# --- DTOs Pydantic ---
class TenantCreateDTO(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "Despacho Asesoría Fiscal Pérez S.L."})
    fiscal_id: str = Field(..., json_schema_extra={"example": "B-12345678"})
    email: str = Field(..., json_schema_extra={"example": "contacto@asesoriaperez.com"})
    plan: str = Field("PROFESSIONAL", json_schema_extra={"example": "PROFESSIONAL"})


class TenantResponseDTO(BaseModel):
    id: str
    name: str
    fiscal_id: str
    email: str
    plan: str


class ClientCreateDTO(BaseModel):
    tenant_id: str
    name: str = Field(..., json_schema_extra={"example": "Iberia Retail Logistics S.L."})
    fiscal_id: str = Field(..., json_schema_extra={"example": "B-87654321"})
    default_erp: str = Field("A3", json_schema_extra={"example": "A3"})
    account_length: int = Field(9, json_schema_extra={"example": 9})
    bank_account_code: str = Field("572000001", json_schema_extra={"example": "572000001"})
    fee_account_code: str = Field("626000001", json_schema_extra={"example": "626000001"})


class ClientResponseDTO(BaseModel):
    id: str
    tenant_id: str
    name: str
    fiscal_id: str
    default_erp: str
    account_length: int
    bank_account_code: str
    fee_account_code: str


class ApproveTransactionDTO(BaseModel):
    approved_by: str = Field("auditor@gestoria.es", json_schema_extra={"example": "auditor@gestoria.es"})
    note: Optional[str] = Field(None, json_schema_extra={"example": "Conforme tras comprobación de albarán."})


# --- ENDPOINTS GESTORÍAS (TENANTS) ---
@router.post("/tenants", response_model=TenantResponseDTO, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreateDTO, db: Session = Depends(get_db)):
    existing = ReconciliationRepository.get_tenant_by_fiscal_id(db, payload.fiscal_id)
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un despacho con ese CIF.")
    tenant = ReconciliationRepository.create_tenant(
        db=db,
        name=payload.name,
        fiscal_id=payload.fiscal_id,
        email=payload.email,
        plan=payload.plan,
    )
    return TenantResponseDTO(
        id=tenant.id,
        name=tenant.name,
        fiscal_id=tenant.fiscal_id,
        email=tenant.email,
        plan=tenant.plan,
    )


@router.get("/tenants", response_model=List[TenantResponseDTO])
def list_tenants(db: Session = Depends(get_db)):
    tenants = ReconciliationRepository.list_tenants(db)
    return [
        TenantResponseDTO(
            id=t.id,
            name=t.name,
            fiscal_id=t.fiscal_id,
            email=t.email,
            plan=t.plan,
        )
        for t in tenants
    ]


# --- ENDPOINTS EMPRESAS CLIENTES ---
@router.post("/clients", response_model=ClientResponseDTO, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreateDTO, db: Session = Depends(get_db)):
    tenant = ReconciliationRepository.get_tenant(db, payload.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Despacho/Tenant no encontrado.")
    client = ReconciliationRepository.create_client(
        db=db,
        tenant_id=payload.tenant_id,
        name=payload.name,
        fiscal_id=payload.fiscal_id,
        default_erp=payload.default_erp,
        account_length=payload.account_length,
        bank_account_code=payload.bank_account_code,
        fee_account_code=payload.fee_account_code,
    )
    return ClientResponseDTO(
        id=client.id,
        tenant_id=client.tenant_id,
        name=client.name,
        fiscal_id=client.fiscal_id,
        default_erp=client.default_erp,
        account_length=client.account_length,
        bank_account_code=client.bank_account_code,
        fee_account_code=client.fee_account_code,
    )


@router.get("/clients", response_model=List[ClientResponseDTO])
def list_clients(tenant_id: str = Query(...), db: Session = Depends(get_db)):
    clients = ReconciliationRepository.list_clients_by_tenant(db, tenant_id)
    return [
        ClientResponseDTO(
            id=c.id,
            tenant_id=c.tenant_id,
            name=c.name,
            fiscal_id=c.fiscal_id,
            default_erp=c.default_erp,
            account_length=c.account_length,
            bank_account_code=c.bank_account_code,
            fee_account_code=c.fee_account_code,
        )
        for c in clients
    ]


# --- ENDPOINTS DE LOTES Y AUDITORÍA ---
@router.get("/batches")
def list_batches(
    client_id: str = Query(...),
    year: Optional[int] = Query(None),
    start_month: Optional[int] = Query(None),
    end_month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    batches = ReconciliationRepository.list_batches(
        db=db,
        client_id=client_id,
        period_year=year,
        start_month=start_month,
        end_month=end_month,
    )
    return [
        {
            "id": b.id,
            "period_year": b.period_year,
            "period_type": b.period_type,
            "start_month": b.start_month,
            "end_month": b.end_month,
            "status": b.status,
            "total_movements": b.total_movements,
            "total_volume_eur": b.total_volume_cents / 100.0,
            "green_count": b.green_count,
            "yellow_count": b.yellow_count,
            "red_count": b.red_count,
            "file_name": b.file_name,
            "file_hash_sha256": b.file_hash_sha256,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in batches
    ]


@router.get("/batches/{batch_id}")
def get_batch_details(batch_id: str, db: Session = Depends(get_db)):
    batch = ReconciliationRepository.get_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    transactions_data = []
    for tx in batch.transactions:
        journal_data = None
        if tx.journal_entry:
            import json
            journal_data = {
                "entry_number": tx.journal_entry.entry_number,
                "date": tx.journal_entry.date.isoformat(),
                "is_balanced": tx.journal_entry.is_balanced,
                "entry_hash_sha256": tx.journal_entry.entry_hash_sha256,
                "lines": json.loads(tx.journal_entry.lines_json),
            }

        transactions_data.append({
            "id": tx.id,
            "external_id": tx.external_id,
            "source": tx.source,
            "date": tx.operation_date.isoformat(),
            "value_date": tx.value_date.isoformat(),
            "concept": tx.concept,
            "net_amount_eur": tx.net_amount_cents / 100.0,
            "gross_amount_eur": tx.gross_amount_cents / 100.0,
            "fee_amount_eur": tx.fee_amount_cents / 100.0,
            "status": tx.status,
            "confidence_score": tx.confidence_score,
            "solver_used": tx.solver_used,
            "audit_explanation": tx.audit_explanation,
            "is_approved": tx.is_approved,
            "journal": journal_data,
        })

    return {
        "id": batch.id,
        "tenant_id": batch.tenant_id,
        "client_id": batch.client_id,
        "period_year": batch.period_year,
        "period_type": batch.period_type,
        "start_month": batch.start_month,
        "end_month": batch.end_month,
        "status": batch.status,
        "total_movements": batch.total_movements,
        "total_volume_eur": batch.total_volume_cents / 100.0,
        "green_count": batch.green_count,
        "yellow_count": batch.yellow_count,
        "red_count": batch.red_count,
        "file_name": batch.file_name,
        "file_hash_sha256": batch.file_hash_sha256,
        "transactions": transactions_data,
    }


@router.post("/batches/{batch_id}/approve/{tx_id}")
def approve_transaction(
    batch_id: str,
    tx_id: str,
    payload: ApproveTransactionDTO,
    db: Session = Depends(get_db),
):
    try:
        tx = ReconciliationRepository.approve_transaction(
            db=db,
            transaction_id=tx_id,
            approved_by=payload.approved_by,
            note=payload.note,
        )
        return {
            "status": "success",
            "message": f"Partida {tx_id} aprobada con éxito. Asiento PGC certificado.",
            "transaction_status": tx.status,
            "is_approved": tx.is_approved,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/batches/{batch_id}/approve-all-yellows")
def bulk_approve_yellows(
    batch_id: str,
    payload: ApproveTransactionDTO,
    db: Session = Depends(get_db),
):
    try:
        count = ReconciliationRepository.bulk_approve_yellows(
            db=db,
            batch_id=batch_id,
            approved_by=payload.approved_by,
        )
        return {
            "status": "success",
            "message": f"Se han aprobado {count} partidas amarillas en lote.",
            "approved_count": count,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/batches/{batch_id}/audit-trail")
def get_audit_trail(batch_id: str, db: Session = Depends(get_db)):
    batch = ReconciliationRepository.get_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    logs = ReconciliationRepository.get_audit_trail(db, batch.tenant_id, batch_id=batch_id)
    import json
    return {
        "batch_id": batch.id,
        "client_id": batch.client_id,
        "total_audit_events": len(logs),
        "chain": [
            {
                "id": l.id,
                "action": l.action,
                "actor": l.actor,
                "timestamp": l.timestamp.isoformat(),
                "prev_hash": l.prev_hash,
                "current_hash_sha256": l.current_hash_sha256,
                "details": json.loads(l.details_json) if l.details_json else {},
            }
            for l in logs
        ],
    }


@router.get("/batches/{batch_id}/export/{erp}")
def export_batch(
    batch_id: str,
    erp: str,
    actor: str = Query("auditor@gestoria.es"),
    db: Session = Depends(get_db),
):
    try:
        res = BatchReconciliationService.export_batch_to_erp(
            db=db,
            batch_id=batch_id,
            target_erp=erp,
            actor=actor,
        )
        headers = {
            "Content-Disposition": f"attachment; filename={res['filename']}",
        }
        return Response(
            content=res["content"],
            media_type=res["content_type"],
            headers=headers,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
