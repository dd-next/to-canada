import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface ComboOption<T> {
  key: string;
  /** Text shown in the list and in the input once selected. */
  label: string;
  item: T;
  /** Second line, e.g. "Toronto CMA — includes Mississauga". */
  description?: ReactNode;
  /** Right-aligned meta, e.g. a NOC code. */
  meta?: ReactNode;
}

export interface ComboboxProps<T> {
  label: ReactNode;
  hideLabel?: boolean;
  placeholder?: string;
  /** Options for a query; '' when browsing. Memoise the source data upstream. */
  search: (query: string) => ComboOption<T>[];
  /** Current selection (its label fills the input when not typing). */
  selected?: ComboOption<T> | null;
  onSelect: (option: ComboOption<T> | null) => void;
  /** Search-and-go: empty the input after choosing (city search). */
  clearOnSelect?: boolean;
  /** Open the browse list on focus (otherwise on typing or ArrowDown). */
  openOnFocus?: boolean;
  emptyMessage?: (query: string) => ReactNode;
  hint?: ReactNode;
  /** Cap rendered options to keep the DOM light (default 50). */
  maxResults?: number;
  icon?: IconName;
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  className?: string;
}

function highlight(label: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark>{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  );
}

/**
 * Accessible type-ahead (ARIA 1.2 combobox + listbox). Keyboard: ↓/↑ move,
 * Enter chooses, Escape closes (then clears), Tab leaves. The input keeps focus;
 * the active option is exposed through aria-activedescendant.
 */
export function Combobox<T>({
  label,
  hideLabel,
  placeholder,
  search,
  selected,
  onSelect,
  clearOnSelect,
  openOnFocus,
  emptyMessage,
  hint,
  maxResults = 50,
  icon = 'search',
  size = 'md',
  disabled,
  loading,
  id,
  className,
}: ComboboxProps<T>) {
  const auto = useId();
  const baseId = id ?? `cb-${auto.replace(/:/g, '')}`;
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const hintId = hint ? `${baseId}-hint` : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const text = editing ? query : clearOnSelect ? query : (selected?.label ?? '');
  const all = useMemo(() => (open ? search(editing ? query : '') : []), [open, search, query, editing]);
  const options = all.slice(0, maxResults);
  const more = all.length - options.length;

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, baseId]);

  const choose = (o: ComboOption<T> | null) => {
    onSelect(o);
    setOpen(false);
    setActive(-1);
    setEditing(false);
    setQuery('');
  };

  const openList = (startAt: number) => {
    setOpen(true);
    setActive(startAt);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList(0);
        else if (n) setActive((a) => (a + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList(-1);
        else if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
        break;
      case 'Enter':
        if (open && active >= 0 && options[active]) {
          e.preventDefault();
          choose(options[active]);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (text) {
          e.preventDefault();
          setEditing(true);
          setQuery('');
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const showClear = !clearOnSelect && !!selected && !disabled;
  const status = open
    ? options.length
      ? `${all.length} ${all.length === 1 ? 'result' : 'results'} available. Use up and down arrows to review, Enter to choose.`
      : 'No results.'
    : '';

  return (
    <div className={['field', 'combo', `combo--${size}`, open && 'is-open', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'field__label label'}>
        {label}
      </label>
      <div className="combo__box">
        {icon && <Icon name={icon} size={16} className="combo__icon" />}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${baseId}-opt-${active}` : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setEditing(true);
            setQuery(e.target.value);
            setOpen(e.target.value.length > 0 || !!openOnFocus);
            setActive(e.target.value.length > 0 ? 0 : -1);
          }}
          onFocus={() => {
            if (openOnFocus) openList(-1);
          }}
          onClick={() => {
            if (openOnFocus && !open) openList(-1);
          }}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
            setEditing(false);
            if (clearOnSelect) setQuery('');
          }}
          onKeyDown={onKeyDown}
        />
        {loading && <span className="combo__spinner" aria-hidden="true" />}
        {showClear && (
          <button
            type="button"
            className="combo__clear"
            aria-label={`Clear ${selected?.label ?? 'selection'}`}
            title="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              choose(null);
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size={14} />
          </button>
        )}
        <ul id={listId} role="listbox" aria-label={typeof label === 'string' ? label : undefined} className="combo__list" hidden={!open}>
          {open &&
            options.map((o, i) => (
              <li
                key={o.key}
                id={`${baseId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={['combo__opt', i === active && 'is-active', selected?.key === o.key && 'is-selected'].filter(Boolean).join(' ')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => choose(o)}
              >
                <span className="combo__opt-main">
                  <span className="combo__opt-label">{highlight(o.label, editing ? query : '')}</span>
                  {o.meta && <span className="combo__opt-meta mono">{o.meta}</span>}
                </span>
                {o.description && <span className="combo__opt-desc">{o.description}</span>}
              </li>
            ))}
          {open && options.length === 0 && (
            <li className="combo__empty" role="presentation">
              {emptyMessage ? emptyMessage(query) : `Nothing matches “${query}”.`}
            </li>
          )}
          {open && more > 0 && (
            <li className="combo__more" role="presentation">
              {more} more — keep typing to narrow
            </li>
          )}
        </ul>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
