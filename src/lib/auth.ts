import { getStoredAdminHash, setStoredAdminHash } from './db';
import { AdminSession, UserRole } from '../types';

const SALT = 'memoryflow_local_salt_2026_';
const SESSION_KEY = 'memoryflow_admin_session';
const ROLE_KEY = 'memoryflow_active_role';
const DEFAULT_PASSPHRASE = 'admin123';
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
    const defaultHash = await hashPassphrase(DEFAULT_PASSPHRASE);
    await setStoredAdminHash(defaultHash);
  }
}

/**
 * Verifies admin credentials and establishes a protected local session.
 */
export async function loginAsAdmin(passphrase: string): Promise<{ success: boolean; error?: string }> {
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
    return { success: true };
  }

  return { success: false, error: 'Incorrect passphrase. Default is "admin123".' };
}

/**
 * Ends the admin session and returns to visitor mode.
 */
export function logoutAdmin(): void {
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

/**
 * Updates the admin passphrase.
 */
export async function changeAdminPassphrase(
  currentPassphrase: string,
  newPassphrase: string
): Promise<{ success: boolean; error?: string }> {
  assertAdminAccess('Changing admin passphrase');
  if (!newPassphrase || newPassphrase.length < 4) {
    return { success: false, error: 'New passphrase must be at least 4 characters long.' };
  }

  const storedHash = await getStoredAdminHash();
  const currentHash = await hashPassphrase(currentPassphrase);

  if (storedHash !== currentHash) {
    return { success: false, error: 'Current passphrase is incorrect.' };
  }

  const newHash = await hashPassphrase(newPassphrase);
  await setStoredAdminHash(newHash);
  return { success: true };
}
