import React, { useState, useEffect } from 'react';
import { Check, X, Clock, User, AlertCircle, Upload } from 'lucide-react';
import { VisitorSuggestion, Moment, MediaItem, MediaContribution } from '../../types';
import {
  loadSuggestions,
  updateSuggestionStatus,
  saveStoredMembership,
  deleteStoredMembership,
} from '../../lib/db';
import { assertAdminAccess } from '../../lib/auth';
import { getAdminToken } from '../../lib/collectionApi';

interface AdminReviewQueueProps {
  isOpen: boolean;
  onClose: () => void;
  moments: Moment[];
  media: MediaItem[];
  collectionSlug?: string;
  onDataUpdated: () => void;
}

export const AdminReviewQueue: React.FC<AdminReviewQueueProps> = ({
  isOpen,
  onClose,
  moments,
  media,
  collectionSlug = 'elevate',
  onDataUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'contributions' | 'suggestions'>('contributions');
  const [suggestions, setSuggestions] = useState<VisitorSuggestion[]>([]);
  const [contributions, setContributions] = useState<MediaContribution[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = () => {
    loadSuggestions().then(setSuggestions);

    const adminToken = getAdminToken();
    if (adminToken) {
      fetch(`/api/admin/collections/${collectionSlug}/contributions`, {
        headers: { 'x-admin-token': adminToken },
      })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.contributions)) {
            setContributions(data.contributions);
          }
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen, collectionSlug]);

  if (!isOpen) return null;

  // Approve a visitor correction suggestion
  const handleApproveSuggestion = async (sugg: VisitorSuggestion) => {
    try {
      assertAdminAccess('Approving visitor suggestion');
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setProcessingId(sugg.id);
    setError(null);

    try {
      if (sugg.action === 'add_to_moment') {
        await saveStoredMembership({
          mediaId: sugg.mediaId,
          momentId: sugg.targetMomentId,
          source: 'visitor_suggestion',
          confidence: 1.0,
        });
      } else if (sugg.action === 'unlink_from_moment') {
        await deleteStoredMembership(sugg.mediaId, sugg.targetMomentId);
      }

      await updateSuggestionStatus(sugg.id, 'approved', 'Admin Organizer');
      fetchItems();
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  };

  // Reject a visitor correction suggestion
  const handleRejectSuggestion = async (sugg: VisitorSuggestion) => {
    try {
      assertAdminAccess('Rejecting visitor suggestion');
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setProcessingId(sugg.id);
    setError(null);

    try {
      await updateSuggestionStatus(sugg.id, 'rejected', 'Admin Organizer');
      fetchItems();
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  };

  // Approve a submitted photo/video contribution
  const handleApproveContribution = async (contrib: MediaContribution) => {
    const adminToken = getAdminToken();
    if (!adminToken) {
      setError('Admin session required.');
      return;
    }

    setProcessingId(contrib.id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/collections/${collectionSlug}/contributions/${contrib.id}/approve`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      });

      if (!res.ok) {
        throw new Error('Failed to approve contribution');
      }

      fetchItems();
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  };

  // Reject a submitted photo/video contribution
  const handleRejectContribution = async (contrib: MediaContribution) => {
    const adminToken = getAdminToken();
    if (!adminToken) {
      setError('Admin session required.');
      return;
    }

    setProcessingId(contrib.id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/collections/${collectionSlug}/contributions/${contrib.id}/reject`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      });

      if (!res.ok) {
        throw new Error('Failed to reject contribution');
      }

      fetchItems();
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  };

  const pendingContributions = contributions.filter((c) => c.status === 'pending');
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-queue-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div className="bg-surface rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-border max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h2 id="review-queue-title" className="text-base font-semibold text-text">
              Organizer Moderation & Review
            </h2>
            <p className="text-xs text-text/60">
              Inspect and approve contributor media and visitor corrections
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close review queue"
            className="p-2 text-text/60 hover:text-text hover:bg-bg rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 py-3 border-b border-border/40">
          <button
            type="button"
            onClick={() => setActiveTab('contributions')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'contributions'
                ? 'bg-accent text-white font-semibold'
                : 'text-text/70 hover:bg-bg'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Submitted Media ({pendingContributions.length} pending)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('suggestions')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'suggestions'
                ? 'bg-accent text-white font-semibold'
                : 'text-text/70 hover:bg-bg'
            }`}
          >
            <span>Moment Adjustments ({pendingSuggestions.length} pending)</span>
          </button>
        </div>

        {error && (
          <div className="my-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {activeTab === 'contributions' ? (
            pendingContributions.length === 0 ? (
              <div className="py-12 text-center text-text/60 text-xs">
                No pending media submissions awaiting review.
              </div>
            ) : (
              pendingContributions.map((contrib) => {
                const targetMoment = moments.find((m) => m.id === contrib.targetMomentId);
                const isVideo = contrib.mimeType.startsWith('video/');

                return (
                  <div
                    key={contrib.id}
                    className="p-4 bg-bg rounded-xl border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-14 h-14 rounded-lg bg-surface border border-border flex items-center justify-center text-xs text-text/40 overflow-hidden shrink-0">
                        {isVideo ? (
                          <span className="font-mono text-[10px] text-accent font-semibold">VIDEO</span>
                        ) : (
                          <img
                            src={`/api/uploads/${contrib.storagePath.split(/[\\/]/).pop()}`}
                            alt={contrib.originalName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-text flex items-center space-x-1">
                            <User className="w-3.5 h-3.5 text-accent" />
                            <span>{contrib.contributorName}</span>
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                            PENDING REVIEW
                          </span>
                        </div>
                        <div className="text-xs text-text/80 mt-1">
                          File: <span className="font-mono font-medium text-text">{contrib.originalName}</span>
                          {targetMoment && (
                            <span className="ml-1 text-text/60">
                              (Target: &ldquo;{targetMoment.label}&rdquo;)
                            </span>
                          )}
                        </div>
                        {contrib.notes && (
                          <p className="text-xs text-text/60 italic mt-0.5">
                            &ldquo;{contrib.notes}&rdquo;
                          </p>
                        )}
                        <div className="text-[10px] text-text/40 mt-1 flex items-center space-x-2">
                          <span className="font-mono">{(contrib.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>•</span>
                          <span>{new Date(contrib.submittedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => handleRejectContribution(contrib)}
                        disabled={processingId === contrib.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-red-200"
                        title="Reject contribution"
                        aria-label="Reject contribution"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveContribution(contrib)}
                        disabled={processingId === contrib.id}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-xl hover:bg-accent-dark transition-colors shadow-sm"
                        title="Approve and publish"
                        aria-label="Approve contribution"
                      >
                        <Check className="w-4 h-4" />
                        <span>Publish</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            pendingSuggestions.length === 0 ? (
              <div className="py-12 text-center text-text/60 text-xs">
                No pending moment adjustment suggestions.
              </div>
            ) : (
              pendingSuggestions.map((sugg) => {
                const targetMoment = moments.find((m) => m.id === sugg.targetMomentId);
                const targetMedia = media.find((m) => m.id === sugg.mediaId);

                return (
                  <div
                    key={sugg.id}
                    className="p-4 bg-bg rounded-xl border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start space-x-3">
                      {targetMedia ? (
                        <img
                          src={targetMedia.thumbnailUrl}
                          alt={targetMedia.originalName}
                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-surface flex items-center justify-center text-xs text-text/40 flex-shrink-0">
                          Photo
                        </div>
                      )}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-text flex items-center space-x-1">
                            <User className="w-3.5 h-3.5 text-accent" />
                            <span>{sugg.visitorName}</span>
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                            PENDING
                          </span>
                        </div>
                        <div className="text-xs text-text/80 mt-1">
                          Action:{' '}
                          <span className="font-medium text-accent">
                            {sugg.action === 'add_to_moment' ? 'Add photo to' : 'Unlink from'}{' '}
                            &ldquo;{targetMoment?.label || 'Moment'}&rdquo;
                          </span>
                        </div>
                        {sugg.note && (
                          <p className="text-xs text-text/60 italic mt-0.5">
                            &ldquo;{sugg.note}&rdquo;
                          </p>
                        )}
                        <div className="text-[10px] text-text/40 mt-1 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(sugg.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => handleRejectSuggestion(sugg)}
                        disabled={processingId === sugg.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-red-200"
                        title="Reject suggestion"
                        aria-label="Reject suggestion"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveSuggestion(sugg)}
                        disabled={processingId === sugg.id}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-xl hover:bg-accent-dark transition-colors shadow-sm"
                        title="Approve and apply"
                        aria-label="Approve suggestion"
                      >
                        <Check className="w-4 h-4" />
                        <span>Approve</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        <div className="pt-3 border-t border-border/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-text/80 hover:bg-bg rounded-xl min-h-[44px]"
          >
            Close Queue
          </button>
        </div>
      </div>
    </div>
  );
};
