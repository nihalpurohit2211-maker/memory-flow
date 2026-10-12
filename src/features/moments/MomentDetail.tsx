import { useState, FC, FormEvent } from 'react';
import { Moment, MediaItem, Membership, Connection, UserRole } from '../../types';
import { ArrowLeft, Plus, Edit2, Check, X, FolderUp, ArrowRight, Unlink, User } from 'lucide-react';
import { FlowCard } from '../flow/FlowCard';

interface MomentDetailProps {
  moment: Moment;
  media: MediaItem[];
  allMoments: Moment[];
  memberships: Membership[];
  connections: Connection[];
  currentRole: UserRole;
  onBack: () => void;
  onOpenMedia: (mediaId: string) => void;
  onUpdateMoment: (momentId: string, label: string, description: string | null) => void;
  onRemoveMembership: (mediaId: string, momentId: string) => void;
  onAddFilesToMoment: (momentId: string) => void;
  onSelectMoment: (momentId: string) => void;
  onAddConnection: (sourceId: string, targetId: string, provenance: 'organizer-confirmed' | 'suggested', evidence: string) => void;
  onOpenVisitorSuggestion: (moment: Moment) => void;
  onConfirmProvisionalMoment?: (momentId: string) => void;
}

export const MomentDetail: FC<MomentDetailProps> = ({
  moment,
  media,
  allMoments,
  memberships,
  connections,
  currentRole,
  onBack,
  onOpenMedia,
  onUpdateMoment,
  onRemoveMembership,
  onAddFilesToMoment,
  onSelectMoment,
  onAddConnection,
  onOpenVisitorSuggestion,
  onConfirmProvisionalMoment,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(moment.label);
  const [editDesc, setEditDesc] = useState(moment.description || '');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedTargetMoment, setSelectedTargetMoment] = useState('');
  const [connectEvidence, setConnectEvidence] = useState('');
  const [displayCount, setDisplayCount] = useState(24);

  // Media belonging to this moment
  const momentMedia = media.filter((m) =>
    memberships.some((mem) => mem.momentId === moment.id && mem.mediaId === m.id)
  );

  // Connected moments
  const relatedConnections = connections.filter(
    (c) => c.sourceMomentId === moment.id || c.targetMomentId === moment.id
  );

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (editLabel.trim()) {
      onUpdateMoment(moment.id, editLabel.trim(), editDesc.trim() || null);
      setIsEditing(false);
    }
  };

  const handleCreateConnection = (e: FormEvent) => {
    e.preventDefault();
    if (selectedTargetMoment && selectedTargetMoment !== moment.id) {
      onAddConnection(
        moment.id,
        selectedTargetMoment,
        'organizer-confirmed',
        connectEvidence.trim() || 'Manual organizer link'
      );
      setShowConnectModal(false);
      setSelectedTargetMoment('');
      setConnectEvidence('');
    }
  };

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* Back to Flow Navigation */}
      <div>
        <button
          onClick={onBack}
          aria-label="Back to Flow"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-charcoal text-xs sm:text-sm font-medium transition-colors shadow-subtle min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4 text-accent" />
          <span>Back to Flow</span>
        </button>
      </div>

      {/* Moment Header Card */}
      <div className="bg-surface border border-border rounded-xl p-5 sm:p-7 shadow-subtle space-y-4">
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-3 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">Moment Label</label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="w-full px-3 py-2 text-base font-semibold border border-accent rounded bg-surface text-charcoal focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-xs sm:text-sm border border-border rounded bg-surface text-charcoal focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Describe this activity or gathering..."
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-1.5 bg-accent text-surface text-xs font-medium rounded hover:bg-accent-hover flex items-center gap-1.5 min-h-[38px]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-charcoal-muted text-xs hover:bg-surface-muted rounded min-h-[38px]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold tracking-wider text-accent uppercase">
                  Moment Activity
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  moment.isProvisional
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-accent-light text-accent'
                }`}>
                  {moment.isProvisional
                    ? 'Provisional AI Grouping'
                    : moment.labelSource === 'organizer'
                    ? 'Organizer-confirmed'
                    : moment.labelSource === 'suggested_time'
                    ? 'Suggested Proximity'
                    : moment.labelSource === 'ai_clustering'
                    ? 'AI Multi-Camera Match'
                    : 'Imported Context'}
                </span>
                {moment.isProvisional && currentRole === 'admin' && onConfirmProvisionalMoment && (
                  <button
                    onClick={() => onConfirmProvisionalMoment(moment.id)}
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-full transition-colors border border-emerald-300"
                    title="Confirm this provisional moment as organizer-confirmed"
                  >
                    <Check className="w-3 h-3" />
                    <span>Confirm Group</span>
                  </button>
                )}
              </div>
              <h1 className="text-xl sm:text-3xl font-semibold text-charcoal tracking-tight">
                {moment.label}
              </h1>
              {moment.description ? (
                <p className="text-sm sm:text-base text-charcoal-muted leading-relaxed">
                  {moment.description}
                </p>
              ) : (
                <p className="text-xs text-charcoal-muted italic">No description provided yet.</p>
              )}
              {moment.isProvisional && moment.provisionalReasons && (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-xs text-amber-900 mt-2">
                  <span className="font-semibold">AI Provisional Basis:</span>{' '}
                  {moment.provisionalReasons.join(' · ')}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-start">
              {currentRole === 'admin' ? (
                <button
                  onClick={() => {
                    setEditLabel(moment.label);
                    setEditDesc(moment.description || '');
                    setIsEditing(true);
                  }}
                  aria-label="Edit moment"
                  className="p-2 border border-border bg-surface hover:bg-surface-muted text-charcoal rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[44px]"
                >
                  <Edit2 className="w-4 h-4 text-accent" />
                  <span className="hidden sm:inline">Rename</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenVisitorSuggestion(moment)}
                  aria-label="Suggest rename"
                  className="p-2 border border-border bg-surface hover:bg-surface-muted text-charcoal-muted rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[44px]"
                >
                  <User className="w-4 h-4 text-accent" />
                  <span className="hidden sm:inline">Suggest Edit</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Were You There? Contribution Prompt */}
      <div className="bg-surface-muted border border-border rounded-xl p-5 sm:p-6 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-accent font-semibold text-sm">
            <FolderUp className="w-4 h-4" />
            <span>Were You There? Have more photos or corrections?</span>
          </div>
          <p className="text-xs sm:text-sm text-charcoal-muted max-w-xl">
            {currentRole === 'admin'
              ? 'As Admin, you can add local files directly or connect related moments.'
              : 'Visitors may suggest corrections or associate existing photos with this moment. Submissions are queued for organizer review.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentRole === 'admin' ? (
            <>
              <button
                onClick={() => onAddFilesToMoment(moment.id)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-surface text-xs sm:text-sm font-medium rounded-lg shadow-subtle transition-colors flex items-center gap-2 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Photos / Videos</span>
              </button>
              <button
                onClick={() => setShowConnectModal(true)}
                className="px-3.5 py-2 bg-surface hover:bg-surface-muted border border-border text-charcoal text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 min-h-[44px]"
              >
                <Plus className="w-4 h-4 text-accent" />
                <span>Link Related Moment</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => onOpenVisitorSuggestion(moment)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-surface text-xs sm:text-sm font-medium rounded-lg shadow-subtle transition-colors flex items-center gap-2 min-h-[44px]"
            >
              <User className="w-4 h-4" />
              <span>Suggest Photo / Correction</span>
            </button>
          )}
        </div>
      </div>

      {/* Media in this Moment */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/70">
          <h2 className="text-lg font-semibold text-charcoal">
            Photos & Videos ({momentMedia.length})
          </h2>
          <span className="text-xs text-charcoal-muted">
            Click any item to view in full resolution
          </span>
        </div>

        {momentMedia.length === 0 ? (
          <div className="py-12 text-center bg-surface border border-dashed border-border rounded-xl">
            <p className="text-sm text-charcoal-muted mb-3">No media currently in this moment.</p>
            <button
              onClick={() => onAddFilesToMoment(moment.id)}
              className="px-4 py-2 bg-accent text-surface text-xs font-medium rounded-lg"
            >
              Add First Photo or Video
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {momentMedia.slice(0, displayCount).map((item) => (
                <div key={item.id} className="relative group">
                  <FlowCard media={item} onOpen={onOpenMedia} layoutVariant="standard" />
                  {/* Organization action: Wrong group? */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMembership(item.id, moment.id);
                    }}
                    title="Remove from this moment (Wrong group?)"
                    aria-label={`Remove ${item.originalName} from this moment`}
                    className="absolute top-2 left-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 bg-surface/95 text-charcoal-muted hover:text-red-600 rounded-md border border-border shadow-subtle transition-opacity text-[11px] flex items-center gap-1 z-10"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Wrong group?</span>
                  </button>
                </div>
              ))}
            </div>

            {momentMedia.length > displayCount && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => setDisplayCount((prev) => prev + 24)}
                  className="px-4 py-2 bg-surface hover:bg-surface-muted border border-border text-charcoal text-xs font-medium rounded-lg shadow-subtle transition-colors min-h-[40px]"
                >
                  Show 24 more ({momentMedia.length - displayCount} remaining)
                </button>
                <button
                  onClick={() => setDisplayCount(momentMedia.length)}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-surface text-xs font-medium rounded-lg shadow-subtle transition-colors min-h-[40px]"
                >
                  Show all ({momentMedia.length})
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Connected Moments Section */}
      <section className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-charcoal">
          Related Moments & Activity Flow
        </h2>

        {relatedConnections.length === 0 ? (
          <p className="text-xs text-charcoal-muted">
            No related moments linked yet. You can connect this to other moments above.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedConnections.map((conn) => {
              const targetId =
                conn.sourceMomentId === moment.id
                  ? conn.targetMomentId
                  : conn.sourceMomentId;
              const target = allMoments.find((m) => m.id === targetId);
              if (!target) return null;

              return (
                <button
                  key={conn.id}
                  onClick={() => onSelectMoment(target.id)}
                  className="p-3 bg-surface hover:bg-surface-muted border border-border rounded-xl text-left flex items-start justify-between group transition-colors shadow-subtle"
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <span className="text-[10px] uppercase font-semibold text-accent">
                      {conn.provenance === 'organizer-confirmed' ? 'Confirmed Link' : 'Suggested'}
                    </span>
                    <h3 className="text-sm font-semibold text-charcoal group-hover:text-accent truncate">
                      {target.label}
                    </h3>
                    <p className="text-xs text-charcoal-muted line-clamp-1">
                      {conn.evidence || 'Connected event sequence'}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-charcoal-light group-hover:text-accent flex-shrink-0 mt-1" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Link Related Moment Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl max-w-md w-full p-6 shadow-modal space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-base font-semibold text-charcoal">Link Related Moment</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="p-1 text-charcoal-muted hover:text-charcoal rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateConnection} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">
                  Connect “{moment.label}” to:
                </label>
                <select
                  value={selectedTargetMoment}
                  onChange={(e) => setSelectedTargetMoment(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-surface text-charcoal text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                >
                  <option value="">Select a moment...</option>
                  {allMoments
                    .filter((m) => m.id !== moment.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">
                  Relationship Note / Evidence
                </label>
                <input
                  type="text"
                  value={connectEvidence}
                  onChange={(e) => setConnectEvidence(e.target.value)}
                  placeholder="e.g. Followed right after keynote, or shared activity"
                  className="w-full px-3 py-2 border border-border rounded bg-surface text-charcoal text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-3 py-2 text-xs text-charcoal-muted hover:bg-surface-muted rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent text-surface text-xs font-medium rounded hover:bg-accent-hover min-h-[40px]"
                >
                  Confirm Relationship
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
