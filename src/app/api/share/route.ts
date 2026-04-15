import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_PAYLOAD_BYTES = 512 * 1024;   // 512 KB

function generateId(): string {
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
}

function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKv() {
  const { kv } = await import('@vercel/kv');
  return kv;
}

// POST /api/share — save a trip and return a short ID
export async function POST(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json({ error: 'Short-link sharing is not configured (KV_REST_API_URL missing)' }, { status: 503 });
  }
  try {
    const body = await req.text();
    if (body.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Trip data too large to share' }, { status: 413 });
    }
    JSON.parse(body);
    const id = generateId();
    const kv = await getKv();
    await kv.set(`trip:${id}`, body, { ex: TTL_SECONDS });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save trip' },
      { status: 500 }
    );
  }
}

// GET /api/share?id=xxxx — retrieve a saved trip
export async function GET(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json({ error: 'Short-link sharing is not configured' }, { status: 503 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[a-z0-9]{6,12}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid share ID' }, { status: 400 });
  }
  try {
    const kv = await getKv();
    const data = await kv.get<string>(`trip:${id}`);
    if (!data) {
      return NextResponse.json({ error: 'Share link not found or expired' }, { status: 404 });
    }
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    return new NextResponse(payload, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load trip' },
      { status: 500 }
    );
  }
}
