/**
 * FICHERO: frontend/src/App.jsx
 * Orquestador Principal de Producción (Sin mocks, con gestión de Planes/Paywall en vivo)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { IngestionZone } from './components/IngestionZone';
import { StagingRadar } from './components/StagingRadar';
import { ExportPanel } from './components/ExportPanel';
import { ScoreRadarModal } from './components/ScoreRadarModal';
import { AuditTrailModal } from './components/AuditTrailModal';
import { ClientModal } from './components/ClientModal';
import { AuthScreen } from './components/AuthScreen';
import { AdminPanel } from './components/AdminPanel';
import { PaywallModal } from './components/PaywallModal';
import { StripeSyncModal } from './components/StripeSyncModal';
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
  saveAuthSession,
  clearAuthSession,
  fetchMeApi,
  fetchTenantSubscription,
  upgradeTenantPlanApi,
  syncStripePayoutsApi,
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

  const [transactions, setTransactions] = useState([]);
  const [modalTransaction, setModalTransaction] = useState(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ online: false });
  const [toastMessage, setToastMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientModalMode, setClientModalMode] = useState('add');
  const [clientModalTarget, setClientModalTarget] = useState(null);

  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [showStripeSyncModal, setShowStripeSyncModal] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  const [currentUser, setCurrentUser] = useState(() => {
    const s = getStoredAuthSession();
    return s ? s.user : null;
  });

  const [currentView, setCurrentView] = useState(() => {
    const s = getStoredAuthSession();
    if (s && s.user && s.user.role === 'SUPERADMIN') {
      const saved = localStorage.getItem('findaffinity_active_view');
      return saved === 'radar' ? 'radar' : 'admin';
    }
    return 'radar';
  });

  const [selectedYear, setSelectedYear] = useState(2026);
  const [periodType, setPeriodType] = useState('ALL');
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);

  const triggerToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3400);
  }, []);

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
        if (details && details.transactions) {
          setTransactions(details.transactions);
          return;
        }
      }
      setCurrentBatchId(null);
      setTransactions([]);
    } catch {
      setBatches([]);
      setCurrentBatchId(null);
      setTransactions([]);
    }
  }, []);

  const syncUserContext = useCallback(async (user) => {
    if (!user) {
      setCompanies([]);
      setSelectedCompany(null);
      setTransactions([]);
      setSubscriptionInfo(null);
      return;
    }

    if (user.role === 'SUPERADMIN') {
      const tList = await fetchTenants();
      setTenants(tList || []);
      if (tList && tList.length > 0) {
        const firstTenant = tList[0];
        setCurrentTenant(firstTenant);
        const [sub, cList] = await Promise.all([
          fetchTenantSubscription(firstTenant.id),
          fetchClients(firstTenant.id),
        ]);
        if (sub) setSubscriptionInfo(sub);
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
    } else if (user.tenant_id) {
      const [sub, clientList] = await Promise.all([
        fetchTenantSubscription(user.tenant_id),
        fetchClients(user.tenant_id),
      ]);
      if (sub) setSubscriptionInfo(sub);

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
    }
  }, [loadBatchesForCompany, selectedYear, startMonth, endMonth]);

  useEffect(() => {
    let isMounted = true;
    async function initApp() {
      const health = await checkBackendHealth();
      if (!isMounted) return;
      setBackendStatus(health);

      const session = getStoredAuthSession();
      if (session && session.token) {
        const meRes = await fetchMeApi();
        if (!isMounted) return;
        if (meRes.success && meRes.user) {
          saveAuthSession(session.token, meRes.user);
          setCurrentUser(meRes.user);
          if (meRes.user.role === 'SUPERADMIN') {
            const saved = localStorage.getItem('findaffinity_active_view');
            setCurrentView(saved === 'radar' ? 'radar' : 'admin');
          }
          await syncUserContext(meRes.user);
        } else if (meRes.status === 401 || meRes.status === 403) {
          clearAuthSession();
          setCurrentUser(null);
        } else if (session.user) {
          // Si el servidor está temporalmente inaccesible pero hay sesión local
          await syncUserContext(session.user);
        }
      }
    }
    initApp();
    return () => {
      isMounted = false;
    };
  }, [syncUserContext]);

  const periodFilteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (!tx.date) return true;
      const parts = tx.date.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (year !== selectedYear) return false;
      if (month < startMonth || month > endMonth) return false;
      return true;
    });
  }, [transactions, selectedYear, startMonth, endMonth]);

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
      setCompanies((prev) => [...prev, res.client]);
      setSelectedCompany(res.client);
      setSelectedErp(res.client.defaultErp || 'A3');
      setTransactions([]);
      setBatches([]);
      setCurrentBatchId(null);
      const sub = await fetchTenantSubscription(tenantIdToUse);
      if (sub) setSubscriptionInfo(sub);
      triggerToast(`Sociedad '${res.client.name}' dada de alta correctamente.`);
    } else if (res.paywallTriggered) {
      setClientModalOpen(false);
      setShowPaywallModal(true);
      throw new Error('Has alcanzado el límite de empresas de tu plan actual.');
    } else {
      throw new Error(res.error || 'Error al crear la empresa cliente');
    }
  }, [currentUser, currentTenant, triggerToast]);

  const handleDeleteClient = useCallback(async (clientId) => {
    const res = await deleteClientApi(clientId);
    if (res.success) {
      setCompanies((prev) => {
        const updated = prev.filter((c) => c.id !== clientId);
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
      triggerToast('Sociedad eliminada correctamente.');
    } else {
      throw new Error(res.error || 'Error al eliminar la empresa cliente');
    }
  }, [selectedCompany, selectedYear, startMonth, endMonth, loadBatchesForCompany, triggerToast]);

  const handleDeleteTransaction = useCallback(async (txId) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== txId));
    if (currentBatchId && backendStatus.online) {
      await deleteTransactionApi(currentBatchId, txId);
    }
    triggerToast('Partida eliminada del radar.');
  }, [currentBatchId, backendStatus.online, triggerToast]);

  const handleClearAllTransactions = useCallback(async () => {
    setTransactions([]);
    if (currentBatchId && backendStatus.online) {
      await deleteBatchApi(currentBatchId);
      setBatches((prev) => prev.filter((b) => b.id !== currentBatchId));
      setCurrentBatchId(null);
    }
    triggerToast('Radar contable vaciado.');
  }, [currentBatchId, backendStatus.online, triggerToast]);

  const handleApproveTransaction = useCallback(async (txId) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              status: 'GREEN',
              confidenceScore: 0.965,
              isApproved: true,
              auditExplanation: `${tx.auditExplanation || ''} [Aprobado por Auditor Contable].`,
            }
          : tx
      )
    );
    if (currentBatchId && backendStatus.online) {
      await approveTransactionApi(currentBatchId, txId);
    }
    triggerToast(`Partida ${txId} aprobada y certificada.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  const handleBulkApproveYellows = useCallback(async () => {
    let approvedCount = 0;
    setTransactions((prev) =>
      prev.map((tx) => {
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
      })
    );
    if (currentBatchId && backendStatus.online) {
      await bulkApproveYellowsApi(currentBatchId);
    }
    triggerToast(`${approvedCount} partidas aprobadas en lote.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  const handleFileUploaded = useCallback(async (file, invoicesFile = null, ephemeralMode = false) => {
    if (!selectedCompany) {
      triggerToast('Crea o selecciona primero una Empresa Cliente para asociar el extracto.');
      handleOpenAddClientModal();
      return null;
    }

    const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
    if (!tenantIdToUse) {
      triggerToast('Sesión de despacho no válida.');
      return null;
    }

    setIsProcessing(true);
    const res = await uploadBatchFile({
      tenantId: tenantIdToUse,
      clientId: selectedCompany.id,
      year: selectedYear,
      periodType,
      startMonth,
      endMonth,
      file,
      invoicesFile,
      ephemeralMode,
    });
    setIsProcessing(false);

    if (res && res.success) {
      if (ephemeralMode && res.data?.transactions) {
        setTransactions(res.data.transactions);
        setCurrentBatchId(null);
      } else {
        await loadBatchesForCompany(selectedCompany.id, selectedYear, startMonth, endMonth);
      }
      const sub = await fetchTenantSubscription(tenantIdToUse);
      if (sub) setSubscriptionInfo(sub);
      triggerToast(`Fichero conciliado con éxito (${res.data.total_movements} movimientos).`);
      return res.data;
    } else if (res && res.paywallTriggered) {
      setShowPaywallModal(true);
      triggerToast('Has alcanzado el límite de 25 facturas de evaluación gratuita. Elige un plan para continuar.');
      return null;
    } else {
      throw new Error(res?.error || 'No se pudo procesar el archivo contable.');
    }
  }, [selectedCompany, currentUser, currentTenant, selectedYear, periodType, startMonth, endMonth, loadBatchesForCompany, handleOpenAddClientModal, triggerToast]);

  const handleSyncStripe = useCallback(async ({ stripeRestrictedKey, ephemeralMode }) => {
    if (!selectedCompany) {
      triggerToast('Añade primero una Empresa Cliente antes de sincronizar con Stripe.');
      handleOpenAddClientModal();
      return;
    }
    const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
    if (!tenantIdToUse) return;

    setIsProcessing(true);
    const res = await syncStripePayoutsApi({
      tenantId: tenantIdToUse,
      clientId: selectedCompany.id,
      stripeRestrictedKey,
      year: selectedYear,
      startMonth,
      endMonth,
      ephemeralMode,
    });
    setIsProcessing(false);

    if (res.success && res.data) {
      setTransactions(res.data.transactions || []);
      const sub = await fetchTenantSubscription(tenantIdToUse);
      if (sub) setSubscriptionInfo(sub);
      triggerToast(`Stripe API: ${res.data.total_movements} liquidaciones sincronizadas y cuadradas.`);
    } else if (res.paywallTriggered) {
      setShowPaywallModal(true);
      triggerToast('Límite de 25 facturas gratuitas alcanzado. Elige un plan para desbloquear.');
    } else {
      throw new Error(res.error || 'Error conectando con Stripe API');
    }
  }, [selectedCompany, currentUser, currentTenant, selectedYear, startMonth, endMonth, triggerToast, handleOpenAddClientModal]);

  const handleSelectPlanUpgrade = useCallback(async (newPlan, extraBlocks) => {
    const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
    if (!tenantIdToUse) return;
    const res = await upgradeTenantPlanApi(tenantIdToUse, newPlan, extraBlocks);
    if (res.success) {
      const sub = await fetchTenantSubscription(tenantIdToUse);
      if (sub) setSubscriptionInfo(sub);
      triggerToast(`Plan ${res.data?.new_plan || newPlan} activado correctamente.`);
    } else {
      triggerToast(`Error al actualizar plan: ${res.error}`);
    }
  }, [currentUser, currentTenant, triggerToast]);

  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    if (company.defaultErp) setSelectedErp(company.defaultErp);
    loadBatchesForCompany(company.id, selectedYear, startMonth, endMonth);
    triggerToast(`Sociedad activa: ${company.name}`);
  }, [loadBatchesForCompany, selectedYear, startMonth, endMonth, triggerToast]);

  const handleToggleView = useCallback((view) => {
    setCurrentView(view);
    localStorage.setItem('findaffinity_active_view', view);
  }, []);

  const handleAuthSuccess = useCallback(async (user) => {
    setCurrentUser(user);
    if (user.role === 'SUPERADMIN') {
      const saved = localStorage.getItem('findaffinity_active_view');
      setCurrentView(saved === 'radar' ? 'radar' : 'admin');
    } else {
      setCurrentView('radar');
    }
    triggerToast(`Bienvenido, ${user.full_name || user.email}`);
    await syncUserContext(user);
  }, [triggerToast, syncUserContext]);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    localStorage.removeItem('findaffinity_active_view');
    setCurrentUser(null);
    setCurrentView('radar');
    setCompanies([]);
    setSelectedCompany(null);
    setTransactions([]);
    setBatches([]);
    setCurrentBatchId(null);
    setSubscriptionInfo(null);
    triggerToast('Sesión cerrada correctamente.');
  }, [triggerToast]);

  if (!currentUser) {
    return (
      <>
        <AuthScreen
          onAuthSuccess={handleAuthSuccess}
          backendOnline={backendStatus.online}
        />
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs shadow-2xl font-medium">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans">
      <HeaderNav
        companies={companies}
        selectedCompany={selectedCompany}
        onSelectCompany={handleSelectCompany}
        selectedErp={selectedErp}
        onSelectErp={setSelectedErp}
        currentUser={currentUser}
        onLogout={handleLogout}
        currentView={currentView}
        onToggleView={handleToggleView}
        onOpenAddClientModal={handleOpenAddClientModal}
        onOpenDeleteClientModal={handleOpenDeleteClientModal}
        subscriptionInfo={subscriptionInfo}
        onOpenPaywall={() => setShowPaywallModal(true)}
        onOpenAuditModal={() => setShowAuditModal(true)}
      />

      {currentUser.role === 'SUPERADMIN' && currentView === 'admin' ? (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <AdminPanel
            onNavigateToRadar={() => setCurrentView('radar')}
            currentUser={currentUser}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <IngestionZone
            isProcessing={isProcessing}
            onFileProcessed={handleFileUploaded}
            onOpenStripeSync={() => setShowStripeSyncModal(true)}
          />

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
            onDeleteTransaction={handleDeleteTransaction}
            onClearAllTransactions={handleClearAllTransactions}
            hasCompanies={companies.length > 0}
            onOpenAddClientModal={handleOpenAddClientModal}
          />

          <ExportPanel
            transactions={periodFilteredTransactions}
            selectedErp={selectedErp}
            onSelectErp={setSelectedErp}
            selectedCompany={selectedCompany}
            batchId={currentBatchId}
            paywallLocked={Boolean(subscriptionInfo?.paywall_triggered)}
            onOpenPaywall={() => setShowPaywallModal(true)}
          />
        </main>
      )}

      <footer className="border-t border-zinc-800/60 bg-[#0c0c0e] py-4 text-center text-xs text-zinc-500">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="font-mono text-[11px] text-zinc-400">
            FINDAFINITY &bull; Conciliación Bancaria y Pasarelas &bull; Cuadre PGC a céntimo cero (0,00 €)
          </div>
          <div className="text-[11px] text-zinc-400">
            Exportación Oficial: Wolters Kluwer A3 (Suenlace) &bull; Sage 50 (XDIARIO) &bull; DELSOL Contasol
          </div>
        </div>
      </footer>

      <ClientModal
        isOpen={clientModalOpen}
        mode={clientModalMode}
        company={clientModalTarget}
        onClose={() => setClientModalOpen(false)}
        onAddClient={handleAddClient}
        onDeleteClient={handleDeleteClient}
      />

      {modalTransaction && (
        <ScoreRadarModal
          transaction={modalTransaction}
          onClose={() => setModalTransaction(null)}
          onApprove={handleApproveTransaction}
        />
      )}

      {showAuditModal && (
        <AuditTrailModal
          batchId={currentBatchId}
          companyName={selectedCompany ? selectedCompany.name : 'Sociedad Activa'}
          onClose={() => setShowAuditModal(false)}
        />
      )}

      <PaywallModal
        isOpen={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
        usedTransactions={subscriptionInfo?.current_month_transactions || 0}
        freeLimit={subscriptionInfo?.max_monthly_transactions || 25}
        currentPlan={subscriptionInfo?.plan || 'FREE'}
        onSelectPlanUpgrade={handleSelectPlanUpgrade}
      />

      <StripeSyncModal
        isOpen={showStripeSyncModal}
        onClose={() => setShowStripeSyncModal(false)}
        onSyncStripe={handleSyncStripe}
        selectedCompany={selectedCompany}
        selectedYear={selectedYear}
        startMonth={startMonth}
        endMonth={endMonth}
      />

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs shadow-2xl font-medium">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
