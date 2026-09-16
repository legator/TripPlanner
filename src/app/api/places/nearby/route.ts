import { NextRequest, NextResponse } from 'next/server';
import { getRoutingProvider, MapProviderName } from '@/lib/providers';
import { Place, PlaceType } from '@/lib/types';

function mapToPlaceType(type: string): PlaceType {
  switch (type) {
    case 'gas_station':
      return PlaceType.GAS_STATION;
    case 'restaurant':
      return PlaceType.RESTAURANT;
    case 'cafe':
      return PlaceType.CAFE;
    case 'rest_stop':
      return PlaceType.REST_STOP;
    default:
      return PlaceType.ATTRACTION;
  }
}

// OpenStreetMap Overpass query fallback
async function fetchFromOverpass(
  lat: number,
  lng: number,
  type: string,
  radiusMeters: number
): Promise<Place[]> {
  try {
    let overpassFilter = '';
    if (type === 'gas_station') {
      overpassFilter = 'node["amenity"="fuel"]';
    } else if (type === 'restaurant' || type === 'cafe') {
      overpassFilter = 'node["amenity"~"restaurant|cafe|fast_food"]';
    } else {
      // rest_stop, park, scenic viewpoints, highway rest areas
      overpassFilter = 'node["highway"~"rest_area|services"];node["tourism"~"viewpoint|picnic_site"];node["leisure"="park"]';
    }

    const query = `[out:json][timeout:5];(${overpassFilter}(around:${Math.min(radiusMeters, 30000)},${lat},${lng}););out 15;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.elements || !Array.isArray(data.elements)) return [];

    interface OsmElement {
      id: number;
      lat: number;
      lon: number;
      tags?: Record<string, string>;
    }

    const placeType = mapToPlaceType(type);
    return (data.elements as OsmElement[])
      .filter((el) => el.tags && (el.tags.name || el.tags['brand'] || el.tags['operator']))
      .map((el) => {
        const name = el.tags?.name || el.tags?.['brand'] || el.tags?.['operator'] || 'Rest Area';
        const street = [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(' ');
        const city = el.tags?.['addr:city'] || el.tags?.['addr:town'] || '';
        const address = [street, city].filter(Boolean).join(', ') || `${el.lat.toFixed(4)}, ${el.lon.toFixed(4)}`;

        return {
          id: `osm-${el.id}`,
          name,
          address,
          vicinity: address,
          location: { lat: el.lat, lng: el.lon },
          type: placeType,
          rating: undefined,
          isOpen: undefined,
        };
      });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const type = searchParams.get('type') || 'gas_station';
  const radiusStr = searchParams.get('radius');
  const reqProvider = searchParams.get('provider') as MapProviderName | null;

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: 'Missing lat or lng parameter' }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  const radius = radiusStr ? parseInt(radiusStr, 10) : 25000;

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  // 1. Try Primary Provider (HERE or Google)
  try {
    const provider = getRoutingProvider(reqProvider ?? undefined);
    const nearby = await provider.searchNearby({ lat, lng }, type, radius, 10);

    if (nearby && nearby.length > 0) {
      const placeType = mapToPlaceType(type);
      const places: Place[] = nearby.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        vicinity: p.address,
        location: p.location,
        type: placeType,
        rating: p.rating,
        priceLevel: p.priceLevel,
        isOpen: p.isOpen,
        photoUrl: p.photoUrl,
      }));

      return NextResponse.json({ places });
    }
  } catch (err) {
    console.warn('Provider searchNearby error, falling back to OSM:', err);
  }

  // 2. OpenStreetMap Overpass fallback
  const osmPlaces = await fetchFromOverpass(lat, lng, type, radius);
  return NextResponse.json({ places: osmPlaces });
}
