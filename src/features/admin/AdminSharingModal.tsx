import { useState, FC, useEffect } from 'react';
import { X, Globe, Link2, Lock, Eye, EyeOff, Copy, Check, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';
import { CollectionVisibility, SharedCollectionInfo } from '../../types';
import { updateSharingSettings } from '../../lib/collectionApi';
import { getAdminSession } from '../../lib/auth';

interface AdminSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionInfo: SharedCollectionInfo | null;
  onUpdated: (updated: SharedCollectionInfo) => void;
  onPreviewVisitorView: () => void;
}

export const AdminSharingModal: FC<AdminSharingModalProps> = ({
  isOpen,
  onClose,
  collectionInfo,
  onUpdated,
  onPreviewVisitorView,
}) => {
  const [visibility, setVisibility] = useState<CollectionVisibility>('public');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordHint, setPasswordHint] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (collectionInfo) {
      setVisibility(collectionInfo.visibility || 'public');
      setPasswordHint(collectionInfo.passwordHint || '');
      setPassword('');
    }
  }, [collectionInfo, isOpen]);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173';
  const collectionUrl = `${currentOrigin}/c/elevate`;
  const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');

  const handleCopyLink = () => {
    navigator.clipboard.writeText(collectionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = async () => {
    const session = getAdminSession();
    if (!session.token) {
      setErrorMessage('Admin session expired. Please re-authenticate.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await updateSharingSettings('elevate', session.token, {
        visibility,
        password: password.trim() ? password.trim() : undefined,
        passwordHint: passwordHint.trim() || undefined,
        removePassword: visibility !== 'password' && collectionInfo?.requiresPassword,
      });

      if (collectionInfo) {
        onUpdated({
          ...collectionInfo,
          visibility: res.visibility,
          requiresPassword: res.hasPassword,
          passwordHint: res.passwordHint,
          updatedAt: new Date().toISOString(),
        });
      }

      setStatusMessage('Sharing configuration updated successfully.');
      setTimeout(() => {
        setStatusMessage(null);
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sharing-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-lg bg-surface rounded-xl border border-theme-border shadow-modal p-6 text-text max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close sharing panel"
          className="absolute top-4 right-4 p-2 text-text-muted hover:text-text rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-accent/10 text-accent rounded-lg">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 id="sharing-title" className="text-xl font-bold tracking-tight">
              Collection Sharing
            </h2>
            <p className="text-xs text-text-muted">
              Configure access for <span className="font-semibold text-text">ELEVATE 1.0</span> (/c/elevate)
            </p>
          </div>
        </div>

        {/* Shareable Link Bar */}
        <div className="my-5 p-3.5 bg-background rounded-lg border border-theme-border/80">
          <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
            Collection Link
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surface px-3 py-2 rounded border border-theme-border text-xs font-mono text-text truncate">
              {collectionUrl}
            </div>
            <button
              onClick={handleCopyLink}
              className="px-3 py-2 bg-surface hover:bg-theme-border/40 text-text border border-theme-border rounded font-medium text-xs flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-text-muted" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Localhost disclaimer badge */}
          {isLocalhost && (
            <div className="mt-2.5 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Localhost Address:</strong> This address is only accessible on this machine. Anyone over the internet will require hosting deployment before this link can be reached remotely.
              </span>
            </div>
          )}
        </div>

        {/* Visibility Options */}
        <div className="space-y-3 mb-5">
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
            Visibility Mode
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              visibility === 'public'
                ? 'bg-accent/5 border-accent text-text ring-1 ring-accent'
                : 'bg-surface border-theme-border hover:bg-background/80'
            }`}
          >
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
              className="mt-1 text-accent focus:ring-accent"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-semibold text-sm">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>Public</span>
                <span className="text-[11px] font-normal px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded">Default</span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Anyone with the link can explore freely. No account or password required.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              visibility === 'unlisted'
                ? 'bg-accent/5 border-accent text-text ring-1 ring-accent'
                : 'bg-surface border-theme-border hover:bg-background/80'
            }`}
          >
            <input
              type="radio"
              name="visibility"
              value="unlisted"
              checked={visibility === 'unlisted'}
              onChange={() => setVisibility('unlisted')}
              className="mt-1 text-accent focus:ring-accent"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-semibold text-sm">
                <Link2 className="w-4 h-4 text-blue-600" />
                <span>Unlisted</span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Accessible to anyone who has the direct link, excluded from any public discovery indexes.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              visibility === 'password'
                ? 'bg-accent/5 border-accent text-text ring-1 ring-accent'
                : 'bg-surface border-theme-border hover:bg-background/80'
            }`}
          >
            <input
              type="radio"
              name="visibility"
              value="password"
              checked={visibility === 'password'}
              onChange={() => setVisibility('password')}
              className="mt-1 text-accent focus:ring-accent"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-semibold text-sm">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Password Protected</span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Visitors must enter the collection password before viewing photos, moments, or metadata.
              </p>
            </div>
          </label>
        </div>

        {/* Password Configuration Section */}
        {visibility === 'password' && (
          <div className="p-4 bg-background rounded-lg border border-theme-border mb-5 space-y-3 animate-fade-in">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                {collectionInfo?.requiresPassword ? 'Set New Password (leave blank to keep current)' : 'Set Password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={collectionInfo?.requiresPassword ? '••••••••' : 'Enter collection password'}
                  className="w-full px-3 py-2 pr-10 text-sm bg-surface border border-theme-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-text-muted hover:text-text"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Password Hint (Optional)
              </label>
              <input
                type="text"
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                placeholder="e.g. The year the event was founded"
                className="w-full px-3 py-2 text-sm bg-surface border border-theme-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Visible to visitors below the password input on the collection unlock screen.
              </p>
            </div>

            {collectionInfo?.requiresPassword && (
              <button
                type="button"
                onClick={() => {
                  setVisibility('public');
                  setPassword('');
                  setPasswordHint('');
                }}
                className="text-xs text-red-600 hover:text-red-700 font-medium underline"
              >
                Remove password protection
              </button>
            )}
          </div>
        )}

        {/* Security & Access Notices */}
        <div className="p-3 bg-neutral-100 rounded-lg border border-neutral-200 text-xs text-text-muted space-y-1.5 mb-5">
          <div className="flex items-center gap-1.5 font-medium text-neutral-800">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>Important Privacy Context</span>
          </div>
          <p>
            • A shared password allows anyone who receives it to view this collection. It does not verify or identify individual visitors.
          </p>
          <p>
            • Protecting MemoryFlow does <strong>not</strong> modify or make an already-public Google Drive folder private.
          </p>
          <p>
            • Changing visibility or updating the password immediately invalidates previous visitor sessions.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {errorMessage}
          </div>
        )}

        {statusMessage && (
          <div className="p-3 mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
            {statusMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-theme-border">
          <button
            type="button"
            onClick={() => {
              onPreviewVisitorView();
              onClose();
            }}
            className="w-full sm:w-auto px-3.5 py-2 text-xs font-medium text-text bg-surface hover:bg-background border border-theme-border rounded-lg flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
            <span>Preview Visitor View</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-text-muted hover:text-text rounded-lg min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent/90 rounded-lg shadow-sm disabled:opacity-50 min-h-[44px]"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
