import { useEffect, useRef, useState, FC } from 'react';
import { MediaItem, Moment, Membership, Connection } from '../../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  AlertCircle,
  ArrowRight,
  Calendar,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { getLocalPlayableVideoBlobUrl } from '../../lib/videoHelper';
import { safelyDecodeImage } from '../../lib/imageRepair';
import { recordViewerClosed } from '../flow/FlowCard';

interface MediaViewerProps {
  mediaId: string;
  mediaList: MediaItem[];
  moments: Moment[];
  memberships: Membership[];
  connections: Connection[];
  onClose: () => void;
  onNavigateMedia: (nextMediaId: string) => void;
  onSelectMoment: (momentId: string) => void;
}

// Bounded LRU cache for preloaded image URLs (max 30 items)
const decodedCache = new Set<string>();

export const MediaViewer: FC<MediaViewerProps> = ({
  mediaId,
  mediaList,
  moments,
  memberships,
  connections,
  onClose,
  onNavigateMedia,
  onSelectMoment,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openingElementRef = useRef<HTMLElement | null>(null);

  const [syntheticVideoUrl, setSyntheticVideoUrl] = useState<string>('');
  const [mediaError, setMediaError] = useState(false);

  // Progressive high-resolution uncropped image state
  const [decodedOriginalUrl, setDecodedOriginalUrl] = useState<string | null>(null);
  const [isOriginalLoaded, setIsOriginalLoaded] = useState(false);

  // Zoom & Pan state
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });

  // Find active media item
  const currentIndex = mediaList.findIndex((m) => m.id === mediaId);
  const currentMedia = mediaList[currentIndex] || mediaList[0];

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < mediaList.length - 1;

  const handleClose = () => {
    if (currentMedia) {
      recordViewerClosed(currentMedia.id);
    }
    onClose();
  };

  // Reset zoom on media change
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, [mediaId]);

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

  // Progressive image decoding and bounded prefetching
  useEffect(() => {
    setMediaError(false);
    setDecodedOriginalUrl(null);
    setIsOriginalLoaded(false);

    if (currentMedia?.mimeType.startsWith('video/')) {
      if (currentMedia.blobUrl) {
        setSyntheticVideoUrl(currentMedia.blobUrl);
      } else {
        getLocalPlayableVideoBlobUrl().then((url) => {
          setSyntheticVideoUrl(url);
        });
      }
    } else if (currentMedia) {
      // Determine target full resolution URL
      const targetFullUrl =
        currentMedia.blobUrl ||
        currentMedia.driveFullUrl ||
        currentMedia.thumbnailUrl;

      // Check if already decoded in cache
      if (decodedCache.has(targetFullUrl)) {
        setDecodedOriginalUrl(targetFullUrl);
        setIsOriginalLoaded(true);
      } else {
        safelyDecodeImage(targetFullUrl, 7000).then((res) => {
          if (res.success) {
            if (decodedCache.size > 30) {
              const first = decodedCache.values().next().value;
              if (first) decodedCache.delete(first);
            }
            decodedCache.add(targetFullUrl);
            setDecodedOriginalUrl(targetFullUrl);
            setIsOriginalLoaded(true);
          } else {
            // Fall back cleanly to thumbnail without showing error screen
            setDecodedOriginalUrl(currentMedia.thumbnailUrl);
            setIsOriginalLoaded(true);
          }
        });
      }

      // Bounded prefetch of adjacent item thumbnails only
      const prefetchTargets = [
        mediaList[currentIndex - 1]?.thumbnailUrl,
        mediaList[currentIndex + 1]?.thumbnailUrl,
      ].filter(Boolean) as string[];

      prefetchTargets.forEach((url) => {
        if (!decodedCache.has(url)) {
          const preImg = new Image();
          preImg.src = url;
        }
      });
    }

    // Always pause video when mediaId changes
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [currentMedia, currentIndex, mediaList]);

  // Pause video on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, []);

  // Keyboard navigation & Focus Trapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isVideoControl = target && (target.tagName === 'VIDEO' || target.closest('video'));

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
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
  }, [hasPrev, hasNext, currentIndex, mediaList, zoomScale]);

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

  const primaryMembership = memberships.find((m) => m.mediaId === currentMedia?.id);
  const primaryMoment = primaryMembership
    ? moments.find((m) => m.id === primaryMembership.momentId)
    : null;

  const relatedMedia = primaryMoment
    ? mediaList.filter((m) => {
        if (m.id === currentMedia?.id) return false;
        return memberships.some(
          (mem) => mem.momentId === primaryMoment.id && mem.mediaId === m.id
        );
      })
    : [];

  const relatedMomentConnections = primaryMoment
    ? connections.filter(
        (c) => c.sourceMomentId === primaryMoment.id || c.targetMomentId === primaryMoment.id
      )
    : [];

  if (!currentMedia) return null;
  const isVideo = currentMedia.mimeType.startsWith('video/') || currentMedia.duration !== null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Media viewer for ${currentMedia.caption || currentMedia.originalName}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white animate-fade-in select-none"
    >
      {/* Top Bar: Title & Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-md border-b border-white/10 z-30">
        <div className="flex items-center gap-3 min-w-0 pr-4">
          <span className="text-xs font-mono text-white/60 shrink-0">
            {currentIndex + 1} / {mediaList.length}
          </span>
          <h2 className="text-sm sm:text-base font-semibold truncate text-white">
            {currentMedia.caption || currentMedia.originalName}
          </h2>
          {primaryMoment && (
            <button
              onClick={() => onSelectMoment(primaryMoment.id)}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-accent-light transition-colors"
            >
              <span>{primaryMoment.label}</span>
            </button>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isVideo && (
            <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5 border border-white/10 mr-1">
              <button
                onClick={handleZoomOut}
                disabled={zoomScale <= 1}
                aria-label="Zoom out (-)"
                className="p-1.5 hover:bg-white/20 rounded disabled:opacity-30 text-white min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
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
                <ZoomIn className="w-4 h-4" />
              </button>
              {zoomScale > 1 && (
                <button
                  onClick={handleResetZoom}
                  aria-label="Fit to screen"
                  className="p-1.5 hover:bg-white/20 rounded text-white/80 hover:text-white min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <button
            onClick={handleClose}
            aria-label="Close viewer (Escape)"
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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

        {/* Media Canvas Area */}
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
                className="max-h-[65vh] sm:max-h-[75vh] max-w-full rounded-lg shadow-modal object-contain bg-black"
                onError={() => {
                  setMediaError(true);
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
              {/* Layer 1: Instant Low-Res / Thumbnail Preview (Always visible initially) */}
              <img
                src={currentMedia.thumbnailUrl || currentMedia.lowResUrl}
                alt={currentMedia.caption || currentMedia.originalName}
                className="max-h-[65vh] sm:max-h-[75vh] max-w-full rounded-lg shadow-modal object-contain"
              />

              {/* Layer 2: Decoded Full Uncropped Original (Replaces smoothly once ready) */}
              {decodedOriginalUrl && (
                <img
                  src={decodedOriginalUrl}
                  alt={currentMedia.caption || currentMedia.originalName}
                  className={`absolute inset-0 m-auto max-h-[65vh] sm:max-h-[75vh] max-w-full rounded-lg shadow-modal object-contain transition-opacity duration-300 ${
                    isOriginalLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={() => setIsOriginalLoaded(true)}
                  onError={() => {
                    // Fall back cleanly to thumbnail
                    setDecodedOriginalUrl(null);
                  }}
                />
              )}
            </div>
          )}

          {/* Error fallback state */}
          {mediaError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-lg p-6 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
              <p className="text-sm font-medium text-white">Media preview unavailable</p>
              <p className="text-xs text-white/60 mt-1 max-w-xs">
                The local media format or codec could not be decoded by the browser. Original file is intact.
              </p>
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

      {/* Bottom Drawer: Metadata, Related Media Strip & Connected Moments */}
      <div className="bg-[#1C201A] border-t border-white/10 px-4 sm:px-6 py-3 max-h-[35vh] overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-3">
          {/* Metadata Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                {currentMedia.caption || currentMedia.originalName}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentMedia.captureTime
                    ? new Date(currentMedia.captureTime).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : 'Date unknown'}
                </span>
                {currentMedia.width && currentMedia.height && (
                  <span className="font-mono text-[11px] text-white/50">
                    {currentMedia.width} × {currentMedia.height}
                  </span>
                )}
              </div>
            </div>

            {primaryMoment && (
              <button
                onClick={() => onSelectMoment(primaryMoment.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors self-start sm:self-auto min-h-[36px]"
              >
                <span>Explore {primaryMoment.label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Related Media Strip */}
          {relatedMedia.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5">
                More in {primaryMoment?.label} ({relatedMedia.length})
              </h4>
              <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
                {relatedMedia.map((rel) => (
                  <button
                    key={rel.id}
                    onClick={() => onNavigateMedia(rel.id)}
                    className="relative flex-shrink-0 w-16 h-12 rounded overflow-hidden border border-white/20 hover:border-accent hover:scale-105 transition-all focus:outline-none focus:ring-1 focus:ring-accent"
                    aria-label={`Jump to ${rel.caption || rel.originalName}`}
                  >
                    <img
                      src={rel.thumbnailUrl}
                      alt={rel.caption || rel.originalName}
                      className="w-full h-full object-cover"
                    />
                    {rel.mimeType.startsWith('video/') && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Play className="w-3.5 h-3.5 text-white fill-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Related Moments Connected to this Activity */}
          {relatedMomentConnections.length > 0 && (
            <div className="pt-2 border-t border-white/10">
              <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5">
                Connected Moments
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {relatedMomentConnections.map((conn) => {
                  const targetId =
                    conn.sourceMomentId === primaryMoment?.id
                      ? conn.targetMomentId
                      : conn.sourceMomentId;
                  const targetMoment = moments.find((m) => m.id === targetId);
                  if (!targetMoment) return null;

                  return (
                    <button
                      key={conn.id}
                      onClick={() => onSelectMoment(targetMoment.id)}
                      className="p-2 rounded bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left group transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-white group-hover:text-accent-light truncate">
                          {targetMoment.label}
                        </p>
                        <p className="text-[11px] text-white/50 truncate">
                          {conn.provenance === 'organizer-confirmed'
                            ? 'Confirmed link'
                            : `Suggested: ${conn.evidence || 'Proximity'}`}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-white flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
