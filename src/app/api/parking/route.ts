import { NextRequest, NextResponse } from 'next/server';
import { fetchHereParking } from '@/lib/providers/here';
import { googleProvider } from '@/lib/providers/google';
import { Place, PlaceType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lng = parseFloat(searchParams.get('lng') || '');
    const radius = parseInt(searchParams.get('radius') || '3000', 10);
    const mode = searchParams.get('mode') === 'highway' ? 'highway' : 'city';
    const query = searchParams.get('query') || undefined;
    const provider = searchParams.get('provider') || 'here';

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Valid lat and lng query parameters are required' },
        { status: 400 }
      );
    }

    let places: Place[] = [];

    if (provider === 'google' && !query && mode !== 'highway') {
      // Use Google Places provider if specifically requested
      const results = await googleProvider.searchNearby({ lat, lng }, 'parking', radius, 15);
      places = results.map((r): Place => ({
        id: r.id,
        name: r.name,
        address: r.address,
        location: r.location,
        type: PlaceType.PARKING,
        rating: r.rating,
        priceLevel: r.priceLevel,
        vicinity: r.address,
        isOpen: r.isOpen,
        parkingDetails: {
          facilityType: 'lot',
          isHighwayRestStop: false,
        },
      }));
    } else {
      // Default to HERE API which offers detailed parking categories and rest areas
      const hereResults = await fetchHereParking(
        { lat, lng },
        radius,
        mode === 'highway',
        query
      );

      places = hereResults.map((item): Place => ({
        id: item.id,
        name: item.name,
        address: item.address,
        location: item.location,
        type: PlaceType.PARKING,
        vicinity: item.address,
        isOpen: item.isOpen,
        parkingDetails: {
          facilityType: item.facilityType,
          isHighwayRestStop: item.isHighwayRestStop,
          totalCapacity: item.totalCapacity,
          availableSpots: item.availableSpots,
          distanceMeters: item.distanceMeters,
        },
      }));
    }

    return NextResponse.json({
      places,
      count: places.length,
      mode,
      center: { lat, lng },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to search parking';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
