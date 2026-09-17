'use client';

import { useState, useEffect, useCallback } from 'react';
import { Place, Waypoint, LatLng } from '@/lib/types';
import { generateUUID } from '@/lib/uuid';

interface CityParkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  onAddStop: (waypoint: Waypoint, insertIndex?: number) => void;
  onFocusLocation?: (location: LatLng, title: string) => void;
}

export default function CityParkingModal({
  isOpen,
  onClose,
  waypoints,
  onAddStop,
  onFocusLocation,
}: CityParkingModalProps) {
  // Target location selection
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number>(
    waypoints.length > 0 ? waypoints.length - 1 : 0
  );
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [radiusMeters, setRadiusMeters] = useState<number>(3000);
  const [selectedFacilityType, setSelectedFacilityType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parkingPlaces, setParkingPlaces] = useState<Place[]>([]);
  const [activeTab, setActiveTab] = useState<'waypoint' | 'custom'>('waypoint');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Current search center coordinates
  const currentCenter: LatLng | null =
    activeTab === 'waypoint' && waypoints[selectedWaypointIndex]
      ? waypoints[selectedWaypointIndex].location
      : null;

  const fetchParking = useCallback(
    async (lat: number, lng: number, query?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const url = new URL('/api/parking', window.location.origin);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lng', String(lng));
        url.searchParams.set('radius', String(radiusMeters));
        url.searchParams.set('mode', 'city');
        if (query && query.trim()) {
          url.searchParams.set('query', query.trim());
        }

        const res = await fetch(url.toString());
        if (!res.ok) {
          throw new Error(`Failed to fetch parking (${res.status})`);
        }
        const data = await res.json();
        setParkingPlaces(data.places || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error finding parking facilities');
        setParkingPlaces([]);
      } finally {
        setIsLoading(false);
      }
    },
    [radiusMeters]
  );

  // Auto-search when selected waypoint or radius changes
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'waypoint' && currentCenter) {
      fetchParking(currentCenter.lat, currentCenter.lng, customSearchQuery);
    }
  }, [isOpen, activeTab, selectedWaypointIndex, radiusMeters, currentCenter, customSearchQuery, fetchParking]);

  if (!isOpen) return null;

  const handleCustomSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSearchQuery.trim()) return;

    // If query contains coordinates lat,lng
    const match = customSearchQuery.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[3]);
      fetchParking(lat, lng);
      return;
    }

    // Otherwise search using discover with current waypoint anchor or Europe center
    const anchor = currentCenter || { lat: 52.52, lng: 13.405 };
    fetchParking(anchor.lat, anchor.lng, customSearchQuery);
  };

  const handleAddAsStop = (place: Place) => {
    const newWaypoint: Waypoint = {
      id: generateUUID(),
      name: `🅿️ ${place.name}`,
      address: place.address || place.vicinity || 'Parking facility',
      location: place.location,
    };

    // Insert just before destination or append
    const insertIdx =
      activeTab === 'waypoint' && selectedWaypointIndex >= 0
        ? selectedWaypointIndex
        : waypoints.length;

    onAddStop(newWaypoint, insertIdx);
    setAddedIds((prev) => new Set(prev).add(place.id));
  };

  const filteredPlaces = parkingPlaces.filter((p) => {
    if (selectedFacilityType === 'all') return true;
    return p.parkingDetails?.facilityType === selectedFacilityType;
  });

  const getFacilityIcon = (facilityType?: string) => {
    switch (facilityType) {
      case 'garage':
        return '🏢';
      case 'underground':
        return '🚇';
      case 'park_and_ride':
        return '🚆';
      case 'rest_area':
        return '🛑';
      default:
        return '🅿️';
    }
  };

  const getFacilityLabel = (facilityType?: string) => {
    switch (facilityType) {
      case 'garage':
        return 'Parking Garage';
      case 'underground':
        return 'Underground Garage';
      case 'park_and_ride':
        return 'Park & Ride';
      case 'rest_area':
        return 'Highway Rest Area';
      default:
        return 'Parking Lot';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-gray-800 dark:to-gray-850">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
              🅿️
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Find City Parking & Garages
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Search nearby parking facilities, lots, and park-and-rides
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search controls */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 space-y-3 bg-gray-50/50 dark:bg-gray-800/40">
          {/* Tab Selection */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('waypoint')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'waypoint'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'
              }`}
            >
              📍 Near Trip Waypoint
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'custom'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'
              }`}
            >
              🔍 Search Address / Query
            </button>
          </div>

          {activeTab === 'waypoint' ? (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                Search near:
              </label>
              <select
                value={selectedWaypointIndex}
                onChange={(e) => setSelectedWaypointIndex(Number(e.target.value))}
                className="flex-1 text-xs py-2 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {waypoints.map((wp, idx) => (
                  <option key={wp.id || idx} value={idx}>
                    {idx === 0
                      ? `🟢 Origin: ${wp.name}`
                      : idx === waypoints.length - 1
                      ? `🏁 Destination: ${wp.name}`
                      : `Stop ${idx}: ${wp.name}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <form onSubmit={handleCustomSearchSubmit} className="flex gap-2">
              <input
                type="text"
                value={customSearchQuery}
                onChange={(e) => setCustomSearchQuery(e.target.value)}
                placeholder="Enter city, street, or keyword (e.g. Berlin Parkhaus, Airport, P+R)..."
                className="flex-1 text-xs py-2 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              >
                Search
              </button>
            </form>
          )}

          {/* Filters: Radius & Type */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400 font-medium">Radius:</span>
              {[1000, 2000, 3000, 5000].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadiusMeters(r)}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                    radiusMeters === r
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-bold'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {r >= 1000 ? `${r / 1000} km` : `${r}m`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {['all', 'garage', 'lot', 'park_and_ride'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedFacilityType(type)}
                  className={`px-2 py-0.5 rounded-md capitalize transition-all ${
                    selectedFacilityType === type
                      ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800 font-bold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {type === 'all'
                    ? 'All'
                    : type === 'park_and_ride'
                    ? 'P+R'
                    : type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Searching nearest parking facilities...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl text-xs">
              {error}
            </div>
          ) : filteredPlaces.length === 0 ? (
            <div className="py-12 text-center text-gray-400 space-y-1">
              <p className="text-2xl">🅿️</p>
              <p className="text-xs font-medium">No parking facilities found in this area.</p>
              <p className="text-[11px]">Try increasing the search radius or choosing another stop.</p>
            </div>
          ) : (
            filteredPlaces.map((place) => {
              const isAdded = addedIds.has(place.id);
              const distanceKm =
                place.parkingDetails?.distanceMeters != null
                  ? (place.parkingDetails.distanceMeters / 1000).toFixed(1)
                  : null;

              return (
                <div
                  key={place.id}
                  className="p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-750 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl shadow-xs transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center text-lg flex-shrink-0">
                      {getFacilityIcon(place.parkingDetails?.facilityType)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {place.name}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                          {getFacilityLabel(place.parkingDetails?.facilityType)}
                        </span>
                        {place.isOpen !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              place.isOpen
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            }`}
                          >
                            {place.isOpen ? 'Open now' : 'Closed'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {place.address || place.vicinity}
                      </p>
                      {distanceKm && (
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                          📍 {distanceKm} km away from search center
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {onFocusLocation && (
                      <button
                        type="button"
                        onClick={() => onFocusLocation(place.location, place.name)}
                        className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-xs transition-colors"
                        title="View on Map"
                      >
                        🗺️
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAddAsStop(place)}
                      disabled={isAdded}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 ${
                        isAdded
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-sm'
                      }`}
                    >
                      {isAdded ? '✓ Added' : '+ Add Stop'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Found {filteredPlaces.length} facilities</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
