import React, { useRef, useState, useEffect } from 'react';
import { MediaItem } from '../../types';
import { Play } from 'lucide-react';

interface FlowCardProps {
  media: MediaItem;
  onOpen: (mediaId: string) => void;
  layoutVariant?: 'hero' | 'tall' | 'wide' | 'standard';
}

// Global tracking to prevent immediate reopening after closing until a new deliberate hover/focus
let recentlyClosedMediaId: string | null = null;
let recentlyClosedTimestamp: number = 0;

export function recordViewerClosed(mediaId: string): void {
  recentlyClosedMediaId = mediaId;
  recentlyClosedTimestamp = Date.now();
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatTimestamp(isoString: string | null, source: MediaItem['captureTimeSource']): string {
  if (!isoString || source === 'unknown') {
    return 'Date unknown';
  }
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Date unknown';
  }
}

export const FlowCard: React.FC<FlowCardProps> = ({
  media,
  onOpen,
  layoutVariant = 'standard',
}) => {
  const isVideo = media.mimeType.startsWith('video/') || media.duration !== null;
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSuppressedRef = useRef<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const isTouchDevice = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  };

  const handlePointerEnter = () => {
    if (isTouchDevice()) return; // Mobile: open strictly by tap

    // Check if this card was just closed to prevent immediate loop reopening
    const justClosed =
      recentlyClosedMediaId === media.id && Date.now() - recentlyClosedTimestamp < 1500;
    if (justClosed || isSuppressedRef.current) {
      isSuppressedRef.current = true;
      return;
    }

    setIsHovering(true);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

    // 1.5 seconds deliberate hover trigger
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(false);
      onOpen(media.id);
    }, 1500);
  };

  const handlePointerLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovering(false);
    isSuppressedRef.current = false; // Reset suppression once pointer leaves
  };

  const handleFocus = () => {
    if (isTouchDevice()) return;
    const justClosed =
      recentlyClosedMediaId === media.id && Date.now() - recentlyClosedTimestamp < 1500;
    if (justClosed || isSuppressedRef.current) return;

    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      onOpen(media.id);
    }, 1500);
  };

  const handleBlur = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    isSuppressedRef.current = false;
  };

  const handleClick = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovering(false);
    isSuppressedRef.current = false;
    onOpen(media.id);
  };

  // Varied editorial aspect ratios and card spans
  let aspectClass = 'aspect-[4/3]';
  let spanClass = 'col-span-1';

  if (layoutVariant === 'hero') {
    aspectClass = 'aspect-[16/9] sm:aspect-[21/9]';
    spanClass = 'col-span-1 sm:col-span-2 lg:col-span-3';
  } else if (layoutVariant === 'tall') {
    aspectClass = 'aspect-[3/4]';
  } else if (layoutVariant === 'wide') {
    aspectClass = 'aspect-[16/9]';
    spanClass = 'col-span-1 sm:col-span-2';
  }

  return (
    <button
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      id={`media-card-${media.id}`}
      aria-label={`View ${media.caption || media.originalName}${isVideo ? ', video' : ''}`}
      className={`group relative w-full ${spanClass} text-left rounded-xl overflow-hidden bg-surface border border-theme-border shadow-subtle hover:shadow-card hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 flex flex-col min-h-[44px]`}
    >
      <div className={`relative w-full ${aspectClass} overflow-hidden bg-background`}>
        <img
          src={media.thumbnailUrl}
          alt={media.caption || media.originalName}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
        />

        {/* 1.5s deliberate hover indicator bar */}
        {isHovering && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/20 overflow-hidden z-10">
            <div
              className="h-full bg-accent transition-all duration-[1500ms] ease-linear w-full animate-[progress_1.5s_linear]"
              style={{ animation: 'progress 1.5s linear forwards' }}
            />
          </div>
        )}

        {/* Video indicator badge */}
        {isVideo && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-medium shadow-subtle">
            <Play className="w-3.5 h-3.5 fill-white text-white" />
            {media.duration ? <span>{formatDuration(media.duration)}</span> : <span>Video</span>}
          </div>
        )}

        {/* Provenance / capture time badge */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-surface/90 backdrop-blur-sm text-text text-[11px] font-medium border border-theme-border/80">
          <span>{formatTimestamp(media.captureTime, media.captureTimeSource)}</span>
        </div>
      </div>

      {/* Caption & Metadata Footer */}
      {(media.caption || media.originalName) && (
        <div className="p-3 bg-surface border-t border-theme-border/50 flex-1 flex flex-col justify-between">
          <p className="text-xs sm:text-sm text-text font-medium line-clamp-2 leading-snug">
            {media.caption || media.originalName}
          </p>
        </div>
      )}
    </button>
  );
};
