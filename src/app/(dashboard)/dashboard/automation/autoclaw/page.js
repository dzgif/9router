"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardSkeleton, Badge, Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

const API = "/api/autoclaw";

function relTime(unixSec) {
  if (!unixSec) return "";
  const diff = Date.now() - unixSec * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}/${path}`, {
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

function AddAccountModal({ onClose, onAdded }) {
  const [tab, setTab] = useState("quick");

  const [quickEmail, setQuickEmail] = useState("");
  const [quickPass, setQuickPass] = useState("");
  const [quickStatus, setQuickStatus] = useState("idle");
  const [quickLogs, setQuickLogs] = useState([]);
  const quickPollRef = useRef(null);

  // -- Batch import --
  const [batchText, setBatchText] = useState("");
  const [batchHeadless, setBatchHeadless] = useState(true);
  const [batchStatus, setBatchStatus] = useState("idle"); // idle | running | done | error
  const [batchLogs, setBatchLogs] = useState([]);
  const [batchResults, setBatchResults] = useState({ total: 0, success: 0, failed: 0 });
  const batchPollRef = useRef(null);
  const batchLogEndRef = useRef(null);

  const addNotification = useNotificationStore((s) => s.addNotification);

  const startQuick = async () => {
    if (!quickEmail || !quickPass) return;
    setQuickStatus("running");
    setQuickLogs([`Starting CloakBrowser for ${quickEmail}...`]);

    const res = await fetch("/api/autoclaw/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: [{ email: quickEmail, password: quickPass }],
        headless: true,
      }),
    });
    const data = await res.json();
    if (data.status !== "started") {
      setQuickStatus("error");
      setQuickLogs(prev => [...prev, data.error || "Failed to start"]);
      return;
    }

    quickPollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch("/api/autoclaw/batch");
        const status = await statusRes.json();
        setQuickLogs(status.logs || []);
        if (status.status === "done" || status.status === "error" || status.status === "idle") {
          clearInterval(quickPollRef.current);
          setQuickStatus(status.status);
          if (status.status === "done") {
            addNotification({ type: "success", message: `Account added: ${quickEmail}`, autoClose: 4000 });
            onAdded();
          } else {
            addNotification({ type: "error", message: "Login failed — check logs", autoClose: 5000 });
          }
        }
      } catch {}
    }, 2000);
  };

  const cancelQuick = async () => {
    if (quickPollRef.current) clearInterval(quickPollRef.current);
    await fetch("/api/autoclaw/batch", { method: "DELETE" });
    setQuickStatus("idle");
    setQuickLogs([]);
  };

  // -- Batch import --

  // -- Batch import --
  const startBatch = async () => {
    const lines = batchText.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    const pairs = lines.map(l => {
      const [email, ...pw] = l.split(":");
      return { email: email.trim(), password: pw.join(":").trim() };
    }).filter(p => p.email && p.password);

    if (pairs.length === 0) {
      addNotification({ type: "error", message: "No valid email:password pairs found", autoClose: 4000 });
      return;
    }

    setBatchStatus("running");
    setBatchLogs([`Starting batch import for ${pairs.length} accounts...\n`]);

    const res = await fetch("/api/autoclaw/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: pairs, headless: batchHeadless }),
    });
    const data = await res.json();

    if (data.status !== "started") {
      setBatchStatus("error");
      setBatchLogs(prev => [...prev, `Error: ${data.error || "Failed to start"}\n`]);
      return;
    }

    batchPollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch("/api/autoclaw/batch");
        const status = await statusRes.json();
        setBatchLogs(status.logs || []);
        setBatchResults(status.results || { total: 0, success: 0, failed: 0 });
        if (status.status === "done" || status.status === "error" || status.status === "idle") {
          clearInterval(batchPollRef.current);
          setBatchStatus(status.status);
          if (status.status === "done") {
            addNotification({ type: "success", message: `Batch done: ${status.results?.success} success, ${status.results?.failed} failed`, autoClose: 5000 });
          } else if (status.status === "error") {
            addNotification({ type: "error", message: "Batch import finished with errors", autoClose: 5000 });
          }
          onAdded();
        }
      } catch {}
    }, 2000);
  };

  const cancelBatch = async () => {
    if (batchPollRef.current) clearInterval(batchPollRef.current);
    await fetch("/api/autoclaw/batch", { method: "DELETE" });
    setBatchStatus("idle");
  };

  useEffect(() => {
    return () => {
      if (quickPollRef.current) clearInterval(quickPollRef.current);
      if (batchPollRef.current) clearInterval(batchPollRef.current);
    };
  }, []);

  const tabs = [
    { id: "quick", label: "Quick Add" },
    { id: "batch", label: "Batch Import" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-bg border border-border-subtle rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h2 className="text-lg font-bold text-text-main">Add Account</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main p-1">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-subtle">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${
                tab === t.id
                  ? "text-brand-500 border-b-2 border-brand-500"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "quick" && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-muted">Add one account via headless CloakBrowser automation:</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Email</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border-subtle text-sm text-text-main focus:outline-none focus:border-brand-500"
                  placeholder="email@gmail.com"
                  value={quickEmail}
                  onChange={(e) => setQuickEmail(e.target.value)}
                  disabled={quickStatus === "running"}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border-subtle text-sm text-text-main focus:outline-none focus:border-brand-500"
                  placeholder="password"
                  value={quickPass}
                  onChange={(e) => setQuickPass(e.target.value)}
                  disabled={quickStatus === "running"}
                />
              </div>
            </div>

            {quickStatus === "idle" && (
              <Button variant="primary" className="w-full justify-center" onClick={startQuick} disabled={!quickEmail || !quickPass}>
                <span className="material-symbols-outlined text-[16px] mr-1">robot_2</span>
                Login via CloakBrowser (Headless)
              </Button>
            )}

            {quickStatus === "running" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-text-main font-medium">Logging in {quickEmail}...</span>
                </div>
                <div className="h-40 overflow-y-auto bg-surface-1 rounded-lg p-3 text-xs font-mono text-text-muted space-y-1">
                  {quickLogs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
                <Button variant="secondary" className="w-full justify-center" onClick={cancelQuick}>
                  <span className="material-symbols-outlined text-[16px] mr-1">stop</span>
                  Cancel
                </Button>
              </div>
            )}

            {(quickStatus === "done" || quickStatus === "error") && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 text-sm font-medium ${quickStatus === "done" ? "text-green-500" : "text-red-500"}`}>
                  <span>{quickStatus === "done" ? "Success" : "Failed"}</span>
                </div>
                <div className="h-40 overflow-y-auto bg-surface-1 rounded-lg p-3 text-xs font-mono text-text-muted space-y-1">
                  {quickLogs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => { setQuickStatus("idle"); setQuickLogs([]); setQuickEmail(""); setQuickPass(""); }}>
                    Add Another
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Batch Import tab */}
        {tab === "batch" && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-muted">
              Paste <strong>email:password</strong> pairs (one per line). Uses CloakBrowser to auto-login.
            </p>
            <textarea
              className="w-full h-32 px-3 py-2 rounded-lg bg-surface-1 border border-border-subtle text-sm text-text-main font-mono focus:outline-none focus:border-brand-500 resize-y"
              placeholder={`email1@gmail.com:password123\ngroup2@outlook.com:pass456`}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              disabled={batchStatus === "running"}
            />
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={batchHeadless}
                onChange={(e) => setBatchHeadless(e.target.checked)}
                className="rounded border-border-subtle"
              />
              Headless mode (no browser UI)
            </label>

            {batchStatus === "idle" && (
              <Button variant="primary" className="w-full justify-center" onClick={startBatch} disabled={!batchText.trim()}>
                <span className="material-symbols-outlined text-[16px] mr-1">play_arrow</span>
                Run Batch Import
              </Button>
            )}

            {(batchStatus === "running") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-text-main font-medium">Processing {batchResults.total} accounts...</span>
                </div>
                <div className="h-40 overflow-y-auto bg-surface-1 rounded-lg p-3 text-xs font-mono text-text-muted space-y-1" ref={batchLogEndRef}>
                  {batchLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
                <div className="flex gap-2 text-xs text-text-muted">
                  <span>✅ {batchResults.success} success</span>
                  <span>❌ {batchResults.failed} failed</span>
                </div>
                <Button variant="secondary" className="w-full justify-center" onClick={cancelBatch}>
                  <span className="material-symbols-outlined text-[16px] mr-1">stop</span>
                  Cancel
                </Button>
              </div>
            )}

            {(batchStatus === "done" || batchStatus === "error") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-medium ${batchStatus === "done" ? "text-green-500" : "text-red-500"}`}>
                    {batchStatus === "done" ? "Batch Complete" : "Finished with Errors"}
                  </span>
                </div>
                <div className="h-40 overflow-y-auto bg-surface-1 rounded-lg p-3 text-xs font-mono text-text-muted space-y-1">
                  {batchLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
                <div className="flex gap-3 text-sm">
                  <span>✅ {batchResults.success} success</span>
                  <span>❌ {batchResults.failed} failed</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => { setBatchStatus("idle"); setBatchText(""); setBatchLogs([]); }}>
                    Import Again
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ email, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`api/delete/${encodeURIComponent(email)}`, { method: "DELETE" });
      if (data.success || data.message) {
        addNotification({ type: "info", message: `Deleted: ${email}`, autoClose: 3000 });
        onDeleted();
        onClose();
      } else {
        addNotification({ type: "error", message: data.error || "Delete failed", autoClose: 5000 });
      }
    } catch {
      addNotification({ type: "error", message: "Delete failed", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-bg border border-border-subtle rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-red-500">warning</span>
            <h2 className="text-lg font-bold text-text-main">Delete Account</h2>
          </div>
          <p className="text-sm text-text-muted">Remove <strong className="text-text-main">{email}</strong> from AutoClaw? This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleDelete} loading={loading} className="!bg-red-600 hover:!bg-red-700">
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AutomationPage() {
  const [health, setHealth] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [wallets, setWallets] = useState({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [refreshing, setRefreshing] = useState({});
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const fetchAll = useCallback(async () => {
    try {
      const [healthRes, detailRes, walletRes] = await Promise.all([
        apiFetch("health").catch(() => null),
        apiFetch("api/accounts-detail").catch(() => null),
        apiFetch("api/wallet-bulk").catch(() => null),
      ]);
      setHealth(healthRes);
      if (detailRes && !detailRes.error) setAccounts(detailRes.accounts || []);
      if (walletRes && !walletRes.error) {
        const wMap = {};
        (walletRes.accounts || []).forEach((a) => { wMap[a.email] = a; });
        setWallets(wMap);
      }
      setError(null);
    } catch {
      setHealth(null);
      setAccounts([]);
      setWallets({});
      setError("AutoClaw proxy is not running.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    const st = await apiFetch("status");
    setStatus(st);
    return st;
  }, []);

  const initProxy = useCallback(async () => {
    setStarting(true);
    setLoading(true);
    try {
      const st = await apiFetch("start", { method: "POST" });
      setStatus(st);
      if (st.running) {
        await new Promise((r) => setTimeout(r, 2000));
        await fetchAll();
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    } finally {
      setStarting(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    fetchStatus().then((st) => {
      if (st && st.running) {
        fetchAll();
      } else if (!st.running && !st.error) {
        initProxy();
      } else {
        setLoading(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(fetchAll, 30000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const st = await apiFetch("start", { method: "POST" });
      setStatus(st);
      if (st.running) {
        addNotification({ type: "success", message: "AutoClaw proxy started", autoClose: 3000 });
        await new Promise((r) => setTimeout(r, 2000));
        await fetchAll();
      } else {
        addNotification({ type: "error", message: st.error || "Failed to start", autoClose: 5000 });
      }
    } catch {
      addNotification({ type: "error", message: "Failed to start AutoClaw proxy", autoClose: 5000 });
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const st = await apiFetch("stop", { method: "POST" });
      setStatus(st);
      setHealth(null);
      setAccounts([]);
      setWallets({});
      setError("AutoClaw proxy stopped.");
      addNotification({ type: "info", message: "AutoClaw proxy stopped", autoClose: 3000 });
    } catch {
      addNotification({ type: "error", message: "Failed to stop AutoClaw proxy", autoClose: 5000 });
    } finally {
      setStopping(false);
    }
  };

  const refreshAccount = async (email) => {
    setRefreshing((p) => ({ ...p, [email]: true }));
    try {
      const data = await apiFetch(`api/refresh/${encodeURIComponent(email)}`, { method: "POST" });
      if (data.success) {
        addNotification({ type: "success", message: `Token refreshed for ${email}`, autoClose: 3000 });
        fetchAll();
      } else {
        addNotification({ type: "error", message: `Refresh failed: ${data.error || "unknown"}`, autoClose: 5000 });
      }
    } catch {
      addNotification({ type: "error", message: "Cannot reach AutoClaw proxy", autoClose: 5000 });
    } finally {
      setRefreshing((p) => ({ ...p, [email]: false }));
    }
  };

  const refreshAll = async () => {
    setBulkRefreshing(true);
    try {
      const data = await apiFetch("refresh-all", { method: "POST" });
      const count = data.results?.filter((r) => r.success)?.length || 0;
      addNotification({ type: "success", message: `Refreshed ${count}/${accounts.length} tokens`, autoClose: 3000 });
      fetchAll();
    } catch {
      addNotification({ type: "error", message: "Bulk refresh failed", autoClose: 5000 });
    } finally {
      setBulkRefreshing(false);
    }
  };

  const connected = health && health.status === "ok";
  const proxyRunning = status && status.running;
  const activeAccounts = accounts.filter((a) => !a.expired).length;
  const totalBalance = Object.values(wallets).reduce((s, w) => s + (w.balance || 0), 0);
  const exhaustedCount = Object.values(wallets).filter((w) => w.status === "exhausted").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Automation</h1>
          {starting && <Badge variant="info" size="sm" dot>Starting Proxy...</Badge>}
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onAdded={fetchAll} />}
      {deleteTarget && (
        <ConfirmDeleteModal email={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={fetchAll} />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Automation</h1>
          {proxyRunning ? (
            <Badge variant={connected ? "success" : "warning"} size="sm" dot>
              {connected ? "AutoClaw Connected" : "Proxy Running (connecting...)"}
            </Badge>
          ) : (
            <Badge variant="error" size="sm" dot>Proxy Stopped</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {proxyRunning && (
            <>
              <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                <span className="material-symbols-outlined text-[16px] mr-1">add</span>
                Add Account
              </Button>
              <Badge variant="info" size="sm">Auto-refresh 30s</Badge>
              <Button variant="secondary" size="sm" onClick={fetchAll}>Refresh Now</Button>
              <Button variant="secondary" size="sm" onClick={handleStop} disabled={stopping}>
                {stopping ? "Stopping..." : "Stop Proxy"}
              </Button>
            </>
          )}
          {!proxyRunning && (
            <Button variant="primary" size="sm" onClick={handleStart} disabled={starting}>
              {starting ? "Starting..." : "Start Proxy"}
            </Button>
          )}
        </div>
      </div>

      {error && !proxyRunning ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-red-400 mb-4">power_off</span>
            <h2 className="text-lg font-semibold mb-2 text-text-main">AutoClaw Proxy Stopped</h2>
            <p className="text-sm text-text-muted max-w-md mb-6">The automation proxy is not running. Start it to manage your AutoClaw tokens.</p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={handleStart} disabled={starting}>
                {starting ? "Starting..." : "Start AutoClaw Proxy"}
              </Button>
            </div>
          </div>
        </Card>
      ) : error && proxyRunning ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="material-symbols-outlined text-[40px] text-amber-400 mb-3">sync_problem</span>
            <h2 className="text-base font-semibold mb-1 text-text-main">Waiting for Proxy</h2>
            <p className="text-sm text-text-muted mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={fetchAll}>Retry</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-brand-500/10">
                  <span className="material-symbols-outlined text-brand-500">person</span>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Accounts</p>
                  <p className="text-xl font-bold text-text-main">{accounts.length}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-green-500/10">
                  <span className="material-symbols-outlined text-green-500">check_circle</span>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Active Tokens</p>
                  <p className="text-xl font-bold text-green-500">{activeAccounts}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-amber-500/10">
                  <span className="material-symbols-outlined text-amber-500">account_balance_wallet</span>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Total Balance</p>
                  <p className="text-xl font-bold text-text-main">{totalBalance.toLocaleString()} pts</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-red-500/10">
                  <span className="material-symbols-outlined text-red-500">hourglass_empty</span>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Exhausted</p>
                  <p className="text-xl font-bold text-red-500">{exhaustedCount}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-main">Accounts</h2>
          </div>

          <Card>
            {accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="material-symbols-outlined text-[40px] text-text-muted mb-3">person_off</span>
                <p className="text-sm text-text-muted mb-3">No accounts configured in AutoClaw</p>
                <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                  <span className="material-symbols-outlined text-[16px] mr-1">add</span>
                  Add Account
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left py-3 px-4 font-semibold text-text-muted">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-text-muted">Token</th>
                      <th className="text-left py-3 px-4 font-semibold text-text-muted">Wallet</th>
                      <th className="text-left py-3 px-4 font-semibold text-text-muted">Requests</th>
                      <th className="text-right py-3 px-4 font-semibold text-text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((acc) => {
                      const wallet = wallets[acc.email];
                      const isRefreshing = refreshing[acc.email];
                      return (
                        <tr key={acc.email} className="border-b border-border-subtle hover:bg-surface-1 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[16px] text-text-muted">email</span>
                              <span className="font-medium text-text-main">{acc.email}</span>
                            </div>
                            <p className="text-xs text-text-muted mt-0.5">Added {relTime(acc.added_at)}</p>
                          </td>
                          <td className="py-3 px-4">
                            {acc.expired ? (
                              <Badge variant="error" size="sm">Expired</Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="success" size="sm" dot>Active</Badge>
                                <span className="text-xs text-text-muted">{acc.remaining_hours ?? "?"}h remaining</span>
                              </div>
                            )}
                            <p className="text-xs text-text-muted mt-0.5">Refreshed {relTime(acc.last_refreshed)}</p>
                          </td>
                          <td className="py-3 px-4">
                            {wallet ? (
                              <div>
                                <span className={`font-medium ${wallet.status === "exhausted" ? "text-red-500" : "text-text-main"}`}>
                                  {wallet.balance?.toLocaleString() ?? "N/A"} pts
                                </span>
                                {wallet.status === "exhausted" && (
                                  <Badge variant="error" size="sm" className="ml-2">Exhausted</Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-text-main">{acc.request_count}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="secondary" size="sm" onClick={() => refreshAccount(acc.email)} disabled={isRefreshing}>
                                {isRefreshing ? "..." : "Refresh"}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(acc.email)} className="!text-red-500">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="p-1">
              <h3 className="text-lg font-semibold text-text-main mb-3">Using AutoClaw with 9Router</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[18px] text-brand-500 mt-0.5">info</span>
                  <div>
                    <p className="text-text-main font-medium">Add as Custom Provider</p>
                    <p className="text-text-muted mt-0.5">
                      Go to <strong>Providers → Custom Providers → Add Custom Provider</strong> to add AutoClaw as an OpenAI-compatible provider.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[18px] text-brand-500 mt-0.5">settings</span>
                  <div>
                    <p className="text-text-main font-medium">Configuration</p>
                    <div className="mt-1 space-y-1 text-text-muted">
                      <p><strong>Type:</strong> openai-compatible</p>
                      <p><strong>Name:</strong> AutoClaw</p>
                      <p><strong>Prefix:</strong> ac</p>
                      <p><strong>Base URL:</strong> http://localhost:31000/v1</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[18px] text-brand-500 mt-0.5">layers</span>
                  <div>
                    <p className="text-text-main font-medium">Available Models</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {["glm-5.2", "glm-5-turbo", "cheap", "deepseek"].map((m) => (
                        <Badge key={m} variant="info" size="sm">{m}</Badge>
                      ))}
                    </div>
                    <p className="text-text-muted mt-1">
                      Use in combos as <code className="px-1 py-0.5 rounded bg-surface-2 text-xs">ac/ac/glm-5.2</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
