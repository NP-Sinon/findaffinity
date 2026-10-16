/**
 * FICHERO: frontend/src/App.jsx
 * Orquestador Principal de Producción con Sincronización Inmutable de Cuota y Lotes
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
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Sociedad '${res.client.name}' dada de alta correctamente.`);
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
            loadBatchesForCompany(nextComp.id, selectedYear, startMonth, endMonth);
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
      triggerToast('Sociedad eliminada correctamente.');
    } else {
      throw new Error(res.error || 'Error al eliminar la sociedad');
    }
  }, [selectedCompany, selectedYear, startMonth, endMonth, loadBatchesForCompany, currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

  // Al borrar una partida o limpiar el radar, el contador de cuota mensual NO se reduce
  const handleDeleteTransaction = useCallback(async (txId) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== txId));
    if (currentBatchId && backendStatus.online) {
      await deleteTransactionApi(currentBatchId, txId);
      const tenantIdToUse = currentUser?.tenant_id || currentTenant?.id;
      await refreshSubscriptionStatus(tenantIdToUse);
    }
    triggerToast('Apunte retirado de la mesa de trabajo.');
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
    triggerToast('Mesa de trabajo limpiada.');
  }, [currentBatchId, backendStatus.online, currentUser, currentTenant, refreshSubscriptionStatus, triggerToast]);

  const handleApproveTransaction = useCallback(async (txId) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              status: 'GREEN',
              confidenceScore: 0.965,
              isApproved: true,
              auditExplanation: `${tx.auditExplanation || ''} [Conformado por Auditor Contable].`,
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
            confidenceScore: 0.955,
            isApproved: true,
            auditExplanation: `${tx.auditExplanation || ''} [Conformado en lote por Auditor Contable].`,
          };
        }
        return tx;
      })
    );
    if (currentBatchId && backendStatus.online) {
      await bulkApproveYellowsApi(currentBatchId);
    }
    triggerToast(`${approvedCount} apuntes conformados en lote.`);
  }, [currentBatchId, backendStatus.online, triggerToast]);

  const handleFileUploaded = useCallback(async (file, invoicesFile = null, ephemeralMode = false) => {
    if (!selectedCompany) {
      triggerToast('Seleccione o dé de alta primero una Sociedad Cliente.');
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
        setCurrentBatchId(null);
      } else {
        await loadBatchesForCompany(selectedCompany.id, selectedYear, startMonth, endMonth);
      }
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Fichero procesado (${res.data.total_movements} apuntes conciliados).`);
      return res.data;
    } else if (res && res.paywallTriggered) {
      await refreshSubscriptionStatus(tenantIdToUse);
      setShowPaywallModal(true);
      triggerToast('Límite mensual de partidas alcanzado. Amplíe su licencia para continuar.');
      return null;
    } else {
      throw new Error(res?.error || 'No se pudo procesar el archivo contable.');
    }
  }, [selectedCompany, currentUser, currentTenant, selectedYear, periodType, startMonth, endMonth, loadBatchesForCompany, refreshSubscriptionStatus, handleOpenAddClientModal, triggerToast]);

  const handleSyncStripe = useCallback(async ({ stripeRestrictedKey, ephemeralMode }) => {
    if (!selectedCompany) {
      triggerToast('Seleccione primero una Sociedad Cliente.');
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
      await refreshSubscriptionStatus(tenantIdToUse);
      triggerToast(`Stripe API: ${res.data.total_movements} liquidaciones importadas.`);
    } else if (res.paywallTriggered) {
      await refreshSubscriptionStatus(tenantIdToUse);
      setShowPaywallModal(true);
      triggerToast('Límite mensual de partidas alcanzado. Amplíe su licencia para continuar.');
    } else {
      throw new Error(res.error || 'Error conectando con Stripe API');
    }
  }, [selectedCompany, currentUser, currentTenant, selectedYear, startMonth, endMonth, refreshSubscriptionStatus, triggerToast, handleOpenAddClientModal]);

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
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded bg-[#161a23] border border-[#283040] text-slate-100 text-xs shadow-2xl font-medium">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans">
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
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
          <AdminPanel
            onNavigateToRadar={() => handleToggleView('radar')}
            currentUser={currentUser}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
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

      <footer className="border-t border-[#1e232d] bg-[#0f1218] py-3.5 text-center text-xs text-slate-500">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="font-mono text-[11px] text-slate-400">
            FINDAFINITY &bull; Conciliación Algorítmica y Partida Doble PGC &bull; Descuadre 0,00 €
          </div>
          <div className="text-[11px] text-slate-400">
            Formatos Oficiales: Wolters Kluwer A3 (Suenlace) &bull; Sage 50 (XDIARIO) &bull; DELSOL Contasol
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
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded bg-[#161a23] border border-[#283040] text-slate-100 text-xs shadow-2xl font-medium">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
