'use client';

import { useApiTracker, clearRateLimit } from '@/lib/apiTracker';

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

  if (!isOpen) return null;

  const providers = Object.values(tracker.providers);

  const getStatusBadge = (status: string, rateLimitedUntil: number | null) => {
    if (status === 'rate_limited') {
      const remainingSec = rateLimitedUntil ? Math.max(0, Math.round((rateLimitedUntil - Date.now()) / 1000)) : 0;
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
        className="relative w-full max-w-lg bg-gray-900 dark:bg-black text-white rounded-2xl shadow-2xl border border-white/15 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">API Limits & Usage Tracker</h3>
              <p className="text-xs text-gray-400">Live monitoring of external map and routing quotas</p>
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
        <div className="px-5 py-3.5 bg-blue-950/40 border-b border-blue-500/20 flex items-center justify-between gap-3">
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

        {/* Content list */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1 divide-y divide-white/5">
          {providers.map((p) => {
            const isSelectedMap =
              (p.provider === 'google' && activeProvider === 'google') ||
              (p.provider === 'here' && activeProvider === 'here');

            return (
              <div key={p.provider} className="pt-3.5 first:pt-0">
                <div className="flex items-center justify-between mb-1.5">
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

                <div className="grid grid-cols-2 gap-2 text-xs bg-white/5 rounded-xl p-2.5">
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
                  <div className="mt-2 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg p-2 leading-relaxed">
                    <strong>Last Notice: </strong>{p.lastError}
                  </div>
                )}

                {p.status === 'rate_limited' && (
                  <div className="mt-2 flex items-center justify-end">
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-gray-400">
          <span>Usage counters reset at midnight local time</span>
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
