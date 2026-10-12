import React, { useRef, useState, useEffect } from 'react';
import { MediaItem } from '../../types';
import { Play } from 'lucide-react';

interface FlowCardProps {
  media: MediaItem;
  onOpen: (mediaId: string) => void;
  layoutVariant?: 'hero' | 'tall' | 'wide' | 'standard';
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
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Progressive in-card image resolution state
  const initialSource = media.lowResUrl || media.thumbnailUrl;
  const [currentSrc, setCurrentSrc] = useState<string>(initialSource);
  const [isUpgraded, setIsUpgraded] = useState<boolean>(false);

  // Reset image if media changes
  useEffect(() => {
    setCurrentSrc(media.lowResUrl || media.thumbnailUrl);
    setIsUpgraded(false);
  }, [media.id, media.thumbnailUrl, media.lowResUrl]);

  // Clean up dwell timer on unmount
  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
      }
    };
  }, []);

  // Hover or focus upgrades image quality inside its existing card after ~1 second
  const handlePointerEnter = () => {
    if (isUpgraded) return;
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);

    // After 1 second of dwell inside card, upgrade to higher resolution thumbnail
    dwellTimerRef.current = setTimeout(() => {
      const upgradeUrl = media.thumbnailUrl || media.driveFullUrl;
      if (upgradeUrl && upgradeUrl !== currentSrc) {
        const img = new Image();
        img.onload = () => {
          setCurrentSrc(upgradeUrl);
          setIsUpgraded(true);
        };
        img.src = upgradeUrl;
      }
    }, 1000);
  };

  const handlePointerLeave = () => {
    // Leaving cancels pending work
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };

  const handleFocus = () => {
    handlePointerEnter();
  };

  const handleBlur = () => {
    handlePointerLeave();
  };

  // Click/tap explicitly opens the viewer
  const handleClick = () => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
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
      className={`group relative w-full ${spanClass} text-left rounded-xl overflow-hidden bg-surface border border-theme-border shadow-subtle hover:shadow-card hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 flex flex-col min-h-[44px] cursor-pointer`}
    >
      <div className={`relative w-full ${aspectClass} overflow-hidden bg-background`}>
        <img
          src={currentSrc}
          alt={media.caption || media.originalName}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
        />

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
