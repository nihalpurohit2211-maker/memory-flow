import React, { useState, useRef, useEffect } from 'react';
import { Moment, StorageEstimate } from '../../types';
import {
  X,
  Upload,
  Folder,
  FileImage,
  AlertTriangle,
  CheckCircle,
  HardDrive,
  Copy,
} from 'lucide-react';
import { processMediaFile } from '../../lib/mediaProcessor';
import {
  saveStoredMediaItem,
  saveStoredMembership,
  findStoredMediaByHash,
  saveStoredMoment,
  getStorageEstimate,
  requestPersistentStorage,
} from '../../lib/db';

interface MediaImporterProps {
  eventId: string;
  moments: Moment[];
  targetMomentId: string | null;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportFileQueueItem {
  id: string;
  file: File;
  status: 'queued' | 'processing' | 'imported' | 'duplicate' | 'error';
  errorMessage?: string;
  duplicateName?: string;
  folderHint?: string | null;
}

export const MediaImporter: React.FC<MediaImporterProps> = ({
  eventId,
  moments,
  targetMomentId,
  onClose,
  onImportComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<ImportFileQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(targetMomentId || '');
  const [newMomentName, setNewMomentName] = useState<string>('');
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isCancelledRef = useRef(false);

  // Load storage estimate on mount
  useEffect(() => {
    getStorageEstimate().then(setStorage);
  }, []);

  const handleRequestPersistence = async () => {
    const persisted = await requestPersistentStorage();
    if (persisted) {
      getStorageEstimate().then(setStorage);
    }
  };

  const addFilesToQueue = (fileList: FileList | File[]) => {
    const newItems: ImportFileQueueItem[] = Array.from(fileList).map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      status: 'queued',
    }));
    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
  };

  // Start importing queue
  const startImport = async () => {
    if (queue.length === 0 || isProcessing) return;

    setIsProcessing(true);
    isCancelledRef.current = false;

    // Check storage quota before large import
    const currentStorage = await getStorageEstimate();
    const totalQueueSize = queue.reduce((acc, item) => acc + item.file.size, 0);

    if (currentStorage.quota - currentStorage.usage < totalQueueSize) {
      alert('Warning: Remaining browser storage quota is insufficient for this batch. Import may fail.');
    }

    // Determine target moment
    let finalMomentId = selectedMomentId;
    if (!finalMomentId && newMomentName.trim()) {
      const createdMoment: Moment = {
        id: `moment-${Date.now()}`,
        eventId,
        label: newMomentName.trim(),
        labelSource: 'organizer',
        coverMediaId: null,
        description: 'Created during local media import',
        isDemo: false,
        createdAt: new Date().toISOString(),
      };
      await saveStoredMoment(createdMoment);
      finalMomentId = createdMoment.id;
    }

    const updatedQueue = [...queue];

    for (let i = 0; i < updatedQueue.length; i++) {
      if (isCancelledRef.current) break;

      const item = updatedQueue[i];
      if (item.status === 'imported' || item.status === 'duplicate') continue;

      // Update status to processing
      item.status = 'processing';
      setQueue([...updatedQueue]);

      try {
        const processed = await processMediaFile(item.file, eventId);

        // Check for exact duplicates using SHA-256
        const existing = await findStoredMediaByHash(processed.mediaItem.hash || '');
        if (existing) {
          item.status = 'duplicate';
          item.duplicateName = existing.originalName;

          // If a moment was specified, link existing media to this moment without duplicating storage
          if (finalMomentId) {
            await saveStoredMembership({
              mediaId: existing.id,
              momentId: finalMomentId,
              source: 'manual',
              confidence: 1.0,
            });
          }
        } else {
          // Store new item and raw blob
          await saveStoredMediaItem(processed.mediaItem, processed.blob);

          // Handle Moment membership:
          // 1. Specified moment
          // 2. Folder name hint
          let momentForThisItem = finalMomentId;
          if (!momentForThisItem && processed.folderHint) {
            // Find or create moment from folder name
            const existingFolderMoment = moments.find(
              (m) => m.label.toLowerCase() === processed.folderHint!.toLowerCase()
            );
            if (existingFolderMoment) {
              momentForThisItem = existingFolderMoment.id;
            } else {
              const autoFolderMoment: Moment = {
                id: `moment-folder-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                eventId,
                label: processed.folderHint,
                labelSource: 'imported_folder',
                coverMediaId: processed.mediaItem.id,
                description: `Imported from folder “${processed.folderHint}”`,
                isDemo: false,
                createdAt: new Date().toISOString(),
              };
              await saveStoredMoment(autoFolderMoment);
              momentForThisItem = autoFolderMoment.id;
            }
          }

          if (momentForThisItem) {
            await saveStoredMembership({
              mediaId: processed.mediaItem.id,
              momentId: momentForThisItem,
              source: finalMomentId ? 'manual' : 'imported_folder',
              confidence: 1.0,
            });
          }

          item.status = 'imported';
        }
      } catch (err) {
        item.status = 'error';
        item.errorMessage = (err as Error).message || 'Failed to process file';
      }

      setQueue([...updatedQueue]);
    }

    setIsProcessing(false);
    getStorageEstimate().then(setStorage);
    onImportComplete();
  };

  const importedCount = queue.filter((q) => q.status === 'imported' || q.status === 'duplicate').length;
  const errorCount = queue.filter((q) => q.status === 'error').length;
  const progressPercent = queue.length > 0 ? Math.round((importedCount / queue.length) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="importer-title"
      className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
    >
      <div className="bg-surface border border-border rounded-xl max-w-2xl w-full p-5 sm:p-6 shadow-modal flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h2 id="importer-title" className="text-lg sm:text-xl font-semibold text-charcoal">
              {targetMomentId ? 'Add Media to Moment' : 'Import Local Photos & Videos'}
            </h2>
            <p className="text-xs text-charcoal-muted mt-0.5">
              Strictly local browser storage (IndexedDB). No cloud uploads, telemetry, or external processing.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close importer"
            className="p-1.5 text-charcoal-muted hover:text-charcoal hover:bg-surface-muted rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Storage Health Info Banner */}
        {storage && (
          <div className="my-3 p-3 bg-surface-muted border border-border rounded-lg text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-charcoal">
              <HardDrive className="w-4 h-4 text-accent" />
              <span>
                Browser Storage: <strong>{Math.round(storage.usage / (1024 * 1024))} MB</strong> used of{' '}
                <strong>{Math.round(storage.quota / (1024 * 1024 * 1024))} GB</strong> quota ({storage.percentage}%)
              </span>
            </div>
            {!storage.isPersisted && (
              <button
                onClick={handleRequestPersistence}
                className="text-accent hover:underline font-medium text-[11px]"
              >
                Request persistent storage
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Target Moment Assignment Controls */}
          <div className="space-y-2 bg-background p-3.5 rounded-lg border border-border/80">
            <label className="block text-xs font-semibold text-charcoal">
              Assign to Moment (Optional)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={selectedMomentId}
                onChange={(e) => {
                  setSelectedMomentId(e.target.value);
                  setNewMomentName('');
                }}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs sm:text-sm border border-border rounded bg-surface text-charcoal focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Auto-group by folder context or unassigned</option>
                {moments.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

              {!selectedMomentId && (
                <input
                  type="text"
                  placeholder="Or name a new moment..."
                  value={newMomentName}
                  onChange={(e) => setNewMomentName(e.target.value)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs sm:text-sm border border-border rounded bg-surface text-charcoal focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              isDragging
                ? 'border-accent bg-accent-light/50'
                : 'border-border hover:border-accent-border bg-surface'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-accent-light text-accent flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-charcoal mb-1">
              Drag photos and videos here
            </p>
            <p className="text-xs text-charcoal-muted mb-4">
              Accepts JPEG, PNG, WebP, GIF, MP4, WebM. Originals remain untouched on your disk.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-surface text-xs sm:text-sm font-medium rounded-lg transition-colors shadow-subtle flex items-center gap-2 min-h-[44px]"
              >
                <FileImage className="w-4 h-4" />
                <span>Select Photos / Videos</span>
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2 bg-surface hover:bg-surface-muted border border-border text-charcoal text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 min-h-[44px]"
              >
                <Folder className="w-4 h-4 text-accent" />
                <span>Select Folder</span>
              </button>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory attribute is non-standard but widely supported
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Queue List & Progress */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-charcoal">
                <span>
                  Queue ({queue.length} items) • {importedCount} completed
                  {errorCount > 0 && `, ${errorCount} errors`}
                </span>
                <span>{progressPercent}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-surface-muted rounded-full overflow-hidden border border-border">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* File list */}
              <div className="max-h-48 overflow-y-auto divide-y divide-border/60 border border-border rounded-lg bg-surface">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === 'imported' ? (
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : item.status === 'duplicate' ? (
                        <Copy className="w-4 h-4 text-accent flex-shrink-0" />
                      ) : item.status === 'error' ? (
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : item.status === 'processing' ? (
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <FileImage className="w-4 h-4 text-charcoal-muted flex-shrink-0" />
                      )}
                      <div className="truncate">
                        <p className="font-medium text-charcoal truncate">{item.file.name}</p>
                        <p className="text-[11px] text-charcoal-muted">
                          {Math.round(item.file.size / 1024)} KB
                        </p>
                      </div>
                    </div>

                    <div className="text-right text-[11px] flex-shrink-0">
                      {item.status === 'imported' && (
                        <span className="text-green-700 font-medium">Imported</span>
                      )}
                      {item.status === 'duplicate' && (
                        <span className="text-accent font-medium" title={`Duplicate of ${item.duplicateName}`}>
                          Duplicate Skipped
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-600 font-medium" title={item.errorMessage}>
                          Error: {item.errorMessage}
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="text-accent font-medium">Processing...</span>
                      )}
                      {item.status === 'queued' && (
                        <span className="text-charcoal-muted">Queued</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-border flex items-center justify-between gap-2 mt-2">
          {queue.length > 0 && !isProcessing && (
            <button
              onClick={() => setQueue([])}
              className="px-3 py-1.5 text-xs text-charcoal-muted hover:text-charcoal"
            >
              Clear Queue
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {isProcessing ? (
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-border text-charcoal text-xs sm:text-sm font-medium rounded-lg hover:bg-surface-muted min-h-[44px]"
              >
                Cancel Import
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-border text-charcoal text-xs sm:text-sm font-medium rounded-lg hover:bg-surface-muted min-h-[44px]"
                >
                  {importedCount > 0 ? 'Done' : 'Cancel'}
                </button>
                {queue.length > 0 && queue.some((q) => q.status === 'queued') && (
                  <button
                    onClick={startImport}
                    className="px-5 py-2 bg-accent hover:bg-accent-hover text-surface text-xs sm:text-sm font-medium rounded-lg shadow-subtle min-h-[44px]"
                  >
                    Start Import ({queue.filter((q) => q.status === 'queued').length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
