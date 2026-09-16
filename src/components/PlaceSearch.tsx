'use client';

import { useState } from 'react';
import { Waypoint } from '@/lib/types';
import PlaceAutocomplete from './PlaceAutocomplete';
import HerePlaceAutocomplete from './HerePlaceAutocomplete';
import type { MapProviderChoice } from './MapProviderPicker';
import { getCurrentLocationWaypoint } from '@/lib/location';

interface PlaceSearchProps {
  onPlaceSelect: (waypoint: Waypoint) => void;
  placeholder?: string;
  disabled?: boolean;
  currentMapProvider?: MapProviderChoice | null;
  allowCurrentLocation?: boolean;
}

export default function PlaceSearch({
  onPlaceSelect,
  placeholder,
  disabled = false,
  currentMapProvider,
  allowCurrentLocation = true,
}: PlaceSearchProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const provider = currentMapProvider ?? (process.env.NEXT_PUBLIC_MAP_PROVIDER as MapProviderChoice);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const wp = await getCurrentLocationWaypoint(provider || undefined, 'My Location');
      onPlaceSelect(wp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to retrieve location';
      setLocationError(msg);
      setTimeout(() => setLocationError(null), 5000);
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center gap-1.5 w-full">
        <div className="flex-1 min-w-0">
          {provider === 'here' ? (
            <HerePlaceAutocomplete
              onPlaceSelect={onPlaceSelect}
              placeholder={placeholder}
              disabled={disabled || isLocating}
            />
          ) : (
            <PlaceAutocomplete
              onPlaceSelect={onPlaceSelect}
              placeholder={placeholder}
              disabled={disabled || isLocating}
            />
          )}
        </div>

        {allowCurrentLocation && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={disabled || isLocating}
            title="Use current location"
            className="flex-shrink-0 h-[38px] w-[38px] flex items-center justify-center text-gray-500 hover:text-primary-600 bg-gray-100 hover:bg-primary-50 dark:bg-gray-700 dark:hover:bg-primary-900/40 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors disabled:opacity-50"
          >
            {isLocating ? (
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
              </svg>
            )}
          </button>
        )}
      </div>

      {locationError && (
        <p className="text-xs text-red-600 dark:text-red-400 px-1 py-0.5 animate-fadeIn">
          {locationError}
        </p>
      )}
    </div>
  );
}
