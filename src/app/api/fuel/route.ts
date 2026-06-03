import { NextResponse } from 'next/server';

export const revalidate = 21600; // Cache for 6 hours (60 * 60 * 6)

export async function GET() {
  try {
    const response = await fetch('https://fuelscan.eu/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TripPlannerBot/1.0',
      },
      next: { revalidate: 21600 }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fuelscan.eu: ${response.status}`);
    }

    const html = await response.text();
    
    const results: Record<string, { euro95: number; diesel: number; lastUpdated: string }> = {};
    
    // The data is embedded in a script tag like:
    // {country:"de",euro95:1.9086146439457063,diesel:1.87415201948446,stationCount:14786,lastUpdated:"2026-06-03T15:30:08.784+00:00"}
    const regex = /\{country:"([^"]+)",euro95:([^,]+),diesel:([^,]+),stationCount:[^,]+,lastUpdated:"([^"]+)"\}/g;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      const countryCode = match[1];
      const euro95 = parseFloat(match[2]);
      const diesel = parseFloat(match[3]);
      const lastUpdated = match[4];
      
      results[countryCode] = {
        euro95: Math.round(euro95 * 100) / 100, // round to 2 decimals
        diesel: Math.round(diesel * 100) / 100,
        lastUpdated
      };
    }

    if (Object.keys(results).length === 0) {
      throw new Error('Failed to parse fuel prices from fuelscan.eu');
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Fuel API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
