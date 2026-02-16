import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const WINDOW_MS = 10_000;
const LIMIT = 30;

const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recent.length >= LIMIT) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

export function middleware(request: NextRequest) {
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
