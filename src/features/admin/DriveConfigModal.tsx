import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { DriveConfig } from '../../types';
import { extractDriveFolderId } from '../../lib/driveClient';
import {
  syncDriveFolder,
  seedSimulatedDriveFolder,
  DriveSyncProgress,
} from '../../lib/driveSync';
import { assertAdminAccess } from '../../lib/auth';
import { processCollectionEmbeddings, EmbeddingProgress } from '../../lib/ai/embeddingPipeline';
import { performMultiSignalClustering } from '../../lib/ai/clustering';
import {
  saveDriveConfig,
  loadDriveConfig,
  loadAllStoredMedia,
  loadAllStoredMoments,
  loadAllStoredMemberships,
  loadAllStoredConnections,
  saveStoredMoment,
  saveStoredMembership,
  saveStoredConnection,
} from '../../lib/db';
import { syncCollectionToServer } from '../../lib/collectionApi';

interface DriveConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  onDataUpdated: () => void;
}

export const DriveConfigModal: React.FC<DriveConfigModalProps> = ({
  isOpen,
  onClose,
  eventId,
  onDataUpdated,
}) => {
  const [folderInput, setFolderInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [autoSync, setAutoSync] = useState(true);

  const [config, setConfig] = useState<DriveConfig | null>(null);
  const [syncProgress, setSyncProgress] = useState<DriveSyncProgress | null>(null);
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDriveConfig().then((cfg) => {
        if (cfg) {
          setConfig(cfg);
          setFolderInput(cfg.folderUrl || cfg.folderId);
          setApiKey(cfg.apiKey || '');
          setAccessToken(cfg.accessToken || '');
          setAutoSync(cfg.autoSync);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveAndSync = async () => {
    try {
      assertAdminAccess('Configuring Google Drive');
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    const folderId = extractDriveFolderId(folderInput);
    if (!folderId) {
      setError('Please provide a valid Google Drive Folder ID or Share Link.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);

    const newConfig: DriveConfig = {
      folderId,
      folderUrl: folderInput.trim(),
      apiKey: apiKey.trim() || null,
      accessToken: accessToken.trim() || null,
      autoSync,
      lastSyncedAt: null,
      status: 'syncing',
      indexedCount: 0,
      totalDiscovered: 0,
    };

    try {
      await saveDriveConfig(newConfig);
      setConfig(newConfig);

      const res = await syncDriveFolder(newConfig, eventId, (progress) => {
        setSyncProgress(progress);
      });

      // Synchronize immediately to the server so visitors can see the photos!
      try {
        const storedMedia = await loadAllStoredMedia();
        const storedMoments = await loadAllStoredMoments();
        const storedMemberships = await loadAllStoredMemberships();
        const storedConnections = await loadAllStoredConnections();

        await syncCollectionToServer('elevate', {
          moments: storedMoments,
          mediaItems: storedMedia,
          memberships: storedMemberships,
          connections: storedConnections,
        });
      } catch (syncErr) {
        console.warn('Failed to push synced items to server:', syncErr);
      }

      setSuccessMsg(`Successfully synchronized ${res.totalDiscovered} files and published to visitors!`);
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulatedConnect = async () => {
    try {
      assertAdminAccess('Connecting Simulated Drive');
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setError(null);
    setIsProcessing(true);
    setSuccessMsg(null);

    try {
      await seedSimulatedDriveFolder(eventId, (progress) => {
        setSyncProgress(progress);
      });

      // Synchronize immediately to the server so visitors can see them!
      try {
        const storedMedia = await loadAllStoredMedia();
        const storedMoments = await loadAllStoredMoments();
        const storedMemberships = await loadAllStoredMemberships();
        const storedConnections = await loadAllStoredConnections();

        await syncCollectionToServer('elevate', {
          moments: storedMoments,
          mediaItems: storedMedia,
          memberships: storedMemberships,
          connections: storedConnections,
        });
      } catch (syncErr) {
        console.warn('Failed to push simulated items to server:', syncErr);
      }

      const updated = await loadDriveConfig();
      if (updated) {
        setConfig(updated);
        setFolderInput(updated.folderUrl);
      }
      setSuccessMsg('Simulated Google Drive folder connected and published to visitors!');
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunAIClustering = async () => {
    try {
      assertAdminAccess('Running AI Grouping Pipeline');
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);

    try {
      const allMedia = await loadAllStoredMedia();
      const existingMoments = await loadAllStoredMoments();
      const existingMemberships = await loadAllStoredMemberships();

      // Step 1: Process visual embeddings
      const embeddings = await processCollectionEmbeddings(allMedia, (prog) => {
        setEmbeddingProgress(prog);
      });

      // Step 2: Multi-signal clustering
      const clusteringResult = performMultiSignalClustering(
        eventId,
        allMedia,
        embeddings,
        existingMoments,
        existingMemberships
      );

      // Persist newly discovered moments, memberships, and connections
      for (const m of clusteringResult.moments) {
        await saveStoredMoment(m);
      }
      for (const mem of clusteringResult.memberships) {
        await saveStoredMembership(mem);
      }
      for (const conn of clusteringResult.connections) {
        await saveStoredConnection(conn);
      }

      setSuccessMsg(
        `AI Analysis complete: Discovered ${clusteringResult.moments.length} moments (${clusteringResult.provisionalCount} provisional), ${clusteringResult.nearDuplicates.length} near-duplicates flagged.`
      );
      onDataUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-config-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div className="bg-surface rounded-2xl max-w-xl w-full p-6 shadow-xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h2 id="drive-config-title" className="text-lg font-semibold text-text">
                Google Drive Configuration
              </h2>
              <p className="text-xs text-text/60">
                Protected Admin Source Settings
                {config?.lastSyncedAt && ` · Synced ${config.indexedCount} files`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Drive settings"
            className="p-2 text-text/60 hover:text-text hover:bg-bg rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational banner */}
        <div className="mt-4 p-3 bg-accent/5 rounded-xl border border-accent/15 text-xs text-text/80 space-y-1">
          <p className="font-semibold text-accent">Drive Read-Only Streaming</p>
          <p>
            Files stream directly into local memory with progressive thumbnails. 
            Original files on Google Drive are never altered, and visitors cannot upload.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1">
              Google Drive Folder Link or ID
            </label>
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/1abc... or Folder ID"
              className="w-full px-3.5 py-2.5 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1">
                Google API Key (Optional)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="For public shared folders"
                className="w-full px-3 py-2 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1">
                OAuth Access Token (Optional)
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Bearer ya29.a0..."
                className="w-full px-3 py-2 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-xs"
              />
            </div>
          </div>

          {/* Quick Demo Option */}
          <div className="p-3.5 bg-bg rounded-xl border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-text">Testing without live API Key?</div>
              <div className="text-xs text-text/60">
                Connect a realistic multi-camera sample folder with authentic capture timestamps.
              </div>
            </div>
            <button
              type="button"
              onClick={handleSimulatedConnect}
              disabled={isProcessing}
              className="px-3.5 py-1.5 text-xs font-medium bg-surface hover:bg-white text-accent border border-accent/30 rounded-lg transition-colors whitespace-nowrap min-h-[36px]"
            >
              Connect Sample Drive Folder
            </button>
          </div>

          {/* Sync Progress Bar */}
          {syncProgress && syncProgress.status === 'syncing' && (
            <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-accent">Syncing from Drive...</span>
                <span>{syncProgress.processedCount} files</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      syncProgress.discoveredCount > 0
                        ? (syncProgress.processedCount / syncProgress.discoveredCount) * 100
                        : 20
                    }%`,
                  }}
                />
              </div>
              <div className="text-xs text-text/60">Folder: {syncProgress.currentFolder}</div>
            </div>
          )}

          {/* AI Embedding Progress */}
          {embeddingProgress && embeddingProgress.isProcessing && (
            <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-accent flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing CPU Visual Embeddings...</span>
                </span>
                <span>
                  {embeddingProgress.completed} / {embeddingProgress.total}
                </span>
              </div>
              <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(embeddingProgress.completed / Math.max(1, embeddingProgress.total)) * 100}%`,
                  }}
                />
              </div>
              <div className="text-xs text-text/60">{embeddingProgress.statusText}</div>
            </div>
          )}

          {error && (
            <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start space-x-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleRunAIClustering}
              disabled={isProcessing}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-bg hover:bg-border/60 text-accent border border-accent/40 rounded-xl transition-colors min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" />
              <span>Run AI Multi-Signal Grouping</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-text/70 hover:bg-bg rounded-xl min-h-[44px]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveAndSync}
                disabled={isProcessing || !folderInput.trim()}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-accent text-white rounded-xl hover:bg-accent-dark transition-colors disabled:opacity-50 min-h-[44px]"
              >
                <FolderSync className="w-4 h-4" />
                <span>{isProcessing ? 'Syncing...' : 'Save & Sync Drive'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
