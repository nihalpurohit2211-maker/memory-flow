import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (query: string) => void;
  onClear: () => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search memories, places, activities...',
  inputRef: externalRef,
}) => {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = externalRef || localRef;

  // Shortcut key: "/" to focus search input (when not typing in another input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        ref.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ref]);

  return (
    <div className="relative flex items-center w-full max-w-xs sm:max-w-sm">
      <div className="absolute left-3 pointer-events-none text-charcoal-muted">
        <Search className="w-4 h-4" />
      </div>

      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search memories"
        className="w-full pl-9 pr-14 py-1.5 text-xs sm:text-sm bg-surface border border-border rounded-full text-charcoal placeholder-charcoal-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all shadow-subtle min-h-[38px]"
      />

      <div className="absolute right-2.5 flex items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="p-1 rounded-full hover:bg-surface-muted text-charcoal-muted hover:text-charcoal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-charcoal-muted bg-surface-muted border border-border/80 rounded">
            /
          </kbd>
        )}
      </div>
    </div>
  );
};
