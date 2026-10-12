import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  EventWorkspace,
  MediaItem,
  Moment,
  Membership,
  Connection,
  Visit,
  ViewMode,
  UserRole,
  DriveConfig,
} from './types';
import { Header } from './components/Header';
import { FlowView } from './features/flow/FlowView';
import { MediaViewer } from './features/viewer/MediaViewer';
import { MomentDetail } from './features/moments/MomentDetail';
import { TimelineView } from './features/timeline/TimelineView';
import { UniverseView } from './features/universe/UniverseView';
import { MediaImporter } from './features/import/MediaImporter';
import { AdminLoginModal } from './features/admin/AdminLoginModal';
import { DriveConfigModal } from './features/admin/DriveConfigModal';
import { AdminReviewQueue } from './features/admin/AdminReviewQueue';
import { VisitorSuggestionModal } from './features/visitor/VisitorSuggestionModal';
import { AdminSharingModal } from './features/admin/AdminSharingModal';
import { AdminPeoplePanel } from './features/admin/AdminPeoplePanel';
import { AdminEmbeddingsImport } from './features/admin/AdminEmbeddingsImport';
import { AdminCollectionsPanel } from './features/admin/AdminCollectionsPanel';
import { BackToTop } from './components/BackToTop';
import { CollectionPasswordPrompt } from './features/visitor/CollectionPasswordPrompt';
import {
  fetchCollectionInfo,
  fetchCollectionData,
  getVisitorToken,
  clearVisitorToken,
  syncCollectionToServer,
} from './lib/collectionApi';
import { SharedCollectionInfo, PersonGroup } from './types';
import { pickTakeMeSomewhere, RecommendationResult } from './lib/recommendation';
import { getActiveRole, setActiveRole, isAdminAuthenticated, logoutAdmin, getAdminSession } from './lib/auth';
import {
  loadStoredEvent,
  saveStoredEvent,
  loadAllStoredMedia,
  saveStoredMediaItem,
  loadAllStoredMoments,
  saveStoredMoment,
  loadAllStoredMemberships,
  saveStoredMembership,
  deleteStoredMembership,
  loadAllStoredConnections,
  saveStoredConnection,
  loadAllStoredVisits,
  saveStoredVisit,
  loadDriveConfig,
  loadSuggestions,
  clearAllLocalData,
} from './lib/db';
import { Sparkles, X, RotateCcw, Trash2 } from 'lucide-react';

