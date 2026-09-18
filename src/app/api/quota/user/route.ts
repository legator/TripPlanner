import { NextRequest, NextResponse } from 'next/server';
import { getUserQuotaStatus } from '@/lib/quota/userQuotaGuard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const clientId =
      request.headers.get('x-client-id') ||
      request.nextUrl.searchParams.get('clientId') ||
      'anonymous';

    const customGoogleKey =
      request.headers.get('x-custom-google-key') ||
      request.nextUrl.searchParams.get('googleKey') ||
      undefined;

    const customHereKey =
      request.headers.get('x-custom-here-key') ||
      request.nextUrl.searchParams.get('hereKey') ||
      undefined;

    const status = await getUserQuotaStatus(clientId, customGoogleKey, customHereKey);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch user quota';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
