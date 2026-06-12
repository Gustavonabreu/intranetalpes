const fallbackBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const LEGACY_API_BASE_URL = import.meta.env.VITE_LEGACY_API_URL || fallbackBase;

export class LegacyApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'LegacyApiError';
    this.status = status;
  }
}

function getCookie(name: string) {
  if (!document.cookie) return null;
  const cookies = document.cookie.split(';');
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return null;
}

async function primeCsrfToken() {
  try {
    await fetch(`${LEGACY_API_BASE_URL}/api/get-csrf-token/`, {
      credentials: 'include'
    });
  } catch {
    // noop
  }
}

export async function legacyRequestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${LEGACY_API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new LegacyApiError(
      errorPayload.error || `Request failed: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export async function legacyGetJson<T>(path: string): Promise<T> {
  return legacyRequestJson<T>(path);
}

export async function legacyMutateJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  await primeCsrfToken();
  const csrfToken = getCookie('csrftoken');

  return legacyRequestJson<T>(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
