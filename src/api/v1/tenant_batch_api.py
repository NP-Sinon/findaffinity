"""
Endpoints REST de FastAPI para Multi-Tenancy, Persistencia de Lotes y Trazabilidad Legal
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status, File, UploadFile, Form
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.models import ClientCompany, ReconciliationBatch, BatchTransaction
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

    from src.billing.quota_manager import BillingQuotaManager, QuotaLimitExceeded
    try:
        BillingQuotaManager.assert_can_add_client(db, payload.tenant_id)
    except QuotaLimitExceeded as qe:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(qe))

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


@router.delete("/clients/{client_id}", status_code=status.HTTP_200_OK)
def delete_client(
    client_id: str,
    db: Session = Depends(get_db),
):
    """Elimina definitivamente una empresa cliente y todos sus lotes contables vinculados."""
    client = db.query(ClientCompany).filter(ClientCompany.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Empresa cliente no encontrada.")

    name = client.name
    fiscal_id = client.fiscal_id
    db.delete(client)
    db.commit()

    return {
        "success": True,
        "message": f"Empresa cliente '{name}' ({fiscal_id}) eliminada con éxito.",
        "deleted_client_id": client_id,
    }


@router.delete("/clients/{client_id}/", status_code=status.HTTP_200_OK, include_in_schema=False)
def delete_client_slash(client_id: str, db: Session = Depends(get_db)):
    return delete_client(client_id, db)


@router.delete("/clients", status_code=status.HTTP_200_OK, include_in_schema=False)
def delete_client_query(client_id: str = Query(...), db: Session = Depends(get_db)):
    return delete_client(client_id, db)


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


@router.post("/batches", status_code=status.HTTP_201_CREATED)
async def upload_and_process_batch(
    tenant_id: str = Form(...),
    client_id: str = Form(...),
    period_year: int = Form(2026),
    period_type: str = Form("ALL"),
    start_month: int = Form(1),
    end_month: int = Form(12),
    file: UploadFile = File(...),
    gateway_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Sube un fichero bancario o de pasarela, ejecuta el motor de conciliación y persiste el lote."""
    client = ReconciliationRepository.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Empresa cliente no encontrada.")

    file_bytes = await file.read()
    file_name = file.filename or "uploaded_file"

    import json
    from pathlib import Path
    from datetime import date
    from src.parsers.base import CanonicalInvoice, CanonicalBankTransaction, TransactionType
    from src.parsers.bank.norma43 import Norma43Parser
    from src.parsers.gateways.stripe import StripeParser
    from src.parsers.gateways.redsys import RedsysParser

    base_dir = Path(__file__).resolve().parent.parent.parent.parent
    inv_path = base_dir / "data" / "pilot" / "cartera_viva_facturas.json"
    open_invoices = []
    if inv_path.exists():
        with open(inv_path, "r", encoding="utf-8") as f:
            inv_data = json.load(f)
        for item in inv_data:
            y, m, d = item["issue_date"].split("-")
            open_invoices.append(
                CanonicalInvoice(
                    invoice_id=item["invoice_id"],
                    invoice_number=item["invoice_number"],
                    issue_date=date(int(y), int(m), int(d)),
                    due_date=date(int(y), int(m), int(d)),
                    customer_id=item["customer_id"],
                    customer_name=item["customer_name"],
                    gross_amount_cents=item["gross_amount_cents"],
                    customer_fiscal_id=item["customer_fiscal_id"],
                )
            )

    fn_lower = file_name.lower()
    bank_txs = []
    gw_txs = None
    resolved_gw = gateway_name or "Stripe"

    if fn_lower.endswith(".n43") or "norma" in fn_lower or file_bytes.startswith(b"11"):
        parse_res = Norma43Parser.parse_file(file_bytes)
        bank_txs = parse_res.canonical_transactions
        resolved_gw = "Norma43"
    elif "stripe" in fn_lower or b"Stripe" in file_bytes or b"Balance transaction" in file_bytes or b"Automatic payout" in file_bytes:
        resolved_gw = "Stripe"
        stripe_txs = StripeParser.parse_balance_transactions_csv(file_bytes)
        gw_txs = stripe_txs
        charges = [t for t in stripe_txs if t.type == "charge"]
        payouts = [t for t in stripe_txs if t.type == "payout"]
        exp_net = sum(c.gross_cents for c in charges) - sum(c.fee_cents for c in charges) if charges else 0
        payout_date = payouts[0].created_at.date() if payouts else date(period_year, start_month, 15)
        bank_txs = [
            CanonicalBankTransaction(
                transaction_id=f"BANCO-STRIPE-{period_year}{start_month:02d}",
                account_iban=client.bank_account_code,
                operation_date=payout_date,
                value_date=payout_date,
                transaction_type=TransactionType.DEPOSIT,
                amount_cents=exp_net,
                concept=f"LIQUIDACION STRIPE PAYOUT {period_year}-{start_month:02d}",
                payer_or_payee="Stripe Payments Europe",
            )
        ]
    elif "redsys" in fn_lower or b"Ds_Merchant" in file_bytes or b"Operacion" in file_bytes or b"Numero Pedido" in file_bytes:
        resolved_gw = "Redsys"
        redsys_ops = RedsysParser.parse_operations_csv(file_bytes)
        gw_txs = redsys_ops
        total_gross = sum(op.gross_amount_cents for op in redsys_ops)
        total_fees = sum(op.fee_cents for op in redsys_ops)
        exp_net = total_gross - total_fees
        op_date = redsys_ops[0].operation_date if redsys_ops else date(period_year, start_month, 15)
        bank_txs = [
            CanonicalBankTransaction(
                transaction_id=f"BANCO-REDSYS-{period_year}{start_month:02d}",
                account_iban=client.bank_account_code,
                operation_date=op_date,
                value_date=op_date,
                transaction_type=TransactionType.DEPOSIT,
                amount_cents=exp_net,
                concept=f"LIQUIDACION DIARIA TPV REDSYS {period_year}-{start_month:02d}",
                payer_or_payee="Redsys Servicios de Procesamiento",
            )
        ]
    else:
        parse_res = Norma43Parser.parse_file(file_bytes)
        bank_txs = parse_res.canonical_transactions
        resolved_gw = "Norma43"

    from src.billing.quota_manager import BillingQuotaManager, QuotaLimitExceeded
    try:
        BillingQuotaManager.assert_can_process_transactions(db, tenant_id, len(bank_txs))
    except QuotaLimitExceeded as qe:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(qe))

    batch = BatchReconciliationService.process_and_persist_batch(
        db=db,
        tenant_id=tenant_id,
        client_id=client_id,
        period_year=period_year,
        period_type=period_type,
        start_month=start_month,
        end_month=end_month,
        bank_transactions=bank_txs,
        open_invoices=open_invoices,
        file_name=file_name,
        file_bytes=file_bytes,
        gateway_name=resolved_gw,
        gateway_transactions=gw_txs,
    )

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
    }



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

        dimensions_data = None
        if tx.dimensions_json:
            import json
            try:
                dimensions_data = json.loads(tx.dimensions_json)
            except Exception:
                dimensions_data = None

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
            "dimensions": dimensions_data,
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


