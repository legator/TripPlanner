'use client';

import { Place } from '@/lib/types';

interface PlaceCardProps {
  place: Place;
  icon: string;
  compact?: boolean;
}

export default function PlaceCard({ place, icon, compact = false }: PlaceCardProps) {
  const openInMaps = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}&query_place_id=${place.id}`;
    window.open(url, '_blank');
  };

  if (compact) {
    return (
      <button
        onClick={openInMaps}
        className="flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-100 transition-colors group"
      >
        <span className="text-sm flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-700 truncate group-hover:text-primary-600">
            {place.name}
          </p>
        </div>
        {place.rating && (
          <span className="text-xs text-amber-600 flex-shrink-0">
            ★ {place.rating}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={openInMaps}
      className="flex items-start gap-2.5 w-full text-left p-2.5 rounded-lg border border-gray-100 
                 hover:border-primary-200 hover:bg-primary-50/50 transition-all group"
    >
      <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 group-hover:text-primary-700 truncate">
          {place.name}
        </p>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {place.vicinity || place.address}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {place.rating && (
            <span className="text-xs text-amber-600">★ {place.rating}</span>
          )}
          {place.priceLevel !== undefined && (
            <span className="text-xs text-gray-400">
              {'$'.repeat(place.priceLevel)}
            </span>
          )}
          {place.isOpen !== undefined && (
            <span
              className={`text-xs ${
                place.isOpen ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {place.isOpen ? 'Open' : 'Closed'}
            </span>
          )}
        </div>
      </div>
      <svg
        className="w-4 h-4 text-gray-300 group-hover:text-primary-400 flex-shrink-0 mt-1"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </button>
  );
}
