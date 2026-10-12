import React, { useState } from 'react';
import { ViewMode, EventWorkspace, UserRole } from '../types';
import {
  Compass,
  Calendar,
  Grid,
  FolderUp,
  Edit3,
  Check,
  X,
  Sparkles,
  Lock,
  Unlock,
  FolderSync,
  Inbox,
  Share2,
} from 'lucide-react';

interface HeaderProps {
  event: EventWorkspace;
  onUpdateEvent: (title: string, description: string | null) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onTakeMeSomewhere: () => void;
  onOpenImporter: () => void;
  isDemo: boolean;
  totalMediaCount: number;
  currentRole: UserRole;
  onToggleRole: () => void;
  onOpenDriveConfig: () => void;
  onOpenReviewQueue: () => void;
  onOpenSharing?: () => void;
  collectionVisibility?: string;
  pendingSuggestionsCount: number;
  isDriveConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  event,
  onUpdateEvent,
  viewMode,
  onChangeViewMode,
  onTakeMeSomewhere,
  onOpenImporter,
  isDemo,
  totalMediaCount,
  currentRole,
  onToggleRole,
  onOpenDriveConfig,
  onOpenReviewQueue,
  onOpenSharing,
  collectionVisibility,
  pendingSuggestionsCount,
  isDriveConnected,
}) => {
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editedTitle, setEditedTitle] = useState(event.title);
  const [editedDesc, setEditedDesc] = useState(event.description || '');

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editedTitle.trim()) {
      onUpdateEvent(editedTitle.trim(), editedDesc.trim() || null);
      setIsEditingEvent(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border shadow-subtle px-4 sm:px-6 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Left: Event Title & Description */}
        <div className="flex-1 min-w-0">
          {isEditingEvent ? (
            <form onSubmit={handleSaveEvent} className="flex flex-col gap-2 max-w-lg">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="px-3 py-1.5 text-base font-semibold border border-accent rounded bg-surface text-charcoal focus:outline-none focus:ring-1 focus:ring-accent w-full"
                  placeholder="Event title..."
                  autoFocus
                />
                <button
                  type="submit"
                  aria-label="Save title"
                  className="p-2 text-accent bg-accent-light rounded hover:bg-accent-light/80 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingEvent(false)}
                  aria-label="Cancel editing"
                  className="p-2 text-charcoal-muted hover:bg-surface rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={editedDesc}
                onChange={(e) => setEditedDesc(e.target.value)}
                className="px-3 py-1 text-xs border border-border rounded bg-surface text-charcoal focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Optional short description..."
              />
            </form>
          ) : (
            <div className="group flex items-start gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-charcoal truncate">
                    {event.title}
                  </h1>
                  <button
                    onClick={() => {
                      setEditedTitle(event.title);
                      setEditedDesc(event.description || '');
                      setIsEditingEvent(true);
                    }}
                    aria-label="Edit event title"
                    className="opacity-60 group-hover:opacity-100 hover:text-accent p-1 rounded transition-opacity"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
                {event.description && (
                  <p className="text-xs sm:text-sm text-charcoal-muted line-clamp-1 mt-0.5">
                    {event.description}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center / Right: Nav Mode & Discovery & Import */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Navigation Views */}
          <nav aria-label="Views" className="flex items-center bg-surface-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => onChangeViewMode('flow')}
              aria-label="Flow view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[38px] ${
                viewMode === 'flow'
                  ? 'bg-surface text-charcoal shadow-subtle'
                  : 'text-charcoal-muted hover:text-charcoal'
              }`}
            >
              <Grid className="w-4 h-4 text-accent" />
              <span>Flow</span>
            </button>
            <button
              onClick={() => onChangeViewMode('timeline')}
              aria-label="Timeline view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[38px] ${
                viewMode === 'timeline'
                  ? 'bg-surface text-charcoal shadow-subtle'
                  : 'text-charcoal-muted hover:text-charcoal'
              }`}
            >
              <Calendar className="w-4 h-4 text-accent" />
              <span>Timeline</span>
            </button>
            <button
              onClick={() => onChangeViewMode('universe')}
              aria-label="Universe view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[38px] ${
                viewMode === 'universe'
                  ? 'bg-surface text-charcoal shadow-subtle'
                  : 'text-charcoal-muted hover:text-charcoal'
              }`}
            >
              <Compass className="w-4 h-4 text-accent" />
              <span>Universe</span>
            </button>
          </nav>

          {/* Prominent Discovery Action: Take Me Somewhere */}
          <button
            onClick={onTakeMeSomewhere}
            className="flex items-center gap-2 px-3.5 py-2 bg-accent hover:bg-accent-hover text-surface rounded-lg text-xs sm:text-sm font-medium shadow-subtle active:scale-[0.98] transition-all min-h-[44px]"
            aria-label="Take me somewhere in the event"
          >
            <Sparkles className="w-4 h-4 text-accent-light" />
            <span className="font-semibold whitespace-nowrap">Take Me Somewhere</span>
          </button>

          {/* Import / Collection Button */}
          <button
            onClick={onOpenImporter}
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-muted text-charcoal border border-border rounded-lg text-xs sm:text-sm font-medium transition-colors min-h-[44px]"
            aria-label="Import local photos or videos"
          >
            <FolderUp className="w-4 h-4 text-accent" />
            <span className="hidden sm:inline">Import</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-muted text-charcoal-muted border border-border">
              {totalMediaCount}
            </span>
          </button>

          {/* Role Switcher Pill */}
          <div className="flex items-center bg-surface-muted p-1 rounded-lg border border-border">
            <button
              onClick={onToggleRole}
              aria-label={currentRole === 'admin' ? 'Switch to Visitor mode' : 'Login as Admin'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[38px] ${
                currentRole === 'admin'
                  ? 'bg-accent text-white shadow-subtle'
                  : 'text-charcoal-muted hover:text-charcoal'
              }`}
            >
              {currentRole === 'admin' ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Visitor</span>
                </>
              )}
            </button>
          </div>

          {/* Admin Protected Action Buttons */}
          {currentRole === 'admin' && (
            <>
              <button
                onClick={onOpenDriveConfig}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-muted text-charcoal border border-border rounded-lg text-xs font-medium transition-colors min-h-[44px]"
                aria-label="Google Drive & AI Settings"
                title="Google Drive & AI Settings"
              >
                <FolderSync className="w-4 h-4 text-accent" />
                <span className="hidden md:inline">Drive & AI</span>
                {isDriveConnected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Drive connected" />
                )}
              </button>

              <button
                onClick={onOpenReviewQueue}
                className="relative flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-muted text-charcoal border border-border rounded-lg text-xs font-medium transition-colors min-h-[44px]"
                aria-label="Visitor review queue"
                title="Review visitor suggestions"
              >
                <Inbox className="w-4 h-4 text-accent" />
                <span className="hidden md:inline">Queue</span>
                {pendingSuggestionsCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold">
                    {pendingSuggestionsCount}
                  </span>
                )}
              </button>

              {onOpenSharing && (
                <button
                  onClick={onOpenSharing}
                  className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-muted text-charcoal border border-border rounded-lg text-xs font-medium transition-colors min-h-[44px]"
                  aria-label="Collection Sharing Settings"
                  title="Shareable Collection & Visibility Settings"
                >
                  <Share2 className="w-4 h-4 text-accent" />
                  <span className="hidden md:inline">Sharing</span>
                  {collectionVisibility === 'password' && (
                    <span className="w-2 h-2 rounded-full bg-amber-500" title="Password protected" />
                  )}
                  {collectionVisibility === 'unlisted' && (
                    <span className="w-2 h-2 rounded-full bg-blue-500" title="Unlisted" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Demo status indicator banner */}
      {isDemo && (
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-border/60 flex flex-wrap items-center justify-between text-xs text-charcoal-muted gap-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-accent"></span>
            <span>Sample Demo Collection (14 local items across 5 moments)</span>
          </div>
          <button
            onClick={onOpenImporter}
            className="text-accent font-medium hover:underline text-xs py-0.5 min-h-[32px] flex items-center"
          >
            Start my real collection →
          </button>
        </div>
      )}
    </header>
  );
};
