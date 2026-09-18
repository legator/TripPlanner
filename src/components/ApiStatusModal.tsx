'use client';

import { useState, useEffect } from 'react';
import { useApiTracker, clearRateLimit } from '@/lib/apiTracker';
import type { HereUsageSummary } from '@/lib/quota/hereQuotaGuard';
import type { UserQuotaStatus } from '@/lib/quota/userQuotaGuard';
import {
  getCustomApiKeys,
  setCustomApiKeys,
  clearCustomApiKeys,
  getApiAuthHeaders,
} from '@/lib/userKeys';

interface ApiStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider?: 'google' | 'here';
  onSwitchProvider?: (provider: 'google' | 'here') => void;
  initialTab?: 'quota' | 'byok';
}

export default function ApiStatusModal({
  isOpen,
  onClose,
  activeProvider = 'google',
  onSwitchProvider,
  initialTab = 'quota',
}: ApiStatusModalProps) {
  const tracker = useApiTracker();
  const [activeTab, setActiveTab] = useState<'quota' | 'byok'>(initialTab);
  const [hereSummary, setHereSummary] = useState<HereUsageSummary | null>(null);
  const [userQuota, setUserQuota] = useState<UserQuotaStatus | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);

  // BYOK form state
  const [googleKeyInput, setGoogleKeyInput] = useState('');
  const [hereKeyInput, setHereKeyInput] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      const keys = getCustomApiKeys();
      setGoogleKeyInput(keys.googleKey || '');
      setHereKeyInput(keys.hereKey || '');
      setSaveSuccess(false);
    }
  }, [isOpen, initialTab]);

  const loadQuotas = () => {
    setIsLoadingQuota(true);
    const authHeaders = getApiAuthHeaders();

    Promise.all([
      fetch('/api/quota/here')
        .then((r) => r.json())
        .catch(() => null),
      fetch('/api/quota/user', { headers: authHeaders })
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([hereData, userData]) => {
        if (hereData && !hereData.error) setHereSummary(hereData);
        if (userData && !userData.error) setUserQuota(userData);
      })
      .finally(() => setIsLoadingQuota(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    loadQuotas();
  }, [isOpen]);

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();
    const prevKeys = getCustomApiKeys();
    const newGoogleKey = googleKeyInput.trim();
    const newHereKey = hereKeyInput.trim();

    setCustomApiKeys({
      googleKey: newGoogleKey || undefined,
      hereKey: newHereKey || undefined,
    });

    setSaveSuccess(true);
    if (prevKeys.googleKey !== newGoogleKey) {
      setNeedsReload(true);
    }

    setTimeout(() => {
      loadQuotas();
      setSaveSuccess(false);
    }, 1500);
  };

  const handleClearKeys = () => {
    clearCustomApiKeys();
    setGoogleKeyInput('');
    setHereKeyInput('');
    setSaveSuccess(true);
    setNeedsReload(true);
    setTimeout(() => {
      loadQuotas();
      setSaveSuccess(false);
    }, 1500);
  };

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

  const isBYOKActive = userQuota?.tier === 'byok' || Boolean(googleKeyInput || hereKeyInput);

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
                Personal usage quotas and custom provider API key setup
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

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-white/10 bg-black/40 px-5 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('quota')}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'quota'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>📊 Usage & Quotas</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('byok')}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'byok'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>🔑 Custom Keys (BYOK)</span>
            {isBYOKActive && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Active Provider Quick Switch */}
        <div className="px-5 py-2.5 bg-blue-950/40 border-b border-blue-500/20 flex items-center justify-between gap-3">
          <div className="text-xs">
            <span className="text-gray-400">Routing Provider: </span>
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
          {activeTab === 'quota' && (
            <>
              {/* ── Personal User Quota Meter ── */}
              <div className="bg-gradient-to-br from-blue-950/40 via-gray-900 to-indigo-950/40 border border-blue-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👤</span>
                    <div>
                      <h4 className="text-sm font-bold text-white">Your Plan Allowance</h4>
                      <p className="text-[11px] text-gray-400">
                        {userQuota?.tier === 'byok'
                          ? 'BYOK active — unlimited trip plans'
                          : 'Personal allowance on shared server keys'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      userQuota?.tier === 'byok'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        userQuota?.tier === 'byok' ? 'bg-emerald-400' : 'bg-blue-400'
                      }`}
                    />
                    {userQuota?.tier === 'byok' ? 'BYOK Unlimited ⚡' : 'Free Community Tier'}
                  </span>
                </div>

                {isLoadingQuota && !userQuota ? (
                  <div className="py-3 text-center text-xs text-gray-400 animate-pulse">
                    Loading your usage metrics...
                  </div>
                ) : userQuota?.tier === 'byok' ? (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-lg text-xs text-emerald-200 flex items-center justify-between">
                    <span>You are using custom API keys. Shared free limits do not apply.</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('byok')}
                      className="text-emerald-300 font-bold underline text-xs"
                    >
                      Manage Keys
                    </button>
                  </div>
                ) : userQuota ? (
                  <div className="space-y-2">
                    {/* Monthly Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">
                          Monthly Trips:{' '}
                          <strong className="text-white font-mono font-bold">
                            {userQuota.monthly.used}
                          </strong>{' '}
                          / {userQuota.monthly.limit}
                        </span>
                        <span
                          className={`font-mono text-[11px] font-bold ${
                            userQuota.monthly.remaining <= 1
                              ? 'text-red-400'
                              : userQuota.monthly.remaining <= 3
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {userQuota.monthly.remaining} trips left this month
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden border border-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            userQuota.monthly.used >= userQuota.monthly.limit
                              ? 'bg-red-500'
                              : userQuota.monthly.used >= userQuota.monthly.limit - 3
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(3, (userQuota.monthly.used / userQuota.monthly.limit) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Daily & Reset details */}
                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                      <span>
                        Today: <strong className="text-gray-200">{userQuota.daily.used}</strong> /{' '}
                        {userQuota.daily.limit} trips planned
                      </span>
                      <span>Next reset: {userQuota.monthly.resetDate}</span>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('byok')}
                        className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-blue-300 font-semibold border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>🔑 Want unlimited trips? Enter your free API keys</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── HERE Free Tier Progress Meter ── */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌐</span>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        HERE Freemium Pool (Global)
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        Shared pool: 30,000 free requests / month
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
                    Loading HERE quota metrics...
                  </div>
                ) : hereSummary ? (
                  <>
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

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {hereSummary.services.map((s) => (
                        <div
                          key={s.service}
                          className="bg-black/30 rounded-lg p-2 border border-white/5 space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-300 flex items-center gap-1 truncate">
                              <span>{s.icon}</span>
                              <span className="truncate">{s.label}</span>
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-mono font-bold text-white">
                              {s.used.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              / {s.limit >= 1000 ? `${s.limit / 1000}k` : s.limit}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              {/* ── Daily Provider Requests ── */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Device Session Counters
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
                                Active
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
                            <strong>Notice: </strong>
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
            </>
          )}

          {activeTab === 'byok' && (
            <form onSubmit={handleSaveKeys} className="space-y-4">
              <div className="bg-gradient-to-r from-blue-950/40 to-purple-950/40 border border-blue-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔑</span>
                  <h4 className="text-sm font-bold text-white">Bring Your Own Key (BYOK)</h4>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Enter your personal API keys to bypass all shared rate limits and plan unlimited trips.
                  Keys are stored exclusively on your device.
                </p>
              </div>

              {/* Google Key Field */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="google-key-input" className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🔴</span> Google Maps Platform API Key
                  </label>
                  <a
                    href="https://console.cloud.google.com/google/maps-apis"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                  >
                    Get Free Key ($200/mo credit) ↗
                  </a>
                </div>
                <input
                  id="google-key-input"
                  type="password"
                  value={googleKeyInput}
                  onChange={(e) => setGoogleKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-gray-400">
                  Required APIs: Directions API, Places API (New), Maps JavaScript API, Geocoding API.
                </p>
              </div>

              {/* HERE Key Field */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="here-key-input" className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🌐</span> HERE Platform API Key
                  </label>
                  <a
                    href="https://platform.here.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                  >
                    Get Free Key (30,000 req/mo) ↗
                  </a>
                </div>
                <input
                  id="here-key-input"
                  type="password"
                  value={hereKeyInput}
                  onChange={(e) => setHereKeyInput(e.target.value)}
                  placeholder="Your HERE REST API key..."
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-gray-400">
                  Includes Routing API v8, Geocoding & Search API, and Traffic Flow/Incidents.
                </p>
              </div>

              {/* Status & Feedback */}
              {saveSuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <span>✓</span>
                  <span>API keys updated successfully!</span>
                </div>
              )}

              {needsReload && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-2">
                  <span>Reload map session to activate new Google Maps JS SDK?</span>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs transition-colors"
                  >
                    Reload Now
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleClearKeys}
                  className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                >
                  Clear Custom Keys & Revert to Free Tier
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95"
                >
                  Save API Keys
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-gray-400">
          <span>{activeTab === 'quota' ? 'Monthly quotas reset on the 1st' : 'Keys stored locally in browser'}</span>
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
