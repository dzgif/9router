"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";

export default function ProviderBackupPage() {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [providers, setProviders] = useState({});
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importStatus, setImportStatus] = useState("idle");
  const [importData, setImportData] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const importRef = useRef(null);

  useEffect(() => {
    fetch("/api/settings/provider-backup")
      .then((r) => r.json())
      .then((data) => {
        if (data.providers) {
          setProviders(data.providers);
          setSelected(Object.fromEntries(Object.keys(data.providers).map((k) => [k, true])));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    const providerList = Object.entries(selected).filter(([_, v]) => v).map(([k]) => k);
    if (providerList.length === 0) {
      addNotification({ type: "error", message: "Select at least one provider", autoClose: 3000 });
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/settings/provider-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export", providers: providerList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      a.href = url;
      a.download = `providers-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addNotification({ type: "success", message: "Backup downloaded", autoClose: 3000 });
    } catch (err) {
      addNotification({ type: "error", message: err.message, autoClose: 5000 });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.providers) throw new Error("Invalid backup file");
        setImportData(data);
        setImportStatus("preview");
      } catch (err) {
        addNotification({ type: "error", message: "Invalid backup file", autoClose: 5000 });
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = "";
  };

  const handleImport = async () => {
    if (!importData) return;
    setImportStatus("importing");
    try {
      const res = await fetch("/api/settings/provider-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", data: importData }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setImportResult(result);
      setImportStatus("done");
      addNotification({
        type: "success",
        message: `Imported ${result.imported} account(s), ${result.skipped} skipped`,
        autoClose: 5000,
      });
    } catch (err) {
      addNotification({ type: "error", message: err.message, autoClose: 5000 });
      setImportStatus("preview");
    }
  };

  const toggleAll = (val) => {
    setSelected(Object.fromEntries(Object.keys(providers).map((k) => [k, val])));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Provider Backup</h1>
        <p className="text-sm text-text-muted mt-1">Export or import provider accounts (tokens, API keys) per provider.</p>
      </div>

      <Card>
        <div className="p-5">
          <h2 className="text-base font-semibold text-text-main mb-1">Export</h2>
          <p className="text-sm text-text-muted mb-4">Select providers to include in the backup file.</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-surface-1 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : Object.keys(providers).length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No provider accounts found.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3 text-xs">
                <button onClick={() => toggleAll(true)} className="text-brand-500 hover:underline cursor-pointer">Select All</button>
                <span className="text-text-muted">·</span>
                <button onClick={() => toggleAll(false)} className="text-brand-500 hover:underline cursor-pointer">Deselect All</button>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {Object.entries(providers).map(([id, p]) => {
                  const reg = AI_PROVIDERS[id];
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-1 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [id]: e.target.checked }))}
                        className="accent-brand-500 size-4"
                      />
                      <div
                        className="size-8 shrink-0 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: reg?.color ? (reg.color.length > 7 ? reg.color : reg.color + "15") : "#66615" }}
                      >
                        <ProviderIcon
                          src={`/providers/${id}.png`}
                          alt={p.name}
                          size={24}
                          className="object-contain"
                          fallbackText={reg?.textIcon || id.slice(0, 2).toUpperCase()}
                          fallbackColor={reg?.color}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-main truncate">{p.name}</p>
                        <p className="text-xs text-text-muted">{p.authType} · {p.connectionCount} account(s)</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <Button
                variant="primary"
                className="w-full justify-center mt-4"
                onClick={handleExport}
                loading={exporting}
                disabled={Object.keys(providers).length === 0}
              >
                <span className="material-symbols-outlined text-[16px] mr-1">download</span>
                Export Selected ({Object.entries(selected).filter(([_, v]) => v).length})
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h2 className="text-base font-semibold text-text-main mb-1">Import</h2>
          <p className="text-sm text-text-muted mb-4">Upload a previously exported backup file.</p>

          {importStatus === "idle" && (
            <div className="border-2 border-dashed border-border-subtle rounded-xl p-8 text-center hover:border-brand-500/50 transition-colors">
              <span className="material-symbols-outlined text-[40px] text-text-muted mb-2">cloud_upload</span>
              <p className="text-sm text-text-muted mb-3">Drop a backup JSON file or click to browse</p>
              <Button variant="secondary" size="sm" onClick={() => importRef.current?.click()}>
                Choose File
              </Button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
            </div>
          )}

          {importStatus === "preview" && importData && (
            <div className="space-y-4">
              <div className="bg-surface-1 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-text-main">Preview — {new Date(importData.exportedAt).toLocaleString()}</p>
                <div className="divide-y divide-border-subtle">
                  {Object.entries(importData.providers).map(([id, p]) => {
                    const reg = AI_PROVIDERS[id];
                    return (
                      <div key={id} className="flex items-center gap-3 py-2">
                        <div
                          className="size-8 shrink-0 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: reg?.color ? (reg.color.length > 7 ? reg.color : reg.color + "15") : "#66615" }}
                        >
                          <ProviderIcon
                            src={`/providers/${id}.png`}
                            alt={p.name}
                            size={24}
                            className="object-contain"
                            fallbackText={reg?.textIcon || id.slice(0, 2).toUpperCase()}
                            fallbackColor={reg?.color}
                          />
                        </div>
                        <span className="text-sm text-text-main flex-1">{p.name}</span>
                        <span className="text-xs text-text-muted">{p.connections.length} account(s)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1 justify-center" onClick={handleImport}>
                  <span className="material-symbols-outlined text-[16px] mr-1">upload</span>
                  Import Accounts
                </Button>
                <Button variant="secondary" onClick={() => { setImportStatus("idle"); setImportData(null); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {importStatus === "importing" && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <span className="inline-block w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              <span className="text-sm text-text-main font-medium">Importing accounts...</span>
            </div>
          )}

          {importStatus === "done" && importResult && (
            <div className="space-y-3">
              <div className="bg-surface-1 rounded-lg p-4 text-center">
                <span className="material-symbols-outlined text-[32px] text-green-500">check_circle</span>
                <p className="text-sm font-medium text-text-main mt-1">Import Complete</p>
                <p className="text-xs text-text-muted mt-1">
                  {importResult.imported} imported · {importResult.skipped} skipped
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => { setImportStatus("idle"); setImportData(null); setImportResult(null); }}>
                  Import Another
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
