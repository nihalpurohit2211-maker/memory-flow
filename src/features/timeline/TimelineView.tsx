import React, { useState, useMemo } from 'react';
import { MediaItem, Moment, Membership } from '../../types';
import { FlowCard } from '../flow/FlowCard';
import { Calendar, Clock, AlertCircle, Plus, Check, Edit3, ArrowRight, Sparkles } from 'lucide-react';

interface TimelineViewProps {
  media: MediaItem[];
  moments: Moment[];
  memberships: Membership[];
  onOpenMedia: (mediaId: string) => void;
  onSelectMoment: (momentId: string) => void;
  onUpdateMediaCaptureTime: (mediaId: string, captureTime: string) => void;
  onCreateMomentFromCluster: (label: string, mediaIds: string[]) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  media,
  moments,
  memberships,
  onOpenMedia,
  onSelectMoment,
  onUpdateMediaCaptureTime,
  onCreateMomentFromCluster,
}) => {
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [manualDateInput, setManualDateInput] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [showAllUnknown, setShowAllUnknown] = useState(false);

  // Map moment by media ID
  const momentByMediaId = useMemo(() => {
    const map = new Map<string, Moment>();
    for (const mem of memberships) {
      const m = moments.find((mom) => mom.id === mem.momentId);
      if (m && !map.has(mem.mediaId)) {
        map.set(mem.mediaId, m);
      }
    }
    return map;
  }, [memberships, moments]);

  // Separate dated media from "Date unknown"
  const { datedGroups, unknownDateItems } = useMemo(() => {
    const dated: MediaItem[] = [];
    const unknown: MediaItem[] = [];

    for (const item of media) {
      if (item.captureTime && item.captureTimeSource !== 'unknown') {
        dated.push(item);
      } else {
        unknown.push(item);
      }
    }

    // Sort dated chronologically
    dated.sort((a, b) => new Date(a.captureTime!).getTime() - new Date(b.captureTime!).getTime());

    // Group by Calendar Day
    const groups = new Map<string, MediaItem[]>();
    for (const item of dated) {
      const d = new Date(item.captureTime!);
      const dayKey = d.toLocaleDateString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const list = groups.get(dayKey) || [];
      list.push(item);
      groups.set(dayKey, list);
    }

    return {
      datedGroups: Array.from(groups.entries()),
      unknownDateItems: unknown,
    };
  }, [media]);

  // Conservative suggestions: find clusters of dated items captured within 45 mins where not all items have an assigned moment
  const suggestedClusters = useMemo(() => {
    const dated = media
      .filter((m) => m.captureTime && m.captureTimeSource !== 'unknown')
      .sort((a, b) => new Date(a.captureTime!).getTime() - new Date(b.captureTime!).getTime());

    const clusters: { name: string; items: MediaItem[]; timeRange: string }[] = [];
    let currentCluster: MediaItem[] = [];

    for (let i = 0; i < dated.length; i++) {
      const item = dated[i];
      if (currentCluster.length === 0) {
        currentCluster.push(item);
      } else {
        const prev = currentCluster[currentCluster.length - 1];
        const diffMinutes =
          (new Date(item.captureTime!).getTime() - new Date(prev.captureTime!).getTime()) / (1000 * 60);

        if (diffMinutes <= 45) {
          currentCluster.push(item);
        } else {
          if (currentCluster.length >= 2) {
            // Suggest only if not all items in cluster are already assigned to a moment
            const allOrganized = currentCluster.every((m) => momentByMediaId.has(m.id));
            if (!allOrganized) {
              const startT = new Date(currentCluster[0].captureTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const endT = new Date(currentCluster[currentCluster.length - 1].captureTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              clusters.push({
                name: `Cluster around ${startT}`,
                items: [...currentCluster],
                timeRange: `${startT} – ${endT}`,
              });
            }
          }
          currentCluster = [item];
        }
      }
    }

    if (currentCluster.length >= 2) {
      const allOrganized = currentCluster.every((m) => momentByMediaId.has(m.id));
      if (!allOrganized) {
        const startT = new Date(currentCluster[0].captureTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endT = new Date(currentCluster[currentCluster.length - 1].captureTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        clusters.push({
          name: `Cluster around ${startT}`,
          items: currentCluster,
          timeRange: `${startT} – ${endT}`,
        });
      }
    }

    return clusters;
  }, [media, momentByMediaId]);

  const handleSaveManualDate = (mediaId: string) => {
    if (manualDateInput) {
      try {
        const parsed = new Date(manualDateInput);
        if (isNaN(parsed.getTime())) {
          setDateError('Please enter a valid date and time.');
          return;
        }
        onUpdateMediaCaptureTime(mediaId, parsed.toISOString());
        setEditingMediaId(null);
        setManualDateInput('');
        setDateError(null);
      } catch {
        setDateError('Please enter a valid date and time.');
      }
    }
  };

  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto">
      {/* Intro & Provenance Clarification Bar */}
      <div className="bg-surface border border-border rounded-xl p-5 sm:p-6 shadow-subtle space-y-2">
        <div className="flex items-center gap-2 text-accent font-semibold text-sm sm:text-base">
          <Calendar className="w-5 h-5" />
          <h2>Event Chronology Timeline</h2>
        </div>
        <p className="text-xs sm:text-sm text-charcoal-muted leading-relaxed">
          Chronology is built strictly from authentic capture timestamps. File modification times and upload times are never used to fake capture chronology. Photos without camera timestamps are honestly categorized under <strong>Date unknown</strong>.
        </p>
        <div className="flex flex-wrap gap-2 pt-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-light text-accent font-medium">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            EXIF Camera Timestamp ({datedGroups.reduce((acc, [, list]) => acc + list.length, 0)})
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-muted text-charcoal-muted border border-border">
            <AlertCircle className="w-3.5 h-3.5" />
            Date Unknown ({unknownDateItems.length})
          </span>
        </div>
      </div>

      {/* Suggested Proximity Clusters if any */}
      {suggestedClusters.length > 0 && (
        <section className="space-y-3 bg-surface-muted border border-border rounded-xl p-5 shadow-subtle">
          <div className="flex items-center gap-2 text-accent font-semibold text-sm">
            <Sparkles className="w-4 h-4" />
            <h3>Honest Grouping Suggestions (Capture-Time Proximity)</h3>
          </div>
          <p className="text-xs text-charcoal-muted">
            The following media were captured within 45 minutes of each other but are not grouped together. These are algorithmic suggestions based on time proximity, not confirmed events.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {suggestedClusters.map((cluster, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-surface border border-border rounded-lg space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-charcoal">{cluster.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-accent-light text-accent font-medium">
                      {cluster.timeRange}
                    </span>
                  </div>
                  <p className="text-xs text-charcoal-muted mt-1">
                    {cluster.items.length} photos captured close in time.
                  </p>
                </div>
                <button
                  onClick={() =>
                    onCreateMomentFromCluster(
                      `Activity (${cluster.timeRange})`,
                      cluster.items.map((m) => m.id)
                    )
                  }
                  className="w-full mt-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-surface text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 min-h-[36px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Moment from Suggestion</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dated Timeline Days */}
      {datedGroups.map(([dayTitle, items]) => (
        <section key={dayTitle} className="space-y-4">
          <div className="sticky top-16 z-10 bg-background/95 backdrop-blur-sm py-2 border-b border-border flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" />
              <h3 className="text-base sm:text-lg font-semibold text-charcoal">{dayTitle}</h3>
            </div>
            <span className="text-xs text-charcoal-muted font-medium">
              {items.length} memories
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {items.map((item) => {
              const assignedMoment = momentByMediaId.get(item.id);

              return (
                <div key={item.id} className="space-y-2">
                  <FlowCard media={item} onOpen={onOpenMedia} layoutVariant="standard" />

                  {/* Timeline provenance details */}
                  <div className="px-1 text-xs text-charcoal-muted flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-mono">
                      <Clock className="w-3 h-3 text-accent" />
                      {new Date(item.captureTime!).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      <span className="text-[10px] text-charcoal-light">
                        ({item.captureTimeSource === 'user' ? 'User-supplied' : 'EXIF'})
                      </span>
                    </span>

                    {assignedMoment && (
                      <button
                        onClick={() => onSelectMoment(assignedMoment.id)}
                        className="text-[11px] text-accent hover:underline flex items-center gap-0.5 truncate max-w-[140px]"
                      >
                        <span className="truncate">{assignedMoment.label}</span>
                        <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Date Unknown Section */}
      {unknownDateItems.length > 0 && (
        <section className="space-y-4 pt-6 border-t-2 border-dashed border-border">
          <div className="bg-surface-muted/50 p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-charcoal font-semibold text-base">
                <AlertCircle className="w-5 h-5 text-accent" />
                <h3>Date Unknown ({unknownDateItems.length})</h3>
              </div>
              <p className="text-xs text-charcoal-muted mt-0.5">
                These media items do not contain verified capture timestamps in their file headers. You may assign an approximate date manually.
              </p>
            </div>
            {unknownDateItems.length > 12 && (
              <button
                onClick={() => setShowAllUnknown((prev) => !prev)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-medium text-charcoal hover:bg-surface-muted transition-colors shrink-0"
              >
                {showAllUnknown ? 'Show first 12' : `Show all ${unknownDateItems.length}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {(showAllUnknown ? unknownDateItems : unknownDateItems.slice(0, 12)).map((item) => (
              <div key={item.id} className="space-y-2 bg-surface p-2 rounded-xl border border-border">
                <FlowCard media={item} onOpen={onOpenMedia} layoutVariant="standard" />

                {/* Edit capture date action */}
                <div className="p-2 pt-0 space-y-2">
                  {editingMediaId === item.id ? (
                    <div className="space-y-2 bg-background p-2.5 rounded-lg border border-border">
                      <label className="block text-[11px] font-medium text-charcoal">
                        Enter Approximate Date & Time:
                      </label>
                      <input
                        type="datetime-local"
                        value={manualDateInput}
                        onChange={(e) => {
                          setManualDateInput(e.target.value);
                          if (dateError) setDateError(null);
                        }}
                        className="w-full px-2 py-1 text-xs border border-border rounded bg-surface text-charcoal"
                      />
                      {dateError && (
                        <p className="text-[11px] text-red-600 font-medium">{dateError}</p>
                      )}
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMediaId(null);
                            setDateError(null);
                          }}
                          className="px-2 py-1 text-[11px] text-charcoal-muted hover:bg-surface rounded"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveManualDate(item.id)}
                          className="px-2.5 py-1 text-[11px] bg-accent text-surface rounded font-medium flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save Date</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-charcoal-muted">
                      <span className="italic text-[11px]">No EXIF timestamp</span>
                      <button
                        onClick={() => {
                          setEditingMediaId(item.id);
                          setManualDateInput(new Date().toISOString().slice(0, 16));
                          setDateError(null);
                        }}
                        className="text-accent hover:underline flex items-center gap-1 text-[11px] font-medium min-h-[32px]"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Supply Date</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!showAllUnknown && unknownDateItems.length > 12 && (
            <div className="text-center pt-2">
              <button
                onClick={() => setShowAllUnknown(true)}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-xs font-medium text-accent hover:bg-surface-muted transition-colors shadow-subtle"
              >
                Show {unknownDateItems.length - 12} more un-dated memories
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
