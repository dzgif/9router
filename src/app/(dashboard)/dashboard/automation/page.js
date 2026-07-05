"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardSkeleton, Badge, Button } from "@/shared/components";
import Link from "next/link";

const AUTOMATION_PROVIDERS = [
  {
    id: "autoclaw",
    name: "AutoClaw",
    icon: "robot_2",
    description: "AutoClaw proxy — manage tokens, refresh accounts, wallet monitoring. Supports Google OAuth and batch import.",
    statusUrl: "/api/autoclaw/status",
    href: "/dashboard/automation/autoclaw",
    color: "brand-500",
  },
  // Future providers:
  // { id: "kiro", name: "Kiro", icon: "...", description: "...", ... },
  // { id: "alibaba", name: "Alibaba", icon: "...", description: "...", ... },
];

function ProviderCard({ provider }) {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(provider.statusUrl);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, [provider.statusUrl]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const running = status?.running;
  const connected = status?.ready;
  const hasError = status?.error;

  const statusBadge = () => {
    if (checking) return <Badge variant="info" size="sm">Checking...</Badge>;
    if (running && connected) return <Badge variant="success" size="sm" dot>Running</Badge>;
    if (running) return <Badge variant="warning" size="sm" dot>Starting...</Badge>;
    if (hasError) return <Badge variant="error" size="sm" dot>Error</Badge>;
    return <Badge variant="default" size="sm">Stopped</Badge>;
  };

  return (
    <Link href={provider.href} className="block group">
      <Card className="transition-all group-hover:ring-1 group-hover:ring-brand-500/30 group-hover:shadow-lg">
        <div className="flex items-start gap-4">
          <div className={`flex items-center justify-center size-12 rounded-xl bg-${provider.color}/10 shrink-0`}>
            <span className={`material-symbols-outlined text-[24px] text-${provider.color}`}>
              {provider.icon}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-text-main">{provider.name}</h3>
              {statusBadge()}
            </div>
            <p className="text-sm text-text-muted line-clamp-2">{provider.description}</p>
            {running && (
              <p className="text-xs text-text-muted mt-2">
                Port {status.port} · Python: {status.python || "N/A"}
              </p>
            )}
            {!running && !checking && !hasError && (
              <p className="text-xs text-text-muted mt-2">Click to start</p>
            )}
            {hasError && (
              <p className="text-xs text-red-400 mt-2 truncate">{status.error}</p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function AutomationListPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Brief delay to let status checks settle
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Automation</h1>
          <p className="text-sm text-text-muted mt-1">
            Manage automation providers — token refresh, account management, and proxy services.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AUTOMATION_PROVIDERS.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      )}

      {!loading && AUTOMATION_PROVIDERS.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-text-muted mb-3">robot_2</span>
            <h2 className="text-lg font-semibold text-text-main mb-1">No Automation Providers</h2>
            <p className="text-sm text-text-muted">Automation providers will appear here once configured.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
