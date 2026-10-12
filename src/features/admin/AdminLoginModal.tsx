import React, { useState } from 'react';
import { Lock, X, KeyRound, AlertCircle } from 'lucide-react';
import { loginAsAdmin } from '../../lib/auth';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await loginAsAdmin(passphrase);
      if (res.success) {
        setPassphrase('');
        onSuccess();
        onClose();
      } else {
        setError(res.error || 'Invalid passphrase.');
      }
    } catch {
      setError('An error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-login-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <Lock className="w-5 h-5" />
            </div>
            <h2 id="admin-login-title" className="text-lg font-semibold text-text">
              Admin Authentication
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close admin login"
            className="p-2 text-text/60 hover:text-text hover:bg-bg rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-text/70 leading-relaxed">
          Admin actions (Drive configuration, AI re-grouping, and visitor suggestion approval) are protected by a local session check.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="admin-passphrase"
              className="block text-xs font-semibold uppercase tracking-wider text-text/80 mb-1.5"
            >
              Admin Passphrase
            </label>
            <div className="relative">
              <input
                id="admin-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  setError(null);
                }}
                placeholder="Enter passphrase..."
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 bg-bg rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
              <KeyRound className="w-4 h-4 text-text/40 absolute left-3.5 top-3" />
            </div>
            <p className="mt-1.5 text-xs text-text/50">
              Default local passphrase: <span className="font-mono font-medium text-accent">admin123</span>
            </p>
          </div>

          {error && (
            <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text/70 hover:bg-bg rounded-xl transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !passphrase.trim()}
              className="px-5 py-2 text-sm font-medium bg-accent text-white rounded-xl hover:bg-accent-dark transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Verifying...' : 'Unlock Admin Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
