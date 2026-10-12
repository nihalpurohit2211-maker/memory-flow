import { useEffect, useRef, useState, FC } from 'react';
import { MediaItem, Moment, Membership, Connection, MediaChip } from '../../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Calendar,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  MapPin,
  Tag,
  Clock,
  User,
} from 'lucide-react';
import { getLocalPlayableVideoBlobUrl } from '../../lib/videoHelper';

interface MediaViewerProps {
  mediaId: string;
  mediaList: MediaItem[];
  moments: Moment[];
  memberships: Membership[];
  connections: Connection[];
  collectionSlug?: string;
  onClose: () => void;
  onNavigateMedia: (nextMediaId: string) => void;
  onSelectMoment: (momentId: string) => void;
  onSelectPlace?: (placeName: string) => void;
  onSelectActivity?: (activityName: string) => void;
}

// Bounded LRU cache for preloaded image URLs (max 30 items)
const preloadedCache = new Set<string>();

export const MediaViewer: FC<MediaViewerProps> = ({
  mediaId,
  mediaList,
  moments,
  memberships,
  connections,
  collectionSlug = 'elevate',
  onClose,
  onNavigateMedia,
  onSelectMoment,
  onSelectPlace,
  onSelectActivity,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openingElementRef = useRef<HTMLElement | null>(null);

  // Single active-media request tracking to prevent stale decodes & rapid input race conditions
  const activeRequestIdRef = useRef<number>(0);

  // Single active-media state
  const [activeMediaUrl, setActiveMediaUrl] = useState<string>('');
  const [isLoadingMedia, setIsLoadingMedia] = useState<boolean>(true);
  const [mediaError, setMediaError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [syntheticVideoUrl, setSyntheticVideoUrl] = useState<string>('');

  // Zoom & Pan state
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });

  // Touch swipe tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Find active media item
  const currentIndex = mediaList.findIndex((m) => m.id === mediaId);
  const currentMedia = mediaList[currentIndex] || mediaList[0];

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < mediaList.length - 1;

  // Track initial focused element to restore on close and lock body scroll
  useEffect(() => {
    openingElementRef.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      openingElementRef.current?.focus();
    };
  }, []);

  // Single Active-Media Transition with Request ID Cancellation
  useEffect(() => {
    const requestId = ++activeRequestIdRef.current;

    // 1. Reset zoom and pan for each item
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });

    // 2. Clear previous image immediately; no crossfade or stacked images
    setActiveMediaUrl('');
    setIsLoadingMedia(true);
    setMediaError(false);
    setErrorMessage('');

    // 3. Immediately stop previous video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }

    if (!currentMedia) {
      setIsLoadingMedia(false);
      return;
    }

    const isVideo = currentMedia.mimeType.startsWith('video/') || currentMedia.duration !== null;

    if (isVideo) {
      if (currentMedia.blobUrl) {
        setSyntheticVideoUrl(currentMedia.blobUrl);
        setIsLoadingMedia(false);
      } else {
        getLocalPlayableVideoBlobUrl().then((url) => {
          if (activeRequestIdRef.current === requestId) {
            setSyntheticVideoUrl(url);
            setIsLoadingMedia(false);
          }
        });
      }
    } else {
      // Determine target display URL: prefer high-res uncropped original or thumbnail
      const targetUrl =
        currentMedia.blobUrl ||
        currentMedia.driveFullUrl ||
        currentMedia.thumbnailUrl ||
        currentMedia.lowResUrl;

      if (!targetUrl) {
        setIsLoadingMedia(false);
        setMediaError(true);
        setErrorMessage('No media source available.');
        return;
      }

      // If already cached, show immediately
      if (preloadedCache.has(targetUrl)) {
        setActiveMediaUrl(targetUrl);
        setIsLoadingMedia(false);
      } else {
        // Asynchronously decode image and verify it belongs to this requestId
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = async () => {
          if (activeRequestIdRef.current !== requestId) return; // Stale fetch ignored

          try {
            if ('decode' in img) {
              await img.decode();
            }
          } catch {
            // Browser decode warning; continue with rendered img
          }

          if (activeRequestIdRef.current === requestId) {
            if (preloadedCache.size > 30) {
              const firstKey = preloadedCache.values().next().value;
              if (firstKey) preloadedCache.delete(firstKey);
            }
            preloadedCache.add(targetUrl);
            setActiveMediaUrl(targetUrl);
            setIsLoadingMedia(false);
          }
        };

        img.onerror = () => {
          if (activeRequestIdRef.current !== requestId) return;
          // If high-res target failed, fallback cleanly to thumbnail
          if (targetUrl !== currentMedia.thumbnailUrl && currentMedia.thumbnailUrl) {
            setActiveMediaUrl(currentMedia.thumbnailUrl);
            setIsLoadingMedia(false);
          } else {
            setIsLoadingMedia(false);
            setMediaError(true);
            setErrorMessage('Unable to load image preview.');
          }
        };

        img.src = targetUrl;
      }

      // Bounded nearby prefetching (+/- 1 item)
      const nearbyUrls = [
        mediaList[currentIndex - 1]?.thumbnailUrl,
        mediaList[currentIndex + 1]?.thumbnailUrl,
      ].filter(Boolean) as string[];

      nearbyUrls.forEach((url) => {
        if (!preloadedCache.has(url)) {
          const preImg = new Image();
          preImg.src = url;
        }
      });
    }

    return () => {
      // Stop video on unmount or transition
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, [mediaId, currentMedia, currentIndex, mediaList]);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isVideoControl = target && (target.tagName === 'VIDEO' || target.closest('video'));

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev && !isVideoControl) {
        e.preventDefault();
        onNavigateMedia(mediaList[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && hasNext && !isVideoControl) {
        e.preventDefault();
        onNavigateMedia(mediaList[currentIndex + 1].id);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasPrev, hasNext, currentIndex, mediaList, zoomScale, onClose, onNavigateMedia]);

  // Zoom helpers
  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleToggleZoom = () => {
    if (zoomScale > 1) {
      handleResetZoom();
    } else {
      setZoomScale(2);
    }
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPanX: panOffset.x,
      initialPanY: panOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || zoomScale <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({
      x: dragStartRef.current.initialPanX + dx,
      y: dragStartRef.current.initialPanY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (currentMedia?.mimeType.startsWith('video/')) return;
    if (e.ctrlKey || Math.abs(e.deltaY) > 20) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };

  // Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoomScale <= 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || zoomScale > 1) return;
    const touchEnd = e.changedTouches[0];
    const dx = touchEnd.clientX - touchStartRef.current.x;
    const dy = touchEnd.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Minimum swipe threshold: 50px horizontal and more horizontal than vertical
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && hasNext) {
        onNavigateMedia(mediaList[currentIndex + 1].id);
      } else if (dx > 0 && hasPrev) {
        onNavigateMedia(mediaList[currentIndex - 1].id);
      }
    }
  };

  // Authentic Original Download Handler
  const handleDownloadOriginal = () => {
    if (!currentMedia) return;
    const downloadEndpoint = `/api/collections/${collectionSlug}/download/${currentMedia.id}`;
    const link = document.createElement('a');
    link.href = downloadEndpoint;
    link.download = currentMedia.originalName || `media_${currentMedia.id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentMedia) return null;
  const isVideo = currentMedia.mimeType.startsWith('video/') || currentMedia.duration !== null;

  // Metadata Chips Extraction
  const primaryMembership = memberships.find((m) => m.mediaId === currentMedia.id);
  const primaryMoment = primaryMembership
    ? moments.find((m) => m.id === primaryMembership.momentId)
    : null;

  const chips: MediaChip[] = [];
  if (primaryMoment) {
    chips.push({
      type: 'moment',
      id: primaryMoment.id,
      label: primaryMoment.label,
      isConfirmed: !primaryMoment.isProvisional,
    });

    // Add related moments connected via connections
    if (Array.isArray(connections)) {
      connections
        .filter((c) => c.sourceMomentId === primaryMoment.id || c.targetMomentId === primaryMoment.id)
        .forEach((c) => {
          const targetId = c.sourceMomentId === primaryMoment.id ? c.targetMomentId : c.sourceMomentId;
          const targetMom = moments.find((m) => m.id === targetId);
          if (targetMom && !chips.some((ch) => ch.id === targetMom.id)) {
            chips.push({
              type: 'moment',
              id: targetMom.id,
              label: `Related: ${targetMom.label}`,
              isConfirmed: c.provenance === 'organizer-confirmed',
            });
          }
        });
    }
  }

  if (Array.isArray(currentMedia.places)) {
    currentMedia.places.forEach((place) => {
      chips.push({
        type: 'place',
        id: place,
        label: place,
        isConfirmed: true,
      });
    });
  }

  if (Array.isArray(currentMedia.activities)) {
    currentMedia.activities.forEach((act) => {
      chips.push({
        type: 'activity',
        id: act,
        label: act,
        isConfirmed: false,
      });
    });
  }

  // Contributor / Uploader String
  const contributorDisplay =
    currentMedia.contributorVerified && currentMedia.contributorName
      ? currentMedia.contributorName
      : currentMedia.contributorName
      ? `${currentMedia.contributorName} (Unverified)`
      : 'Contributor unknown';

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Media viewer for ${currentMedia.caption || currentMedia.originalName}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white animate-fade-in select-none"
    >
      {/* Top Bar: Title & Controls */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-black/50 backdrop-blur-md border-b border-white/10 z-30">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <span className="text-xs font-mono text-white/60 shrink-0">
            {currentIndex + 1} / {mediaList.length}
          </span>
          <h2 className="text-xs sm:text-sm font-semibold truncate text-white">
            {currentMedia.caption || currentMedia.originalName}
          </h2>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Download Original Button */}
          <button
            onClick={handleDownloadOriginal}
            title="Download original file bytes"
            aria-label="Download original file"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors min-h-[36px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download original</span>
          </button>

          {!isVideo && (
            <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5 border border-white/10">
              <button
                onClick={handleZoomOut}
                disabled={zoomScale <= 1}
                aria-label="Zoom out (-)"
                className="p-1.5 hover:bg-white/20 rounded disabled:opacity-30 text-white min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                aria-label="Reset zoom (0)"
                className="px-2 py-1 text-xs font-mono hover:bg-white/20 rounded text-white min-h-[36px] flex items-center justify-center transition-colors"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                disabled={zoomScale >= 4}
                aria-label="Zoom in (+)"
                className="p-1.5 hover:bg-white/20 rounded disabled:opacity-30 text-white min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {zoomScale > 1 && (
                <button
                  onClick={handleResetZoom}
                  aria-label="Fit to screen"
                  className="p-1.5 hover:bg-white/20 rounded text-white/80 hover:text-white min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            aria-label="Close viewer (Escape)"
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Main Single Active-Media Canvas Area */}
      <div
        className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Previous Button */}
        {hasPrev && (
          <button
            onClick={() => onNavigateMedia(mediaList[currentIndex - 1].id)}
            aria-label="Previous media item (Left Arrow)"
            className="absolute left-2 sm:left-4 z-20 p-2 sm:p-3 text-white/80 hover:text-white bg-black/40 hover:bg-black/70 rounded-full backdrop-blur-sm transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        )}

        {/* Media Frame Container */}
        <div className="relative w-full h-full flex items-center justify-center max-w-6xl">
          {isVideo ? (
            <div className="relative max-h-full max-w-full flex items-center justify-center">
              <video
                ref={videoRef}
                src={syntheticVideoUrl || currentMedia.blobUrl}
                poster={currentMedia.thumbnailUrl}
                controls
                playsInline
                preload="metadata"
                className="max-h-[60vh] sm:max-h-[70vh] max-w-full rounded-lg shadow-modal object-contain bg-black"
                onError={() => {
                  setMediaError(true);
                  setErrorMessage('Video playback unavailable in browser.');
                }}
              />
            </div>
          ) : (
            <div
              className={`relative max-h-full max-w-full flex items-center justify-center transition-transform ${
                zoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
              }`}
              onDoubleClick={handleToggleZoom}
              style={{
                transform: `scale(${zoomScale}) translate(${panOffset.x / zoomScale}px, ${
                  panOffset.y / zoomScale
                }px)`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.15s ease-out',
              }}
            >
              {/* Single Active Image Element (No stacking, no crossfade) */}
              {activeMediaUrl && (
                <img
                  src={activeMediaUrl}
                  alt={currentMedia.caption || currentMedia.originalName}
                  className="max-h-[60vh] sm:max-h-[70vh] max-w-full rounded-lg shadow-modal object-contain select-none"
                  draggable={false}
                />
              )}

              {/* Single clean loader when loading */}
              {isLoadingMedia && (
                <div className="flex flex-col items-center justify-center p-8 text-white/60">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-xs font-mono">Loading image...</span>
                </div>
              )}
            </div>
          )}

          {/* Damaged Source Notice */}
          {currentMedia.isDamaged && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-900/80 backdrop-blur-sm border border-amber-500/40 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Damaged source file: incomplete scan data. Showing best available preview.</span>
            </div>
          )}

          {/* Error fallback state */}
          {mediaError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-lg p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-red-400 mb-2" />
              <p className="text-sm font-medium text-white">Media preview unavailable</p>
              <p className="text-xs text-white/60 mt-1 max-w-xs">{errorMessage}</p>
              <button
                onClick={handleDownloadOriginal}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 text-white text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download original file</span>
              </button>
            </div>
          )}
        </div>

        {/* Next Button */}
        {hasNext && (
          <button
            onClick={() => onNavigateMedia(mediaList[currentIndex + 1].id)}
            aria-label="Next media item (Right Arrow)"
            className="absolute right-2 sm:right-4 z-20 p-2 sm:p-3 text-white/80 hover:text-white bg-black/40 hover:bg-black/70 rounded-full backdrop-blur-sm transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        )}
      </div>

      {/* Bottom Drawer: Metadata, Chips, & Clickable Groups */}
      <div className="bg-[#181B16] border-t border-white/10 px-4 sm:px-6 py-3 max-h-[38vh] overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-2.5">
          {/* Metadata Row: Capture Time, Contributor, Resolution */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-white/70">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-white/50" />
                {currentMedia.captureTime
                  ? new Date(currentMedia.captureTime).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Date unknown'}
              </span>

              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-white/50" />
                <span>{contributorDisplay}</span>
              </span>

              {currentMedia.width && currentMedia.height && (
                <span className="font-mono text-[11px] text-white/50">
                  {currentMedia.width} × {currentMedia.height}
                </span>
              )}
            </div>
          </div>

          {/* Clickable Categorical Chips Row (Moment, Place, Activity, People) */}
          {chips.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
              {chips.map((chip) => {
                let Icon = Tag;
                if (chip.type === 'moment') Icon = Clock;
                if (chip.type === 'place') Icon = MapPin;
                if (chip.type === 'person') Icon = User;

                const handleClickChip = () => {
                  if (chip.type === 'moment') {
                    onSelectMoment(chip.id);
                  } else if (chip.type === 'place' && onSelectPlace) {
                    onSelectPlace(chip.label);
                  } else if (chip.type === 'activity' && onSelectActivity) {
                    onSelectActivity(chip.label);
                  }
                };

                return (
                  <button
                    key={`${chip.type}_${chip.id}`}
                    onClick={handleClickChip}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-colors shrink-0 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <Icon className="w-3 h-3 text-accent-light" />
                    <span>
                      <span className="text-white/50 capitalize mr-1">{chip.type}:</span>
                      {chip.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Caption */}
          {currentMedia.caption && (
            <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-sans">
              {currentMedia.caption}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
