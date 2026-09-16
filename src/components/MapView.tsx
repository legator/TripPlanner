'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGoogleMaps } from './GoogleMapsProvider';
import { DayPlan, Place } from '@/lib/types';
import { DAY_COLORS, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from '@/lib/constants';
import { Waypoint } from '@/lib/types';
import { LiveDrivingPosition, getCurrentCoordinates, reverseGeocodeCoordinates } from '@/lib/location';
import { generateUUID } from '@/lib/uuid';

interface MapViewProps {
  waypoints: Waypoint[];
  tripPlan: { days: DayPlan[]; overviewPolyline: string } | null;
  selectedDay: number | null;
  onAddWaypoint?: (waypoint: Waypoint) => void;
  onSetStart?: (waypoint: Waypoint) => void;
  onOpenUpdateTripModal?: () => void;
  isDrivingMode?: boolean;
  drivingPosition?: LiveDrivingPosition | null;
  autoFollow?: boolean;
  onMapUserDrag?: () => void;
  focusedPlace?: Place | null;
}

export default function MapView({
  waypoints,
  tripPlan,
  selectedDay,
  onAddWaypoint,
  onSetStart,
  onOpenUpdateTripModal,
  isDrivingMode = false,
  drivingPosition = null,
  autoFollow = true,
  onMapUserDrag,
  focusedPlace = null,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const { isLoaded, loadError } = useGoogleMaps();
  const onAddWaypointRef = useRef(onAddWaypoint);
  const onSetStartRef = useRef(onSetStart);
  const onOpenUpdateTripModalRef = useRef(onOpenUpdateTripModal);

  const [isLocating, setIsLocating] = useState(false);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const drivingMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  // Keep refs in sync
  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
    onSetStartRef.current = onSetStart;
    onOpenUpdateTripModalRef.current = onOpenUpdateTripModal;
  }, [onAddWaypoint, onSetStart, onOpenUpdateTripModal]);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: MAP_DEFAULT_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      mapId: 'TRIP_PLANNER_MAP',
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    });

    infoWindowRef.current = new google.maps.InfoWindow();

    // Click on map to add a stop
    mapInstanceRef.current.addListener('click', async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !onAddWaypointRef.current) return;

      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      // Reverse geocode to get address & name
      const geocoder = new google.maps.Geocoder();
      try {
        const res = await geocoder.geocode({ location: { lat, lng } });
        const result = res.results?.[0];
        const address = result?.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const name =
          result?.address_components?.find((c) =>
            c.types.includes('locality')
          )?.long_name ||
          result?.address_components?.find((c) =>
            c.types.includes('administrative_area_level_1')
          )?.long_name ||
          address.split(',')[0];
        const placeId = result?.place_id;

        // Show confirmation InfoWindow
        const contentDiv = document.createElement('div');
        contentDiv.style.padding = '8px';
        contentDiv.style.maxWidth = '260px';
        contentDiv.innerHTML = `
          <strong style="font-size:14px">${name}</strong>
          <p style="margin:4px 0 8px;font-size:12px;color:#666">${address}</p>
        `;
        const btn = document.createElement('button');
        btn.textContent = '+ Add as stop';
        btn.style.cssText =
          'background:#2563eb;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;width:100%';
        btn.onmouseover = () => (btn.style.background = '#1d4ed8');
        btn.onmouseout = () => (btn.style.background = '#2563eb');
        btn.addEventListener('click', () => {
          onAddWaypointRef.current?.({
            id: generateUUID(),
            name,
            address,
            location: { lat, lng },
            placeId: placeId || undefined,
          });
          infoWindowRef.current?.close();
        });
        contentDiv.appendChild(btn);

        infoWindowRef.current?.setContent(contentDiv);
        infoWindowRef.current?.setPosition({ lat, lng });
        infoWindowRef.current?.open(mapInstanceRef.current!);
      } catch (err) {
        console.error('Reverse geocode failed:', err);
      }
    });

    // Listen for drag to pause auto-follow in driving mode
    const dragListener = mapInstanceRef.current.addListener('dragstart', () => {
      onMapUserDrag?.();
    });

    return () => {
      google.maps.event.removeListener(dragListener);
    };
  }, [isLoaded, onMapUserDrag]);

  const handleLocateUser = useCallback(async () => {
    if (!mapInstanceRef.current || !isLoaded) return;
    setIsLocating(true);

    try {
      const coords = await getCurrentCoordinates();
      const pos = { lat: coords.lat, lng: coords.lng };
      mapInstanceRef.current.panTo(pos);
      mapInstanceRef.current.setZoom(14);

      if (userMarkerRef.current) {
        userMarkerRef.current.map = null;
      }

      const pulseDiv = document.createElement('div');
      pulseDiv.style.cssText = 'position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      pulseDiv.innerHTML = `
        <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(37,99,235,0.35);animation:ping 1.6s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);position:relative;z-index:2;"></div>
      `;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: pos,
        map: mapInstanceRef.current,
        title: 'Your Current Location',
        content: pulseDiv,
      });
      userMarkerRef.current = marker;

      const geocoded = await reverseGeocodeCoordinates(coords.lat, coords.lng, 'google');
      const wp: Waypoint = {
        id: generateUUID(),
        name: geocoded.name || 'Current Location',
        address: geocoded.address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        location: pos,
        placeId: geocoded.placeId,
      };

      const content = document.createElement('div');
      content.style.padding = '8px';
      content.style.maxWidth = '250px';
      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:16px;">📍</span>
          <strong style="font-size:13px;color:#1e3a8a;">You Are Here</strong>
        </div>
        <p style="margin:2px 0 10px;font-size:11px;color:#4b5563;line-height:1.4;">${wp.name}<br/><span style="color:#6b7280">${wp.address}</span></p>
      `;

      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex';
      btnContainer.style.flexDirection = 'column';
      btnContainer.style.gap = '5px';

      if (onSetStartRef.current) {
        const setStartBtn = document.createElement('button');
        setStartBtn.textContent = '🏠 Set as Trip Start';
        setStartBtn.style.cssText = 'background:#16a34a;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;';
        setStartBtn.addEventListener('click', () => {
          onSetStartRef.current?.(wp);
          infoWindowRef.current?.close();
        });
        btnContainer.appendChild(setStartBtn);
      }

      if (tripPlan && onOpenUpdateTripModalRef.current) {
        const updateTripBtn = document.createElement('button');
        updateTripBtn.textContent = '🧭 Update Trip from Here';
        updateTripBtn.style.cssText = 'background:#2563eb;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;';
        updateTripBtn.addEventListener('click', () => {
          onOpenUpdateTripModalRef.current?.();
          infoWindowRef.current?.close();
        });
        btnContainer.appendChild(updateTripBtn);
      }

      if (onAddWaypointRef.current) {
        const addStopBtn = document.createElement('button');
        addStopBtn.textContent = '+ Add as Stop';
        addStopBtn.style.cssText = 'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;';
        addStopBtn.addEventListener('click', () => {
          onAddWaypointRef.current?.(wp);
          infoWindowRef.current?.close();
        });
        btnContainer.appendChild(addStopBtn);
      }

      content.appendChild(btnContainer);
      infoWindowRef.current?.setContent(content);
      infoWindowRef.current?.open(mapInstanceRef.current, marker);
    } catch (err) {
      console.warn('Locate user error:', err);
    } finally {
      setIsLocating(false);
    }
  }, [isLoaded, tripPlan]);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
  }, []);

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  const createMarker = useCallback(
    (
      position: google.maps.LatLngLiteral,
      _label: string,
      icon: string,
      title: string,
      details?: string
    ) => {
      if (!mapInstanceRef.current) return;

      const pinEl = document.createElement('div');
      pinEl.style.fontSize = '24px';
      pinEl.style.cursor = 'pointer';
      pinEl.textContent = icon;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position,
        map: mapInstanceRef.current,
        title,
        content: pinEl,
      });

      if (details) {
        marker.addEventListener('gmp-click', () => {
          infoWindowRef.current?.setContent(
            `<div style="padding:8px;max-width:250px">
              <strong style="font-size:14px">${title}</strong>
              <p style="margin:4px 0 0;font-size:12px;color:#666">${details}</p>
            </div>`
          );
          infoWindowRef.current?.open(mapInstanceRef.current!, marker);
        });
      }

      markersRef.current.push(marker);
      return marker;
    },
    []
  );

  // Update waypoint markers (when no trip plan)
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || tripPlan) return;

    clearMarkers();
    clearPolylines();

    if (waypoints.length === 0) return;

    waypoints.forEach((wp, index) => {
      const icon = index === 0 ? '🏠' : '📍';
      createMarker(wp.location, `${index + 1}`, icon, wp.name, wp.address);
    });

    // Fit bounds
    if (waypoints.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      waypoints.forEach((wp) => bounds.extend(wp.location));
      mapInstanceRef.current.fitBounds(bounds, 80);
      if (waypoints.length === 1) {
        mapInstanceRef.current.setZoom(12);
      }
    }
  }, [isLoaded, waypoints, tripPlan, clearMarkers, clearPolylines, createMarker]);

  // Driving Follow Mode live position & camera auto-follow
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !isDrivingMode || !drivingPosition) return;

    const pos = { lat: drivingPosition.lat, lng: drivingPosition.lng };
    const heading = drivingPosition.heading ?? 0;

    if (autoFollow) {
      mapInstanceRef.current.panTo(pos);
      const currentZoom = mapInstanceRef.current.getZoom() ?? 12;
      if (currentZoom < 15) {
        mapInstanceRef.current.setZoom(16);
      }
    }

    if (drivingMarkerRef.current) {
      drivingMarkerRef.current.position = pos;
      const el = drivingMarkerRef.current.content as HTMLElement;
      if (el) {
        const arrow = el.querySelector('.car-arrow') as HTMLElement;
        if (arrow) {
          arrow.style.transform = `rotate(${heading}deg)`;
        }
      }
    } else {
      const carEl = document.createElement('div');
      carEl.style.cssText = 'position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      carEl.innerHTML = `
        <div style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(37,99,235,0.25);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div class="car-arrow" style="width:30px;height:30px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;transition:transform 0.2s ease;transform:rotate(${heading}deg);position:relative;z-index:2;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff">
            <path d="M12 2L4 20l8-3 8 3L12 2z"/>
          </svg>
        </div>
      `;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: pos,
        map: mapInstanceRef.current,
        title: 'Your Vehicle',
        content: carEl,
      });
      drivingMarkerRef.current = marker;
    }
  }, [isLoaded, isDrivingMode, drivingPosition, autoFollow]);

  // Clean up driving marker when exiting driving mode
  useEffect(() => {
    if (!isDrivingMode && drivingMarkerRef.current) {
      drivingMarkerRef.current.map = null;
      drivingMarkerRef.current = null;
    }
  }, [isDrivingMode]);

  // Center and highlight a focused place (e.g. from Driving HUD quick stops)
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !focusedPlace) return;

    mapInstanceRef.current.panTo(focusedPlace.location);
    if ((mapInstanceRef.current.getZoom() ?? 0) < 15) {
      mapInstanceRef.current.setZoom(16);
    }

    if (infoWindowRef.current) {
      infoWindowRef.current.setContent(`
        <div style="padding: 4px 6px; font-family: system-ui, sans-serif; max-width: 220px;">
          <div style="font-weight: bold; font-size: 13px; color: #111827; margin-bottom: 2px;">${focusedPlace.name}</div>
          <div style="font-size: 11px; color: #6b7280; line-height: 1.2;">${focusedPlace.vicinity || focusedPlace.address}</div>
          ${focusedPlace.rating ? `<div style="font-size: 11px; color: #d97706; margin-top: 3px; font-weight: 600;">⭐ ${focusedPlace.rating}</div>` : ''}
        </div>
      `);
      infoWindowRef.current.setPosition(focusedPlace.location);
      infoWindowRef.current.open(mapInstanceRef.current);
    }
  }, [isLoaded, focusedPlace]);

  // Render trip plan on map
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !tripPlan) return;

    clearMarkers();
    clearPolylines();

    const bounds = new google.maps.LatLngBounds();

    tripPlan.days.forEach((day, dayIndex) => {
      // Skip days not selected (if filter active)
      if (selectedDay !== null && selectedDay !== dayIndex) return;

      const color = DAY_COLORS[dayIndex % DAY_COLORS.length];

      // Draw route polyline for this day – decode each segment individually
      if (day.polylineSegments && day.polylineSegments.length > 0) {
        const fullPath: google.maps.LatLng[] = [];
        day.polylineSegments.forEach((segment) => {
          const decoded = google.maps.geometry.encoding.decodePath(segment);
          fullPath.push(...decoded);
        });
        const polyline = new google.maps.Polyline({
          path: fullPath,
          geodesic: true,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 5,
          map: mapInstanceRef.current!,
        });
        polylinesRef.current.push(polyline);
        fullPath.forEach((p) => bounds.extend(p));
      }

      // Start marker
      createMarker(
        day.startLocation.location,
        `D${day.dayNumber}`,
        dayIndex === 0 ? '🏠' : '🌅',
        `Day ${day.dayNumber} Start`,
        day.startLocation.name
      );


      // Main stops
      day.mainStops.forEach((stop) => {
        createMarker(stop.location, '', '📍', stop.name, `Day ${day.dayNumber} Stop`);
        bounds.extend(stop.location);
      });

      // End marker
      createMarker(
        day.endLocation.location,
        `D${day.dayNumber}`,
        dayIndex === tripPlan.days.length - 1 ? '🏁' : '🌙',
        `Day ${day.dayNumber} End`,
        day.endLocation.name
      );
      bounds.extend(day.endLocation.location);

      // Hotel markers
      day.hotelSuggestions.slice(0, 2).forEach((hotel) => {
        createMarker(
          hotel.location,
          '',
          '🏨',
          hotel.name,
          `${hotel.rating ? `⭐ ${hotel.rating}` : ''} ${hotel.vicinity || hotel.address}`
        );
      });

      // Gas station markers
      day.gasStops.slice(0, 3).forEach((gas) => {
        createMarker(gas.location, '', '⛽', gas.name, gas.vicinity || gas.address);
      });

      // Restaurant markers
      day.restaurants.slice(0, 3).forEach((rest) => {
        createMarker(
          rest.location,
          '',
          '🍽️',
          rest.name,
          `${rest.rating ? `⭐ ${rest.rating}` : ''} ${rest.vicinity || rest.address}`
        );
      });

      // Attraction markers
      day.attractions.slice(0, 3).forEach((attr) => {
        createMarker(
          attr.location,
          '',
          '⭐',
          attr.name,
          `${attr.rating ? `⭐ ${attr.rating}` : ''} ${attr.vicinity || attr.address}`
        );
      });
    });

    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds, 60);
    }
  }, [isLoaded, tripPlan, selectedDay, clearMarkers, clearPolylines, createMarker]);

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Google Maps Error
          </h3>
          <p className="text-sm text-gray-600">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div ref={mapRef} className="w-full h-full" />

      {/* Floating Locate Me Button */}
      {isLoaded && (
        <button
          type="button"
          onClick={handleLocateUser}
          disabled={isLocating}
          title="Locate my position on map"
          className="absolute bottom-6 right-4 z-10 p-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-all flex items-center justify-center disabled:opacity-50 hover:scale-105 active:scale-95"
        >
          {isLocating ? (
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
            </svg>
          )}
        </button>
      )}

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="flex items-center gap-3 text-gray-600">
            <svg
              className="spinner w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            Loading map...
          </div>
        </div>
      )}
    </div>
  );
}
