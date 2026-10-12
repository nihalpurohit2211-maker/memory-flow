import { SharedCollectionInfo, Moment, MediaItem, Membership, Connection, VisitorSuggestion, CollectionVisibility } from '../types';

export function getVisitorToken(slug: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(`memoryflow_visitor_token_${slug}`);
}

export function setVisitorToken(slug: string, token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(`memoryflow_visitor_token_${slug}`, token);
}

export function clearVisitorToken(slug: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`memoryflow_visitor_token_${slug}`);
}

export async function fetchCollectionInfo(slug: string = 'elevate'): Promise<SharedCollectionInfo> {
  const res = await fetch(`/api/collections/${slug}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to load collection info: ${res.statusText}`);
  }
  return res.json();
}

export async function verifyCollectionPassword(
  slug: string,
  password: string
): Promise<{ success: boolean; token?: string; error?: string; remainingAttempts?: number; retryAfterSec?: number }> {
  const res = await fetch(`/api/collections/${slug}/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await res.json();
  if (res.ok && data.token) {
    setVisitorToken(slug, data.token);
    return { success: true, token: data.token };
  }
  return {
    success: false,
    error: data.error || 'Failed to verify password',
    remainingAttempts: data.remainingAttempts,
    retryAfterSec: data.retryAfterSec,
  };
}

export async function fetchCollectionData(
  slug: string = 'elevate',
  customToken?: string
): Promise<{
  collection: SharedCollectionInfo;
  moments: Moment[];
  mediaItems: MediaItem[];
  memberships: Membership[];
  connections: Connection[];
  suggestions: VisitorSuggestion[];
}> {
  const token = customToken || getVisitorToken(slug);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api/collections/${slug}/data`, { headers });
  if (res.status === 401) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Password required');
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch collection data: ${res.statusText}`);
  }
  return res.json();
}

export async function updateSharingSettings(
  slug: string,
  adminToken: string,
  settings: {
    visibility?: CollectionVisibility;
    password?: string;
    passwordHint?: string;
    removePassword?: boolean;
  }
): Promise<{ success: boolean; visibility: CollectionVisibility; hasPassword: boolean; passwordHint: string | null }> {
  const res = await fetch(`/api/admin/collections/${slug}/sharing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify(settings),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update sharing settings (${res.status})`);
  }
  return res.json();
}

export async function syncCollectionToServer(
  slug: string,
  data: {
    moments: Moment[];
    mediaItems: MediaItem[];
    memberships: Membership[];
    connections: Connection[];
  }
): Promise<{ success: boolean; syncedAt: string; mediaCount: number; momentsCount: number }> {
  const res = await fetch(`/api/collections/${slug}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to sync collection: ${res.statusText}`);
  }
  return res.json();
}
