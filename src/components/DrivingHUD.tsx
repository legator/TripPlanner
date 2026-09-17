'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DayPlan, Place, PlaceType, TrafficIncident, TripPlan } from '@/lib/types';
import { LiveDrivingPosition, calculateHaversineDistanceKm, getNavigationAppUrl } from '@/lib/location';
import { getOrderedDayTargetStops, findUpcomingStopOnDay, findActiveTripDayAndTarget, checkRouteDeviation, DayTargetStop } from '@/lib/routeProgress';
import { voiceGuidance } from '@/lib/voiceGuidance';
import { saveDrivingSession } from '@/lib/driveSession';
import { fetchWeather, WeatherAlert } from '@/lib/weather';

export type QuickStopCategory = 'gas' | 'food' | 'rest';

interface DrivingHUDProps {
  day: DayPlan;
  dayIndex: number;
  totalDays: number;
  currentPosition: LiveDrivingPosition | null;
  autoFollow: boolean;
  onRecenter: () => void;
  onExit: () => void;
  wakeLockActive: boolean;
  onFocusPlace?: (place: Place | null) => void;
  onAddStop?: (place: Place) => void;
  onReroute?: (fromLocation: { lat: number; lng: number }, targetStop: DayTargetStop) => void;
  mapProvider?: string;
  tripPlan?: TripPlan | null;
  onChangeDay?: (dayIndex: number) => void;
}

interface PlaceWithDistance extends Place {
  distanceKm: number;
  driveTimeMin: number;
}

