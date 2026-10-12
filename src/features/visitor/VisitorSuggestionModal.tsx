import React, { useState } from 'react';
import { Users, X, Check, AlertCircle } from 'lucide-react';
import { Moment, MediaItem, VisitorSuggestion } from '../../types';
import { saveSuggestion } from '../../lib/db';

interface VisitorSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMoment: Moment;
  availableMedia: MediaItem[];
  currentMemberships: string[]; // mediaIds currently in this moment
  onSuggestionSubmitted: () => void;
}

export const VisitorSuggestionModal: React.FC<VisitorSuggestionModalProps> = ({
  isOpen,
  onClose,
  targetMoment,
  availableMedia,
  currentMemberships,
  onSuggestionSubmitted,
}) => {
  const [visitorName, setVisitorName] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [actionType, setActionType] = useState<'add_to_moment' | 'unlink_from_moment'>('add_to_moment');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  // If action is add_to_moment, list items not yet in moment
  // If unlink_from_moment, list items currently in moment
  const candidateMedia =
    actionType === 'add_to_moment'
      ? availableMedia.filter((m) => !currentMemberships.includes(m.id))
      : availableMedia.filter((m) => currentMemberships.includes(m.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName.trim()) {
      setError('Please provide your name for attribution.');
      return;
    }
    if (!selectedMediaId) {
      setError('Please select a photo or video to suggest.');
      return;
    }

    setError(null);

    const suggestion: VisitorSuggestion = {
      id: `sugg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      visitorName: visitorName.trim(),
      createdAt: new Date().toISOString(),
      mediaId: selectedMediaId,
      targetMomentId: targetMoment.id,
      action: actionType,
      note: note.trim() || undefined,
      status: 'pending',
    };

    await saveSuggestion(suggestion);
    setSuccess(true);
    setTimeout(() => {
      onSuggestionSubmitted();
      onClose();
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="visitor-suggestion-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div className="bg-surface rounded-2xl max-w-lg w-full p-6 shadow-xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 id="visitor-suggestion-title" className="text-base font-semibold text-text">
                Were You There?
              </h2>
              <p className="text-xs text-text/60">Suggest a correction for &ldquo;{targetMoment.label}&rdquo;</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close suggestion modal"
            className="p-2 text-text/60 hover:text-text hover:bg-bg rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-text">Suggestion Queued!</h3>
            <p className="text-xs text-text/60">
              Thank you, {visitorName}. Your suggestion has been queued for organizer review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="p-3 bg-bg rounded-xl border border-border text-xs text-text/70 space-y-1">
              <p className="font-semibold text-text">Visitor Attribution Policy</p>
              <p>
                Your entered name is strictly for attribution and records your contribution. All submissions are reviewed by the organizer before updating the collection.
              </p>
            </div>

            <div>
              <label
                htmlFor="visitor-name-input"
                className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1"
              >
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                id="visitor-name-input"
                type="text"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="e.g. Maya Chen, attendee"
                className="w-full px-3.5 py-2.5 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionType('add_to_moment');
                  setSelectedMediaId('');
                }}
                className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                  actionType === 'add_to_moment'
                    ? 'bg-accent/10 border-accent text-accent font-semibold'
                    : 'border-border text-text/70 hover:bg-bg'
                }`}
              >
                Add media to this moment
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionType('unlink_from_moment');
                  setSelectedMediaId('');
                }}
                className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                  actionType === 'unlink_from_moment'
                    ? 'bg-accent/10 border-accent text-accent font-semibold'
                    : 'border-border text-text/70 hover:bg-bg'
                }`}
              >
                Suggest removing wrong photo
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1.5">
                Select Photo or Video <span className="text-red-500">*</span>
              </label>
              {candidateMedia.length === 0 ? (
                <div className="p-4 bg-bg rounded-xl border border-border text-center text-xs text-text/60">
                  No eligible photos available for this action.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-bg/50 rounded-xl border border-border">
                  {candidateMedia.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMediaId(m.id)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        selectedMediaId === m.id
                          ? 'border-accent ring-2 ring-accent/30'
                          : 'border-transparent hover:opacity-80'
                      }`}
                    >
                      <img
                        src={m.thumbnailUrl}
                        alt={m.originalName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {selectedMediaId === m.id && (
                        <div className="absolute inset-0 bg-accent/20 flex items-center justify-center text-accent">
                          <Check className="w-5 h-5 bg-white rounded-full p-0.5 shadow" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="visitor-note-input"
                className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1"
              >
                Reason or Note (Optional)
              </label>
              <textarea
                id="visitor-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. I took this during the keynote Q&A from the balcony..."
                rows={2}
                className="w-full px-3 py-2 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-xs"
              />
            </div>

            {error && (
              <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-text/70 hover:bg-bg rounded-xl min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!visitorName.trim() || !selectedMediaId}
                className="px-5 py-2 text-xs font-semibold bg-accent text-white rounded-xl hover:bg-accent-dark transition-colors disabled:opacity-50 min-h-[44px]"
              >
                Submit Suggestion
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
