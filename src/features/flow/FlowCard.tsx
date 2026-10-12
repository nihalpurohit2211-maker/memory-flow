import React, { useRef, useState, useEffect } from 'react';
import { MediaItem } from '../../types';
import { Play, Camera, RotateCcw } from 'lucide-react';

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

// Upgrade Google Drive thumbnail to crisp s1000 for high-resolution displays
function getHighResThumbnail(url?: string): string {
  if (!url) return '';
  if (url.includes('googleusercontent.com') && url.includes('=s')) {
    return url.replace(/=s\d+/, '=s1000');
  }
  return url;
}

export const FlowCard: React.FC<FlowCardProps> = ({
  media,
  onOpen,
  layoutVariant = 'standard',
}) => {
  const isVideo = media.mimeType.startsWith('video/') || media.duration !== null;
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Progressive in-card image resolution: crisp high-resolution thumbnail by default
  const highResThumb = getHighResThumbnail(media.thumbnailUrl);
  const initialSource = highResThumb || media.thumbnailUrl || media.lowResUrl || '';
  const [currentSrc, setCurrentSrc] = useState<string>(initialSource);
  const [isUpgraded, setIsUpgraded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [triedFallback, setTriedFallback] = useState<boolean>(false);

  // Reset image if media changes
  useEffect(() => {
    const updatedSource = getHighResThumbnail(media.thumbnailUrl) || media.thumbnailUrl || media.lowResUrl || '';
    setCurrentSrc(updatedSource);
    setIsUpgraded(false);
    setLoadError(false);
    setTriedFallback(false);
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
    if (isUpgraded || loadError) return;
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);

    dwellTimerRef.current = setTimeout(() => {
      const upgradeUrl = media.thumbnailUrl || media.driveFullUrl;
      if (upgradeUrl && upgradeUrl !== currentSrc) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.onload = () => {
          setCurrentSrc(upgradeUrl);
          setIsUpgraded(true);
        };
        img.src = upgradeUrl;
      }
    }, 1000);
  };

  const handlePointerLeave = () => {
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

  const handleImageError = () => {
    // If external Google CDN failed (e.g. rate limit/429), fallback to local backend thumbnail proxy
    if (!triedFallback && media.id) {
      setTriedFallback(true);
      setCurrentSrc(`/api/collections/elevate/media/${encodeURIComponent(media.id)}/thumbnail`);
    } else {
      setLoadError(true);
    }
  };

  // Derive aspect ratio from actual media dimensions if available, else layoutVariant
  let aspectClass = 'aspect-[4/3]';
  let spanClass = 'col-span-1';

  if (media.width && media.height) {
    const ratio = media.width / media.height;
    if (ratio < 0.85) {
      aspectClass = 'aspect-[3/4]'; // portrait
    } else if (ratio > 1.6) {
      aspectClass = 'aspect-[16/9]'; // widescreen / panoramic
    } else {
      aspectClass = 'aspect-[4/3]'; // standard photo
    }
  } else if (layoutVariant === 'hero') {
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
      className={`group relative w-full ${spanClass} self-start text-left rounded-xl overflow-hidden bg-surface border border-theme-border shadow-subtle hover:shadow-card hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 flex flex-col min-h-[44px] cursor-pointer`}
    >
      <div className={`relative w-full ${aspectClass} overflow-hidden bg-background`}>
        {loadError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-surface-muted text-charcoal-muted p-4 text-center">
            <Camera className="w-7 h-7 opacity-40 mb-1" />
            <span className="text-xs font-medium">Preview unavailable</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLoadError(false);
                setTriedFallback(false);
                setCurrentSrc(media.lowResUrl || media.thumbnailUrl);
              }}
              className="mt-2 text-[11px] text-accent hover:underline flex items-center gap-1 font-sans"
            >
              <RotateCcw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : (
          <img
            src={currentSrc}
            alt={media.caption || media.originalName}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          />
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

      {/* Caption & Metadata Footer (compact, no blank white spacing) */}
      {(media.caption || media.originalName) && (
        <div className="px-3 py-2 bg-surface border-t border-theme-border/50 shrink-0">
          <p className="text-xs sm:text-sm text-text font-medium line-clamp-2 leading-snug">
            {media.caption || media.originalName}
          </p>
        </div>
      )}
    </button>
  );
};
