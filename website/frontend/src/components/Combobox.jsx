import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Accessible searchable single-select dropdown ("combobox").
 *
 *   - Click to open, type to filter, click an item to select.
 *   - Keyboard:  ↑ ↓ to highlight, Enter to choose, Esc to close.
 *   - Click-outside closes.
 *
 * Generic over the option shape — caller supplies `getKey`, `getLabel`,
 * `getGroup` (optional) and an optional `renderOption` for icons / hints.
 *
 * Props:
 *   value          currently selected key (or '' for "any")
 *   onChange(key)  called with new key
 *   options        Array of option objects
 *   placeholder    String shown when input is empty
 *   icon           Optional ReactNode rendered inside the input
 *   getKey         (option) => string
 *   getLabel       (option) => string
 *   getGroup       (option) => string?    — small secondary text under label
 *   allOptionLabel Label for the synthetic "any" choice at the top (default 'All')
 *   disabled       Disables the input
 */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Type or pick…',
  icon = null,
  getKey = (o) => o.id,
  getLabel = (o) => o.label,
  getGroup,
  allOptionLabel = 'All',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Compute the visible label for the current selection so the input
  // shows the chosen item's text instead of the raw key.
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const opt = options.find((o) => getKey(o) === value);
    return opt ? getLabel(opt) : '';
  }, [value, options, getKey, getLabel]);

  // When closed, show the selected label in the input. When open, allow
  // the user to type freely to filter — `query` overrides the displayed value.
  const displayValue = open ? query : selectedLabel;

  // Filter logic — case-insensitive substring match against label.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => getLabel(o).toLowerCase().includes(q));
  }, [query, options, getLabel]);

  // Reset highlight whenever the visible list changes.
  useEffect(() => { setHighlight(0); }, [filtered.length, open]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (opt) => {
    onChange(opt ? getKey(opt) : '');
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length /* incl. "All" row */));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight === 0) choose(null); // "All"
      else choose(filtered[highlight - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={
          'flex items-center gap-2 bg-paper border border-slate2 rounded-lg ' +
          'focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent ' +
          'transition px-3 py-2 ' +
          (disabled ? 'opacity-50 pointer-events-none' : '')
        }
      >
        {icon && <span className="text-ink/50 shrink-0">{icon}</span>}
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink placeholder:text-ink/40"
          aria-expanded={open}
          aria-haspopup="listbox"
          autoComplete="off"
        />
        {value && !open && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); choose(null); }}
            aria-label="Clear"
            className="text-ink/40 hover:text-ink shrink-0 text-base leading-none"
          >×</button>
        )}
        <ChevronDown open={open} />
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-paper border border-slate2 rounded-lg shadow-lg py-1"
        >
          <li
            role="option"
            aria-selected={!value}
            onMouseEnter={() => setHighlight(0)}
            onClick={() => choose(null)}
            className={
              'px-3 py-2 text-sm cursor-pointer transition ' +
              (highlight === 0 ? 'bg-slate1' : 'hover:bg-slate1/60') +
              (!value ? ' font-medium' : '')
            }
          >
            {allOptionLabel}
          </li>
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink/50">No matches</li>
          ) : (
            filtered.map((opt, idx) => {
              const key = getKey(opt);
              const isSel = key === value;
              const isHi = highlight === idx + 1;
              return (
                <li
                  key={key}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setHighlight(idx + 1)}
                  onClick={() => choose(opt)}
                  className={
                    'px-3 py-2 text-sm cursor-pointer transition flex items-center justify-between gap-2 ' +
                    (isHi ? 'bg-slate1' : 'hover:bg-slate1/60') +
                    (isSel ? ' font-medium' : '')
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{getLabel(opt)}</span>
                  {getGroup && (
                    <span className="text-xs text-ink/50 shrink-0">{getGroup(opt)}</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function ChevronDown({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={'w-4 h-4 text-ink/40 transition-transform ' + (open ? 'rotate-180' : '')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