function parseHash(hash: string): { momentId: string | null; mediaId: string | null } {
  const clean = hash.replace(/^#/, '');
  if (!clean) return { momentId: null, mediaId: null };

  const momentMediaMatch = clean.match(/^moment-([^/]+)\/media-(.+)$/);
  if (momentMediaMatch) {
    return { momentId: momentMediaMatch[1], mediaId: momentMediaMatch[2] };
  }

  const momentMatch = clean.match(/^moment-(.+)$/);
  if (momentMatch) {
    return { momentId: momentMatch[1], mediaId: null };
  }

  const mediaMatch = clean.match(/^media-(.+)$/);
  if (mediaMatch) {
    return { momentId: null, mediaId: mediaMatch[1] };
  }

  return { momentId: null, mediaId: null };
}

const defaultElevateEvent: EventWorkspace = {
  id: 'elevate-1.0',
  title: 'ELEVATE 1.0',
  description: 'Official ELEVATE 1.0 Event Collection',
  updatedAt: new Date().toISOString(),
};

export default function App() {
  // State
  const [event, setEvent] = useState<EventWorkspace>(defaultElevateEvent);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [visits, setVisits] = useState<Record<string, Visit>>({});
  const [recentVisitHistory, setRecentVisitHistory] = useState<string[]>([]);
  const [isRealCollection, setIsRealCollection] = useState<boolean>(true);

  // Navigation State
  const [viewMode, setViewMode] = useState<ViewMode>('flow');
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [activeMomentId, setActiveMomentId] = useState<string | null>(null);
  const [recommendationNotice, setRecommendationNotice] = useState<RecommendationResult | null>(null);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [importTargetMomentId, setImportTargetMomentId] = useState<string | null>(null);

  // Role and Admin Security State
  const [currentRole, setCurrentRole] = useState<UserRole>(getActiveRole());
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isDriveConfigOpen, setIsDriveConfigOpen] = useState(false);
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState(false);
  const [isVisitorSuggestionOpen, setIsVisitorSuggestionOpen] = useState(false);
  const [suggestionTargetMoment, setSuggestionTargetMoment] = useState<Moment | null>(null);
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState<number>(0);
  const [driveConfig, setDriveConfig] = useState<DriveConfig | null>(null);

  // Collection Sharing & Server Sync State
  const [isSharingOpen, setIsSharingOpen] = useState(false);
  const [collectionInfo, setCollectionInfo] = useState<SharedCollectionInfo | null>(null);
  const [isCollectionUnlocked, setIsCollectionUnlocked] = useState<boolean>(true);

  // Search & Feature Panels State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPeoplePanelOpen, setIsPeoplePanelOpen] = useState(false);
  const [isAiImportOpen, setIsAiImportOpen] = useState(false);
  const [isCollectionsPanelOpen, setIsCollectionsPanelOpen] = useState(false);
  const [peopleGroups, setPeopleGroups] = useState<PersonGroup[]>([]);

  // Dedicated Flow scroll position preservation
  const flowScrollPosRef = useRef<number>(0);

  // Main unified collection loading: prioritize server collection, then fallback to IndexedDB
  const refreshFromDb = useCallback(async () => {
    // 1. Try server collection first (primary source of truth)
    try {
      const info = await fetchCollectionInfo('elevate');
      setCollectionInfo(info);
      setEvent({
        id: info.id || 'elevate-1.0',
        title: info.name || 'ELEVATE 1.0',
        description: info.description || 'Official ELEVATE 1.0 Event Collection',
        updatedAt: info.updatedAt || new Date().toISOString(),
      });

      if (info.requiresPassword) {
        const token = getVisitorToken('elevate');
        if (!token && !isAdminAuthenticated()) {
          setIsCollectionUnlocked(false);
          return;
        }
      }

      const serverData = await fetchCollectionData('elevate');
      if (serverData.mediaItems.length > 0 || serverData.moments.length > 0) {
        setMedia(serverData.mediaItems);
        setMoments(serverData.moments);
        setMemberships(serverData.memberships);
        setConnections(serverData.connections);
        setIsRealCollection(true);

        // Fetch people groups
        try {
          const pRes = await fetch('/api/collections/elevate/people-groups');
          if (pRes.ok) {
            const pData = await pRes.json();
            setPeopleGroups(pData.groups || []);
          }
        } catch {
          // Ignore if people groups not yet created
        }

        // Background cache into IndexedDB for offline resilience
        saveStoredEvent({
          id: info.id || 'elevate-1.0',
          title: info.name || 'ELEVATE 1.0',
          description: info.description || 'Official ELEVATE 1.0 Event Collection',
          updatedAt: info.updatedAt || new Date().toISOString(),
        }).catch(() => {});
        for (const item of serverData.mediaItems) {
          saveStoredMediaItem(item).catch(() => {});
        }
        for (const mom of serverData.moments) {
          saveStoredMoment(mom).catch(() => {});
        }
        for (const mem of serverData.memberships) {
          saveStoredMembership(mem).catch(() => {});
        }
        for (const conn of serverData.connections) {
          saveStoredConnection(conn).catch(() => {});
        }
        return;
      }
    } catch (err) {
      console.warn('Server collection fetch failed, trying IndexedDB:', err);
    }

    // 2. Fallback to local IndexedDB if server is unavailable
    try {
      const storedMedia = await loadAllStoredMedia();
      const storedMoments = await loadAllStoredMoments();
      const storedEvent = await loadStoredEvent();
      const storedMemberships = await loadAllStoredMemberships();
      const storedConnections = await loadAllStoredConnections();
      const storedVisits = await loadAllStoredVisits();

      if (storedMedia.length > 0 || storedMoments.length > 0) {
        setIsRealCollection(true);
        if (storedEvent) setEvent(storedEvent);
        setMedia(storedMedia);
        setMoments(storedMoments);
        setMemberships(storedMemberships);
        setConnections(storedConnections);
        setVisits(storedVisits);

        // Auto-sync to server so all visitors and incognito sessions can immediately see the collection!
        syncCollectionToServer('elevate', {
          moments: storedMoments,
          mediaItems: storedMedia,
          memberships: storedMemberships,
          connections: storedConnections,
        }).then((res) => {
          console.log('[Auto-Sync] Local memories published to server for visitors:', res);
        }).catch((err) => {
          console.warn('[Auto-Sync] Auto-sync to server failed:', err);
        });
      }
    } catch {
      // IndexedDB fallback failed
    }
  }, []);

  // Hydrate collection on mount and load secondary metadata
  useEffect(() => {
    refreshFromDb();
    loadDriveConfig().then((cfg) => {
      if (cfg) setDriveConfig(cfg);
    }).catch(() => {});
    loadSuggestions().then((sugs) => {
      const pendingCount = sugs.filter((s) => s.status === 'pending').length;
      setPendingSuggestionsCount(pendingCount);
    }).catch(() => {});
  }, [refreshFromDb]);

  // Initial URL hash hydration
  useEffect(() => {
    const { momentId, mediaId } = parseHash(window.location.hash);
    if (momentId || mediaId) {
      setActiveMomentId(momentId);
      setActiveMediaId(mediaId);
    }
  }, []);

  // Browser History / Back-Button integration
  useEffect(() => {
    const handlePopState = () => {
      const { momentId, mediaId } = parseHash(window.location.hash);
      setActiveMomentId(momentId);
      setActiveMediaId(mediaId);

      // Returning to Flow view: restore scroll position
      if (!momentId && !mediaId) {
        setTimeout(() => {
          window.scrollTo({ top: flowScrollPosRef.current, behavior: 'auto' });
        }, 10);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Open Media Viewer
  const handleOpenMedia = (mediaId: string) => {
    // Only capture Flow scroll position if transitioning from Flow
    if (!activeMomentId && !activeMediaId) {
      flowScrollPosRef.current = window.scrollY;
    }
    const targetHash = activeMomentId
      ? `#moment-${activeMomentId}/media-${mediaId}`
      : `#media-${mediaId}`;

    window.history.pushState(null, '', targetHash);
    setActiveMediaId(mediaId);
  };

  // Navigate between media items inside viewer
  const handleNavigateMedia = (nextMediaId: string) => {
    const targetHash = activeMomentId
      ? `#moment-${activeMomentId}/media-${nextMediaId}`
      : `#media-${nextMediaId}`;

    window.history.replaceState(null, '', targetHash);
    setActiveMediaId(nextMediaId);
  };

  // Close Media Viewer
  const handleCloseMedia = () => {
    if (activeMediaId) {
      window.history.back();
    }
  };

  // Select Moment for Detail View
  const handleSelectMoment = (momentId: string) => {
    // Only capture Flow scroll position if currently in Flow
    if (!activeMomentId && !activeMediaId) {
      flowScrollPosRef.current = window.scrollY;
    }

    window.history.pushState(null, '', `#moment-${momentId}`);
    setActiveMomentId(momentId);
    setActiveMediaId(null);

    // Track visit
    const updatedVisit: Visit = {
      momentId,
      lastVisitedAt: new Date().toISOString(),
      visitCount: (visits[momentId]?.visitCount || 0) + 1,
    };
    setVisits((prev) => ({
      ...prev,
      [momentId]: updatedVisit,
    }));
    saveStoredVisit(updatedVisit);

    setRecentVisitHistory((prev) => [...prev.slice(-10), momentId]);

    // Scroll to top of moment view
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back from Moment to Flow
  const handleBackToFlow = () => {
    if (activeMomentId || activeMediaId) {
      window.history.back();
    }
  };

  // Take Me Somewhere discovery action
  const handleTakeMeSomewhere = () => {
    const result = pickTakeMeSomewhere(moments, visits, recentVisitHistory);
    if (result) {
      setRecommendationNotice(result);
      handleSelectMoment(result.moment.id);
    }
  };

  // Update Event Metadata (persisted to IndexedDB)
  const handleUpdateEvent = async (title: string, description: string | null) => {
    const updated: EventWorkspace = {
      ...event,
      title,
      description,
      updatedAt: new Date().toISOString(),
    };
    setEvent(updated);
    if (isRealCollection) {
      await saveStoredEvent(updated);
    }
  };

  // Update Moment Metadata (persisted to IndexedDB)
  const handleUpdateMoment = async (momentId: string, label: string, description: string | null) => {
    const updatedMoments = moments.map((m) =>
      m.id === momentId ? { ...m, label, description } : m
    );
    setMoments(updatedMoments);

    const target = updatedMoments.find((m) => m.id === momentId);
    if (target && isRealCollection) {
      await saveStoredMoment(target);
    }
  };

  // Remove Membership (Wrong group?)
  const handleRemoveMembership = async (mediaId: string, momentId: string) => {
    setMemberships((prev) =>
      prev.filter((mem) => !(mem.mediaId === mediaId && mem.momentId === momentId))
    );
    if (isRealCollection) {
      await deleteStoredMembership(mediaId, momentId);
    }
  };

  // Add Connection between Moments
  const handleAddConnection = async (
    sourceId: string,
    targetId: string,
    provenance: 'organizer-confirmed' | 'suggested',
    evidence: string
  ) => {
    const newConn: Connection = {
      id: `conn-${Date.now()}`,
      sourceMomentId: sourceId,
      targetMomentId: targetId,
      type: 'activity',
      provenance,
      evidence,
      confidence: 1.0,
    };
    setConnections((prev) => [...prev, newConn]);
    if (isRealCollection) {
      await saveStoredConnection(newConn);
    }
  };

  // Reset to Demo Collection
  const handleResetToDemo = async () => {
    if (window.confirm('Reset collection to initial sample demo data? Your imported media in IndexedDB will be cleared.')) {
      await clearAllLocalData();
      await refreshFromDb();
      setActiveMomentId(null);
      setActiveMediaId(null);
      window.history.pushState(null, '', '#');
    }
  };

  // Clear Local Data
  const handleClearCollection = async () => {
    if (window.confirm('Clear all local moments and media from this browser?')) {
      await clearAllLocalData();
      await refreshFromDb();
      setActiveMomentId(null);
      setActiveMediaId(null);
      window.history.pushState(null, '', '#');
    }
  };

  // Open Importer targeting a specific moment (Were You There)
  const handleAddFilesToMoment = (momentId: string) => {
    setImportTargetMomentId(momentId);
    setIsImporterOpen(true);
  };

  // Update Media Capture Time (explicitly user-supplied)
  const handleUpdateMediaCaptureTime = async (mediaId: string, captureTime: string) => {
    const updated = media.map((m) =>
      m.id === mediaId ? { ...m, captureTime, captureTimeSource: 'user' as const } : m
    );
    setMedia(updated);
    const target = updated.find((m) => m.id === mediaId);
    if (target && isRealCollection) {
      await saveStoredMediaItem(target);
    }
  };

  // Create Moment from suggested proximity cluster
  const handleCreateMomentFromCluster = async (label: string, mediaIds: string[]) => {
    const newMoment: Moment = {
      id: `moment-cluster-${Date.now()}`,
      eventId: event.id,
      label,
      labelSource: 'organizer',
      coverMediaId: mediaIds[0] || null,
      description: 'Created from capture-time proximity suggestion',
      isDemo: !isRealCollection,
      createdAt: new Date().toISOString(),
    };
    setMoments((prev) => [...prev, newMoment]);
    if (isRealCollection) {
      await saveStoredMoment(newMoment);
    }

    const newMemberships: Membership[] = mediaIds.map((mId) => ({
      mediaId: mId,
      momentId: newMoment.id,
      source: 'suggested_time',
      confidence: 0.9,
    }));
    setMemberships((prev) => [...prev, ...newMemberships]);
    if (isRealCollection) {
      for (const mem of newMemberships) {
        await saveStoredMembership(mem);
      }
    }

    handleSelectMoment(newMoment.id);
  };

  const handleToggleRole = () => {
    if (currentRole === 'admin') {
      logoutAdmin();
      setCurrentRole('visitor');
    } else {
      if (isAdminAuthenticated()) {
        setActiveRole('admin');
        setCurrentRole('admin');
      } else {
        setIsAdminLoginOpen(true);
      }
    }
  };

  const handleConfirmProvisionalMoment = async (momentId: string) => {
    const updated = moments.map((m) =>
      m.id === momentId
        ? {
            ...m,
            isProvisional: false,
            labelSource: 'organizer' as const,
            description: (m.description || '') + ' (Confirmed by Organizer)',
          }
        : m
    );
    setMoments(updated);
    const target = updated.find((m) => m.id === momentId);
    if (target) {
      await saveStoredMoment(target);
    }
  };

  const handleUpdatePersonGroupName = async (groupId: string, newLabel: string) => {
    const session = getAdminSession();
    try {
      const res = await fetch(`/api/collections/${collectionInfo?.slug || 'elevate'}/admin/people-groups/${groupId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ label: newLabel }),
      });
      if (res.ok) {
        setPeopleGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, label: newLabel, isConfirmed: true } : g))
        );
      }
    } catch (err) {
      console.error('Failed to update person group label:', err);
    }
  };

  // Keyboard shortcuts: Alt+1 (Flow), Alt+2 (Timeline), Alt+3 (Universe), Alt+S (Take Me Somewhere)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveMomentId(null);
          setActiveMediaId(null);
          setViewMode('flow');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveMomentId(null);
          setActiveMediaId(null);
          setViewMode('timeline');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveMomentId(null);
          setActiveMediaId(null);
          setViewMode('universe');
        } else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleTakeMeSomewhere();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTakeMeSomewhere]);

  // Search filter across media captions, filenames, contributors, places, and activities
  const displayedMedia = useMemo(() => {
    if (!searchQuery.trim()) return media;
    const q = searchQuery.toLowerCase().trim();
    return media.filter((m) => {
      const matchCaption = m.caption?.toLowerCase().includes(q);
      const matchName = m.originalName.toLowerCase().includes(q);
      const matchContributor = m.contributorName?.toLowerCase().includes(q);
      const matchPlace = m.places?.some((p) => p.toLowerCase().includes(q));
      const matchActivity = m.activities?.some((a) => a.toLowerCase().includes(q));
      return matchCaption || matchName || matchContributor || matchPlace || matchActivity;
    });
  }, [media, searchQuery]);

  const activeMoment = moments.find((m) => m.id === activeMomentId);

  // If collection is password protected and visitor has not unlocked it
  if (
    collectionInfo &&
    collectionInfo.requiresPassword &&
    !isCollectionUnlocked &&
    currentRole !== 'admin'
  ) {
    return (
      <CollectionPasswordPrompt
        collection={collectionInfo}
        onUnlocked={() => {
          setIsCollectionUnlocked(true);
          refreshFromDb();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-charcoal flex flex-col font-sans">
      {/* Header */}
      <Header
        event={event}
        onUpdateEvent={handleUpdateEvent}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setActiveMomentId(null);
          setActiveMediaId(null);
          window.history.pushState(null, '', '#');
          setViewMode(mode);
        }}
        onTakeMeSomewhere={handleTakeMeSomewhere}
        onOpenImporter={() => {
          setImportTargetMomentId(null);
          setIsImporterOpen(true);
        }}
        isDemo={!isRealCollection}
        totalMediaCount={media.length}
        currentRole={currentRole}
        onToggleRole={handleToggleRole}
        onOpenDriveConfig={() => setIsDriveConfigOpen(true)}
        onOpenReviewQueue={() => setIsReviewQueueOpen(true)}
        onOpenSharing={() => setIsSharingOpen(true)}
        collectionVisibility={collectionInfo?.visibility}
        pendingSuggestionsCount={pendingSuggestionsCount}
        isDriveConnected={!!driveConfig && driveConfig.status === 'ready'}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
        onOpenPeoplePanel={() => setIsPeoplePanelOpen(true)}
        onOpenAiImport={() => setIsAiImportOpen(true)}
        onOpenCollectionsPanel={() => setIsCollectionsPanelOpen(true)}
      />

      {/* Active Search Results Banner */}
      {searchQuery && (
        <div className="bg-surface-muted border-b border-border px-4 sm:px-6 py-2 text-xs text-charcoal">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span>
              Found <strong>{displayedMedia.length}</strong> memories matching “<strong>{searchQuery}</strong>”
            </span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-accent hover:underline font-medium text-xs"
            >
              Clear search
            </button>
          </div>
        </div>
      )}

      {/* Collection management sub-bar */}
      <div className="bg-surface-muted/60 border-b border-border/80 px-4 sm:px-6 py-1.5 text-xs text-charcoal-muted flex flex-wrap items-center justify-between gap-2">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-charcoal">
              {isRealCollection ? 'ELEVATE 1.0 Collection' : 'Sample Demo Fixture'}
            </span>
            <span>•</span>
            <span>{media.length} photos/videos across {moments.length} moments</span>
          </div>

          <div className="flex items-center gap-3">
            {isRealCollection ? (
              <>
                <button
                  onClick={handleResetToDemo}
                  className="hover:text-charcoal flex items-center gap-1 transition-colors"
                  title="Reset to sample demo dataset"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-accent" />
                  <span>Reset to Demo</span>
                </button>
                <button
                  onClick={handleClearCollection}
                  className="hover:text-red-600 flex items-center gap-1 transition-colors"
                  title="Delete all items from IndexedDB"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Local Storage</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsImporterOpen(true)}
                className="text-accent font-medium hover:underline flex items-center gap-1"
              >
                <span>Import real photos to replace demo →</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Take Me Somewhere Notice Toast */}
      {recommendationNotice && (
        <div className="bg-accent-light border-b border-accent-border px-4 py-2.5 text-xs text-charcoal flex items-center justify-between shadow-subtle animate-fadeIn">
          <div className="max-w-7xl mx-auto flex items-center gap-2 w-full justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
              <span>
                <strong>Take Me Somewhere:</strong> Landed on “{recommendationNotice.moment.label}” —{' '}
                <span className="text-charcoal-muted">{recommendationNotice.reason}</span>
              </span>
            </div>
            <button
              onClick={() => setRecommendationNotice(null)}
              aria-label="Dismiss notice"
              className="p-1 hover:bg-surface rounded text-charcoal-muted"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeMoment ? (
          <MomentDetail
            moment={activeMoment}
            media={media}
            allMoments={moments}
            memberships={memberships}
            connections={connections}
            currentRole={currentRole}
            onBack={handleBackToFlow}
            onOpenMedia={handleOpenMedia}
            onUpdateMoment={handleUpdateMoment}
            onRemoveMembership={handleRemoveMembership}
            onAddFilesToMoment={handleAddFilesToMoment}
            onSelectMoment={handleSelectMoment}
            onAddConnection={handleAddConnection}
            onOpenVisitorSuggestion={(m) => {
              setSuggestionTargetMoment(m);
              setIsVisitorSuggestionOpen(true);
            }}
            onConfirmProvisionalMoment={handleConfirmProvisionalMoment}
          />
        ) : viewMode === 'flow' ? (
          <FlowView
            moments={moments}
            media={displayedMedia}
            memberships={memberships}
            onOpenMedia={handleOpenMedia}
            onSelectMoment={handleSelectMoment}
            onOpenImporter={() => {
              setImportTargetMomentId(null);
              setIsImporterOpen(true);
            }}
          />
        ) : viewMode === 'timeline' ? (
          <TimelineView
            media={displayedMedia}
            moments={moments}
            memberships={memberships}
            onOpenMedia={handleOpenMedia}
            onSelectMoment={handleSelectMoment}
            onUpdateMediaCaptureTime={handleUpdateMediaCaptureTime}
            onCreateMomentFromCluster={handleCreateMomentFromCluster}
          />
        ) : (
          <UniverseView
            moments={moments}
            media={media}
            memberships={memberships}
            connections={connections}
            onSelectMoment={handleSelectMoment}
          />
        )}
      </main>

      {/* Full-Screen Media Viewer */}
      {activeMediaId && (
        <MediaViewer
          mediaId={activeMediaId}
          mediaList={media}
          moments={moments}
          memberships={memberships}
          connections={connections}
          collectionSlug={collectionInfo?.slug || 'elevate'}
          onClose={handleCloseMedia}
          onNavigateMedia={handleNavigateMedia}
          onSelectMoment={handleSelectMoment}
        />
      )}

      {/* Local Media Importer Modal */}
      {isImporterOpen && (
        <MediaImporter
          eventId={event.id}
          moments={moments}
          targetMomentId={importTargetMomentId}
          onClose={() => setIsImporterOpen(false)}
          onImportComplete={async () => {
            await refreshFromDb();
            setIsImporterOpen(false);
          }}
        />
      )}

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onSuccess={() => {
          setCurrentRole('admin');
          setIsAdminLoginOpen(false);
        }}
      />

      {/* Google Drive Configuration & AI Grouping Modal */}
      <DriveConfigModal
        isOpen={isDriveConfigOpen}
        onClose={() => setIsDriveConfigOpen(false)}
        eventId={event.id}
        onDataUpdated={refreshFromDb}
      />

      {/* Admin Review Queue Modal */}
      <AdminReviewQueue
        isOpen={isReviewQueueOpen}
        onClose={() => setIsReviewQueueOpen(false)}
        moments={moments}
        media={media}
        collectionSlug={collectionInfo?.slug || 'elevate'}
        onDataUpdated={refreshFromDb}
      />

      {/* Visitor Suggestion Modal */}
      {suggestionTargetMoment && (
        <VisitorSuggestionModal
          isOpen={isVisitorSuggestionOpen}
          onClose={() => {
            setIsVisitorSuggestionOpen(false);
            setSuggestionTargetMoment(null);
          }}
          targetMoment={suggestionTargetMoment}
          availableMedia={media}
          currentMemberships={memberships
            .filter((m) => m.momentId === suggestionTargetMoment.id)
            .map((m) => m.mediaId)}
          collectionSlug={collectionInfo?.slug || 'elevate'}
          onSuggestionSubmitted={refreshFromDb}
        />
      )}

      {/* Admin Collection Sharing Modal */}
      <AdminSharingModal
        isOpen={isSharingOpen}
        onClose={() => setIsSharingOpen(false)}
        collectionInfo={collectionInfo}
        onUpdated={(updated) => {
          setCollectionInfo(updated);
        }}
        onPreviewVisitorView={() => {
          setCurrentRole('visitor');
          if (collectionInfo?.requiresPassword) {
            clearVisitorToken('elevate');
            setIsCollectionUnlocked(false);
          }
        }}
      />

      {/* Admin People & Face Groups Panel */}
      {isPeoplePanelOpen && (
        <AdminPeoplePanel
          collectionSlug={collectionInfo?.slug || 'elevate'}
          adminSessionToken={getAdminSession().token || ''}
          peopleGroups={peopleGroups}
          media={media}
          onClose={() => setIsPeoplePanelOpen(false)}
          onUpdateGroupName={handleUpdatePersonGroupName}
          onOpenMedia={handleOpenMedia}
        />
      )}

      {/* Admin Colab AI Data Importer */}
      {isAiImportOpen && (
        <AdminEmbeddingsImport
          collectionSlug={collectionInfo?.slug || 'elevate'}
          adminSessionToken={getAdminSession().token || ''}
          onClose={() => setIsAiImportOpen(false)}
          onImportComplete={refreshFromDb}
        />
      )}

      {/* Admin Multi-Collection Management Panel */}
      {isCollectionsPanelOpen && (
        <AdminCollectionsPanel
          currentSlug={collectionInfo?.slug || 'elevate'}
          adminSessionToken={getAdminSession().token || ''}
          onClose={() => setIsCollectionsPanelOpen(false)}
          onSelectCollection={(slug) => {
            window.location.pathname = `/c/${slug}`;
          }}
        />
      )}

      {/* Back To Top Floating Action Button */}
      <BackToTop />
    </div>
  );
}
