import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Accessible / tooltip text when the label is abbreviated or an icon. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible group name (visible label is up to the caller). */
  label: string;
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: 'sm' | 'md';
  /** Stretch segments to fill the width. */
  block?: boolean;
  className?: string;
  id?: string;
}

/**
 * Single-choice segmented control with radio-group semantics: one tab stop,
 * arrow keys move and select, Home/End jump.
 */
export function SegmentedControl<V extends string>({ label, options, value, onChange, size = 'md', block, className, id }: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = options.findIndex((o) => o.value === value);
  const focusable = current >= 0 && !options[current].disabled ? current : enabled[0];

  const move = (e: KeyboardEvent, from: number) => {
    let next: number | undefined;
    const pos = enabled.indexOf(from);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={['seg', `seg--${size}`, block && 'seg--block', className].filter(Boolean).join(' ')}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.title}
            title={o.title}
            disabled={o.disabled}
            tabIndex={i === focusable ? 0 : -1}
            className={checked ? 'seg__opt is-on' : 'seg__opt'}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
