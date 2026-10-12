import React, { useState, useMemo } from 'react';
import { MediaItem, Moment, Membership } from '../../types';
import { FlowCard } from './FlowCard';
import { ArrowRight, Compass } from 'lucide-react';

interface FlowViewProps {
  moments: Moment[];
  media: MediaItem[];
  memberships: Membership[];
  onOpenMedia: (mediaId: string) => void;
  onSelectMoment: (momentId: string) => void;
  onOpenImporter: () => void;
}

export const FlowView: React.FC<FlowViewProps> = ({
  moments,
  media,
  memberships,
  onOpenMedia,
  onSelectMoment,
  onOpenImporter,
}) => {
  // Incremental chunk limit for smooth rendering
  const [visibleCount, setVisibleCount] = useState(25);

  // Map media by moment
  const momentMediaMap = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    const mediaById = new Map<string, MediaItem>(media.map((m) => [m.id, m]));

    // Group memberships
    for (const mem of memberships) {
      const item = mediaById.get(mem.mediaId);
      if (item) {
        const list = map.get(mem.momentId) || [];
        list.push(item);
        map.set(mem.momentId, list);
      }
    }

    // Also include media that might not have a membership
    const unassignedMedia = media.filter(
      (m) => !memberships.some((mem) => mem.mediaId === m.id)
    );
    if (unassignedMedia.length > 0) {
      map.set('unassigned', unassignedMedia);
    }

    return map;
  }, [media, memberships]);

  if (media.length === 0) {
    return (
      <div className="py-20 px-4 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-accent-light text-accent flex items-center justify-center mx-auto mb-4">
          <Compass className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold text-charcoal mb-2">No memories in this collection yet</h2>
        <p className="text-sm text-charcoal-muted mb-6">
          Start your local collection by importing photos and videos directly from your computer. Everything stays private on your machine.
        </p>
        <button
          onClick={onOpenImporter}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-surface rounded-lg text-sm font-medium transition-colors shadow-subtle min-h-[44px]"
        >
          Import Local Photos & Videos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-16">
      {moments.map((moment, momentIdx) => {
        const momentItems = momentMediaMap.get(moment.id) || [];
        if (momentItems.length === 0) return null;

        return (
          <section
            key={moment.id}
            aria-labelledby={`moment-heading-${moment.id}`}
            className="space-y-4"
          >
            {/* Moment Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-border/70">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-semibold tracking-wider text-accent uppercase">
                  Moment {momentIdx + 1}
                </span>
                <h2
                  id={`moment-heading-${moment.id}`}
                  className="text-lg sm:text-xl font-semibold text-charcoal"
                >
                  {moment.label}
                </h2>
                {moment.labelSource && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-charcoal-muted border border-border">
                    {moment.labelSource === 'organizer'
                      ? 'Organizer'
                      : moment.labelSource === 'suggested_time'
                      ? 'Suggested Proximity'
                      : 'Imported'}
                  </span>
                )}
              </div>

              <button
                onClick={() => onSelectMoment(moment.id)}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-accent hover:text-accent-hover group py-1 min-h-[36px]"
              >
                <span>Explore moment ({momentItems.length})</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {moment.description && (
              <p className="text-xs sm:text-sm text-charcoal-muted max-w-2xl">
                {moment.description}
              </p>
            )}

            {/* Editorial Multi-Aspect Ratio Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {momentItems.slice(0, visibleCount).map((item, itemIdx) => {
                // Editorial layout pattern based on item index
                let variant: 'hero' | 'tall' | 'wide' | 'standard' = 'standard';
                if (itemIdx === 0 && momentItems.length >= 3) {
                  variant = 'wide';
                } else if (itemIdx % 5 === 2) {
                  variant = 'tall';
                }

                return (
                  <FlowCard
                    key={item.id}
                    media={item}
                    onOpen={onOpenMedia}
                    layoutVariant={variant}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Unassigned Media Section if any */}
      {momentMediaMap.has('unassigned') && (
        <section className="space-y-4 pt-4 border-t border-dashed border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-charcoal">
              Unassigned Photos & Videos
            </h2>
            <span className="text-xs text-charcoal-muted">
              {momentMediaMap.get('unassigned')!.length} items
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {momentMediaMap.get('unassigned')!.map((item) => (
              <FlowCard
                key={item.id}
                media={item}
                onOpen={onOpenMedia}
                layoutVariant="standard"
              />
            ))}
          </div>
        </section>
      )}

      {/* Incremental load trigger for large collections */}
      {media.length > visibleCount && (
        <div className="pt-6 text-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + 25)}
            className="px-6 py-2.5 rounded-lg border border-border bg-surface text-charcoal hover:bg-surface-muted text-sm font-medium transition-colors shadow-subtle min-h-[44px]"
          >
            Load More Memories ({media.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};
