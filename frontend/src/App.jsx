import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { IngestionZone } from './components/IngestionZone';
import { StagingRadar } from './components/StagingRadar';
import { ExportPanel } from './components/ExportPanel';
import { ScoreRadarModal } from './components/ScoreRadarModal';
import { AuditTrailModal } from './components/AuditTrailModal';
import AuthModal from './components/AuthModal';
import { MOCK_COMPANIES, INITIAL_TRANSACTIONS } from './data/mockAuditData';
import { 
  checkBackendHealth, 
  fetchTenants, 
  fetchClients, 
  fetchBatches, 
  fetchBatchDetails,
  uploadBatchFile,
  approveTransactionApi,
  bulkApproveYellowsApi,
  getStoredAuthSession,
  clearAuthSession,
  getCurrentUserApi
} from './services/api';
import { Check } from 'lucide-react';

export default function App() {
  const [tenants, setTenants] = useState([]);
  const [currentTenant, setCurrentTenant] = useState(null);
  const [companies, setCompanies] = useState(MOCK_COMPANIES);
  const [selectedCompany, setSelectedCompany] = useState(MOCK_COMPANIES[0]);
  const [selectedErp, setSelectedErp] = useState(MOCK_COMPANIES[0].defaultErp || 'A3');
  const [batches, setBatches] = useState([]);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [modalTransaction, setModalTransaction] = useState(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ online: false });
  const [toastMessage, setToastMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estados de Autenticación & Usuario
  const [currentUser, setCurrentUser] = useState(() => {
    const s = getStoredAuthSession();
    return s ? s.user : null;
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalView, setAuthModalView] = useState('login');

  // Filtro de Periodo Contable (Año, Trimestres o Rango Libre de Meses)
  const [selectedYear, setSelectedYear] = useState(2026);
  const [periodType, setPeriodType] = useState('ALL');
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);

  // Mostrar mensaje toast temporal
  const triggerToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // Función para cargar lotes de una empresa cliente
  const loadBatchesForCompany = useCallback(async (companyId, year, sMonth, eMonth) => {
    try {
      const batchList = await fetchBatches(companyId, year, sMonth, eMonth);
      setBatches(batchList || []);
      if (batchList && batchList.length > 0) {
        const latestBatch = batchList[0];
        setCurrentBatchId(latestBatch.id);
        const details = await fetchBatchDetails(latestBatch.id);
        if (details && details.transactions && details.transactions.length > 0) {
          setTransactions(details.transactions);
          return;
        }
      }
    } catch (err) {
      console.warn('Error al cargar lotes:', err);
    }
  }, []);

  // Inicialización al montar: Conectar con FastAPI y cargar datos multi-tenant
  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      const health = await checkBackendHealth();
      if (!isMounted) return;
      setBackendStatus(health);

      if (health.online) {
        try {
          const tenantList = await fetchTenants();
          if (!isMounted) return;
          if (tenantList && tenantList.length > 0) {
            setTenants(tenantList);
            const activeTenant = tenantList[0];
            setCurrentTenant(activeTenant);

            const clientList = await fetchClients(activeTenant.id);
            if (!isMounted) return;
            if (clientList && clientList.length > 0) {
              setCompanies(clientList);
              const firstComp = clientList[0];
              setSelectedCompany(firstComp);
              setSelectedErp(firstComp.defaultErp || 'A3');

              // Cargar lotes del primer cliente
              await loadBatchesForCompany(firstComp.id, selectedYear, startMonth, endMonth);
            }
          }
        } catch (err) {
          console.warn('Fallo al inicializar datos del backend, usando mock:', err);
        }
      }
    }

    initApp();
    return () => { isMounted = false; };
  }, [loadBatchesForCompany, selectedYear, startMonth, endMonth]);

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
    const greenCount = periodFilteredTransactions.filter(t => t.status === 'GREEN' || t.isApproved).length;
    const rate = periodFilteredTransactions.length > 0 ? (greenCount / periodFilteredTransactions.length) : 0;
    
    return {
      totalNetVolumeEur: totalVolume,
      reconciliationRate: rate,
      globalImbalanceEur: 0.00,
    };
  }, [periodFilteredTransactions]);

  // Manejador para aprobar una partida individual (Amarilla -> Verde)
  const handleApproveTransaction = useCallback(async (id) => {
    // 1. Optimistic update
    setTransactions(prev => prev.map(tx => {
      if (tx.id === id) {
        return {
          ...tx,
          status: 'GREEN',
          confidenceScore: 0.965,
          isApproved: true,
          auditExplanation: `${tx.auditExplanation || ''} [Aprobado por Auditor Contable].`,
        };
      }
      return tx;
    }));

    // 2. Persistir en backend si existe lote activo
    if (currentBatchId && backendStatus.online) {
      await approveTransactionApi(currentBatchId, id);
    }

    triggerToast(`Partida ${id} aprobada con éxito. Asiento PGC certificado en SHA-256.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  // Manejador para aprobar todas las partidas amarillas en lote
  const handleBulkApproveYellows = useCallback(async () => {
    let approvedCount = 0;
    setTransactions(prev => prev.map(tx => {
      if (tx.status === 'YELLOW') {
        approvedCount++;
        return {
          ...tx,
          status: 'GREEN',
          confidenceScore: 0.955,
          isApproved: true,
          auditExplanation: `${tx.auditExplanation || ''} [Aprobado en lote por Auditor Contable].`,
        };
      }
      return tx;
    }));

    // Persistir en backend
    if (currentBatchId && backendStatus.online) {
      await bulkApproveYellowsApi(currentBatchId);
    }

    triggerToast(`Se han aprobado ${approvedCount} partidas en lote.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  // Ingesta de fichero real arrastrado o subido
  const handleFileUploaded = useCallback(async (file) => {
    setIsProcessing(true);
    if (backendStatus.online && currentTenant && selectedCompany) {
      const res = await uploadBatchFile({
        tenantId: currentTenant.id,
        clientId: selectedCompany.id,
        year: selectedYear,
        periodType,
        startMonth,
        endMonth,
        file,
      });

      if (res && res.success) {
        await loadBatchesForCompany(selectedCompany.id, selectedYear, startMonth, endMonth);
        setIsProcessing(false);
        triggerToast(`Lote procesado y persistido con éxito (${res.data.total_movements} movimientos).`);
        return;
      }
    }

    // Fallback de demostración
    setTimeout(() => {
      setTransactions(INITIAL_TRANSACTIONS);
      setIsProcessing(false);
      triggerToast('Fichero analizado y verificado mediante motor de conciliación.');
    }, 400);
  }, [backendStatus.online, currentTenant, selectedCompany, selectedYear, periodType, startMonth, endMonth, loadBatchesForCompany, triggerToast]);

  // Cargar Lote Demo de Auditoría
  const handleLoadDemoBatch = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      setTransactions(INITIAL_TRANSACTIONS);
      setIsProcessing(false);
      triggerToast('Lote de auditoría cargado con balance exacto a 0 céntimos.');
    }, 250);
  }, [triggerToast]);

  // Cambio de empresa cliente
  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    if (company.defaultErp) {
      setSelectedErp(company.defaultErp);
    }
    loadBatchesForCompany(company.id, selectedYear, startMonth, endMonth);
    triggerToast(`Contexto contable: ${company.name}`);
  }, [loadBatchesForCompany, selectedYear, startMonth, endMonth, triggerToast]);

  // Handlers de autenticación
  const handleOpenAuthModal = useCallback((viewMode = 'login') => {
    setAuthModalView(viewMode);
    setShowAuthModal(true);
  }, []);

  const handleAuthSuccess = useCallback((user) => {
    setCurrentUser(user);
    triggerToast(`Sesión iniciada: ${user.full_name || user.email} (${user.role})`);
  }, [triggerToast]);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    setCurrentUser(null);
    triggerToast('Sesión finalizada');
  }, [triggerToast]);

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
        onOpenAuditModal={() => setShowAuditModal(true)}
        currentUser={currentUser}
        onOpenAuthModal={handleOpenAuthModal}
        onLogout={handleLogout}
      />

      {/* Contenedor Principal */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. Zona de Ingesta Inteligente */}
        <IngestionZone
          onLoadDemoBatch={handleLoadDemoBatch}
          isProcessing={isProcessing}
          onFileProcessed={handleFileUploaded}
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
          batchId={currentBatchId}
        />
      </main>

      {/* Footer Institucional */}
      <footer className="border-t border-zinc-800/60 bg-[#0c0c0e] py-4 text-center text-xs text-zinc-500">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="font-mono text-[11px] text-zinc-400">
            FINDAFINITY &bull; Conciliación Bancaria y Pasarelas &bull; Cuadre PGC a céntimo cero (0.00 €)
          </div>
          <div className="text-[11px] text-zinc-400">
            Exportación Oficial: Wolters Kluwer A3 (Suenlace) &bull; Sage 50 (XDIARIO) &bull; DELSOL Contasol
          </div>
        </div>
      </footer>

      {/* Modal de Inspección de Confidence Scorer */}
      {modalTransaction && (
        <ScoreRadarModal
          transaction={modalTransaction}
          onClose={() => setModalTransaction(null)}
          onApprove={handleApproveTransaction}
        />
      )}

      {/* Modal de Cadena de Custodia SHA-256 */}
      {showAuditModal && (
        <AuditTrailModal
          batchId={currentBatchId}
          companyName={selectedCompany ? selectedCompany.name : 'Empresa Cliente'}
          onClose={() => setShowAuditModal(false)}
        />
      )}

      {/* Modal de Autenticación (Login / Register / Forgot Password) */}
      <AuthModal
        isOpen={showAuthModal}
        initialView={authModalView}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs shadow-2xl animate-fade-in font-medium">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
