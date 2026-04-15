'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useHereMaps } from './HereMapsProvider';
import { DayPlan, Waypoint } from '@/lib/types';
import { DAY_COLORS, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from '@/lib/constants';
import { decodePolyline } from '@/lib/tripGpxExport';

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || '';

interface HereMapViewProps {
  waypoints: Waypoint[];
  tripPlan: { days: DayPlan[]; overviewPolyline: string } | null;
  selectedDay: number | null;
  onAddWaypoint?: (waypoint: Waypoint) => void;
}

export default function HereMapView({
  waypoints,
  tripPlan,
  selectedDay,
  onAddWaypoint,
}: HereMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objectsGroupRef = useRef<any>(null);
  const { isLoaded, loadError } = useHereMaps();
  const onAddWaypointRef = useRef(onAddWaypoint);

  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
  }, [onAddWaypoint]);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    const H = window.H;
    const platform = new H.service.Platform({ apikey: HERE_API_KEY });
    platformRef.current = platform;

    const defaultLayers = platform.createDefaultLayers();
    const map = new H.Map(mapRef.current, defaultLayers.vector.normal.map, {
      center: { lat: MAP_DEFAULT_CENTER.lat, lng: MAP_DEFAULT_CENTER.lng },
      zoom: MAP_DEFAULT_ZOOM,
      pixelRatio: window.devicePixelRatio || 1,
    });
    mapInstanceRef.current = map;

    new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
    H.ui.UI.createDefault(map, defaultLayers);

    objectsGroupRef.current = new H.map.Group();
    map.addObject(objectsGroupRef.current);

    // Click to add waypoint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addEventListener('tap', async (e: any) => {
      if (!onAddWaypointRef.current) return;
      const coord = map.screenToGeo(
        e.currentPointer.viewportX,
        e.currentPointer.viewportY
      );
      const { lat, lng } = coord;

      try {
        const url = new URL('https://revgeocode.search.hereapi.com/v1/revgeocode');
        url.searchParams.set('apiKey', HERE_API_KEY);
        url.searchParams.set('at', `${lat},${lng}`);
        url.searchParams.set('lang', 'en');
        const res = await fetch(url.toString());
        const data = await res.json();
        const item = data.items?.[0];
        const address = item?.address?.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const name =
          item?.address?.city || item?.address?.county || address.split(',')[0];

        onAddWaypointRef.current?.({
          id: crypto.randomUUID(),
          name,
          address,
          location: { lat, lng },
        });
      } catch {
        onAddWaypointRef.current?.({
          id: crypto.randomUUID(),
          name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          location: { lat, lng },
        });
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => map.getViewPort().resize());
    resizeObserver.observe(mapRef.current);
    return () => resizeObserver.disconnect();
  }, [isLoaded]);

  const clearObjects = useCallback(() => {
    objectsGroupRef.current?.removeAll();
  }, []);

  const addMarker = useCallback((lat: number, lng: number, icon: string, title: string) => {
    const H = window.H;
    if (!mapInstanceRef.current || !objectsGroupRef.current) return;

    const el = document.createElement('div');
    el.style.cssText = 'font-size:24px;cursor:pointer;line-height:1';
    el.textContent = icon;
    el.title = title;

    const domIcon = new H.map.DomIcon(el);
    const marker = new H.map.DomMarker({ lat, lng }, { icon: domIcon });
    objectsGroupRef.current.addObject(marker);
  }, []);

  // Render waypoints (no plan)
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || tripPlan) return;
    clearObjects();
    if (waypoints.length === 0) return;

    const H = window.H;
    let hasPoints = false;

    waypoints.forEach((wp, index) => {
      addMarker(wp.location.lat, wp.location.lng, index === 0 ? '🏠' : '📍', wp.name);
      hasPoints = true;
    });

    if (hasPoints && waypoints.length > 0) {
      const lats = waypoints.map((w) => w.location.lat);
      const lngs = waypoints.map((w) => w.location.lng);
      const viewBounds = new H.geo.Rect(
        Math.max(...lats),
        Math.min(...lngs),
        Math.min(...lats),
        Math.max(...lngs)
      );
      mapInstanceRef.current.getViewModel().setLookAtData({ bounds: viewBounds }, true);
      if (waypoints.length === 1) mapInstanceRef.current.setZoom(12);
    }
  }, [isLoaded, waypoints, tripPlan, clearObjects, addMarker]);

  // Render trip plan
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !tripPlan) return;
    clearObjects();

    const H = window.H;
    const allPoints: { lat: number; lng: number }[] = [];

    tripPlan.days.forEach((day, dayIndex) => {
      if (selectedDay !== null && selectedDay !== dayIndex) return;

      const color = DAY_COLORS[dayIndex % DAY_COLORS.length];

      // Draw polylines
      if (day.polylineSegments?.length > 0) {
        const lineString = new H.geo.LineString();
        day.polylineSegments.forEach((encoded: string) => {
          const decoded = decodePolyline(encoded);
          decoded.forEach((pt) => {
            lineString.pushPoint({ lat: pt.lat, lng: pt.lng });
            allPoints.push(pt);
          });
        });
        const polyline = new H.map.Polyline(lineString, {
          style: {
            strokeColor: color,
            lineWidth: 5,
            lineCap: 'round',
          },
        });
        objectsGroupRef.current?.addObject(polyline);
      }

      // Start marker
      addMarker(
        day.startLocation.location.lat,
        day.startLocation.location.lng,
        dayIndex === 0 ? '🏠' : '🌅',
        `Day ${day.dayNumber} Start`
      );
      allPoints.push(day.startLocation.location);

      // Main stops
      day.mainStops.forEach((stop) => {
        addMarker(stop.location.lat, stop.location.lng, '📍', stop.name);
        allPoints.push(stop.location);
      });

      // End marker
      addMarker(
        day.endLocation.location.lat,
        day.endLocation.location.lng,
        dayIndex === tripPlan.days.length - 1 ? '🏁' : '🌙',
        `Day ${day.dayNumber} End`
      );
      allPoints.push(day.endLocation.location);

      // Hotels
      day.hotelSuggestions.slice(0, 2).forEach((hotel) => {
        addMarker(hotel.location.lat, hotel.location.lng, '🏨', hotel.name);
      });

      // Gas stops
      day.gasStops.forEach((gas) => {
        addMarker(gas.location.lat, gas.location.lng, '⛽', gas.name);
      });
    });

    // Fit map to all points
    if (allPoints.length > 0) {
      const lats = allPoints.map((p) => p.lat);
      const lngs = allPoints.map((p) => p.lng);
      const viewBounds = new window.H.geo.Rect(
        Math.max(...lats),
        Math.min(...lngs),
        Math.min(...lats),
        Math.max(...lngs)
      );
      mapInstanceRef.current.getViewModel().setLookAtData({ bounds: viewBounds }, true);
    }
  }, [isLoaded, tripPlan, selectedDay, clearObjects, addMarker]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 text-red-600 p-6">
        <p>Failed to load HERE Maps: {loadError}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading HERE Maps…</p>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full" />;
}
