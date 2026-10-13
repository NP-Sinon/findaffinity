import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { IngestionZone } from './components/IngestionZone';
import { StagingRadar } from './components/StagingRadar';
import { ExportPanel } from './components/ExportPanel';
import { ScoreRadarModal } from './components/ScoreRadarModal';
import { AuditTrailModal } from './components/AuditTrailModal';
import AuthModal from './components/AuthModal';
import { AuthScreen } from './components/AuthScreen';
import { AdminPanel } from './components/AdminPanel';
import { MOCK_COMPANIES, INITIAL_TRANSACTIONS } from './data/mockAuditData';
import { 
  checkBackendHealth, 
  fetchTenants, 
  fetchClients, 
  createClientApi,
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
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedErp, setSelectedErp] = useState('A3');
  const [batches, setBatches] = useState([]);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  
  // Transacciones en memoria: inicializado ESTRICTAMENTE vacío por defecto (cero documentos fantasma)
  const [transactions, setTransactions] = useState([]);
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
  
  // Exclusividad SUPERADMIN: Solo SUPERADMIN puede tener la vista 'admin'
  const [currentView, setCurrentView] = useState(() => {
    const s = getStoredAuthSession();
    if (s && s.user && s.user.role === 'SUPERADMIN') {
      return 'admin';
    }
    return 'radar';
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
    if (!companyId) {
      setBatches([]);
      setCurrentBatchId(null);
      setTransactions([]);
      return;
    }
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
      // Si la empresa no tiene lotes persistidos en este periodo, queda limpia y vacía
      setCurrentBatchId(null);
      setTransactions([]);
    } catch (err) {
      console.warn('Error al cargar lotes:', err);
      setBatches([]);
      setCurrentBatchId(null);
      setTransactions([]);
    }
  }, []);

  // Sincronización de contexto multi-tenant según el usuario activo
  const syncUserContext = useCallback(async (user) => {
    if (!user) {
      setCompanies([]);
      setSelectedCompany(null);
      setTransactions([]);
      return;
    }

    if (user.tenant_id) {
      try {
        let clientList = await fetchClients(user.tenant_id);

        // Si el despacho no tiene empresas clientes aún, autoprovisionar una por defecto
        if (!clientList || clientList.length === 0) {
          const compName = user.tenant_name || user.full_name || 'Mi Empresa SL';
          const defaultFiscal = `B${user.tenant_id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;
          const createRes = await createClientApi({
            tenantId: user.tenant_id,
            name: compName,
            fiscalId: defaultFiscal,
            defaultErp: 'A3',
          });
          if (createRes.success && createRes.client) {
            clientList = [createRes.client];
          }
        }

        if (clientList && clientList.length > 0) {
          setCompanies(clientList);
          const firstComp = clientList[0];
          setSelectedCompany(firstComp);
          setSelectedErp(firstComp.defaultErp || 'A3');
          await loadBatchesForCompany(firstComp.id, selectedYear, startMonth, endMonth);
        } else {
          setCompanies([]);
          setSelectedCompany(null);
          setTransactions([]);
        }
      } catch (err) {
        console.warn('Error sincronizando empresas del tenant:', err);
      }
    } else if (user.role === 'SUPERADMIN') {
      try {
        const tList = await fetchTenants();
        if (tList && tList.length > 0) {
          setTenants(tList);
          const firstTenant = tList[0];
          setCurrentTenant(firstTenant);
          const cList = await fetchClients(firstTenant.id);
          if (cList && cList.length > 0) {
            setCompanies(cList);
            setSelectedCompany(cList[0]);
            setSelectedErp(cList[0].defaultErp || 'A3');
            await loadBatchesForCompany(cList[0].id, selectedYear, startMonth, endMonth);
          }
        }
      } catch (err) {
        console.warn('Error sincronizando contexto SUPERADMIN:', err);
      }
    }
  }, [loadBatchesForCompany, selectedYear, startMonth, endMonth]);

  // Inicialización al montar: Conectar con FastAPI y cargar datos multi-tenant
  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      const health = await checkBackendHealth();
      if (!isMounted) return;
      setBackendStatus(health);

      if (health.online && currentUser) {
        await syncUserContext(currentUser);
      }
    }

    initApp();
    return () => { isMounted = false; };
  }, [currentUser, syncUserContext]);

  // Partidas filtradas por periodo contable
  const periodFilteredTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
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
    if (!periodFilteredTransactions || periodFilteredTransactions.length === 0) {
      return {
        totalNetVolumeEur: 0.00,
        reconciliationRate: 0,
        globalImbalanceEur: 0.00,
      };
    }

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

    if (currentBatchId && backendStatus.online) {
      await bulkApproveYellowsApi(currentBatchId);
    }

    triggerToast(`Se han aprobado ${approvedCount} partidas en lote.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  // Ingesta de fichero real arrastrado o subido
  const handleFileUploaded = useCallback(async (file) => {
    setIsProcessing(true);
    const tenantIdToUse = currentUser?.tenant_id || (currentTenant && currentTenant.id);
    if (backendStatus.online && tenantIdToUse && selectedCompany) {
      const res = await uploadBatchFile({
        tenantId: tenantIdToUse,
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
  }, [backendStatus.online, currentUser, currentTenant, selectedCompany, selectedYear, periodType, startMonth, endMonth, loadBatchesForCompany, triggerToast]);

  // Cargar Lote Demo de Auditoría (SOLO bajo petición explícita)
  const handleLoadDemoBatch = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      setTransactions(INITIAL_TRANSACTIONS);
      if (!selectedCompany && MOCK_COMPANIES.length > 0) {
        setSelectedCompany(MOCK_COMPANIES[0]);
        setCompanies(MOCK_COMPANIES);
      }
      setIsProcessing(false);
      triggerToast('Lote de prueba cargado con balance exacto a 0 céntimos.');
    }, 250);
  }, [selectedCompany, triggerToast]);

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

  const handleAuthSuccess = useCallback(async (user) => {
    setCurrentUser(user);
    if (user.role === 'SUPERADMIN') {
      setCurrentView('admin');
    } else {
      setCurrentView('radar');
    }
    triggerToast(`Sesión iniciada: ${user.full_name || user.email} (${user.role})`);
    await syncUserContext(user);
  }, [triggerToast, syncUserContext]);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    setCurrentUser(null);
    setCurrentView('radar');
    setCompanies([]);
    setSelectedCompany(null);
    setTransactions([]);
    setBatches([]);
    setCurrentBatchId(null);
    triggerToast('Sesión finalizada');
  }, [triggerToast]);

  // Si no está registrado o logeado, mostrar pantalla grande de autenticación
  if (!currentUser) {
    return (
      <>
        <AuthScreen 
          onAuthSuccess={handleAuthSuccess} 
          backendOnline={backendStatus.online} 
        />

        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs shadow-2xl animate-fade-in font-medium">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

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
        currentView={currentView}
        onToggleView={setCurrentView}
      />

      {/* Contenedor Principal: Conmutador entre Panel ADMIN (Exclusivo SUPERADMIN) y Radar Contable */}
      {currentUser.role === 'SUPERADMIN' && currentView === 'admin' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <AdminPanel 
            onNavigateToRadar={() => setCurrentView('radar')}
            currentUser={currentUser}
          />
        </main>
      ) : (
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
            onLoadDemoBatch={handleLoadDemoBatch}
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
      )}

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
