'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useGoogleMaps } from './GoogleMapsProvider';
import { DayPlan, Place, PlaceType } from '@/lib/types';
import { DAY_COLORS, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from '@/lib/constants';
import { Waypoint } from '@/lib/types';

interface MapViewProps {
  waypoints: Waypoint[];
  tripPlan: { days: DayPlan[]; overviewPolyline: string } | null;
  selectedDay: number | null;
  onAddWaypoint?: (waypoint: Waypoint) => void;
}

export default function MapView({
  waypoints,
  tripPlan,
  selectedDay,
  onAddWaypoint,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const { isLoaded, loadError } = useGoogleMaps();
  const onAddWaypointRef = useRef(onAddWaypoint);

  // Keep ref in sync
  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
  }, [onAddWaypoint]);

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
            id: crypto.randomUUID(),
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
  }, [isLoaded]);

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
