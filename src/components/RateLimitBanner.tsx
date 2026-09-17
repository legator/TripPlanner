'use client';

import { useState, useEffect } from 'react';
import { parseRateLimitDetails, clearRateLimit, ApiProvider } from '@/lib/apiTracker';

interface RateLimitBannerProps {
  error: string | null;
  activeProvider?: 'google' | 'here';
  onSwitchProvider?: (provider: 'google' | 'here') => void;
  onRetry?: () => void;
  onOpenStatusModal?: () => void;
  onDismiss?: () => void;
}

export default function RateLimitBanner({
  error,
  activeProvider = 'google',
  onSwitchProvider,
  onRetry,
  onOpenStatusModal,
  onDismiss,
}: RateLimitBannerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const rateDetails = error ? parseRateLimitDetails(error, activeProvider) : null;
  const isLimit = rateDetails?.isRateLimit ?? false;

  useEffect(() => {
    if (!isLimit || !rateDetails) {
      setSecondsRemaining(null);
      return;
    }

    setSecondsRemaining(rateDetails.retryAfter || 60);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [error, isLimit, rateDetails]);

  if (!isLimit || !rateDetails) return null;

  const targetAlt: 'google' | 'here' = activeProvider === 'google' ? 'here' : 'google';
  const altName = targetAlt === 'here' ? 'HERE Maps' : 'Google Maps';
  const currentName = activeProvider === 'google' ? 'Google Maps' : 'HERE Maps';

  const handleSwitch = () => {
    clearRateLimit(activeProvider as ApiProvider);
    onSwitchProvider?.(targetAlt);
  };

  return (
    <div className="relative z-30 mx-3 sm:mx-6 my-2 animate-slideDown pointer-events-auto">
      <div className="bg-gradient-to-r from-amber-950/95 via-gray-900/95 to-red-950/95 text-white border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Warning info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0 text-lg">
            ⚠️
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                API Limit Exceeded • {currentName}
              </span>
              {secondsRemaining !== null && secondsRemaining > 0 && (
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded border border-amber-500/30">
                  Cooldown: {secondsRemaining}s
                </span>
              )}
            </div>
            <p className="text-xs text-gray-200 mt-0.5 leading-snug">
              {rateDetails.message || `${currentName} request limit or daily quota reached.`}
              {' '}You can seamlessly switch to <strong>{altName}</strong> to continue planning your trip without delay.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
          {onSwitchProvider && (
            <button
              type="button"
              onClick={handleSwitch}
              className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg transition-all transform active:scale-95 flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>Switch to {altName}</span>
            </button>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={secondsRemaining !== null && secondsRemaining > 0}
              className="py-1.5 px-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 text-xs font-semibold border border-white/10 transition-all"
            >
              Retry
            </button>
          )}

          {onOpenStatusModal && (
            <button
              type="button"
              onClick={onOpenStatusModal}
              className="py-1.5 px-2 rounded-xl text-gray-400 hover:text-white text-xs hover:bg-white/10 transition-colors"
              title="View API Usage and Limits"
            >
              Stats
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
