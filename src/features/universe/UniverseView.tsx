import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Moment, MediaItem, Membership, Connection } from '../../types';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  List,
  Compass,
  ArrowRight,
} from 'lucide-react';

interface UniverseViewProps {
  moments: Moment[];
  media: MediaItem[];
  memberships: Membership[];
  connections: Connection[];
  onSelectMoment: (momentId: string) => void;
}

interface NodePosition {
  momentId: string;
  x: number;
  y: number;
}

export const UniverseView: React.FC<UniverseViewProps> = ({
  moments,
  media,
  memberships,
  connections,
  onSelectMoment,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // View state: Canvas vs List Fallback
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas');

  // Pan and Zoom transform state
  const [scale, setScale] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  // Map cover media and counts per moment
  const momentDataMap = useMemo(() => {
    const map = new Map<
      string,
      { count: number; cover: MediaItem | null; items: MediaItem[] }
    >();
    const mediaById = new Map<string, MediaItem>(media.map((m) => [m.id, m]));

    for (const m of moments) {
      const momentMedia: MediaItem[] = [];
      for (const mem of memberships) {
        if (mem.momentId === m.id) {
          const item = mediaById.get(mem.mediaId);
          if (item) momentMedia.push(item);
        }
      }

      let coverItem: MediaItem | null = null;
      if (m.coverMediaId) {
        coverItem = mediaById.get(m.coverMediaId) || null;
      }
      if (!coverItem && momentMedia.length > 0) {
        coverItem = momentMedia[0];
      }

      map.set(m.id, {
        count: momentMedia.length,
        cover: coverItem,
        items: momentMedia,
      });
    }

    return map;
  }, [moments, media, memberships]);

  // Sort moments chronologically based on their earliest media capture time
  const sortedMoments = useMemo(() => {
    return [...moments].sort((a, b) => {
      const dataA = momentDataMap.get(a.id);
      const dataB = momentDataMap.get(b.id);
      const timeA = dataA?.items.find((i) => i.captureTime)?.captureTime || '';
      const timeB = dataB?.items.find((i) => i.captureTime)?.captureTime || '';
      if (timeA && timeB) return new Date(timeA).getTime() - new Date(timeB).getTime();
      if (timeA) return -1;
      if (timeB) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [moments, momentDataMap]);

  // Deterministic 2D layout based on golden angle spiral ordered by chronological sequence
  const nodePositions = useMemo<Map<string, NodePosition>>(() => {
    const posMap = new Map<string, NodePosition>();
    const centerX = 800;
    const centerY = 550;

    sortedMoments.forEach((moment, idx) => {
      if (idx === 0) {
        posMap.set(moment.id, { momentId: moment.id, x: centerX, y: centerY });
      } else {
        const radius = 220 + 95 * Math.sqrt(idx);
        const angle = idx * 2.39996; // Golden angle in radians
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        posMap.set(moment.id, { momentId: moment.id, x, y });
      }
    });

    return posMap;
  }, [sortedMoments]);

  // Fit to view
  const handleFitToView = useCallback(() => {
    if (moments.length === 0 || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const centerX = 800;
    const centerY = 550;

    setScale(0.85);
    setPan({
      x: container.width / 2 - centerX * 0.85,
      y: container.height / 2 - centerY * 0.85,
    });
  }, [moments]);

  // Center canvas on mount
  useEffect(() => {
    handleFitToView();
  }, [handleFitToView]);

  // Non-passive native wheel listener to prevent browser scroll and enable smooth zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setScale((s) => Math.max(0.4, Math.min(2.0, Number((s + delta).toFixed(2)))));
    };

    container.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  // Zoom helpers
  const handleZoomIn = () => setScale((s) => Math.min(2.0, Number((s + 0.2).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.4, Number((s - 0.2).toFixed(2))));

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left click and if not clicking a button
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    setIsPanning(true);
    startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - startPanRef.current.x,
      y: e.clientY - startPanRef.current.y,
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  // Touch pan & pinch-zoom handlers for mobile viewports
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1.0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !(e.target as HTMLElement).closest('button')) {
      setIsPanning(true);
      startPanRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
      touchStartDistRef.current = null;
    } else if (e.touches.length === 2) {
      setIsPanning(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistRef.current = Math.hypot(dx, dy);
      touchStartScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isPanning) {
      setPan({
        x: e.touches[0].clientX - startPanRef.current.x,
        y: e.touches[0].clientY - startPanRef.current.y,
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      const factor = currentDist / touchStartDistRef.current;
      const nextScale = Math.max(0.4, Math.min(2.0, Number((touchStartScaleRef.current * factor).toFixed(2))));
      setScale(nextScale);
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    touchStartDistRef.current = null;
  };

  // Keyboard navigation for canvas pan
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = 40;
    if (e.key === 'ArrowUp') {
      setPan((p) => ({ ...p, y: p.y + step }));
    } else if (e.key === 'ArrowDown') {
      setPan((p) => ({ ...p, y: p.y - step }));
    } else if (e.key === 'ArrowLeft') {
      setPan((p) => ({ ...p, x: p.x + step }));
    } else if (e.key === 'ArrowRight') {
      setPan((p) => ({ ...p, x: p.x - step }));
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* View Mode & Controls Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 shadow-subtle flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-accent-light text-accent">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-charcoal">
              Memory Universe
            </h2>
            <p className="text-xs text-charcoal-muted">
              Spatial overview of moments and relationships.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle between Canvas and List Fallback */}
          <div className="flex items-center bg-surface-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => setViewMode('canvas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 min-h-[36px] ${
                viewMode === 'canvas'
                  ? 'bg-surface text-charcoal shadow-subtle'
                  : 'text-charcoal-muted hover:text-charcoal'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-accent" />
              <span>Canvas</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 min-h-[36px] ${
                viewMode === 'list'
                  ? 'bg-surface text-charcoal shadow-subtle'
                  : 'text-charcoal-muted hover:text-charcoal'
              }`}
            >
              <List className="w-3.5 h-3.5 text-accent" />
              <span>Accessible List</span>
            </button>
          </div>

          {/* Zoom controls only on canvas mode */}
          {viewMode === 'canvas' && (
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg border border-border">
              <button
                onClick={handleZoomIn}
                aria-label="Zoom in"
                className="p-1.5 hover:bg-surface text-charcoal rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono px-1.5 text-charcoal-muted">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomOut}
                aria-label="Zoom out"
                className="p-1.5 hover:bg-surface text-charcoal rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={handleFitToView}
                aria-label="Fit to view"
                className="p-1.5 hover:bg-surface text-charcoal rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                title="Fit to view"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Canvas or Accessible List */}
      {viewMode === 'canvas' ? (
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="Memory Universe spatial canvas. Use arrow keys to pan, zoom controls to inspect."
          className={`relative w-full h-[620px] sm:h-[720px] bg-[#FAF8F2] border border-border rounded-xl overflow-hidden shadow-subtle cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-2 focus:ring-accent`}
        >
          {/* Subtle constellation grid pattern */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: 'radial-gradient(#D6D0BC 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              transform: `translate(${pan.x % 32}px, ${pan.y % 32}px)`,
            }}
          />

          {/* SVG Connection Layer */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: 'visible' }}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {connections.map((conn) => {
                const sourcePos = nodePositions.get(conn.sourceMomentId);
                const targetPos = nodePositions.get(conn.targetMomentId);
                if (!sourcePos || !targetPos) return null;

                const isConfirmed = conn.provenance === 'organizer-confirmed';

                return (
                  <g key={conn.id}>
                    <line
                      x1={sourcePos.x}
                      y1={sourcePos.y}
                      x2={targetPos.x}
                      y2={targetPos.y}
                      stroke={isConfirmed ? '#52664F' : '#94A38E'}
                      strokeWidth={isConfirmed ? 2.5 : 1.5}
                      strokeDasharray={isConfirmed ? undefined : '5,5'}
                      opacity={0.65}
                    />
                    {/* Midpoint provenance badge */}
                    <circle
                      cx={(sourcePos.x + targetPos.x) / 2}
                      cy={(sourcePos.y + targetPos.y) / 2}
                      r={4}
                      fill={isConfirmed ? '#52664F' : '#94A38E'}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Nodes Layer */}
          <div
            className="absolute inset-0 origin-top-left transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            {sortedMoments.map((moment) => {
              const pos = nodePositions.get(moment.id);
              if (!pos) return null;

              const data = momentDataMap.get(moment.id);
              const count = data?.count || 0;
              const cover = data?.cover;
              const coverThumb = cover
                ? `/api/collections/elevate/media/${cover.id}/thumbnail`
                : null;

              // Wide zoom vs Close zoom level of detail
              const isWideZoom = scale < 0.65;

              return (
                <div
                  key={moment.id}
                  style={{
                    position: 'absolute',
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="group"
                >
                  <button
                    onClick={() => onSelectMoment(moment.id)}
                    aria-label={`Explore moment: ${moment.label}, ${count} memories`}
                    className={`text-left rounded-2xl bg-surface border-2 shadow-card hover:shadow-modal transition-all focus:outline-none focus:ring-4 focus:ring-accent/30 ${
                      moment.labelSource === 'organizer'
                        ? 'border-accent/70'
                        : 'border-border'
                    } ${isWideZoom ? 'p-2 flex items-center gap-2' : 'w-48 overflow-hidden'}`}
                  >
                    {isWideZoom ? (
                      /* Compact node for wide view */
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="w-3 h-3 rounded-full bg-accent" />
                        <span className="text-xs font-semibold text-charcoal">
                          {moment.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-muted text-charcoal-muted">
                          {count}
                        </span>
                      </div>
                    ) : (
                      /* Full visual cluster card for detailed view */
                      <div className="flex flex-col">
                        <div className="relative h-28 bg-surface-muted overflow-hidden">
                          {cover ? (
                            <img
                              src={coverThumb || cover.thumbnailUrl}
                              alt={moment.label}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                // Fallback to direct thumbnail URL if proxy fails
                                if (e.currentTarget.src !== cover.thumbnailUrl) {
                                  e.currentTarget.src = cover.thumbnailUrl;
                                }
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-charcoal-muted text-xs">
                              Empty Moment
                            </div>
                          )}
                          <div className="absolute top-2 left-2 flex items-center gap-1">
                            {moment.isProvisional && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm">
                                Provisional
                              </span>
                            )}
                          </div>
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-charcoal/80 text-surface text-[11px] font-mono font-medium backdrop-blur-sm">
                            {count}
                          </div>
                        </div>

                        <div className="p-3 bg-surface space-y-1">
                          <p className="text-xs font-bold text-charcoal truncate leading-tight">
                            {moment.label}
                          </p>
                          <p className="text-[11px] text-charcoal-muted line-clamp-1">
                            {moment.description || 'Activity moment'}
                          </p>
                          <div className="pt-1 flex items-center justify-between text-[10px] text-accent font-semibold">
                            <span>Explore moment</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Canvas Navigation Hint Overlay */}
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-surface/90 border border-border text-[11px] text-charcoal-muted shadow-subtle backdrop-blur-sm pointer-events-none">
            Drag to pan • Scroll to zoom • Click moment to explore
          </div>
        </div>
      ) : (
        /* Accessible List Fallback */
        <div className="space-y-4">
          <div className="p-4 bg-surface rounded-xl border border-border shadow-subtle space-y-2">
            <h3 className="text-base font-semibold text-charcoal">
              All Moments List ({moments.length})
            </h3>
            <p className="text-xs text-charcoal-muted">
              Alternative accessible view displaying moments, coverage, and relationship connections.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {moments.map((moment) => {
              const data = momentDataMap.get(moment.id);
              const count = data?.count || 0;
              const cover = data?.cover;

              // Connections from this moment
              const relatedConns = connections.filter(
                (c) => c.sourceMomentId === moment.id || c.targetMomentId === moment.id
              );

              return (
                <div
                  key={moment.id}
                  className="p-4 bg-surface rounded-xl border border-border shadow-subtle space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    {cover && (
                      <div className="h-32 rounded-lg overflow-hidden bg-surface-muted">
                        <img
                          src={cover.thumbnailUrl}
                          alt={moment.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-base font-semibold text-charcoal">
                        {moment.label}
                      </h4>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-light text-accent">
                        {count} items
                      </span>
                    </div>
                    {moment.description && (
                      <p className="text-xs text-charcoal-muted line-clamp-2">
                        {moment.description}
                      </p>
                    )}

                    {relatedConns.length > 0 && (
                      <div className="pt-2 text-xs space-y-1">
                        <span className="text-[11px] font-semibold text-charcoal uppercase tracking-wider">
                          Connected to:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {relatedConns.map((c) => {
                            const otherId =
                              c.sourceMomentId === moment.id ? c.targetMomentId : c.sourceMomentId;
                            const otherMoment = moments.find((m) => m.id === otherId);
                            if (!otherMoment) return null;
                            return (
                              <span
                                key={c.id}
                                className="text-[11px] px-2 py-0.5 rounded bg-surface-muted text-charcoal-muted border border-border"
                              >
                                {otherMoment.label} ({c.provenance === 'organizer-confirmed' ? 'Confirmed' : 'Suggested'})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onSelectMoment(moment.id)}
                    className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-surface text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    <span>Explore Moment</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