@router.delete("/batches/{batch_id}", status_code=status.HTTP_200_OK)
def delete_batch(batch_id: str, db: Session = Depends(get_db)):
    """Elimina definitivamente un lote de conciliación completo con todas sus partidas."""
    batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    db.delete(batch)
    db.commit()
    return {"success": True, "deleted_batch_id": batch_id}


@router.delete("/batches/{batch_id}/", status_code=status.HTTP_200_OK, include_in_schema=False)
def delete_batch_slash(batch_id: str, db: Session = Depends(get_db)):
    return delete_batch(batch_id, db)


@router.delete("/batches/{batch_id}/transactions/{tx_id}", status_code=status.HTTP_200_OK)
def delete_batch_transaction(batch_id: str, tx_id: str, db: Session = Depends(get_db)):
    """Elimina una partida individual dentro de un lote de conciliación."""
    tx = db.query(BatchTransaction).filter(
        BatchTransaction.id == tx_id,
        BatchTransaction.batch_id == batch_id,
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Partida no encontrada en este lote.")

    batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.id == batch_id).first()
    if batch:
        batch.total_movements = max(0, (batch.total_movements or 1) - 1)
        if tx.status == "GREEN":
            batch.green_count = max(0, (batch.green_count or 1) - 1)
        elif tx.status == "YELLOW":
            batch.yellow_count = max(0, (batch.yellow_count or 1) - 1)
        elif tx.status == "RED":
            batch.red_count = max(0, (batch.red_count or 1) - 1)

    db.delete(tx)
    db.commit()
    return {"success": True, "deleted_transaction_id": tx_id}


@router.delete("/batches/{batch_id}/transactions/{tx_id}/", status_code=status.HTTP_200_OK, include_in_schema=False)
def delete_batch_transaction_slash(batch_id: str, tx_id: str, db: Session = Depends(get_db)):
    return delete_batch_transaction(batch_id, tx_id, db)
