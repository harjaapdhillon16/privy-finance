import crypto from 'crypto';
import { cookies } from 'next/headers';

const CSRF_COOKIE_NAME = 'csrf-token';

export function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function setCSRFToken() {
  const token = generateCSRFToken();

  cookies().set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  return token;
}

export function verifyCSRFToken(token: string) {
  const storedToken = cookies().get(CSRF_COOKIE_NAME)?.value;
  return Boolean(storedToken && storedToken === token);
}