export default function DrivingHUD({
  day,
  dayIndex,
  totalDays,
  currentPosition,
  autoFollow,
  onRecenter,
  onExit,
  wakeLockActive,
  onFocusPlace,
  onAddStop,
  onReroute,
  mapProvider,
  tripPlan,
  onChangeDay,
}: DrivingHUDProps) {
  const [activeCategory, setActiveCategory] = useState<QuickStopCategory | 'traffic' | null>(null);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [livePlaces, setLivePlaces] = useState<{ [key in QuickStopCategory]: Place[] }>({
    gas: [],
    food: [],
    rest: [],
  });
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [trafficIncidents, setTrafficIncidents] = useState<TrafficIncident[]>([]);
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);
  const [dismissedIncidents, setDismissedIncidents] = useState<string[]>([]);
  const lastFetchedTrafficRef = useRef<{ lat: number; lng: number } | null>(null);
  const [navTargetPlace, setNavTargetPlace] = useState<Place | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [activeWeatherAlert, setActiveWeatherAlert] = useState<WeatherAlert | null>(null);
  const weatherAnnouncedRef = useRef<boolean>(false);

  const showNotice = useCallback((msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  }, []);

  // Speed in km/h (position.speed is in m/s)
  const speedKmh = currentPosition?.speed && currentPosition.speed > 0.5
    ? Math.round(currentPosition.speed * 3.6)
    : 0;

  // Ordered list of upcoming destination targets for this day
  const allStops = useMemo(() => {
    return getOrderedDayTargetStops(day, dayIndex);
  }, [day, dayIndex]);

  // Optional manual target index override
  const [manualTargetIndex, setManualTargetIndex] = useState<number | null>(null);
  const prevTargetIdRef = useRef<string | null>(null);
  const hasAutoSyncedDayRef = useRef<boolean>(false);

  // ── PiP (Picture-in-Picture) Mode Detection ──
  const [isPip, setIsPip] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 340 || window.innerHeight <= 400;
  });

  useEffect(() => {
    const handlePipChange = (e: Event) => {
      const custom = e as CustomEvent<{ isInPip: boolean }>;
      if (custom.detail?.isInPip != null) {
        setIsPip(custom.detail.isInPip);
      }
    };

    const handleResize = () => {
      const small = window.innerWidth <= 340 || window.innerHeight <= 400;
      setIsPip((prev) => (small ? true : prev && window.innerWidth <= 450));
    };

    window.addEventListener('pipModeChange', handlePipChange);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('pipModeChange', handlePipChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Auto-sync active Day when entering drive mode based on vehicle's live GPS coordinates
  useEffect(() => {
    if (hasAutoSyncedDayRef.current || !currentPosition || !tripPlan || !onChangeDay) return;
    hasAutoSyncedDayRef.current = true;

    const active = findActiveTripDayAndTarget(
      tripPlan,
      { lat: currentPosition.lat, lng: currentPosition.lng }
    );

    if (active.activeDayIndex !== dayIndex) {
      showNotice(`📍 Located on Day ${active.activeDayIndex + 1} • Next: ${active.targetStop.name.split(',')[0]}`);
      onChangeDay(active.activeDayIndex);
    }
  }, [currentPosition, tripPlan, dayIndex, onChangeDay, showNotice]);

  // Automatically find the upcoming stop from vehicle's progress along the route
  const upcomingResult = useMemo(() => {
    return findUpcomingStopOnDay(
      day,
      dayIndex,
      currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null
    );
  }, [day, dayIndex, currentPosition]);

  const activeStopIndex =
    manualTargetIndex !== null && manualTargetIndex < allStops.length
      ? manualTargetIndex
      : upcomingResult.targetIndex;

  const targetStop: DayTargetStop = allStops[activeStopIndex] || upcomingResult.targetStop;
  const targetLocation = targetStop.location;
  const targetName = targetStop.name.split(',')[0];

  // Auto-advancement toast notice when a stop has been reached / passed
  useEffect(() => {
    const currentId = targetStop.id;
    if (prevTargetIdRef.current && prevTargetIdRef.current !== currentId) {
      const prevStop = allStops.find((s) => s.id === prevTargetIdRef.current);
      if (prevStop) {
        showNotice(`✅ Passed ${prevStop.name.split(',')[0]} • Next: ${targetName}`);
      }
    }
    prevTargetIdRef.current = currentId;
  }, [targetStop.id, allStops, targetName, showNotice]);

  // If driver has completed the entire day and there is a next day, advance automatically
  useEffect(() => {
    if (upcomingResult.isDayPassed && dayIndex + 1 < totalDays && onChangeDay) {
      showNotice(`🎉 Day ${dayIndex + 1} Complete! Starting Day ${dayIndex + 2}`);
      setManualTargetIndex(null);
      onChangeDay(dayIndex + 1);
    }
  }, [upcomingResult.isDayPassed, dayIndex, totalDays, onChangeDay, showNotice]);

  // Remaining distance in km to THIS immediate upcoming target
  const distanceRemainingKm =
    activeStopIndex === upcomingResult.targetIndex && upcomingResult.distanceToTargetKm > 0
      ? upcomingResult.distanceToTargetKm
      : currentPosition
      ? Math.round(
          calculateHaversineDistanceKm(
            { lat: currentPosition.lat, lng: currentPosition.lng },
            targetLocation
          ) * 10
        ) / 10
      : Math.round(calculateHaversineDistanceKm(day.startLocation.location, targetLocation) * 10) / 10;

  // Total remaining day distance to overnight stop
  const totalDayRemainingKm = currentPosition
    ? Math.round(
        calculateHaversineDistanceKm(
          { lat: currentPosition.lat, lng: currentPosition.lng },
          day.endLocation.location
        ) * 10
      ) / 10
    : day.distanceKm;

  // Heading degrees and cardinal direction
  const heading = currentPosition?.heading != null ? Math.round(currentPosition.heading) : null;
  const getCardinalDirection = (deg: number | null) => {
    if (deg == null) return '';
    const val = Math.floor((deg / 22.5) + 0.5);
    const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return arr[val % 16];
  };

  // ── Voice Guidance, Off-Route Deviation & Dynamic Traffic ETA ──
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => voiceGuidance.isVoiceEnabled());
  const [isRerouting, setIsRerouting] = useState(false);
  const [liveTrafficEta, setLiveTrafficEta] = useState<{
    durationMinutes: number;
    distanceKm: number;
    trafficDelayMinutes: number;
    etaArrivalTime: string;
  } | null>(null);

  const offRouteCountRef = useRef(0);
  const lastRerouteTimeRef = useRef(0);
  const lastEtaQueryTimeRef = useRef(0);
  const announcedStopsRef = useRef<Set<string>>(new Set());

  // Toggle voice prompts
  const handleToggleVoice = () => {
    const nextState = voiceGuidance.toggleVoice();
    setIsVoiceEnabled(nextState);
    showNotice(nextState ? '🔊 Voice Guidance Enabled' : '🔇 Voice Guidance Muted');
  };

  // Announce upcoming stops (2km, 500m, arrived)
  useEffect(() => {
    const distM = Math.round(distanceRemainingKm * 1000);
    if (distM <= 250 && !announcedStopsRef.current.has(`${targetStop.id}_here`)) {
      announcedStopsRef.current.add(`${targetStop.id}_here`);
      voiceGuidance.announceUpcomingTurn(targetName, 50);
    } else if (distM <= 550 && distM > 350 && !announcedStopsRef.current.has(`${targetStop.id}_500m`)) {
      announcedStopsRef.current.add(`${targetStop.id}_500m`);
      voiceGuidance.announceUpcomingTurn(targetName, 500);
    } else if (distM <= 2100 && distM > 1800 && !announcedStopsRef.current.has(`${targetStop.id}_2k`)) {
      announcedStopsRef.current.add(`${targetStop.id}_2k`);
      voiceGuidance.announceUpcomingTurn(targetName, 2000);
    }
  }, [distanceRemainingKm, targetStop.id, targetName]);

  // Persist driving progress to localStorage so user can close and reopen app seamlessly
  useEffect(() => {
    saveDrivingSession({
      dayIndex,
      targetStopId: targetStop.id,
      manualTargetIndex,
    });
  }, [dayIndex, targetStop.id, manualTargetIndex]);

  // Route deviation detection & automatic recalculation
  useEffect(() => {
    if (!currentPosition) return;
    const deviation = checkRouteDeviation(
      { lat: currentPosition.lat, lng: currentPosition.lng },
      day,
      200
    );

    if (deviation.isDeviated) {
      offRouteCountRef.current += 1;
      const now = Date.now();
      if (offRouteCountRef.current >= 3 && now - lastRerouteTimeRef.current > 30000) {
        lastRerouteTimeRef.current = now;
        offRouteCountRef.current = 0;
        setIsRerouting(true);
        voiceGuidance.announceReroute();
        showNotice('⚠️ Off route — Recalculating route...');

        onReroute?.({ lat: currentPosition.lat, lng: currentPosition.lng }, targetStop);
        setTimeout(() => setIsRerouting(false), 3500);
      }
    } else {
      offRouteCountRef.current = 0;
    }
  }, [currentPosition, day, targetStop, onReroute, showNotice]);

  // Query dynamic traffic ETA from routing provider
  const fetchLiveTrafficEta = useCallback(async () => {
    if (!currentPosition || !targetLocation) return;
    const now = Date.now();
    if (now - lastEtaQueryTimeRef.current < 45000) return;
    lastEtaQueryTimeRef.current = now;

    try {
      const res = await fetch('/api/route/eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: currentPosition.lat, lng: currentPosition.lng },
          destination: targetLocation,
          provider: mapProvider,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiveTrafficEta(data);
      }
    } catch (err) {
      console.warn('Dynamic traffic ETA query error:', err);
    }
  }, [currentPosition, targetLocation, mapProvider]);

  useEffect(() => {
    fetchLiveTrafficEta();
  }, [currentPosition?.lat, currentPosition?.lng, targetLocation?.lat, targetLocation?.lng, fetchLiveTrafficEta]);

  // Fetch weather safety alerts for the target location on this day
  useEffect(() => {
    if (!targetLocation || !day.date) return;
    fetchWeather(targetLocation.lat, targetLocation.lng, day.date, 1).then((results) => {
      const today = results[0];
      if (today && today.alerts && today.alerts.length > 0) {
        const topAlert = today.alerts[0];
        setActiveWeatherAlert(topAlert);
        if (!weatherAnnouncedRef.current && isVoiceEnabled) {
          weatherAnnouncedRef.current = true;
          voiceGuidance.announceWeatherWarning(`${topAlert.title}. ${topAlert.message}`);
        }
      } else {
        setActiveWeatherAlert(null);
      }
    });
  }, [targetLocation, day.date, isVoiceEnabled]);

  // Rough ETA minutes fallback vs dynamic traffic ETA
  const effectiveSpeedKmh = speedKmh > 20 ? speedKmh : 70;
  const etaMinutes =
    liveTrafficEta?.durationMinutes ??
    Math.round((distanceRemainingKm / effectiveSpeedKmh) * 60);
  const etaHours = Math.floor(etaMinutes / 60);
  const etaMins = etaMinutes % 60;
  const etaFormatted = etaHours > 0 ? `${etaHours}h ${etaMins}m` : `${etaMins} min`;

  // Helper to compute distance and drive time from current GPS position (or start location)
  const computeDistanceAndDriveTime = useCallback(
    (placeLocation: { lat: number; lng: number }): { distanceKm: number; driveTimeMin: number } => {
      const origin = currentPosition
        ? { lat: currentPosition.lat, lng: currentPosition.lng }
        : day.startLocation.location;
      const dist = calculateHaversineDistanceKm(origin, placeLocation);
      const estSpeed = speedKmh > 25 ? speedKmh : 65;
      const mins = Math.max(1, Math.round((dist / estSpeed) * 60));
      return { distanceKm: dist, driveTimeMin: mins };
    },
    [currentPosition, day.startLocation.location, speedKmh]
  );

  // Group and sort places for each quick-stop category
  const categorizedPlaces = useMemo(() => {
    const processList = (routePlaces: Place[], liveList: Place[], defaultType: PlaceType): PlaceWithDistance[] => {
      const mergedMap = new Map<string, Place>();
      routePlaces.forEach((p) => mergedMap.set(p.id || `${p.location.lat},${p.location.lng}`, p));
      liveList.forEach((p) => mergedMap.set(p.id || `${p.location.lat},${p.location.lng}`, p));

      return Array.from(mergedMap.values())
        .map((p) => {
          const { distanceKm, driveTimeMin } = computeDistanceAndDriveTime(p.location);
          return {
            ...p,
            type: p.type || defaultType,
            distanceKm,
            driveTimeMin,
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);
    };

    // Gas Stations
    const gas = processList(day.gasStops || [], livePlaces.gas, PlaceType.GAS_STATION);

    // Food / Restaurants / Cafes
    const food = processList(day.restaurants || [], livePlaces.food, PlaceType.RESTAURANT);

    // Rest Stops / Places to relax (attractions, campgrounds, viewpoints, rest areas, parking)
    const restSource = [
      ...(day.attractions || []),
      ...(day.campgrounds || []),
      ...(day.parkingStops || []),
    ];
    const rest = processList(restSource, livePlaces.rest, PlaceType.REST_STOP);

    return { gas, food, rest };
  }, [day, livePlaces, computeDistanceAndDriveTime]);

  // Format distance cleanly (e.g. "850 m" or "4.2 km")
  const formatDistance = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  // Fetch nearby traffic incidents from HERE Traffic API v7 matched along the actual route corridor
  const fetchTrafficIncidents = useCallback(async () => {
    const lat = currentPosition?.lat ?? day.startLocation.location.lat;
    const lng = currentPosition?.lng ?? day.startLocation.location.lng;

    setIsLoadingTraffic(true);
    try {
      let res: Response;
      const corridorPolyline = day.polylineSegments?.[0] || tripPlan?.overviewPolyline;

      if (corridorPolyline) {
        res = await fetch('/api/traffic/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            corridor: corridorPolyline,
            radius: 300,
            limit: 40,
          }),
        });
      } else {
        res = await fetch(`/api/traffic/incidents?lat=${lat}&lng=${lng}&radius=25000&limit=25`);
      }

      if (res.ok) {
        const data = await res.json();
        setTrafficIncidents(data.incidents || []);
      }
    } catch (err) {
      console.warn('Driving HUD traffic incidents fetch error:', err);
    } finally {
      setIsLoadingTraffic(false);
    }
  }, [currentPosition, day.startLocation.location, day.polylineSegments, tripPlan?.overviewPolyline]);

  useEffect(() => {
    const lat = currentPosition?.lat ?? day.startLocation.location.lat;
    const lng = currentPosition?.lng ?? day.startLocation.location.lng;

    if (lastFetchedTrafficRef.current) {
      const dist = calculateHaversineDistanceKm({ lat, lng }, lastFetchedTrafficRef.current);
      if (dist < 4) return;
    }
    lastFetchedTrafficRef.current = { lat, lng };
    fetchTrafficIncidents();
  }, [currentPosition?.lat, currentPosition?.lng, day.startLocation.location.lat, day.startLocation.location.lng, fetchTrafficIncidents]);

  // Compute live distance to each traffic incident
  const incidentsWithDistance = useMemo(() => {
    const userLat = currentPosition?.lat ?? day.startLocation.location.lat;
    const userLng = currentPosition?.lng ?? day.startLocation.location.lng;

    return trafficIncidents
      .map((inc) => {
        const distKm = calculateHaversineDistanceKm({ lat: userLat, lng: userLng }, inc.location);
        const estSpeed = speedKmh > 25 ? speedKmh : 65;
        const driveTimeMin = Math.max(1, Math.round((distKm / estSpeed) * 60));
        return {
          ...inc,
          distanceKm: distKm,
          driveTimeMin,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [trafficIncidents, currentPosition, day.startLocation.location, speedKmh]);

  // Closest high-priority incident within 12km for warning banner
  const closestCriticalIncident = useMemo(() => {
    return incidentsWithDistance.find(
      (inc) =>
        (inc.roadClosed || inc.criticality === 'critical' || inc.criticality === 'major') &&
        inc.distanceKm <= 12 &&
        !dismissedIncidents.includes(inc.id)
    );
  }, [incidentsWithDistance, dismissedIncidents]);

  const lastFetchedPOICoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const isScanningPOIsRef = useRef(false);

  // Fetch live nearby POIs around current GPS coordinates for all categories (gas, food, rest)
  const fetchAllNearbyPOIs = useCallback(
    async (targetCoords?: { lat: number; lng: number }, categoryToNotify?: QuickStopCategory) => {
      const coords =
        targetCoords ||
        (currentPosition
          ? { lat: currentPosition.lat, lng: currentPosition.lng }
          : day.startLocation.location);

      if (!coords || (coords.lat === 0 && coords.lng === 0)) return;
      if (isScanningPOIsRef.current) return;
      isScanningPOIsRef.current = true;
      setIsLoadingNearby(true);

      const typeMapping: Record<QuickStopCategory, string> = {
        gas: 'gas_station',
        food: 'restaurant',
        rest: 'rest_stop',
      };

      try {
        const categories: QuickStopCategory[] = categoryToNotify
          ? [categoryToNotify]
          : ['gas', 'food', 'rest'];

        const results = await Promise.allSettled(
          categories.map(async (category) => {
            const params = new URLSearchParams({
              lat: String(coords.lat),
              lng: String(coords.lng),
              type: typeMapping[category],
              radius: '30000', // 30 km radius
            });
            if (mapProvider) params.set('provider', mapProvider);

            const res = await fetch(`/api/places/nearby?${params.toString()}`);
            if (res.ok) {
              const data = await res.json();
              if (data.places && Array.isArray(data.places)) {
                return { category, places: data.places as Place[] };
              }
            }
            return { category, places: [] as Place[] };
          })
        );

        const updatedCategories: Partial<{ [key in QuickStopCategory]: Place[] }> = {};
        results.forEach((r) => {
          if (r.status === 'fulfilled' && r.value.places.length > 0) {
            updatedCategories[r.value.category] = r.value.places;
          }
        });

        if (Object.keys(updatedCategories).length > 0) {
          setLivePlaces((prev) => ({
            ...prev,
            ...updatedCategories,
          }));

          if (categoryToNotify && updatedCategories[categoryToNotify]) {
            showNotice(
              `Found ${updatedCategories[categoryToNotify]!.length} nearby ${
                categoryToNotify === 'gas'
                  ? 'gas stations'
                  : categoryToNotify === 'food'
                  ? 'restaurants & cafes'
                  : 'rest stops'
              }`
            );
          }
        }
      } catch (err) {
        console.warn('Auto-scan nearby POIs failed:', err);
      } finally {
        setIsLoadingNearby(false);
        isScanningPOIsRef.current = false;
      }
    },
    [currentPosition, day.startLocation.location, mapProvider, showNotice]
  );

  // Auto-scan live nearby POIs immediately on drive start and whenever car moves >= 2.5 km
  useEffect(() => {
    const lat = currentPosition?.lat ?? day.startLocation.location.lat;
    const lng = currentPosition?.lng ?? day.startLocation.location.lng;
    if (!lat || !lng) return;

    if (lastFetchedPOICoordsRef.current) {
      const dist = calculateHaversineDistanceKm({ lat, lng }, lastFetchedPOICoordsRef.current);
      if (dist < 2.5) return;
    }

    lastFetchedPOICoordsRef.current = { lat, lng };
    fetchAllNearbyPOIs({ lat, lng });
  }, [currentPosition?.lat, currentPosition?.lng, day.startLocation.location.lat, day.startLocation.location.lng, fetchAllNearbyPOIs]);

  const handleOpenCategory = (cat: QuickStopCategory) => {
    if (activeCategory === cat) {
      setActiveCategory(null);
    } else {
      setActiveCategory(cat);
      // Auto-scan if no live places fetched yet for this category
      if (livePlaces[cat].length === 0) {
        fetchAllNearbyPOIs(undefined, cat);
      }
    }
  };

  const handleFocusPlace = (place: Place) => {
    onFocusPlace?.(place);
    showNotice(`Centered map on ${place.name.split(',')[0]}`);
  };

  const handleAddStopToRoute = (place: Place) => {
    onAddStop?.(place);
    showNotice(`Added ${place.name.split(',')[0]} to route`);
  };

  const handleOpenNavApp = (app: 'google' | 'apple' | 'waze', destinationOverride?: { lat: number; lng: number }) => {
    setShowNavMenu(false);
    setNavTargetPlace(null);
    const origin = currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : undefined;
    const dest = destinationOverride || { lat: targetLocation.lat, lng: targetLocation.lng };
    const intermediateStops = destinationOverride
      ? undefined
      : day.mainStops.map((s) => ({ lat: s.location.lat, lng: s.location.lng }));
    const url = getNavigationAppUrl(app, dest, origin, intermediateStops);
    window.open(url, '_blank');
  };

  const closestGas = categorizedPlaces.gas[0];
  const closestFood = categorizedPlaces.food[0];
  const closestRest = categorizedPlaces.rest[0];

  // First upcoming gas station on route for PiP mode & glance
  const firstGasStation = useMemo(() => {
    if (day.gasStops && day.gasStops.length > 0) {
      const stop = day.gasStops[0];
      const withDist = categorizedPlaces.gas.find((g) => g.id === stop.id);
      if (withDist) return withDist;
      const { distanceKm, driveTimeMin } = computeDistanceAndDriveTime(stop.location);
      return {
        ...stop,
        distanceKm,
        driveTimeMin,
      };
    }
    if (categorizedPlaces.gas.length > 0) {
      return categorizedPlaces.gas[0];
    }
    return null;
  }, [day.gasStops, categorizedPlaces.gas, computeDistanceAndDriveTime]);

  // ── PiP (Picture-in-Picture) Ultra-Compact View ──
  // When in PiP mode, show ONLY essential navigation and the first gas station
  if (isPip) {
    return (
      <div className="fixed inset-0 pointer-events-none z-50 flex flex-col justify-between p-2 font-sans select-none animate-fadeIn">
        {/* Compact Navigation & Gas Station Card */}
        <div className="pointer-events-auto bg-gray-950/95 text-white rounded-xl p-2 shadow-2xl border border-white/20 backdrop-blur-md flex flex-col gap-1.5 w-full">
          {/* Main Navigation Row */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-base shrink-0">
                {targetStop.isDayEnd ? '🏨' : '📍'}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xs font-bold text-white truncate leading-tight">
                  {targetName}
                </h2>
                <p className="text-[11px] font-black text-blue-400 leading-tight flex items-center gap-1">
                  <span>{distanceRemainingKm <= 0.25 ? 'Here!' : `${distanceRemainingKm} km`}</span>
                  {distanceRemainingKm > 0.25 && <span>• ~{etaFormatted}</span>}
                  {liveTrafficEta?.trafficDelayMinutes && liveTrafficEta.trafficDelayMinutes > 2 ? (
                    <span className="text-[9px] bg-rose-500/40 text-rose-300 px-1 rounded font-bold">
                      +{liveTrafficEta.trafficDelayMinutes}m
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            {/* Live Speed */}
            <div className="shrink-0 text-right">
              <span className="text-[10px] font-mono font-bold bg-blue-900/80 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-md">
                {speedKmh} km/h
              </span>
            </div>
          </div>

          {/* First Gas Station Row */}
          <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/15 text-[10px] leading-tight">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-xs shrink-0">⛽</span>
              <span className="font-semibold text-amber-300 truncate">
                {firstGasStation ? firstGasStation.name.split(',')[0] : 'No gas stop planned'}
              </span>
            </div>
            {firstGasStation && (
              <span className="text-[10px] font-mono font-bold text-gray-200 shrink-0">
                {formatDistance(firstGasStation.distanceKm)}
              </span>
            )}
          </div>
        </div>

        {/* Minimal Recenter button if user moved map */}
        {!autoFollow && (
          <div className="pointer-events-auto self-end">
            <button
              type="button"
              onClick={onRecenter}
              className="px-2 py-1 bg-black/80 hover:bg-black text-white text-[10px] font-semibold rounded-lg border border-white/20 shadow flex items-center gap-1 backdrop-blur-sm"
              title="Recenter map"
            >
              <span>🎯</span>
              <span>Center</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-2 sm:p-4 md:p-5 select-none font-sans safe-pt safe-pb safe-pl safe-pr overflow-hidden">
      {/* ── TOP STACK: Target Info & Quick Stops Bar ── */}
      <div className="flex flex-col gap-1.5 sm:gap-2 max-w-xl mx-auto w-full">
        {/* Top Header Card */}
        <div className="pointer-events-auto bg-gray-900/90 dark:bg-black/90 backdrop-blur-md text-white rounded-2xl p-2.5 sm:p-4 shadow-2xl border border-white/10 flex items-center justify-between gap-2.5 sm:gap-4 animate-slideDown">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-blue-600 flex items-center justify-center text-base sm:text-xl flex-shrink-0 shadow-lg shadow-blue-500/30">
              {targetStop.isDayEnd ? '🏨' : '📍'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Day selector with steppers */}
                <div className="flex items-center gap-0.5 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-lg">
                  {onChangeDay && dayIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualTargetIndex(null);
                        onChangeDay(dayIndex - 1);
                      }}
                      className="text-gray-400 hover:text-white px-1 py-0.2 rounded hover:bg-white/10 text-[10px] transition-colors"
                      title="Previous day"
                    >
                      ◀
                    </button>
                  )}
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 px-0.5">
                    Day {day.dayNumber || dayIndex + 1} of {totalDays}
                  </span>
                  {onChangeDay && dayIndex + 1 < totalDays && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualTargetIndex(null);
                        onChangeDay(dayIndex + 1);
                      }}
                      className="text-gray-400 hover:text-white px-1 py-0.2 rounded hover:bg-white/10 text-[10px] transition-colors"
                      title="Next day"
                    >
                      ▶
                    </button>
                  )}
                </div>

                {allStops.length > 1 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] bg-white/10 text-gray-300 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                      Stop {activeStopIndex + 1} of {allStops.length}
                    </span>
                    {manualTargetIndex !== null && (
                      <button
                        type="button"
                        onClick={() => setManualTargetIndex(null)}
                        className="text-[10px] bg-blue-500/30 text-blue-200 hover:bg-blue-500/50 px-1.5 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 border border-blue-400/30 animate-pulse"
                        title="Reset to live auto-tracking"
                      >
                        Auto ↺
                      </button>
                    )}
                  </div>
                )}

                {wakeLockActive && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Awake
                  </span>
                )}

                {/* Voice Guidance Toggle */}
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 border transition-colors ${
                    isVoiceEnabled
                      ? 'bg-blue-600/30 text-blue-200 border-blue-400/40 hover:bg-blue-600/50'
                      : 'bg-white/10 text-gray-400 border-white/10 hover:text-white hover:bg-white/20'
                  }`}
                  title={isVoiceEnabled ? 'Voice Guidance active (Click to mute)' : 'Voice Guidance muted (Click to enable)'}
                >
                  <span>{isVoiceEnabled ? '🔊' : '🔇'}</span>
                  <span className="hidden xs:inline sm:inline">{isVoiceEnabled ? 'Voice' : 'Mute'}</span>
                </button>

                {isRerouting && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-400/30 animate-pulse">
                    <span>🔄</span> Recalculating...
                  </span>
                )}

                {activeWeatherAlert && (
                  <span
                    className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border border-rose-400/30 truncate max-w-[140px] sm:max-w-[200px]"
                    title={`${activeWeatherAlert.title}: ${activeWeatherAlert.message}`}
                  >
                    <span>{activeWeatherAlert.icon}</span>
                    <span className="truncate">{activeWeatherAlert.title}</span>
                  </span>
                )}
              </div>

              {/* Target Name with Stepper Buttons if multiple stops */}
              <div className="flex items-center gap-1.5 mt-0.5">
                {allStops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setManualTargetIndex(Math.max(0, activeStopIndex - 1))}
                    disabled={activeStopIndex === 0}
                    className="w-5 h-5 rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-[10px] text-gray-300 transition-colors"
                    title="Previous stop"
                  >
                    ◀
                  </button>
                )}

                <h2 className="text-xs sm:text-base font-bold truncate text-white">
                  Next: {targetName}
                </h2>

                {allStops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setManualTargetIndex(Math.min(allStops.length - 1, activeStopIndex + 1))}
                    disabled={activeStopIndex >= allStops.length - 1}
                    className="w-5 h-5 rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-[10px] text-gray-300 transition-colors"
                    title="Skip to next stop"
                  >
                    ▶
                  </button>
                )}
              </div>

              <p className="text-[10px] sm:text-xs text-gray-400 truncate">
                {targetStop.isDayEnd
                  ? `${day.startLocation.name.split(',')[0]} → ${day.endLocation.name.split(',')[0]}`
                  : `Leg to ${targetName} • Final: ${day.endLocation.name.split(',')[0]} (${totalDayRemainingKm} km day total)`}
              </p>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-lg sm:text-2xl font-black text-blue-400 tracking-tight">
              {distanceRemainingKm <= 0.25 ? (
                <span className="text-emerald-400 font-bold text-base sm:text-xl">Here!</span>
              ) : (
                <>
                  {distanceRemainingKm} <span className="text-[10px] sm:text-xs font-semibold text-gray-400">km</span>
                </>
              )}
            </p>
            <div className="text-[10px] sm:text-[11px] text-gray-300 font-medium flex items-center justify-end gap-1">
              {distanceRemainingKm <= 0.25 ? (
                <span>Arrived</span>
              ) : (
                <>
                  <span>~{etaFormatted}</span>
                  {liveTrafficEta?.trafficDelayMinutes && liveTrafficEta.trafficDelayMinutes > 2 ? (
                    <span className="text-[9px] bg-rose-500/25 text-rose-300 border border-rose-500/40 px-1 py-0.2 rounded font-bold">
                      +{liveTrafficEta.trafficDelayMinutes}m
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── LIVE HAZARD ALERT BANNER (Road closure / Critical incident ahead) ── */}
        {closestCriticalIncident && (
          <div className="pointer-events-auto w-full bg-rose-600/95 text-white p-2.5 sm:p-3 rounded-2xl shadow-2xl border border-rose-400/80 backdrop-blur-md flex items-center justify-between gap-2.5 animate-fadeIn">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl sm:text-2xl flex-shrink-0">
                {closestCriticalIncident.roadClosed ? '⛔' : '⚠️'}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] sm:text-[11px] font-black tracking-wide uppercase text-rose-100 bg-rose-900/80 px-1.5 py-0.5 rounded">
                    {closestCriticalIncident.roadClosed ? 'Road Closed Ahead' : 'Hazard Alert'}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold text-white">
                    {formatDistance(closestCriticalIncident.distanceKm)}
                  </span>
                </div>
                <p className="text-xs font-semibold truncate text-white mt-0.5">
                  {closestCriticalIncident.summary}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  onFocusPlace?.({
                    id: closestCriticalIncident.id,
                    name: closestCriticalIncident.summary,
                    address: closestCriticalIncident.description,
                    location: closestCriticalIncident.location,
                    type: PlaceType.ATTRACTION,
                  });
                  setActiveCategory('traffic');
                }}
                className="px-2.5 py-1 bg-white text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg shadow transition-colors"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setDismissedIncidents((prev) => [...prev, closestCriticalIncident.id])}
                className="w-6 h-6 rounded-full hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center text-xs"
                title="Dismiss warning"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── QUICK STOPS TOOLBAR (Gas, Food, Rest, Traffic) ── */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 w-full justify-center">
          {/* Gas Button */}
          <button
            type="button"
            onClick={() => handleOpenCategory('gas')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-1.5 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
              activeCategory === 'gas'
                ? 'bg-amber-600 text-white border-amber-400 shadow-amber-500/30 scale-[1.02]'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-amber-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">⛽</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Gas</span>
              <span className="text-[9px] sm:text-[10px] text-amber-400 font-mono font-semibold">
                {closestGas ? formatDistance(closestGas.distanceKm) : 'Nearby'}
              </span>
            </div>
          </button>

          {/* Food Button */}
          <button
            type="button"
            onClick={() => handleOpenCategory('food')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-1.5 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
              activeCategory === 'food'
                ? 'bg-orange-600 text-white border-orange-400 shadow-orange-500/30 scale-[1.02]'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-orange-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">🍽️</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Food</span>
              <span className="text-[9px] sm:text-[10px] text-orange-400 font-mono font-semibold">
                {closestFood ? formatDistance(closestFood.distanceKm) : 'Nearby'}
              </span>
            </div>
          </button>

          {/* Rest / Relax Button */}
          <button
            type="button"
            onClick={() => handleOpenCategory('rest')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-1.5 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
              activeCategory === 'rest'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-500/30 scale-[1.02]'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-emerald-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">☕</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Rest</span>
              <span className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-semibold">
                {closestRest ? formatDistance(closestRest.distanceKm) : 'Nearby'}
              </span>
            </div>
          </button>

          {/* Traffic Alerts Button */}
          <button
            type="button"
            onClick={() => setActiveCategory(activeCategory === 'traffic' ? null : 'traffic')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-1.5 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
              activeCategory === 'traffic'
                ? 'bg-rose-600 text-white border-rose-400 shadow-rose-500/30 scale-[1.02]'
                : incidentsWithDistance.some((i) => i.roadClosed || i.criticality === 'critical')
                ? 'bg-rose-950/85 hover:bg-rose-900/80 text-rose-200 border-rose-500/40 animate-pulse backdrop-blur-md'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-rose-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">
              {incidentsWithDistance.some((i) => i.roadClosed) ? '⛔' : '🚦'}
            </span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Traffic</span>
              <span className="text-[9px] sm:text-[10px] text-rose-400 font-mono font-semibold">
                {isLoadingTraffic
                  ? 'Checking...'
                  : incidentsWithDistance.length > 0
                  ? `${incidentsWithDistance.length} alert${incidentsWithDistance.length === 1 ? '' : 's'}`
                  : 'Clear'}
              </span>
            </div>
          </button>
        </div>

        {/* Temporary Feedback Notification */}
        {actionSuccessMsg && (
          <div className="pointer-events-auto self-center bg-blue-600/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-blue-400 animate-fadeIn flex items-center gap-2">
            <span>✨</span>
            <span>{actionSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* ── EXPANDED POI / TRAFFIC DRAWER ── */}
      {activeCategory && (
        <div className="pointer-events-auto max-w-xl mx-auto w-full max-h-[55vh] sm:max-h-[50vh] landscape:max-h-[65vh] flex flex-col bg-gray-950/95 backdrop-blur-xl border border-white/20 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-2xl text-white my-auto animate-slideUp overflow-hidden">
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">
                {activeCategory === 'gas' ? '⛽' : activeCategory === 'food' ? '🍽️' : activeCategory === 'rest' ? '☕' : '🚦'}
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {activeCategory === 'gas'
                    ? 'Upcoming Gas Stations'
                    : activeCategory === 'food'
                    ? 'Upcoming Restaurants & Cafes'
                    : activeCategory === 'rest'
                    ? 'Rest Stops & Relax Areas'
                    : 'Live Traffic Incidents'}
                </h3>
                <p className="text-[11px] text-gray-400">
                  {activeCategory === 'traffic'
                    ? `${incidentsWithDistance.length} incidents reported nearby (HERE Traffic v7)`
                    : `${categorizedPlaces[activeCategory].length} stops found ahead on route`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Refresh / Scan button */}
              <button
                type="button"
                onClick={() => (activeCategory === 'traffic' ? fetchTrafficIncidents() : fetchAllNearbyPOIs(undefined, activeCategory))}
                disabled={activeCategory === 'traffic' ? isLoadingTraffic : isLoadingNearby}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 text-[11px] font-semibold text-white flex items-center gap-1.5 transition-all shadow"
                title="Scan immediate surroundings around GPS coordinates"
              >
                <span className={(activeCategory === 'traffic' ? isLoadingTraffic : isLoadingNearby) ? 'animate-spin' : ''}>🔄</span>
                <span className="hidden sm:inline">
                  {(activeCategory === 'traffic' ? isLoadingTraffic : isLoadingNearby) ? 'Scanning...' : 'Refresh'}
                </span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                title="Close list"
              >
                ✕
              </button>
            </div>
          </div>

          {/* List: Places or Traffic Incidents */}
          <div className="overflow-y-auto divide-y divide-white/5 py-2 pr-1 flex-1 space-y-2.5 scrollbar-thin scrollbar-thumb-white/20">
            {activeCategory === 'traffic' ? (
              incidentsWithDistance.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">🟢</p>
                  <p className="text-sm font-bold text-white">Roads are Clear!</p>
                  <p className="text-xs text-gray-400 mt-1">No traffic closures, accidents, or major delays detected within 25 km.</p>
                  <button
                    type="button"
                    onClick={fetchTrafficIncidents}
                    className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <span>🔄</span> Check Again
                  </button>
                </div>
              ) : (
                incidentsWithDistance.map((inc) => {
                  let incIcon = '⚠️';
                  let incColor = 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
                  if (inc.roadClosed || inc.type === 'roadClosure') {
                    incIcon = '⛔';
                    incColor = 'text-rose-400 border-rose-500/40 bg-rose-500/10';
                  } else if (inc.type === 'accident') {
                    incIcon = '💥';
                    incColor = 'text-red-400 border-red-500/40 bg-red-500/10';
                  } else if (inc.type === 'roadwork') {
                    incIcon = '🚧';
                    incColor = 'text-amber-400 border-amber-500/40 bg-amber-500/10';
                  } else if (inc.type === 'congestion') {
                    incIcon = '🛑';
                    incColor = 'text-rose-400 border-rose-500/40 bg-rose-500/10';
                  }

                  return (
                    <div
                      key={inc.id}
                      className="bg-white/5 hover:bg-white/10 p-3 rounded-2xl border border-white/5 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base flex-shrink-0">{incIcon}</span>
                            <h4 className="font-bold text-xs sm:text-sm text-white truncate">
                              {inc.summary}
                            </h4>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${incColor}`}>
                              {inc.criticality}
                            </span>
                          </div>
                          {inc.roadClosed && (
                            <div className="mt-1 inline-flex items-center gap-1 bg-red-500/20 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30">
                              <span>⛔</span> ROAD CLOSED
                            </div>
                          )}
                          <p className="text-[11px] text-gray-300 mt-1 line-clamp-2">
                            {inc.description}
                          </p>
                          {inc.lengthMeters ? (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              📏 Length: {(inc.lengthMeters / 1000).toFixed(1)} km
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-xs sm:text-sm font-black text-rose-400 tabular-nums">
                            {formatDistance(inc.distanceKm)}
                          </span>
                          <span className="block text-[10px] text-gray-400">
                            ~{inc.driveTimeMin} min
                          </span>
                        </div>
                      </div>

                      {/* Incident Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            onFocusPlace?.({
                              id: inc.id,
                              name: inc.summary,
                              address: inc.description,
                              location: inc.location,
                              type: PlaceType.ATTRACTION,
                            });
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] flex items-center gap-1 transition-colors"
                          title="Center incident on map"
                        >
                          <span>📍</span>
                          <span>Map</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNavTargetPlace({
                              id: inc.id,
                              name: inc.summary,
                              address: inc.description,
                              location: inc.location,
                              type: PlaceType.ATTRACTION,
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-md transition-all active:scale-95"
                          title="Navigate / avoid via navigation app"
                        >
                          <span>🧭</span>
                          <span>Nav</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )
            ) : categorizedPlaces[activeCategory].length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-2xl mb-2">🔎</p>
                <p className="text-xs font-semibold">No {activeCategory} stops currently listed along this leg.</p>
                <button
                  type="button"
                  onClick={() => fetchAllNearbyPOIs(undefined, activeCategory)}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-lg"
                >
                  <span>📡</span> Search Live Around GPS
                </button>
              </div>
            ) : (
              categorizedPlaces[activeCategory].map((place) => (
                <div
                  key={place.id || `${place.location.lat},${place.location.lng}`}
                  className="bg-white/5 hover:bg-white/10 p-3 rounded-2xl border border-white/5 transition-all flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-white truncate">
                          {place.name}
                        </h4>
                        {place.isOpen != null && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                              place.isOpen
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {place.isOpen ? 'Open' : 'Closed'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {place.vicinity || place.address}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xs sm:text-sm font-black text-amber-400 tabular-nums">
                        {formatDistance(place.distanceKm)}
                      </span>
                      <span className="block text-[10px] text-gray-400">
                        ~{place.driveTimeMin} min
                      </span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-xs">
                    {place.rating ? (
                      <span className="text-[11px] text-yellow-400 font-semibold flex items-center gap-1">
                        ⭐ {place.rating}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Verified Stop</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {/* View on Map */}
                      <button
                        type="button"
                        onClick={() => handleFocusPlace(place)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] flex items-center gap-1 transition-colors"
                        title="Show on map"
                      >
                        <span>📍</span>
                        <span>Map</span>
                      </button>

                      {/* Add Stop to Route */}
                      {onAddStop && (
                        <button
                          type="button"
                          onClick={() => handleAddStopToRoute(place)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] flex items-center gap-1 transition-colors"
                          title="Add as stop to trip"
                        >
                          <span>➕</span>
                          <span className="hidden sm:inline">Add</span>
                        </button>
                      )}

                      {/* Launch Turn-by-Turn Navigation */}
                      <button
                        type="button"
                        onClick={() => setNavTargetPlace(place)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-md transition-all active:scale-95"
                        title="Navigate to this stop"
                      >
                        <span>↗️</span>
                        <span>Go</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── NAVIGATION HANDOFF CHOOSER (for specific stop or whole route) ── */}
      {navTargetPlace && (
        <div className="pointer-events-auto fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/20 rounded-2xl p-5 max-w-sm w-full text-white shadow-2xl animate-scaleUp">
            <h3 className="text-base font-bold mb-1">Navigate to {navTargetPlace.name.split(',')[0]}</h3>
            <p className="text-xs text-gray-400 mb-4">Choose your preferred navigation app:</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleOpenNavApp('google', navTargetPlace.location)}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-blue-600 rounded-xl text-left text-xs font-semibold flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🗺️</span>
                <span>Google Maps</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenNavApp('apple', navTargetPlace.location)}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-blue-600 rounded-xl text-left text-xs font-semibold flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🍏</span>
                <span>Apple Maps</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenNavApp('waze', navTargetPlace.location)}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-blue-600 rounded-xl text-left text-xs font-semibold flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🚗</span>
                <span>Waze Navigation</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNavTargetPlace(null)}
              className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── BOTTOM ROW: Speedometer, Camera Recenter & Action Buttons ── */}
      <div className="pointer-events-auto w-full flex items-end justify-between gap-1.5 sm:gap-3">
        {/* Speedometer Widget */}
        <div className="bg-gray-900/90 dark:bg-black/90 backdrop-blur-md text-white rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-2xl border border-white/10 flex items-center gap-2 sm:gap-3">
          <div className="text-center min-w-[48px] sm:min-w-[60px]">
            <span className="text-2xl sm:text-4xl font-black tabular-nums tracking-tighter text-white">
              {speedKmh}
            </span>
            <span className="block text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 -mt-0.5 sm:-mt-1">
              km/h
            </span>
          </div>

          {heading != null && (
            <div className="border-l border-white/10 pl-2 sm:pl-3 text-center">
              <span className="text-xs sm:text-sm font-bold text-blue-400 block">
                {getCardinalDirection(heading)}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-gray-400">
                {heading}°
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Recenter Button (shows when user panned away) */}
          {!autoFollow && (
            <button
              type="button"
              onClick={onRecenter}
              className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] sm:text-xs font-bold shadow-xl flex items-center gap-1.5 transition-all transform hover:scale-105 active:scale-95 animate-bounce"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
              </svg>
              <span>Recenter</span>
            </button>
          )}

          {/* External Navigation Handoff Menu (whole route) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNavMenu(!showNavMenu)}
              className="py-2.5 sm:py-3 px-2.5 sm:px-3.5 rounded-xl bg-gray-900/90 dark:bg-black/90 hover:bg-gray-800 text-white text-[11px] sm:text-xs font-semibold shadow-xl border border-white/10 flex items-center gap-1 transition-all"
              title="Open full day route in Google Maps, Waze, or Apple Maps"
            >
              <span>🧭</span>
              <span className="hidden xs:inline sm:inline">Nav</span>
              <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showNavMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-44 sm:w-48 bg-gray-900 dark:bg-black border border-white/15 rounded-xl shadow-2xl overflow-hidden py-1 z-50 text-white">
                <button
                  type="button"
                  onClick={() => handleOpenNavApp('google')}
                  className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-xs flex items-center gap-2 transition-colors"
                >
                  <span>🗺️</span>
                  <span>Google Maps</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNavApp('apple')}
                  className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-xs flex items-center gap-2 transition-colors"
                >
                  <span>🍏</span>
                  <span>Apple Maps</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNavApp('waze')}
                  className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-xs flex items-center gap-2 transition-colors"
                >
                  <span>🚗</span>
                  <span>Waze Navigation</span>
                </button>
              </div>
            )}
          </div>

          {/* Exit Driving Mode Button */}
          <button
            type="button"
            onClick={onExit}
            className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-[11px] sm:text-xs font-bold shadow-xl flex items-center gap-1 transition-all transform active:scale-95"
            title="Exit Driving Mode and return to Trip Planner"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
