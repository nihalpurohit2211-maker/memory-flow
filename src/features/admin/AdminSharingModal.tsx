import { useState, FC, useEffect } from 'react';
import {
  X,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  QrCode,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import QRCode from 'qrcode';
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
  const [visibility, setVisibility] = useState<CollectionVisibility>('password');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordHint, setPasswordHint] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // QR Code state
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Admin passphrase change state
  const [showAdminPassChange, setShowAdminPassChange] = useState(false);
  const [newAdminPass, setNewAdminPass] = useState('');
  const [adminPassMessage, setAdminPassMessage] = useState<string | null>(null);
  const [isAdminPassSaving, setIsAdminPassSaving] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173';
  const collectionUrl = `${currentOrigin}/c/${collectionInfo?.slug || 'elevate'}`;
  const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');

  useEffect(() => {
    if (collectionInfo) {
      setVisibility(collectionInfo.visibility || 'password');
      setPasswordHint(collectionInfo.passwordHint || '');
      setPassword('');
    }
  }, [collectionInfo, isOpen]);

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(collectionUrl, { width: 220, margin: 2 }, (err, url) => {
        if (!err && url) {
          setQrCodeUrl(url);
        }
      });
    }
  }, [isOpen, collectionUrl]);

  if (!isOpen) return null;

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
      const res = await updateSharingSettings(collectionInfo?.slug || 'elevate', session.token, {
        visibility,
        password: password.trim() ? password.trim() : undefined,
        passwordHint: passwordHint.trim() || undefined,
        removePassword: visibility === 'public' && collectionInfo?.requiresPassword,
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

  const handleChangeAdminPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPass.trim().length < 6) {
      setAdminPassMessage('Passphrase must be at least 6 characters.');
      return;
    }

    const session = getAdminSession();
    setIsAdminPassSaving(true);
    setAdminPassMessage(null);

    try {
      const res = await fetch('/api/admin/change-passphrase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ newPassphrase: newAdminPass.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to change admin passphrase.');
      }

      setAdminPassMessage('✓ Admin passphrase updated! Use your new passphrase next time you log in.');
      setNewAdminPass('');
      setTimeout(() => {
        setShowAdminPassChange(false);
        setAdminPassMessage(null);
      }, 3500);
    } catch (err: any) {
      setAdminPassMessage(`Error: ${err.message}`);
    } finally {
      setIsAdminPassSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sharing-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-lg bg-surface rounded-xl border border-theme-border shadow-modal p-6 text-text max-h-[90vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          aria-label="Close sharing panel"
          className="absolute top-4 right-4 p-2 text-text-muted hover:text-text rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 text-accent rounded-lg">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 id="sharing-title" className="text-xl font-bold tracking-tight">
              Collection Sharing & Passwords
            </h2>
            <p className="text-xs text-text-muted">
              Configure visitor access and admin credentials for <span className="font-semibold text-text">{collectionInfo?.name || 'ELEVATE 1.0'}</span>
            </p>
          </div>
        </div>

        {/* Shareable Link Bar */}
        <div className="p-3.5 bg-background rounded-lg border border-theme-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Shareable Link
            </label>
            {qrCodeUrl && (
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQr ? 'Hide QR' : 'Show QR Code'}</span>
              </button>
            )}
          </div>

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

          {/* QR Code display */}
          {showQr && qrCodeUrl && (
            <div className="pt-2 text-center bg-surface p-3 rounded-lg border border-theme-border flex flex-col items-center gap-2">
              <img src={qrCodeUrl} alt="Collection QR Code" className="w-36 h-36" />
              <p className="text-[11px] text-text-muted">
                Scan with any smartphone camera to open the gallery.
              </p>
            </div>
          )}

          {/* Localhost disclaimer badge */}
          {isLocalhost && (
            <div className="mt-2.5 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Localhost Address:</strong> This address runs locally. For friends to open it remotely, deploy on Render or another host.
              </span>
            </div>
          )}
        </div>

        {/* Visibility Options */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
            Visitor Access Mode
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
                <span>Password Protected (Private)</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Visitors must enter the collection password before viewing photos or videos.
              </p>
            </div>
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
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Anyone with the link can explore freely without entering a password.
              </p>
            </div>
          </label>
        </div>

        {/* Visitor Password Configuration Section */}
        {visibility === 'password' && (
          <div className="p-4 bg-background rounded-lg border border-theme-border space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-text">
                {collectionInfo?.requiresPassword ? 'Change Visitor Password' : 'Set Visitor Password'}
              </label>
              <span className="text-[11px] text-charcoal-muted">
                Placeholder default: <code className="bg-surface px-1 py-0.5 rounded border border-border">elevate2026</code>
              </span>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={collectionInfo?.requiresPassword ? '•••••••• (leave blank to keep current)' : 'elevate2026'}
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

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Password Hint (Optional)
              </label>
              <input
                type="text"
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                placeholder="e.g. Event year or shared codeword"
                className="w-full px-3 py-2 text-sm bg-surface border border-theme-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Shown to visitors on the unlock screen to help them remember.
              </p>
            </div>
          </div>
        )}

        {/* Admin Password Management Section */}
        <div className="p-3.5 bg-surface-muted rounded-xl border border-theme-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-charcoal">
              <KeyRound className="w-4 h-4 text-accent" />
              <span>Admin Passphrase</span>
            </div>
            <span className="text-[11px] text-charcoal-muted">
              Placeholder default: <code className="bg-surface px-1 py-0.5 rounded border border-border">admin123</code>
            </span>
          </div>

          <p className="text-[11px] text-charcoal-muted">
            The admin password guards administrative actions, Review Queue, and sharing controls.
          </p>

          {showAdminPassChange ? (
            <form onSubmit={handleChangeAdminPassphrase} className="space-y-2 pt-1">
              <input
                type="password"
                value={newAdminPass}
                onChange={(e) => setNewAdminPass(e.target.value)}
                placeholder="Enter new admin passphrase (min 6 chars)"
                required
                className="w-full px-3 py-1.5 text-xs bg-surface border border-theme-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent text-charcoal"
              />
              {adminPassMessage && (
                <p className="text-[11px] text-accent font-medium">{adminPassMessage}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminPassChange(false);
                    setAdminPassMessage(null);
                  }}
                  className="px-2.5 py-1 text-xs text-charcoal-muted hover:bg-surface rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdminPassSaving}
                  className="px-3 py-1 bg-accent text-surface text-xs font-medium rounded hover:bg-accent-hover"
                >
                  {isAdminPassSaving ? 'Saving...' : 'Update Admin Password'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdminPassChange(true)}
              className="text-xs text-accent hover:underline font-medium flex items-center gap-1 pt-1"
            >
              <span>Change Admin Passphrase</span>
            </button>
          )}
        </div>

        {/* Security & Access Notices */}
        <div className="p-3 bg-neutral-100 rounded-lg border border-neutral-200 text-xs text-text-muted space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium text-neutral-800">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>Privacy & Access Notice</span>
          </div>
          <p>
            • A shared password allows anyone who has it to browse the collection without an individual account.
          </p>
          <p>
            • Protecting MemoryFlow does <strong>not</strong> change underlying Google Drive folder permissions.
          </p>
          <p>
            • Updating password or visibility immediately revokes previous visitor access.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {errorMessage}
          </div>
        )}

        {statusMessage && (
          <div className="p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
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
