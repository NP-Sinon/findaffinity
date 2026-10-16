/**
 * FICHERO: frontend/src/App.jsx
 * Orquestador Principal con gestión estable de estado contable y lotes
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

  const toastTimeoutRef = useRef(null);

  const triggerToast = useCallback((msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  const refreshSubscriptionStatus = useCallback(async (tenantId) => {
    if (!tenantId) return;
    const sub = await fetchTenantSubscription(tenantId);
    if (sub) setSubscriptionInfo(sub);
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

  const handleSelectBatch = useCallback(async (batchId) => {
    if (!batchId) return;
    setCurrentBatchId(batchId);
    const details = await fetchBatchDetails(batchId);
    if (details && details.transactions) {
      setTransactions(details.transactions);
    }
  }, []);

  // Carga inicial de sociedades del despacho (no depende de los filtros de mes/año)
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
        setSelectedCompany(clientList[0]);
        setSelectedErp(clientList[0].defaultErp || 'A3');
      } else {
        setCompanies([]);
        setSelectedCompany(null);
        setTransactions([]);
      }
    }
  }, []);

  // Efecto exclusivo de arranque de aplicación
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
          await syncUserContext(session.user);
        }
      }
    }
    initApp();
    return () => {
      isMounted = false;
    };
  }, [syncUserContext]);

  // Efecto reactivo cuando cambia la sociedad activa o el filtro de periodo
  useEffect(() => {
    if (selectedCompany?.id) {
      loadBatchesForCompany(selectedCompany.id, selectedYear, startMonth, endMonth);
    }
  }, [selectedCompany?.id, selectedYear, startMonth, endMonth, loadBatchesForCompany]);

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
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Sociedad ${res.client.name} registrada.`);
    } else if (res.paywallTriggered) {
      setClientModalOpen(false);
      setShowPaywallModal(true);
      throw new Error('Ha alcanzado el límite de sociedades de su plan actual.');
    } else {
      throw new Error(res.error || 'Error al dar de alta la sociedad');
    }
  }, [currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

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
          } else {
            setTransactions([]);
            setBatches([]);
            setCurrentBatchId(null);
          }
        }
        return updated;
      });
      const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast('Sociedad eliminada.');
    } else {
      throw new Error(res.error || 'Error al eliminar la sociedad');
    }
  }, [selectedCompany, currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

  const handleDeleteTransaction = useCallback(async (txId) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== txId));
    if (currentBatchId && backendStatus.online) {
      await deleteTransactionApi(currentBatchId, txId);
      const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
      await refreshSubscriptionStatus(tenantIdToUse);
    }
    triggerToast('Apunte descartado.');
  }, [currentBatchId, backendStatus.online, currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

  const handleClearAllTransactions = useCallback(async () => {
    setTransactions([]);
    if (currentBatchId && backendStatus.online) {
      await deleteBatchApi(currentBatchId);
      setBatches((prev) => prev.filter((b) => b.id !== currentBatchId));
      setCurrentBatchId(null);
      const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
      await refreshSubscriptionStatus(tenantIdToUse);
    }
    triggerToast('Lote eliminado de la mesa de trabajo.');
  }, [currentBatchId, backendStatus.online, currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

  const handleApproveTransaction = useCallback(async (txId) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              status: 'GREEN',
              confidenceScore: Math.max(tx.confidenceScore || 0, 0.965),
              isApproved: true,
              auditExplanation: `${tx.auditExplanation || ''} [Conformado]`.trim(),
            }
          : tx
      )
    );
    if (currentBatchId && backendStatus.online) {
      await approveTransactionApi(currentBatchId, txId);
    }
    triggerToast(`Apunte ${txId} conformado.`);
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
            confidenceScore: Math.max(tx.confidenceScore || 0, 0.955),
            isApproved: true,
            auditExplanation: `${tx.auditExplanation || ''} [Conformado en lote]`.trim(),
          };
        }
        return tx;
      })
    );
    if (currentBatchId && backendStatus.online) {
      await bulkApproveYellowsApi(currentBatchId);
    }
    triggerToast(`${approvedCount} apuntes conformados.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  // Por defecto ephemeralMode = false para conservar batchId, auditoría SHA-256 y exportación de servidor
  const handleFileUploaded = useCallback(async (file, invoicesFile = null, ephemeralMode = false) => {
    if (!selectedCompany) {
      triggerToast('Seleccione o cree primero una sociedad cliente.');
      handleOpenAddClientModal();
      return null;
    }

    const tenantIdToUse = selectedCompany?.tenantId || selectedCompany?.tenant_id || currentTenant?.id || currentUser?.tenant_id;
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
        setCurrentBatchId(res.data.batch_id || null);
      } else {
        await loadBatchesForCompany(selectedCompany.id, selectedYear, startMonth, endMonth);
      }
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Lote procesado: ${res.data.total_movements} apuntes.`);
      return res.data;
    } else if (res && res.paywallTriggered) {
      await refreshSubscriptionStatus(tenantIdToUse);
      setShowPaywallModal(true);
      triggerToast('Límite mensual de partidas alcanzado.');
      return null;
    } else {
      throw new Error(res?.error || 'No se pudo procesar el archivo contable.');
    }
  }, [selectedCompany, currentUser, currentTenant, selectedYear, periodType, startMonth, endMonth, loadBatchesForCompany, refreshSubscriptionStatus, handleOpenAddClientModal, triggerToast]);

  const handleSyncStripe = useCallback(async ({ stripeRestrictedKey, ephemeralMode = false }) => {
    if (!selectedCompany) {
      triggerToast('Seleccione primero una sociedad cliente.');
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
      if (!ephemeralMode) {
        await loadBatchesForCompany(selectedCompany.id, selectedYear, startMonth, endMonth);
      } else {
        setTransactions(res.data.transactions || []);
      }
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Stripe: ${res.data.total_movements} liquidaciones importadas.`);
    } else if (res.paywallTriggered) {
      await refreshSubscriptionStatus(tenantIdToUse);
      setShowPaywallModal(true);
      triggerToast('Límite mensual de partidas alcanzado.');
    } else {
      throw new Error(res.error || 'Error conectando con Stripe API');
    }
  }, [selectedCompany, currentUser, currentTenant, selectedYear, startMonth, endMonth, loadBatchesForCompany, refreshSubscriptionStatus, triggerToast, handleOpenAddClientModal]);

  const handleSelectPlanUpgrade = useCallback(async (newPlan, extraBlocks) => {
    const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
    if (!tenantIdToUse) return;
    const res = await upgradeTenantPlanApi(tenantIdToUse, newPlan, extraBlocks);
    if (res.success) {
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Licencia actualizada a ${res.data?.new_plan || newPlan}.`);
    } else {
      triggerToast(`Error al actualizar licencia: ${res.error}`);
    }
  }, [currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    if (company.defaultErp) setSelectedErp(company.defaultErp);
  }, []);

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
    await syncUserContext(user);
  }, [syncUserContext]);

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
  }, []);

  if (!currentUser) {
    return (
      <>
        <AuthScreen
          onAuthSuccess={handleAuthSuccess}
          backendOnline={backendStatus.online}
        />
        {toastMessage && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded bg-[#161920] border border-[#2a303c] text-slate-200 text-xs shadow-lg">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-slate-200 flex flex-col font-sans">
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
        <main className="flex-1 max-w-[1640px] w-full mx-auto px-4 sm:px-6 py-4">
          <AdminPanel
            onNavigateToRadar={() => handleToggleView('radar')}
            currentUser={currentUser}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-[1640px] w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
          <IngestionZone
            isProcessing={isProcessing}
            onFileProcessed={handleFileUploaded}
            onOpenStripeSync={() => setShowStripeSyncModal(true)}
          />

          <StagingRadar
            transactions={periodFilteredTransactions}
            batches={batches}
            currentBatchId={currentBatchId}
            onSelectBatch={handleSelectBatch}
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
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded bg-[#161920] border border-[#2a303c] text-slate-200 text-xs shadow-lg">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
