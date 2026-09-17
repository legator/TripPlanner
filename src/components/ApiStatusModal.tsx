'use client';

import { useState, useEffect } from 'react';
import { useApiTracker, clearRateLimit } from '@/lib/apiTracker';
import type { HereUsageSummary } from '@/lib/quota/hereQuotaGuard';

interface ApiStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider?: 'google' | 'here';
  onSwitchProvider?: (provider: 'google' | 'here') => void;
}

export default function ApiStatusModal({
  isOpen,
  onClose,
  activeProvider = 'google',
  onSwitchProvider,
}: ApiStatusModalProps) {
  const tracker = useApiTracker();
  const [hereSummary, setHereSummary] = useState<HereUsageSummary | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingQuota(true);
    fetch('/api/quota/here')
      .then((r) => r.json())
      .then((data: HereUsageSummary) => setHereSummary(data))
      .catch((err) => console.warn('Failed to load HERE quota:', err))
      .finally(() => setIsLoadingQuota(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const providers = Object.values(tracker.providers);

  const getStatusBadge = (status: string, rateLimitedUntil: number | null) => {
    if (status === 'rate_limited') {
      const remainingSec = rateLimitedUntil
        ? Math.max(0, Math.round((rateLimitedUntil - Date.now()) / 1000))
        : 0;
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          Rate Limited {remainingSec > 0 ? `(${remainingSec}s)` : ''}
        </span>
      );
    }
    if (status === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Throttled / Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Healthy
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-xl bg-gray-900 text-white rounded-2xl shadow-2xl border border-white/15 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                API Limits & Quota Meter
              </h3>
              <p className="text-xs text-gray-400">
                Live monitoring of external map APIs and free-tier quotas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Active Provider Quick Switch */}
        <div className="px-5 py-3 bg-blue-950/40 border-b border-blue-500/20 flex items-center justify-between gap-3">
          <div className="text-xs">
            <span className="text-gray-400">Active Routing Provider: </span>
            <strong className="text-blue-300 uppercase tracking-wide">
              {activeProvider === 'here' ? 'HERE Maps' : 'Google Maps'}
            </strong>
          </div>
          {onSwitchProvider && (
            <button
              type="button"
              onClick={() => onSwitchProvider(activeProvider === 'google' ? 'here' : 'google')}
              className="py-1 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center gap-1"
            >
              <span>🔄 Switch to {activeProvider === 'google' ? 'HERE' : 'Google'}</span>
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* ── HERE Free Tier Progress Meter ── */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🌐</span>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    HERE Freemium Monthly Quota
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Base Plan: 30,000 free requests / month
                  </p>
                </div>
              </div>

              {hereSummary && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                    hereSummary.isRedisConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                  title={
                    hereSummary.isRedisConnected
                      ? 'Synced globally via Upstash Redis cloud'
                      : 'Running in local storage fallback mode'
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      hereSummary.isRedisConnected ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {hereSummary.isRedisConnected ? 'Upstash Redis Cloud' : 'Local Storage Mode'}
                </span>
              )}
            </div>

            {isLoadingQuota && !hereSummary ? (
              <div className="py-4 text-center text-xs text-gray-400 animate-pulse">
                Loading quota metrics...
              </div>
            ) : hereSummary ? (
              <>
                {/* Total Monthly Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 font-medium">
                      Month ({hereSummary.currentMonth}):{' '}
                      <strong className="text-white font-mono">
                        {hereSummary.totalUsed.toLocaleString()}
                      </strong>{' '}
                      / {hereSummary.totalLimit.toLocaleString()} used
                    </span>
                    <span
                      className={`font-bold font-mono text-[11px] ${
                        hereSummary.percentUsed >= 95
                          ? 'text-red-400'
                          : hereSummary.percentUsed >= 80
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {hereSummary.totalRemaining.toLocaleString()} remaining ({hereSummary.percentUsed}%)
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        hereSummary.percentUsed >= 95
                          ? 'bg-red-500'
                          : hereSummary.percentUsed >= 80
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-blue-500 to-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(1, hereSummary.percentUsed))}%` }}
                    />
                  </div>
                </div>

                {/* Per-Service Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {hereSummary.services.map((s) => (
                    <div
                      key={s.service}
                      className="bg-black/40 border border-white/5 rounded-lg p-2 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400 truncate">
                          {s.icon} {s.label.split(' ')[0]}
                        </span>
                        <span className="font-mono text-gray-300 font-bold">
                          {s.used}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.percentUsed >= 95
                              ? 'bg-red-500'
                              : s.percentUsed >= 80
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(1, s.percentUsed))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-gray-500">
                        <span>Max {s.limit >= 1000 ? `${s.limit / 1000}k` : s.limit}</span>
                        <span>{s.remaining.toLocaleString()} left</span>
                      </div>
                    </div>
                  ))}
                </div>

                {hereSummary.isExceeded && (
                  <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center justify-between gap-2">
                    <span>⚠️ Free quota threshold reached for this month.</span>
                    {onSwitchProvider && (
                      <button
                        type="button"
                        onClick={() => onSwitchProvider('google')}
                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] whitespace-nowrap"
                      >
                        Switch to Google
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* ── Daily Activity Tracker by Provider ── */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Daily Request Counters
            </h4>
            <div className="space-y-2.5">
              {providers.map((p) => {
                const isSelectedMap =
                  (p.provider === 'google' && activeProvider === 'google') ||
                  (p.provider === 'here' && activeProvider === 'here');

                return (
                  <div
                    key={p.provider}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{p.name}</span>
                        {isSelectedMap && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
                            Current
                          </span>
                        )}
                      </div>
                      {getStatusBadge(p.status, p.rateLimitedUntil)}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 rounded-lg p-2">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Requests Today</span>
                        <span className="text-white font-mono font-bold text-sm">
                          {p.totalRequestsToday}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Session Calls</span>
                        <span className="text-white font-mono font-bold text-sm">
                          {p.totalRequestsSession}
                        </span>
                      </div>
                    </div>

                    {p.lastError && (
                      <div className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg p-2 leading-relaxed">
                        <strong>Last Notice: </strong>
                        {p.lastError}
                      </div>
                    )}

                    {p.status === 'rate_limited' && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => clearRateLimit(p.provider)}
                          className="text-[11px] text-gray-400 hover:text-white underline"
                        >
                          Clear / Reset Cooldown
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-gray-400">
          <span>Monthly quotas reset automatically on the 1st</span>
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
