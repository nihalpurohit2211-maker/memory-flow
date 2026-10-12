import React, { useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, Sparkles, UserCheck, X } from 'lucide-react';

interface AdminEmbeddingsImportProps {
  collectionSlug: string;
  adminSessionToken: string;
  onClose: () => void;
  onImportComplete?: () => void;
}

export const AdminEmbeddingsImport: React.FC<AdminEmbeddingsImportProps> = ({
  collectionSlug,
  adminSessionToken,
  onClose,
  onImportComplete,
}) => {
  const [embeddingsFile, setEmbeddingsFile] = useState<File | null>(null);
  const [faceGroupsFile, setFaceGroupsFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleImport = async () => {
    if (!embeddingsFile && !faceGroupsFile) {
      setIsError(true);
      setStatusMessage('Please select at least one JSON file (embeddings.json or face_groups.json).');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Uploading and processing AI data...');
    setIsError(false);

    try {
      let importedEmbeddingsCount = 0;
      let importedFaceGroupsCount = 0;

      // 1. Process embeddings if provided
      if (embeddingsFile) {
        const text = await embeddingsFile.text();
        const json = JSON.parse(text);

        const res = await fetch(`/api/collections/${collectionSlug}/admin/import/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminSessionToken}`,
          },
          body: JSON.stringify(json),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to import embeddings.');
        }

        const data = await res.json();
        importedEmbeddingsCount = data.count || 0;
      }

      // 2. Process face groups if provided
      if (faceGroupsFile) {
        const text = await faceGroupsFile.text();
        const json = JSON.parse(text);

        const res = await fetch(`/api/collections/${collectionSlug}/admin/import/face-groups`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminSessionToken}`,
          },
          body: JSON.stringify(json),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to import face groups.');
        }

        const data = await res.json();
        importedFaceGroupsCount = data.count || 0;
      }

      setStatusMessage(
        `✓ Success! Imported ${importedEmbeddingsCount} visual embeddings and ${importedFaceGroupsCount} face clusters.`
      );
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setIsError(true);
      setStatusMessage(err.message || 'Error occurred during import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-modal space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-accent font-semibold text-base">
            <Sparkles className="w-5 h-5" />
            <h3>Import Colab AI Data</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-charcoal-muted hover:text-charcoal rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-charcoal-muted leading-relaxed">
          Upload the JSON files exported from your Google Colab run. Visual embeddings calibrate real CLIP scene tags, and face groups enable editable person clusters with zero client CPU load.
        </p>

        <div className="space-y-4">
          {/* Embeddings JSON input */}
          <div className="p-3.5 bg-surface-muted border border-border rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-charcoal">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-accent" />
                1. CLIP Embeddings (embeddings.json)
              </span>
              {embeddingsFile && <span className="text-[11px] text-accent font-mono">Selected</span>}
            </div>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setEmbeddingsFile(e.target.files?.[0] || null)}
              className="text-xs text-charcoal file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-border file:text-xs file:bg-surface file:text-charcoal hover:file:bg-surface-muted cursor-pointer"
            />
          </div>

          {/* Face groups JSON input */}
          <div className="p-3.5 bg-surface-muted border border-border rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-charcoal">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-accent" />
                2. Face Groups (face_groups.json)
              </span>
              {faceGroupsFile && <span className="text-[11px] text-accent font-mono">Selected</span>}
            </div>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setFaceGroupsFile(e.target.files?.[0] || null)}
              className="text-xs text-charcoal file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-border file:text-xs file:bg-surface file:text-charcoal hover:file:bg-surface-muted cursor-pointer"
            />
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
              isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <p className="leading-snug">{statusMessage}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-charcoal-muted hover:bg-surface-muted rounded-lg"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isSubmitting || (!embeddingsFile && !faceGroupsFile)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-surface text-xs font-medium rounded-lg shadow-subtle transition-colors flex items-center gap-1.5 min-h-[38px]"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Importing...' : 'Upload & Apply'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
