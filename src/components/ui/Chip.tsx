import type { ButtonHTMLAttributes, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export interface ChipProps {
  children: ReactNode;
  /** Optional colour swatch (e.g. a compare colour). */
  swatch?: string;
  tone?: 'default' | 'ink' | 'accent';
  className?: string;
  title?: string;
}

/** Static tag. */
export function Chip({ children, swatch, tone = 'default', className, title }: ChipProps) {
  return (
    <span className={cx('chip', `chip--${tone}`, className)} title={title}>
      {swatch && <span className="chip__swatch" style={{ background: swatch }} aria-hidden="true" />}
      {children}
    </span>
  );
}

export interface ToggleChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Trailing count, e.g. number of places. */
  count?: number;
  swatch?: string;
  size?: 'sm' | 'md';
}

/** Toggle button styled as a chip (aria-pressed). Group several in role="group" with a label. */
export function ToggleChip({ pressed, onPressedChange, count, swatch, size = 'md', className, children, onClick, ...rest }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx('chip', 'chip--toggle', `chip--${size}`, pressed && 'is-on', className)}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onPressedChange?.(!pressed);
      }}
      {...rest}
    >
      {swatch && <span className="chip__swatch" style={{ background: swatch }} aria-hidden="true" />}
      <span>{children}</span>
      {count !== undefined && <span className="chip__count num">{count}</span>}
    </button>
  );
}
