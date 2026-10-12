import React, { useState, useRef } from 'react';
import { Users, X, Check, AlertCircle, Upload, Image as ImageIcon } from 'lucide-react';
import { Moment, MediaItem, VisitorSuggestion } from '../../types';
import { saveSuggestion } from '../../lib/db';
import { uploadContributorMedia } from '../../lib/collectionApi';

interface VisitorSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMoment: Moment;
  availableMedia: MediaItem[];
  currentMemberships: string[];
  collectionSlug?: string;
  onSuggestionSubmitted: () => void;
}

export const VisitorSuggestionModal: React.FC<VisitorSuggestionModalProps> = ({
  isOpen,
  onClose,
  targetMoment,
  availableMedia,
  currentMemberships,
  collectionSlug = 'elevate',
  onSuggestionSubmitted,
}) => {
  const [modalMode, setModalMode] = useState<'upload_media' | 'suggest_correction'>('upload_media');
  const [visitorName, setVisitorName] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [actionType, setActionType] = useState<'add_to_moment' | 'unlink_from_moment'>('add_to_moment');
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const candidateMedia =
    actionType === 'add_to_moment'
      ? availableMedia.filter((m) => !currentMemberships.includes(m.id))
      : availableMedia.filter((m) => currentMemberships.includes(m.id));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // File validation: 25MB for images, 100MB for video
      const isVideo = file.type.startsWith('video/');
      const maxSize = isVideo ? 100 * 1024 * 1024 : 25 * 1024 * 1024;

      if (file.size > maxSize) {
        setError(`File exceeds maximum size limit (${isVideo ? '100MB' : '25MB'}).`);
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName.trim()) {
      setError('Please provide your name for attribution.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (modalMode === 'upload_media') {
        if (!selectedFile) {
          setError('Please select a photo or video to contribute.');
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('contributorName', visitorName.trim());
        formData.append('mediaFile', selectedFile);
        formData.append('targetMomentId', targetMoment.id);
        if (note.trim()) {
          formData.append('notes', note.trim());
        }

        const res = await uploadContributorMedia(collectionSlug, formData);
        setSuccessMessage(res.message || 'Media contribution queued for organizer review.');
        setSuccess(true);
      } else {
        if (!selectedMediaId) {
          setError('Please select a photo or video to suggest.');
          setLoading(false);
          return;
        }

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
        setSuccessMessage('Your suggestion has been queued for organizer review.');
        setSuccess(true);
      }

      setTimeout(() => {
        onSuggestionSubmitted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit contribution.');
    } finally {
      setLoading(false);
    }
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
              <p className="text-xs text-text/60">Contribute to &ldquo;{targetMoment.label}&rdquo;</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-text/60 hover:text-text hover:bg-bg rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex gap-2 mt-3 p-1 bg-bg rounded-xl border border-border">
          <button
            type="button"
            onClick={() => {
              setModalMode('upload_media');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              modalMode === 'upload_media'
                ? 'bg-surface text-accent font-semibold shadow-sm'
                : 'text-text/70 hover:text-text'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Submit Photo / Video</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setModalMode('suggest_correction');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              modalMode === 'suggest_correction'
                ? 'bg-surface text-accent font-semibold shadow-sm'
                : 'text-text/70 hover:text-text'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Suggest Adjustment</span>
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-text">Submission Received!</h3>
            <p className="text-xs text-text/60">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="p-3 bg-bg rounded-xl border border-border text-xs text-text/70 space-y-1">
              <p className="font-semibold text-text">Attribution & Moderation Policy</p>
              <p>
                Your entered name is strictly for attribution and records your contribution. All submissions are stored in a pending queue and require organizer approval before publishing.
              </p>
            </div>

            <div>
              <label
                htmlFor="visitor-name-input"
                className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1"
              >
                Your Name / Attribution <span className="text-red-500">*</span>
              </label>
              <input
                id="visitor-name-input"
                type="text"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="e.g. Maya Chen (Attendee)"
                className="w-full px-3.5 py-2.5 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
            </div>

            {modalMode === 'upload_media' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1.5">
                  Select File (Image up to 25MB, Video up to 100MB) <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-border hover:border-accent rounded-xl text-center bg-bg/50 hover:bg-bg transition-colors flex flex-col items-center justify-center gap-1.5"
                >
                  <Upload className="w-5 h-5 text-accent" />
                  <span className="text-xs font-medium text-text">
                    {selectedFile ? selectedFile.name : 'Choose a photo or video file from your device'}
                  </span>
                  {selectedFile && (
                    <span className="text-[11px] font-mono text-text/50">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type}
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <>
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
                    Add existing photo
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
                    Suggest removing photo
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1.5">
                    Select Media from Collection <span className="text-red-500">*</span>
                  </label>
                  {candidateMedia.length === 0 ? (
                    <div className="p-4 bg-bg rounded-xl border border-border text-center text-xs text-text/60">
                      No eligible photos available for this action.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1 bg-bg/50 rounded-xl border border-border">
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
              </>
            )}

            <div>
              <label
                htmlFor="visitor-note-input"
                className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1"
              >
                Notes or Context (Optional)
              </label>
              <textarea
                id="visitor-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Captured during the morning keynote session..."
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
                disabled={loading || !visitorName.trim() || (modalMode === 'upload_media' ? !selectedFile : !selectedMediaId)}
                className="px-5 py-2 text-xs font-semibold bg-accent text-white rounded-xl hover:bg-accent-dark transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {loading ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
