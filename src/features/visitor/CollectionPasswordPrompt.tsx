import { useState, FC, FormEvent } from 'react';
import { Lock, Eye, EyeOff, KeyRound, AlertCircle, Sparkles } from 'lucide-react';
import { verifyCollectionPassword } from '../../lib/collectionApi';
import { SharedCollectionInfo } from '../../types';

interface CollectionPasswordPromptProps {
  collection: SharedCollectionInfo;
  onUnlocked: () => void;
}

export const CollectionPasswordPrompt: FC<CollectionPasswordPromptProps> = ({
  collection,
  onUnlocked,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await verifyCollectionPassword(collection.slug, password.trim());
      if (res.success) {
        onUnlocked();
      } else {
        setErrorMessage(res.error || 'Incorrect collection password');
        if (res.remainingAttempts !== undefined) {
          setRemainingAttempts(res.remainingAttempts);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-theme-border rounded-2xl shadow-modal p-8 text-text animate-fade-in">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>MemoryFlow Collection</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {collection.name}
          </h1>
          <p className="text-xs text-text-muted mt-1.5 max-w-xs">
            This collection is protected. Enter the password shared with you by the organizer to explore.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="collection-pwd" className="block text-xs font-semibold text-text mb-1.5">
              Collection Password
            </label>
            <div className="relative">
              <input
                id="collection-pwd"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to unlock"
                autoFocus
                disabled={isVerifying}
                className="w-full px-3.5 py-2.5 pr-10 text-sm bg-background border border-theme-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-3 text-text-muted hover:text-text"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Admin-written Password Hint */}
            {collection.passwordHint && (
              <div className="mt-2.5 p-2.5 bg-background rounded border border-theme-border/80 flex items-start gap-2 text-xs text-text-muted">
                <KeyRound className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-text">Hint:</span> {collection.passwordHint}
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p>{errorMessage}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <p className="text-[11px] mt-0.5 text-red-600">
                    Remaining attempts: {remainingAttempts}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || !password.trim()}
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent/90 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <span>Unlocking...</span>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Unlock Collection</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-theme-border/60 text-center">
          <p className="text-[11px] text-text-muted">
            Browsing requires no account. Password verification is securely validated by the server.
          </p>
        </div>
      </div>
    </div>
  );
};
