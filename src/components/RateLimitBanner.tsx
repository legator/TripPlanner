'use client';

import { useState, useEffect } from 'react';
import { parseRateLimitDetails, clearRateLimit, ApiProvider } from '@/lib/apiTracker';

interface RateLimitBannerProps {
  error: string | null;
  activeProvider?: 'google' | 'here';
  onSwitchProvider?: (provider: 'google' | 'here') => void;
  onRetry?: () => void;
  onOpenStatusModal?: (tab?: 'quota' | 'byok') => void;
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

  const isUserQuota = error
    ? /free tier|monthly quota|trip planning limit|user_quota_exceeded/i.test(error)
    : false;

  const rateDetails = error ? parseRateLimitDetails(error, activeProvider) : null;
  const isLimit = isUserQuota || (rateDetails?.isRateLimit ?? false);

  useEffect(() => {
    if (!isLimit || isUserQuota) {
      setSecondsRemaining(null);
      return;
    }

    setSecondsRemaining(rateDetails?.retryAfter || 60);
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
  }, [error, isLimit, isUserQuota, rateDetails]);

  if (!isLimit) return null;

  const targetAlt: 'google' | 'here' = activeProvider === 'google' ? 'here' : 'google';
  const altName = targetAlt === 'here' ? 'HERE Maps' : 'Google Maps';
  const currentName = activeProvider === 'google' ? 'Google Maps' : 'HERE Maps';

  const handleSwitch = () => {
    clearRateLimit(activeProvider as ApiProvider);
    onSwitchProvider?.(targetAlt);
  };

  return (
    <div className="relative z-30 mx-3 sm:mx-6 my-2 animate-slideDown pointer-events-auto">
      <div
        className={`text-white border rounded-2xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isUserQuota
            ? 'bg-gradient-to-r from-purple-950/95 via-gray-900/95 to-blue-950/95 border-purple-500/40'
            : 'bg-gradient-to-r from-amber-950/95 via-gray-900/95 to-red-950/95 border-amber-500/40'
        }`}
      >
        {/* Warning info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 text-lg ${
              isUserQuota
                ? 'bg-purple-500/20 border-purple-400/40'
                : 'bg-amber-500/20 border-amber-400/40'
            }`}
          >
            {isUserQuota ? '🔑' : '⚠️'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  isUserQuota ? 'text-purple-300' : 'text-amber-300'
                }`}
              >
                {isUserQuota
                  ? 'Personal Free Trip Limit Reached'
                  : `API Limit Exceeded • ${currentName}`}
              </span>
              {secondsRemaining !== null && secondsRemaining > 0 && !isUserQuota && (
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded border border-amber-500/30">
                  Cooldown: {secondsRemaining}s
                </span>
              )}
            </div>
            <p className="text-xs text-gray-200 mt-0.5 leading-snug">
              {isUserQuota ? (
                <>
                  You have reached your device limit on the shared free tier.{' '}
                  <strong>Add your own free Google or HERE API key</strong> in Settings to plan
                  unlimited trips immediately.
                </>
              ) : (
                <>
                  {rateDetails?.message || `${currentName} request limit or daily quota reached.`}{' '}
                  You can seamlessly switch to <strong>{altName}</strong> to continue planning your
                  trip without delay.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
          {isUserQuota ? (
            <button
              type="button"
              onClick={() => onOpenStatusModal?.('byok')}
              className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg transition-all transform active:scale-95 flex items-center gap-1.5"
            >
              <span>🔑</span>
              <span>Add Custom Key (BYOK)</span>
            </button>
          ) : (
            onSwitchProvider && (
              <button
                type="button"
                onClick={handleSwitch}
                className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg transition-all transform active:scale-95 flex items-center gap-1.5"
              >
                <span>🔄</span>
                <span>Switch to {altName}</span>
              </button>
            )
          )}

          {onRetry && !isUserQuota && (
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
              onClick={() => onOpenStatusModal(isUserQuota ? 'byok' : 'quota')}
              className="py-1.5 px-2 rounded-xl text-gray-400 hover:text-white text-xs hover:bg-white/10 transition-colors"
              title="View API Usage and Limits"
            >
              {isUserQuota ? 'Keys' : 'Stats'}
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
