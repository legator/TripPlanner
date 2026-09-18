'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useHereMaps } from './HereMapsProvider';
import { DayPlan, Waypoint, Place, TrafficIncident } from '@/lib/types';
import { DAY_COLORS, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from '@/lib/constants';
import { decodePolyline } from '@/lib/tripGpxExport';
import { LiveDrivingPosition, getCurrentCoordinates, reverseGeocodeCoordinates } from '@/lib/location';
import { generateUUID } from '@/lib/uuid';

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || '';

interface HereMapViewProps {
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

export default function HereMapView({
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
}: HereMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objectsGroupRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uiRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drivingMarkerRef = useRef<any>(null);
  const carArrowRef = useRef<HTMLElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bubbleRef = useRef<any>(null);

  const [isLocating, setIsLocating] = useState(false);
  const { isLoaded, loadError } = useHereMaps();
  const onAddWaypointRef = useRef(onAddWaypoint);
  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficIncidents, setTrafficIncidents] = useState<TrafficIncident[]>([]);
  const [loadingTraffic, setLoadingTraffic] = useState(false);
  const [isolinePoints, setIsolinePoints] = useState<{lat: number, lng: number}[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trafficLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trafficIncidentsGroupRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trafficBubbleRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isolinePolygonRef = useRef<any>(null);
  const onSetStartRef = useRef(onSetStart);
  const onOpenUpdateTripModalRef = useRef(onOpenUpdateTripModal);
  const onMapUserDragRef = useRef(onMapUserDrag);

  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
    onSetStartRef.current = onSetStart;
    onOpenUpdateTripModalRef.current = onOpenUpdateTripModal;
    onMapUserDragRef.current = onMapUserDrag;
  }, [onAddWaypoint, onSetStart, onOpenUpdateTripModal, onMapUserDrag]);

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
    trafficLayerRef.current = defaultLayers.vector.normal.traffic;

    new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
    uiRef.current = H.ui.UI.createDefault(map, defaultLayers);

    map.addEventListener('dragstart', () => {
      onMapUserDragRef.current?.();
    });

    objectsGroupRef.current = new H.map.Group();
    map.addObject(objectsGroupRef.current);

    const incidentsGroup = new H.map.Group();
    map.addObject(incidentsGroup);
    trafficIncidentsGroupRef.current = incidentsGroup;

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
          id: generateUUID(),
          name,
          address,
          location: { lat, lng },
        });
      } catch {
        onAddWaypointRef.current?.({
          id: generateUUID(),
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

  // Traffic layer & Incidents toggle
  useEffect(() => {
    if (!mapInstanceRef.current || !trafficLayerRef.current) return;
    const H = window.H;

    if (!showTraffic) {
      mapInstanceRef.current.removeLayer(trafficLayerRef.current);
      trafficIncidentsGroupRef.current?.removeAll();
      if (trafficBubbleRef.current && uiRef.current) {
        uiRef.current.removeBubble(trafficBubbleRef.current);
        trafficBubbleRef.current = null;
      }
      setTrafficIncidents([]);
      return;
    }

    // Turn on vector traffic flow layer
    mapInstanceRef.current.addLayer(trafficLayerRef.current);

    let isSubscribed = true;
    setLoadingTraffic(true);

    const fetchIncidents = async () => {
      try {
        let res: Response;
        const activePolyline = tripPlan?.overviewPolyline;

        if (activePolyline) {
          res = await fetch('/api/traffic/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              corridor: activePolyline,
              radius: 300,
              limit: 60,
            }),
          });
        } else if (waypoints.length > 0) {
          res = await fetch(
            `/api/traffic/incidents?lat=${waypoints[0].location.lat}&lng=${waypoints[0].location.lng}&radius=35000&limit=60`
          );
        } else {
          const center = mapInstanceRef.current.getCenter();
          res = await fetch(
            `/api/traffic/incidents?lat=${center.lat}&lng=${center.lng}&radius=35000&limit=60`
          );
        }

        if (!res.ok) throw new Error('Failed to fetch incidents');
        const data = await res.json();
        if (!isSubscribed) return;

        const incidents: TrafficIncident[] = data.incidents || [];
        setTrafficIncidents(incidents);

        trafficIncidentsGroupRef.current?.removeAll();

        incidents.forEach((incident) => {
          let icon = '⚠️';
          let label = 'Hazard';
          let color = '#eab308'; // yellow

          if (incident.type === 'roadClosure' || incident.roadClosed) {
            icon = '⛔';
            label = 'Road Closed';
            color = '#ef4444';
          } else if (incident.type === 'accident') {
            icon = '💥';
            label = 'Accident';
            color = '#dc2626';
          } else if (incident.type === 'roadwork') {
            icon = '🚧';
            label = 'Roadwork';
            color = '#f59e0b';
          } else if (incident.type === 'congestion') {
            icon = '🛑';
            label = 'Congestion';
            color = '#e11d48';
          }

          const isCritical = incident.criticality === 'critical' || incident.roadClosed;

          const markerEl = document.createElement('div');
          markerEl.style.cssText = 'position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
          markerEl.innerHTML = `
            <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:${color}40;${isCritical ? 'animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;' : ''}"></div>
            <div style="width:26px;height:26px;border-radius:50%;background:#09090b;border:2.5px solid ${color};color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 3px 8px rgba(0,0,0,0.6);position:relative;z-index:2;">
              ${icon}
            </div>
          `;

          const domIcon = new H.map.DomIcon(markerEl);
          const marker = new H.map.DomMarker(
            { lat: incident.location.lat, lng: incident.location.lng },
            { icon: domIcon }
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          marker.addEventListener('tap', (evt: any) => {
            evt.stopPropagation();
            if (trafficBubbleRef.current && uiRef.current) {
              uiRef.current.removeBubble(trafficBubbleRef.current);
            }

            const bubbleEl = document.createElement('div');
            bubbleEl.style.cssText = 'max-width:270px;padding:8px 10px;font-family:system-ui,-apple-system,sans-serif;color:#18181b;';
            bubbleEl.innerHTML = `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <span style="font-weight:700;font-size:13px;color:#09090b;display:flex;align-items:center;gap:5px;">
                  <span style="font-size:15px;">${icon}</span>
                  <span>${label}</span>
                </span>
                <span style="font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 6px;border-radius:9999px;background:${color}20;color:${color};border:1px solid ${color}40;">
                  ${incident.criticality}
                </span>
              </div>
              ${incident.roadClosed ? '<div style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;margin-bottom:6px;display:flex;align-items:center;gap:4px;"><span>⛔</span><span>ROAD CLOSED</span></div>' : ''}
              <p style="margin:0 0 5px;font-size:12px;font-weight:600;color:#18181b;line-height:1.35;">
                ${incident.summary}
              </p>
              ${incident.description && incident.description !== incident.summary ? `<p style="margin:0 0 6px;font-size:11px;color:#52525b;line-height:1.3;">${incident.description}</p>` : ''}
              ${incident.lengthMeters ? `<div style="font-size:11px;color:#71717a;margin-bottom:3px;">📏 Length: ${(incident.lengthMeters / 1000).toFixed(1)} km (${(incident.lengthMeters * 0.000621371).toFixed(1)} mi)</div>` : ''}
              ${incident.endTime ? `<div style="font-size:10px;color:#a1a1aa;">⏱️ Until: ${new Date(incident.endTime).toLocaleDateString()}</div>` : ''}
            `;

            const bubble = new H.ui.InfoBubble(
              { lat: incident.location.lat, lng: incident.location.lng },
              { content: bubbleEl }
            );
            uiRef.current?.addBubble(bubble);
            trafficBubbleRef.current = bubble;
          });

          trafficIncidentsGroupRef.current?.addObject(marker);
        });
      } catch (err) {
        console.warn('HERE Traffic incidents load error:', err);
      } finally {
        if (isSubscribed) {
          setLoadingTraffic(false);
        }
      }
    };

    fetchIncidents();

    return () => {
      isSubscribed = false;
    };
  }, [showTraffic, tripPlan, waypoints]);

  // Render Isoline Polygon
  useEffect(() => {
    const H = window.H;
    if (!mapInstanceRef.current || !objectsGroupRef.current) return;

    if (isolinePolygonRef.current) {
      objectsGroupRef.current.removeObject(isolinePolygonRef.current);
      isolinePolygonRef.current = null;
    }

    if (isolinePoints && isolinePoints.length > 0) {
      const lineString = new H.geo.LineString();
      isolinePoints.forEach(p => lineString.pushPoint(p));
      const polygon = new H.map.Polygon(lineString, {
        style: {
          fillColor: 'rgba(59, 130, 246, 0.2)', // blue-500 with opacity
          strokeColor: 'rgba(37, 99, 235, 0.8)', // blue-600
          lineWidth: 2,
        }
      });
      isolinePolygonRef.current = polygon;
      objectsGroupRef.current.addObject(polygon);
      
      const viewBounds = polygon.getBoundingBox();
      mapInstanceRef.current.getViewModel().setLookAtData({ bounds: viewBounds }, true);
    }
  }, [isolinePoints]);

  const handleLocateUser = useCallback(async () => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const H = window.H;
    setIsLocating(true);

    try {
      const coords = await getCurrentCoordinates();
      mapInstanceRef.current.setCenter({ lat: coords.lat, lng: coords.lng });
      mapInstanceRef.current.setZoom(14);

      if (userMarkerRef.current) {
        mapInstanceRef.current.removeObject(userMarkerRef.current);
      }
      if (bubbleRef.current && uiRef.current) {
        uiRef.current.removeBubble(bubbleRef.current);
      }

      const pulseEl = document.createElement('div');
      pulseEl.style.cssText = 'position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      pulseEl.innerHTML = `
        <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(37,99,235,0.35);animation:ping 1.6s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);position:relative;z-index:2;"></div>
      `;

      const domIcon = new H.map.DomIcon(pulseEl);
      const marker = new H.map.DomMarker({ lat: coords.lat, lng: coords.lng }, { icon: domIcon });
      mapInstanceRef.current.addObject(marker);
      userMarkerRef.current = marker;

      const geocoded = await reverseGeocodeCoordinates(coords.lat, coords.lng, 'here');
      const wp: Waypoint = {
        id: generateUUID(),
        name: geocoded.name || 'Current Location',
        address: geocoded.address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        location: { lat: coords.lat, lng: coords.lng },
        placeId: geocoded.placeId,
      };

      if (uiRef.current) {
        const bubbleContainer = document.createElement('div');
        bubbleContainer.style.padding = '8px';
        bubbleContainer.style.maxWidth = '250px';
        bubbleContainer.innerHTML = `
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
            if (bubbleRef.current) uiRef.current.removeBubble(bubbleRef.current);
          });
          btnContainer.appendChild(setStartBtn);
        }

        if (tripPlan && onOpenUpdateTripModalRef.current) {
          const updateTripBtn = document.createElement('button');
          updateTripBtn.textContent = '🧭 Update Trip from Here';
          updateTripBtn.style.cssText = 'background:#2563eb;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;';
          updateTripBtn.addEventListener('click', () => {
            onOpenUpdateTripModalRef.current?.();
            if (bubbleRef.current) uiRef.current.removeBubble(bubbleRef.current);
          });
          btnContainer.appendChild(updateTripBtn);
        }

        if (onAddWaypointRef.current) {
          const addStopBtn = document.createElement('button');
          addStopBtn.textContent = '+ Add as Stop';
          addStopBtn.style.cssText = 'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:500;';
          addStopBtn.addEventListener('click', () => {
            onAddWaypointRef.current?.(wp);
            if (bubbleRef.current) uiRef.current.removeBubble(bubbleRef.current);
          });
          btnContainer.appendChild(addStopBtn);
        }

        bubbleContainer.appendChild(btnContainer);

        const bubble = new H.ui.InfoBubble({ lat: coords.lat, lng: coords.lng }, { content: bubbleContainer });
        uiRef.current.addBubble(bubble);
        bubbleRef.current = bubble;
      }
    } catch (err) {
      console.warn('Locate user error in HERE map:', err);
    } finally {
      setIsLocating(false);
    }
  }, [isLoaded, tripPlan]);

  const clearObjects = useCallback(() => {
    objectsGroupRef.current?.removeAll();
    setIsolinePoints(null);
  }, []);

  const addMarker = useCallback((lat: number, lng: number, icon: string, title: string) => {
    const H = window.H;
    if (!mapInstanceRef.current || !objectsGroupRef.current) return;

    const el = document.createElement('div');
    el.style.cssText = 'font-size:24px;cursor:pointer;line-height:1;transition:transform 0.1s;';
    el.textContent = icon;
    el.title = title + ' (Click to see 15-min reachable area)';
    
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      el.style.transform = 'scale(1.2)';
      setTimeout(() => { el.style.transform = 'none'; }, 200);
      try {
        const res = await fetch(`/api/route/isoline?lat=${lat}&lng=${lng}&rangeMins=15&mode=car`);
        if (res.ok) {
          const data = await res.json();
          setIsolinePoints(data.points || []);
        }
      } catch (err) {
        console.error('Failed to fetch isoline:', err);
      }
    });

    const domIcon = new H.map.DomIcon(el);
    const marker = new H.map.DomMarker({ lat, lng }, { icon: domIcon });
    objectsGroupRef.current.addObject(marker);
  }, []);

  // Driving Follow Mode live position & camera auto-follow
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !isDrivingMode || !drivingPosition) return;
    const H = window.H;
    const pos = { lat: drivingPosition.lat, lng: drivingPosition.lng };
    const heading = drivingPosition.heading ?? 0;

    if (autoFollow) {
      mapInstanceRef.current.setCenter(pos);
      const currentZoom = mapInstanceRef.current.getZoom();
      if (currentZoom < 15) {
        mapInstanceRef.current.setZoom(16);
      }
    }

    if (drivingMarkerRef.current) {
      drivingMarkerRef.current.setGeometry(pos);
      if (carArrowRef.current) {
        carArrowRef.current.style.transform = `rotate(${heading}deg)`;
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

      carArrowRef.current = carEl.querySelector('.car-arrow');
      const domIcon = new H.map.DomIcon(carEl);
      const marker = new H.map.DomMarker(pos, { icon: domIcon });
      mapInstanceRef.current.addObject(marker);
      drivingMarkerRef.current = marker;
    }
  }, [isLoaded, isDrivingMode, drivingPosition, autoFollow]);

  // Clean up driving marker when exiting driving mode
  useEffect(() => {
    if (!isDrivingMode && drivingMarkerRef.current && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.removeObject(drivingMarkerRef.current);
      } catch {}
      drivingMarkerRef.current = null;
      carArrowRef.current = null;
    }
  }, [isDrivingMode]);

  // Center and highlight a focused place (e.g. from Driving HUD quick stops)
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !focusedPlace) return;
    const H = window.H;
    const pos = { lat: focusedPlace.location.lat, lng: focusedPlace.location.lng };
    mapInstanceRef.current.setCenter(pos);
    if (mapInstanceRef.current.getZoom() < 15) {
      mapInstanceRef.current.setZoom(16);
    }

    const focusEl = document.createElement('div');
    focusEl.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;';
    focusEl.innerHTML = `
      <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(234,88,12,0.3);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="width:28px;height:28px;border-radius:50%;background:#ea580c;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:14px;position:relative;z-index:2;">
        📍
      </div>
    `;
    const domIcon = new H.map.DomIcon(focusEl);
    const marker = new H.map.DomMarker(pos, { icon: domIcon });
    objectsGroupRef.current?.addObject(marker);

    return () => {
      try {
        objectsGroupRef.current?.removeObject(marker);
      } catch {}
    };
  }, [isLoaded, focusedPlace]);

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

      // Restaurants
      day.restaurants.slice(0, 3).forEach((rest) => {
        addMarker(rest.location.lat, rest.location.lng, '🍽️', rest.name);
      });

      // Attractions
      day.attractions.slice(0, 3).forEach((attr) => {
        addMarker(attr.location.lat, attr.location.lng, '⭐', attr.name);
      });

      // Parking & highway rest stops
      (day.parkingStops || []).slice(0, 4).forEach((parking) => {
        addMarker(
          parking.location.lat,
          parking.location.lng,
          parking.parkingDetails?.isHighwayRestStop ? '🛑' : '🅿️',
          parking.name
        );
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

  return (
    <div className="flex-1 relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Traffic Toggle */}
      {!isDrivingMode && (
        <div className="absolute top-4 right-4 z-[1]">
          <button
            type="button"
            onClick={() => setShowTraffic(!showTraffic)}
            className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg shadow-md font-medium text-xs md:text-sm transition-all ${
              showTraffic 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20' 
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
            }`}
          >
            <span>🚥</span>
            <span>
              {showTraffic
                ? loadingTraffic
                  ? 'Loading Alerts...'
                  : trafficIncidents.length > 0
                  ? `Traffic (${trafficIncidents.length})`
                  : 'Traffic (Clear)'
                : 'Show Traffic'}
            </span>
            {loadingTraffic && (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin ml-0.5" />
            )}
          </button>
        </div>
      )}

      {/* Floating Locate Me Button */}
      {isLoaded && !isDrivingMode && (
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
    </div>
  );
}
