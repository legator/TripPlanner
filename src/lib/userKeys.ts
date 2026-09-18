/**
 * Client-side user identity and custom API key storage (BYOK).
 *
 * Provides:
 * - Anonymous persistent client ID (UUID) for per-user quota calculation
 * - Secure local storage for custom Google Maps and HERE Platform API keys
 * - Standard request header generator for API calls
 */

export interface CustomApiKeys {
  googleKey?: string;
  hereKey?: string;
}

const STORAGE_KEY_CLIENT_ID = 'tp_client_id';
const STORAGE_KEY_CUSTOM_KEYS = 'tp_custom_api_keys';
export const KEYS_UPDATED_EVENT = 'tp:keys-updated';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieves the persistent anonymous client ID, generating and saving one if not found.
 * Safe to call on both client and server (returns 'anonymous' during SSR).
 */
export function getClientId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = localStorage.getItem(STORAGE_KEY_CLIENT_ID);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

/**
 * Retrieves configured custom API keys from localStorage.
 */
export function getCustomApiKeys(): CustomApiKeys {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_KEYS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      googleKey: typeof parsed.googleKey === 'string' ? parsed.googleKey.trim() : undefined,
      hereKey: typeof parsed.hereKey === 'string' ? parsed.hereKey.trim() : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Returns the custom key for a specific provider if configured.
 */
export function getCustomKey(provider: 'google' | 'here'): string | undefined {
  const keys = getCustomApiKeys();
  return provider === 'google' ? keys.googleKey : keys.hereKey;
}

/**
 * Checks if the user has provided their own API key for the given provider.
 */
export function hasCustomKey(provider: 'google' | 'here'): boolean {
  const key = getCustomKey(provider);
  return Boolean(key && key.length > 5);
}

/**
 * Saves user custom API keys and dispatches an event for reactive UI updates.
 */
export function setCustomApiKeys(keys: CustomApiKeys): void {
  if (typeof window === 'undefined') return;
  try {
    const clean: CustomApiKeys = {
      googleKey: keys.googleKey?.trim() || undefined,
      hereKey: keys.hereKey?.trim() || undefined,
    };
    localStorage.setItem(STORAGE_KEY_CUSTOM_KEYS, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(KEYS_UPDATED_EVENT, { detail: clean }));
  } catch (err) {
    console.warn('Failed to save custom API keys:', err);
  }
}

/**
 * Clears custom API keys and reverts to the shared free tier.
 */
export function clearCustomApiKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_KEYS);
    window.dispatchEvent(new CustomEvent(KEYS_UPDATED_EVENT, { detail: {} }));
  } catch (err) {
    console.warn('Failed to clear custom API keys:', err);
  }
}

/**
 * Returns HTTP headers containing client ID and any custom API keys for backend verification.
 */
export function getApiAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'x-client-id': getClientId(),
  };

  const keys = getCustomApiKeys();
  if (keys.googleKey) {
    headers['x-custom-google-key'] = keys.googleKey;
  }
  if (keys.hereKey) {
    headers['x-custom-here-key'] = keys.hereKey;
  }

  return headers;
}
