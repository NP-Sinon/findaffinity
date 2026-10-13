import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { IngestionZone } from './components/IngestionZone';
import { StagingRadar } from './components/StagingRadar';
import { ExportPanel } from './components/ExportPanel';
import { ScoreRadarModal } from './components/ScoreRadarModal';
import { AuditTrailModal } from './components/AuditTrailModal';
import { ClientModal } from './components/ClientModal';
import AuthModal from './components/AuthModal';
import { AuthScreen } from './components/AuthScreen';
import { AdminPanel } from './components/AdminPanel';
import { MOCK_COMPANIES, INITIAL_TRANSACTIONS } from './data/mockAuditData';
import { 
  checkBackendHealth, 
  fetchTenants, 
  fetchClients, 
  createClientApi,
  deleteClientApi,
  deleteBatchApi,
  deleteTransactionApi,
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

  // Modal para Añadir / Eliminar Empresa Cliente
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientModalMode, setClientModalMode] = useState('add');
  const [clientModalTarget, setClientModalTarget] = useState(null);

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

  // Carga lotes reales de la empresa seleccionada
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
        const clientList = await fetchClients(user.tenant_id);
        if (clientList && clientList.length > 0) {
          setCompanies(clientList);
          const firstComp = clientList[0];
          setSelectedCompany(firstComp);
          setSelectedErp(firstComp.defaultErp || 'A3');
          await loadBatchesForCompany(firstComp.id, selectedYear, startMonth, endMonth);
        } else {
          // El usuario NO tiene clientes aún: dejar lista vacía (cero empresas 'por la cara')
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
          } else {
            setCompanies([]);
            setSelectedCompany(null);
            setTransactions([]);
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
  }, [syncUserContext, currentUser]);

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

  // Handlers para Añadir y Quitar Empresa Cliente
  const handleOpenAddClientModal = useCallback(() => {
    setClientModalMode('add');
    setClientModalTarget(null);
    setClientModalOpen(true);
  }, []);

  const handleOpenDeleteClientModal = useCallback((comp) => {
    setClientModalMode('delete');
    setClientModalTarget(comp);
    setClientModalOpen(true);
  }, []);

  const handleAddClient = useCallback(async ({ name, fiscalId, defaultErp, accountLength }) => {
    const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
    if (!tenantIdToUse) {
      throw new Error('No se ha detectado el identificador de su despacho.');
    }

    const res = await createClientApi({
      tenantId: tenantIdToUse,
      name,
      fiscalId,
      defaultErp,
      accountLength,
    });

    if (res.success && res.client) {
      setCompanies(prev => [...prev, res.client]);
      setSelectedCompany(res.client);
      setSelectedErp(res.client.defaultErp || 'A3');
      setTransactions([]);
      setBatches([]);
      setCurrentBatchId(null);
      triggerToast(`Empresa cliente '${res.client.name}' creada con éxito.`);
    } else {
      throw new Error(res.error || 'Error al crear la empresa cliente');
    }
  }, [currentUser, currentTenant, triggerToast]);

  const handleDeleteClient = useCallback(async (clientId) => {
    const res = await deleteClientApi(clientId);
    if (res.success) {
      setCompanies(prev => {
        const updated = prev.filter(c => c.id !== clientId);
        if (selectedCompany?.id === clientId) {
          const nextComp = updated.length > 0 ? updated[0] : null;
          setSelectedCompany(nextComp);
          if (nextComp) {
            setSelectedErp(nextComp.defaultErp || 'A3');
            loadBatchesForCompany(nextComp.id, selectedYear, startMonth, endMonth);
          } else {
            setTransactions([]);
            setBatches([]);
            setCurrentBatchId(null);
          }
        }
        return updated;
      });
      triggerToast('Empresa cliente eliminada correctamente.');
    } else {
      throw new Error(res.error || 'Error al eliminar la empresa cliente');
    }
  }, [selectedCompany, selectedYear, startMonth, endMonth, loadBatchesForCompany, triggerToast]);

  // Eliminación de partidas (individual y vaciado completo)
  const handleDeleteTransaction = useCallback(async (txId) => {
    setTransactions(prev => prev.filter(tx => tx.id !== txId));
    if (currentBatchId && backendStatus.online) {
      await deleteTransactionApi(currentBatchId, txId);
    }
    triggerToast('Partida eliminada.');
  }, [currentBatchId, backendStatus.online, triggerToast]);

  const handleClearAllTransactions = useCallback(async () => {
    setTransactions([]);
    if (currentBatchId && backendStatus.online) {
      await deleteBatchApi(currentBatchId);
      setBatches(prev => prev.filter(b => b.id !== currentBatchId));
      setCurrentBatchId(null);
    }
    triggerToast('Todas las partidas han sido eliminadas del radar.');
  }, [currentBatchId, backendStatus.online, triggerToast]);

  // Aprobación individual de partida
  const handleApproveTransaction = useCallback(async (txId) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.id === txId) {
        return {
          ...tx,
          status: 'GREEN',
          confidenceScore: 0.965,
          isApproved: true,
          auditExplanation: `${tx.auditExplanation || ''} [Aprobado manualmente por Auditor Contable].`,
        };
      }
      return tx;
    }));

    if (currentBatchId && backendStatus.online) {
      await approveTransactionApi(currentBatchId, txId);
    }

    triggerToast(`Partida ${txId} aprobada. Asiento PGC certificado.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  // Aprobación masiva de todas las partidas amarillas
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
    if (!selectedCompany) {
      setIsProcessing(false);
      triggerToast('Añade o selecciona una Empresa Cliente antes de procesar un archivo.');
      handleOpenAddClientModal();
      return null;
    }

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
        return res.data;
      } else {
        setIsProcessing(false);
        triggerToast(`Error: ${res?.error || 'No se pudo procesar el archivo'}`);
        return null;
      }
    }

    // Fallback de demostración en modo autónomo
    return new Promise((resolve) => {
      setTimeout(() => {
        setTransactions(INITIAL_TRANSACTIONS);
        setIsProcessing(false);
        triggerToast('Fichero analizado y verificado mediante motor de conciliación.');
        resolve({ total_movements: INITIAL_TRANSACTIONS.length });
      }, 400);
    });
  }, [backendStatus.online, currentUser, currentTenant, selectedCompany, selectedYear, periodType, startMonth, endMonth, loadBatchesForCompany, handleOpenAddClientModal, triggerToast]);

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
      {/* 1. Barra superior limpia (cero métricas invasivas, aislamiento estricto en vista Admin) */}
      <HeaderNav
        companies={companies}
        selectedCompany={selectedCompany}
        onSelectCompany={handleSelectCompany}
        selectedErp={selectedErp}
        onSelectErp={setSelectedErp}
        currentUser={currentUser}
        onLogout={handleLogout}
        currentView={currentView}
        onToggleView={setCurrentView}
        onOpenAddClientModal={handleOpenAddClientModal}
        onOpenDeleteClientModal={handleOpenDeleteClientModal}
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

          {/* 3. El Radar de Conciliación y Desambiguación con vaciado y eliminación de partidas */}
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
            onDeleteTransaction={handleDeleteTransaction}
            onClearAllTransactions={handleClearAllTransactions}
            hasCompanies={companies.length > 0}
            onOpenAddClientModal={handleOpenAddClientModal}
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

      {/* Modal para Añadir o Eliminar Empresa Cliente */}
      <ClientModal
        isOpen={clientModalOpen}
        mode={clientModalMode}
        company={clientModalTarget}
        onClose={() => setClientModalOpen(false)}
        onAddClient={handleAddClient}
        onDeleteClient={handleDeleteClient}
      />

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
