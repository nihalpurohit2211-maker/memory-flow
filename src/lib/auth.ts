import { getStoredAdminHash, setStoredAdminHash } from './db';
import { adminLogin, adminLogout, setAdminToken, clearAdminToken } from './collectionApi';
import { AdminSession, UserRole } from '../types';

const SALT = 'memoryflow_local_salt_2026_';
const SESSION_KEY = 'memoryflow_admin_session';
const ROLE_KEY = 'memoryflow_active_role';
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

const memoryStore = new Map<string, string>();

function getSessionStore() {
  if (typeof sessionStorage !== 'undefined') return sessionStorage;
  return {
    getItem: (k: string) => memoryStore.get(`session_${k}`) || null,
    setItem: (k: string, v: string) => {
      memoryStore.set(`session_${k}`, v);
    },
    removeItem: (k: string) => {
      memoryStore.delete(`session_${k}`);
    },
  };
}

function getLocalStore() {
  if (typeof localStorage !== 'undefined') return localStorage;
  return {
    getItem: (k: string) => memoryStore.get(`local_${k}`) || null,
    setItem: (k: string, v: string) => {
      memoryStore.set(`local_${k}`, v);
    },
    removeItem: (k: string) => {
      memoryStore.delete(`local_${k}`);
    },
  };
}

/**
 * Computes a SHA-256 hash with salt using the native Web Crypto API.
 */
async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT + passphrase);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Initializes default admin passphrase if not yet set in database.
 */
export async function initializeAdminAuth(): Promise<void> {
  const existingHash = await getStoredAdminHash();
  if (!existingHash) {
    const defaultHash = await hashPassphrase('admin123');
    await setStoredAdminHash(defaultHash);
  }
}

/**
 * Verifies admin credentials via server-enforced authentication API,
 * with graceful local fallback for standalone browser/node test environments.
 */
export async function loginAsAdmin(passphrase: string): Promise<{ success: boolean; error?: string }> {
  // 1. Try server-enforced authentication endpoint
  try {
    const serverRes = await adminLogin(passphrase);
    if (serverRes.success && serverRes.token) {
      const session: AdminSession = {
        isAuthenticated: true,
        token: serverRes.token,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      getSessionStore().setItem(SESSION_KEY, JSON.stringify(session));
      getLocalStore().setItem(ROLE_KEY, 'admin');
      return { success: true };
    } else if (serverRes.error && serverRes.error !== 'Authentication failed') {
      return { success: false, error: serverRes.error };
    }
  } catch {
    // Server endpoint unreachable; fall back to local store
  }

  // 2. Local fallback verification
  await initializeAdminAuth();
  const storedHash = await getStoredAdminHash();
  const inputHash = await hashPassphrase(passphrase);

  if (storedHash === inputHash) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    const session: AdminSession = {
      isAuthenticated: true,
      token,
      expiresAt,
    };

    getSessionStore().setItem(SESSION_KEY, JSON.stringify(session));
    getLocalStore().setItem(ROLE_KEY, 'admin');
    setAdminToken(token);
    return { success: true };
  }

  return { success: false, error: 'Incorrect passphrase.' };
}

/**
 * Ends the admin session and returns to visitor mode.
 */
export function logoutAdmin(): void {
  adminLogout().catch(() => {});
  clearAdminToken();
  getSessionStore().removeItem(SESSION_KEY);
  getLocalStore().setItem(ROLE_KEY, 'visitor');
}

/**
 * Retrieves the active AdminSession object.
 */
export function getAdminSession(): AdminSession {
  try {
    const raw = getSessionStore().getItem(SESSION_KEY);
    if (!raw) return { isAuthenticated: false, token: null, expiresAt: null };
    const session: AdminSession = JSON.parse(raw);
    if (!session.isAuthenticated || !session.expiresAt || Date.now() > session.expiresAt) {
      return { isAuthenticated: false, token: null, expiresAt: null };
    }
    return session;
  } catch {
    return { isAuthenticated: false, token: null, expiresAt: null };
  }
}

/**
 * Checks whether the current session is an active, unexpired admin session.
 */
export function isAdminAuthenticated(): boolean {
  return getAdminSession().isAuthenticated;
}

/**
 * Retrieves the currently active simulated role ('admin' or 'visitor').
 */
export function getActiveRole(): UserRole {
  const role = getLocalStore().getItem(ROLE_KEY) as UserRole | null;
  if (role === 'admin' && isAdminAuthenticated()) {
    return 'admin';
  }
  return 'visitor';
}

/**
 * Sets the active role. If switching to 'admin', requires valid authentication.
 */
export function setActiveRole(role: UserRole): boolean {
  if (role === 'admin') {
    if (!isAdminAuthenticated()) {
      return false;
    }
    getLocalStore().setItem(ROLE_KEY, 'admin');
    return true;
  }
  getLocalStore().setItem(ROLE_KEY, 'visitor');
  return true;
}

/**
 * Asserts that the caller has admin rights. Throws Error if unauthorized.
 */
export function assertAdminAccess(actionName = 'This action'): void {
  if (!isAdminAuthenticated() || getActiveRole() !== 'admin') {
    throw new Error(`${actionName} requires an active Admin session.`);
  }
}
