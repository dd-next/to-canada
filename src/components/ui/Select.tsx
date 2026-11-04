import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  label: ReactNode;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | { group: string; options: SelectOption[] })[];
  size?: 'sm' | 'md';
  hint?: ReactNode;
}

/** Styled native select (keeps native keyboard + mobile pickers). */
export function Select({ label, hideLabel, value, onChange, options, size = 'md', hint, className, id, ...rest }: SelectProps) {
  const auto = useId();
  const selectId = id ?? `sel-${auto}`;
  const hintId = hint ? `${selectId}-hint` : undefined;
  return (
    <div className={['field', 'select', `select--${size}`, className].filter(Boolean).join(' ')}>
      <label htmlFor={selectId} className={hideLabel ? 'sr-only' : 'field__label label'}>
        {label}
      </label>
      <div className="select__box">
        <select id={selectId} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hintId} {...rest}>
          {options.map((o) =>
            'group' in o ? (
              <optgroup key={o.group} label={o.group}>
                {o.options.map((x) => (
                  <option key={x.value} value={x.value} disabled={x.disabled}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ),
          )}
        </select>
        <Icon name="chevronDown" size={16} className="select__chev" />
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
