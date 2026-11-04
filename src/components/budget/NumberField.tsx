import { useEffect, useId, useState, type ReactNode } from 'react';
import { parseAmount } from './scenario';

export interface NumberFieldProps {
  label: ReactNode;
  hideLabel?: boolean;
  /** Current valid value (null = nothing entered). */
  value: number | null;
  onChange: (v: number | null) => void;
  /** Whole dollars shown when not editing (estimates). */
  roundDisplay?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  prefix?: string;
  className?: string;
  badge?: ReactNode;
}

/**
 * Text field for money amounts. Accepts "$1,250.50"; non-numeric, negative and
 * absurdly large input shows an inline error and reports null (never a stale number).
 */
export function NumberField({ label, hideLabel, value, onChange, roundDisplay, placeholder, hint, prefix = '$', className, badge }: NumberFieldProps) {
  const auto = useId();
  const id = `nf-${auto.replace(/:/g, '')}`;
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? null : parseAmount(draft);
  const error = parsed?.error;

  // An outside change (reset, scenario switch) wins over a stale draft.
  useEffect(() => {
    if (draft !== null && draft.trim() !== '' && !parseAmount(draft).error && parseAmount(draft).value !== value) setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const shown =
    draft !== null
      ? draft
      : value === null
        ? ''
        : (roundDisplay ? Math.round(value) : value).toLocaleString('en-CA', { maximumFractionDigits: 2 });

  return (
    <div className={['field', 'nf', error && 'nf--error', className].filter(Boolean).join(' ')}>
      <div className="nf__head">
        <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field__label label'}>
          {label}
        </label>
        {badge}
      </div>
      <div className="nf__box">
        <span className="nf__prefix" aria-hidden="true">
          {prefix}
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            onChange(parseAmount(raw).value);
          }}
          onBlur={() => {
            if (!error) setDraft(null);
          }}
        />
      </div>
      {error ? (
        <p id={`${id}-err`} className="nf__error" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
