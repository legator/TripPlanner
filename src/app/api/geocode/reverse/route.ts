import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const reqProvider = searchParams.get('provider');

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: 'Missing lat or lng parameter' }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  const envProvider = process.env.MAP_PROVIDER || process.env.NEXT_PUBLIC_MAP_PROVIDER;
  const provider = reqProvider || (envProvider === 'here' ? 'here' : 'google');

  // ── 1. Try HERE Reverse Geocoding ──────────────────────────────────────────
  if (provider === 'here') {
    const customHereKey = request.headers.get('x-custom-here-key') || undefined;
    const hereKey = customHereKey || process.env.HERE_API_KEY || process.env.NEXT_PUBLIC_HERE_API_KEY;
    if (hereKey && hereKey !== 'your_here_api_key_here') {
      try {
        const url = new URL('https://revgeocode.search.hereapi.com/v1/revgeocode');
        url.searchParams.set('apiKey', hereKey);
        url.searchParams.set('at', `${lat},${lng}`);
        url.searchParams.set('lang', 'en');

        const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
        if (res.ok) {
          const data = await res.json();
          const item = data.items?.[0];
          if (item) {
            const address = item.address?.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            const name =
              item.title ||
              item.address?.city ||
              item.address?.district ||
              item.address?.county ||
              address.split(',')[0] ||
              'Current Location';

            return NextResponse.json({
              name,
              address,
              location: { lat, lng },
              placeId: item.id || undefined,
            });
          }
        }
      } catch (err) {
        console.warn('HERE reverse geocode failed, falling back:', err);
      }
    }
  }

  // ── 2. Try Google Reverse Geocoding ────────────────────────────────────────
  const customGoogleKey = request.headers.get('x-custom-google-key') || undefined;
  const googleKey = customGoogleKey || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (googleKey && googleKey !== 'your_google_maps_api_key_here') {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', `${lat},${lng}`);
      url.searchParams.set('key', googleKey);

      const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = await res.json();
        const result = data.results?.[0];
        if (result) {
          const address = result.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          const locality = result.address_components?.find((c: { types: string[]; long_name: string }) =>
            c.types.includes('locality')
          )?.long_name;
          const adminArea = result.address_components?.find((c: { types: string[]; long_name: string }) =>
            c.types.includes('administrative_area_level_1')
          )?.long_name;
          const name = locality || adminArea || address.split(',')[0] || 'Current Location';

          return NextResponse.json({
            name,
            address,
            location: { lat, lng },
            placeId: result.place_id || undefined,
          });
        }
      }
    } catch (err) {
      console.warn('Google reverse geocode failed, falling back:', err);
    }
  }

  // ── 3. OpenStreetMap Nominatim Fallback ────────────────────────────────────
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TripPlannerApp/1.0',
      },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const name =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.suburb ||
        addr.county ||
        data.name ||
        'Current Location';
      const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      return NextResponse.json({
        name,
        address,
        location: { lat, lng },
      });
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode failed:', err);
  }

  // ── 4. Coordinate fallback ────────────────────────────────────────────────
  return NextResponse.json({
    name: 'Current Location',
    address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    location: { lat, lng },
  });
}
