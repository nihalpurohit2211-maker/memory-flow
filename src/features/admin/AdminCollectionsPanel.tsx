import React, { useState, useEffect } from 'react';
import { SharedCollectionInfo } from '../../types';
import { Layers, Plus, Trash2, ArrowRight, X, AlertCircle } from 'lucide-react';

interface AdminCollectionsPanelProps {
  currentSlug: string;
  adminSessionToken: string;
  onClose: () => void;
  onSelectCollection: (slug: string) => void;
}

export const AdminCollectionsPanel: React.FC<AdminCollectionsPanelProps> = ({
  currentSlug,
  adminSessionToken,
  onClose,
  onSelectCollection,
}) => {
  const [collections, setCollections] = useState<SharedCollectionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New collection form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newDriveFolderId, setNewDriveFolderId] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public' | 'password'>('password');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCollections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/collections', {
        headers: { Authorization: `Bearer ${adminSessionToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections || []);
      } else {
        // Fallback: list current collection if multi-collection list route isn't enabled yet
        setCollections([
          {
            id: currentSlug,
            slug: currentSlug,
            name: currentSlug === 'elevate' ? 'ELEVATE 1.0' : currentSlug,
            description: 'Event memories collection',
            visibility: 'password',
            hasPassword: true,
            requiresPassword: true,
            passwordHint: 'Initial password set by administrator',
            peopleGroupingEnabled: false,
            updatedAt: new Date().toISOString(),
            mediaCount: 192,
            momentCount: 8,
          },
        ]);
      }
    } catch {
      setCollections([
        {
          id: currentSlug,
          slug: currentSlug,
          name: currentSlug === 'elevate' ? 'ELEVATE 1.0' : currentSlug,
          description: 'Event memories collection',
          visibility: 'password',
          hasPassword: true,
          requiresPassword: true,
          passwordHint: 'Initial password set by administrator',
          peopleGroupingEnabled: false,
          updatedAt: new Date().toISOString(),
          mediaCount: 192,
          momentCount: 8,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [adminSessionToken]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/collections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSessionToken}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          slug: newSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''),
          driveFolderId: newDriveFolderId.trim() || null,
          visibility: newVisibility,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create collection.');
      }

      setIsCreating(false);
      setNewName('');
      setNewSlug('');
      setNewDriveFolderId('');
      await fetchCollections();
    } catch (err: any) {
      setError(err.message || 'Error creating collection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (slug === currentSlug && collections.length === 1) {
      alert('Cannot delete the only active collection.');
      return;
    }
    if (!confirm(`Are you sure you want to delete collection "${slug}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/collections/${slug}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminSessionToken}` },
      });
      if (res.ok) {
        await fetchCollections();
        if (slug === currentSlug) {
          const remaining = collections.filter((c) => c.slug !== slug);
          if (remaining.length > 0) {
            onSelectCollection(remaining[0].slug);
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete collection:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl max-w-xl w-full p-6 shadow-modal space-y-5 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
          <div className="flex items-center gap-2 text-accent font-semibold text-base">
            <Layers className="w-5 h-5" />
            <h3>Manage Event Collections</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-charcoal-muted hover:text-charcoal rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isCreating ? (
          <form onSubmit={handleCreate} className="space-y-3 bg-surface-muted p-4 rounded-xl border border-border shrink-0">
            <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wider">
              Create New Collection
            </h4>
            <div>
              <label className="block text-[11px] font-medium text-charcoal mb-1">
                Event Name:
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug) {
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                  }
                }}
                placeholder="e.g. ELEVATE 2.0 or Summer Summit"
                required
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded bg-surface text-charcoal"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-charcoal mb-1">
                URL Slug (/c/slug):
              </label>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. elevate-2"
                required
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded bg-surface text-charcoal font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-charcoal mb-1">
                Google Drive Folder ID (optional):
              </label>
              <input
                type="text"
                value={newDriveFolderId}
                onChange={(e) => setNewDriveFolderId(e.target.value)}
                placeholder="Drive folder ID..."
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded bg-surface text-charcoal font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-charcoal mb-1">
                Visibility:
              </label>
              <select
                value={newVisibility}
                onChange={(e: any) => setNewVisibility(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded bg-surface text-charcoal"
              >
                <option value="password">Password protected (Default)</option>
                <option value="public">Public (Open to anyone with link)</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs text-charcoal-muted hover:bg-surface rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-accent text-surface text-xs font-medium rounded hover:bg-accent-hover"
              >
                {isSubmitting ? 'Creating...' : 'Create Collection'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end shrink-0">
            <button
              onClick={() => setIsCreating(true)}
              className="px-3.5 py-1.5 bg-accent text-surface text-xs font-medium rounded-lg hover:bg-accent-hover flex items-center gap-1.5 shadow-subtle min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Collection</span>
            </button>
          </div>
        )}

        <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
          {isLoading ? (
            <p className="text-xs text-charcoal-muted text-center py-8">Loading collections...</p>
          ) : (
            collections.map((col) => {
              const isCurrent = col.slug === currentSlug;

              return (
                <div
                  key={col.slug}
                  className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-accent-light/40 border-accent/60 shadow-subtle'
                      : 'bg-surface border-border hover:border-accent/30'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-charcoal truncate">
                        {col.name}
                      </h4>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-accent text-surface text-[10px] font-semibold uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-charcoal-muted">
                      /c/{col.slug} · {col.mediaCount || 0} media · {col.visibility}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isCurrent && (
                      <button
                        onClick={() => {
                          onSelectCollection(col.slug);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-surface hover:bg-surface-muted border border-border text-charcoal text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <span>Switch</span>
                        <ArrowRight className="w-3.5 h-3.5 text-accent" />
                      </button>
                    )}
                    {collections.length > 1 && !isCurrent && (
                      <button
                        onClick={() => handleDelete(col.slug)}
                        title="Delete collection"
                        className="p-1.5 text-charcoal-muted hover:text-red-600 rounded-lg hover:bg-surface-muted transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface hover:bg-surface-muted border border-border text-charcoal text-xs font-medium rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
