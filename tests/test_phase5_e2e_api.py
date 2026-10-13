"""
Test Suite para la Fase 5: Verificación End-to-End de la API REST FastAPI
Verifica:
1. Endpoint de estado y salud /health
2. Endpoint de ingesta /api/v1/ingest/norma43 con fichero real codificado en ISO-8859-15
3. Endpoint de desambiguación /api/v1/disambiguate/transfer
4. Endpoint de reconciliación algorítmica /api/v1/reconcile/batch-payout
5. Generación de ficheros auditados de pre-asientos en modo Solo Lectura
"""
from datetime import date
from fastapi.testclient import TestClient
import pytest

from src.main import app
from tests.test_phase1_ingestion import build_sample_norma43_text


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    """Verifica que el servicio esté operativo y en modo Solo Lectura."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["staging_mode"] == "read_only_zero_liability"


def test_api_ingest_norma43_file(client):
    """Verifica la subida de un extracto bancario Norma 43 codificado en ISO-8859-15."""
    n43_text = build_sample_norma43_text(include_special_chars=True)
    raw_bytes = n43_text.encode("iso-8859-15")

    response = client.post(
        "/api/v1/ingest/norma43",
        files={"file": ("extracto_octubre.n43", raw_bytes, "application/octet-stream")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is True
    assert data["detected_encoding"] in ("iso-8859-15", "windows-1252", "iso-8859-1")
    assert data["movements_count"] == 2
    assert len(data["validation_errors"]) == 0


def test_api_disambiguate_transfer(client):
    """Verifica la desambiguación de una transferencia bancaria española con Confidence Scorer."""
    payload = {
        "bank_amount_cents": 35000,           # 350.00 €
        "bank_date": "2026-10-14",
        "bank_concept": "TRANSF. DE: JUAN CARLOS GARCIA FRA 2026-88",
        "invoice_number": "2026-88",
        "invoice_amount_cents": 35000,       # 350.00 €
        "invoice_due_date": "2026-10-14",
        "customer_name": "GARCIA JUAN CARLOS",
        "customer_fiscal_id": "12345678Z",
    }

    response = client.post("/api/v1/disambiguate/transfer", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "GREEN"
    assert data["confidence_score"] >= 0.95
    assert data["invoice_number_match"] is True


def test_api_reconcile_batch_payout(client):
    """Verifica la conciliación de liquidación agrupada mediante endpoint REST."""
    # Liquidación bancaria neta teórica: 98.25 € + 96.28 € = 194.53 € (19453 céntimos)
    payout_req = {
        "payout_amount_cents": 19453,
        "payout_date": "2026-10-14",
        "bank_account_iban": "ES0000491234001234567890",
        "gateway_id": "stripe",
        "company_id": "COMP-001",
        "bank_account_code": "572000001",
        "fee_account_code": "626000001",
    }

    invoices_payload = [
        {
            "invoice_id": "I-01",
            "invoice_number": "F-01",
            "issue_date": "2026-10-12",
            "due_date": "2026-10-12",
            "customer_id": "C-1",
            "customer_name": "Cliente A",
            "gross_amount_cents": 10000,
            "gateway_id": "stripe",
        },
        {
            "invoice_id": "I-02",
            "invoice_number": "F-02",
            "issue_date": "2026-10-13",
            "due_date": "2026-10-13",
            "customer_id": "C-2",
            "customer_name": "Cliente B",
            "gross_amount_cents": 9800,
            "gateway_id": "stripe",
        },
    ]

    response = client.post(
        "/api/v1/reconcile/batch-payout",
        json={"req": payout_req, "invoices": invoices_payload},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_reconciled"] is True
    assert data["is_balanced"] is True
    assert set(data["matched_invoice_ids"]) == {"I-01", "I-02"}
    assert len(data["journal_lines"]) >= 3
    # Comprobar que suma de Debe == Haber
    total_debit = sum(line["debit_eur"] for line in data["journal_lines"])
    total_credit = sum(line["credit_eur"] for line in data["journal_lines"])
    assert round(total_debit, 2) == round(total_credit, 2)
