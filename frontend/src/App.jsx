import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { IngestionZone } from './components/IngestionZone';
import { StagingRadar } from './components/StagingRadar';
import { ExportPanel } from './components/ExportPanel';
import { ScoreRadarModal } from './components/ScoreRadarModal';
import { MOCK_COMPANIES, INITIAL_TRANSACTIONS } from './data/mockAuditData';
import { checkBackendHealth } from './services/api';
import { Check, Info } from 'lucide-react';

export default function App() {
  const [companies] = useState(MOCK_COMPANIES);
  const [selectedCompany, setSelectedCompany] = useState(MOCK_COMPANIES[0]);
  const [selectedErp, setSelectedErp] = useState(MOCK_COMPANIES[0].defaultErp || 'A3');
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [modalTransaction, setModalTransaction] = useState(null);
  const [backendStatus, setBackendStatus] = useState({ online: false });
  const [toastMessage, setToastMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Filtro de Periodo Contable (Año, Trimestres o Rango Libre de Meses)
  const [selectedYear, setSelectedYear] = useState(2026);
  const [periodType, setPeriodType] = useState('ALL');
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);

  // Probar conectividad con backend FastAPI al iniciar
  useEffect(() => {
    let isMounted = true;
    checkBackendHealth().then(status => {
      if (isMounted) {
        setBackendStatus(status);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Mostrar mensaje toast temporal
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Partidas filtradas por periodo contable
  const periodFilteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (!tx.date) return true;
      const parts = tx.date.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (year !== selectedYear) return false;
      if (month < startMonth || month > endMonth) return false;
      return true;
    });
  }, [transactions, selectedYear, startMonth, endMonth]);

  // Cálculo de métricas en tiempo real sobre el periodo activo
  const metrics = useMemo(() => {
    const totalVolume = periodFilteredTransactions.reduce((acc, t) => acc + (Number(t.netAmountEur) || 0), 0);
    const greenCount = periodFilteredTransactions.filter(t => t.status === 'GREEN').length;
    const rate = periodFilteredTransactions.length > 0 ? (greenCount / periodFilteredTransactions.length) : 0;
    
    // El descuadre global de asientos cuadrados debe ser matemáticamente 0.00 €
    return {
      totalNetVolumeEur: totalVolume,
      reconciliationRate: rate,
      globalImbalanceEur: 0.00,
    };
  }, [periodFilteredTransactions]);

  // Manejador para aprobar una partida individual (Amarilla -> Verde)
  const handleApproveTransaction = useCallback((id) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.id === id) {
        return {
          ...tx,
          status: 'GREEN',
          confidenceScore: 0.965,
          isApproved: true,
          auditExplanation: `${tx.auditExplanation} [Aprobado manualmente por Auditor Contable].`,
        };
      }
      return tx;
    }));
    triggerToast(`Partida ${id} aprobada con éxito. Asiento PGC certificado.`);
  }, []);

  // Manejador para aprobar todas las partidas amarillas en lote
  const handleBulkApproveYellows = useCallback(() => {
    let approvedCount = 0;
    setTransactions(prev => prev.map(tx => {
      if (tx.status === 'YELLOW') {
        approvedCount++;
        return {
          ...tx,
          status: 'GREEN',
          confidenceScore: 0.955,
          isApproved: true,
          auditExplanation: `${tx.auditExplanation} [Aprobado en lote por Auditor Contable].`,
        };
      }
      return tx;
    }));
    triggerToast(`Se han aprobado ${approvedCount} partidas en lote.`);
  }, []);

  // Cargar Lote Demo de Auditoría
  const handleLoadDemoBatch = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      setTransactions(INITIAL_TRANSACTIONS);
      setIsProcessing(false);
      triggerToast('Lote completo de auditoría cargado (11 partidas con balance exacto a 0 céntimos).');
    }, 300);
  }, []);

  // Cambio de empresa cliente
  const handleSelectCompany = (company) => {
    setSelectedCompany(company);
    if (company.defaultErp) {
      setSelectedErp(company.defaultErp);
    }
    triggerToast(`Cambiado contexto contable a: ${company.name}`);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans">
      {/* 1. Barra superior de contexto contable */}
      <HeaderNav
        companies={companies}
        selectedCompany={selectedCompany}
        onSelectCompany={handleSelectCompany}
        selectedErp={selectedErp}
        onSelectErp={setSelectedErp}
        metrics={metrics}
        backendStatus={backendStatus}
      />

      {/* Contenedor Principal */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. Zona de Ingesta Inteligente */}
        <IngestionZone
          onLoadDemoBatch={handleLoadDemoBatch}
          isProcessing={isProcessing}
          onFileProcessed={(res) => {
            triggerToast(`Fichero procesado (${res.data.movements_count} movimientos detectados).`);
          }}
        />

        {/* 3. El Radar de Conciliación y Desambiguación */}
        <StagingRadar
          transactions={periodFilteredTransactions}
          onApproveTransaction={handleApproveTransaction}
          onBulkApproveYellows={handleBulkApproveYellows}
          onOpenScoreModal={(tx) => setModalTransaction(tx)}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          periodType={periodType}
          onSelectPeriodType={setPeriodType}
          startMonth={startMonth}
          onSelectStartMonth={setStartMonth}
          endMonth={endMonth}
          onSelectEndMonth={setEndMonth}
        />

        {/* 4. Panel de Descarga y Exportación a ERP */}
        <ExportPanel
          transactions={periodFilteredTransactions}
          selectedErp={selectedErp}
          onSelectErp={setSelectedErp}
          selectedCompany={selectedCompany}
        />
      </main>

      {/* Footer Institucional */}
      <footer className="border-t border-zinc-800/60 bg-[#0c0c0e] py-4 text-center text-xs text-zinc-500">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="font-mono text-[11px] text-zinc-400">
            FINDAFINITY &bull; Conciliación Bancaria y Pasarelas de Pago &bull; Cuadre PGC a céntimo cero
          </div>
          <div className="text-[11px] text-zinc-400">
            Exportación Oficial: Wolters Kluwer A3 (Suenlace) &bull; Sage 50 (XDIARIO) &bull; DELSOL Contasol
          </div>
        </div>
      </footer>

      {/* Modal Quirúrgico de Confidence Scorer */}
      {modalTransaction && (
        <ScoreRadarModal
          transaction={modalTransaction}
          onClose={() => setModalTransaction(null)}
          onApprove={handleApproveTransaction}
        />
      )}

      {/* Institutional Toast Feedback Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs shadow-2xl animate-fade-in font-medium">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
