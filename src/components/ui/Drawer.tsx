import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name, e.g. "Halifax details". */
  label: string;
  children: ReactNode;
  side?: 'right' | 'left';
  /**
   * Move focus into the drawer when this value changes while open (pass e.g. the
   * selected id after a keyboard selection). Undefined = never steal focus.
   */
  focusKey?: string | number | null;
  /** 'contained' = absolutely positioned inside the nearest positioned parent (map stays interactive). */
  position?: 'contained' | 'fixed';
  className?: string;
  closeLabel?: string;
}

/** Non-modal side panel. Escape closes while focus is inside. */
export function Drawer({ open, onClose, label, children, side = 'right', focusKey, position = 'contained', className, closeLabel = 'Close' }: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open && focusKey !== undefined && focusKey !== null) ref.current?.focus({ preventScroll: true });
  }, [open, focusKey]);
  if (!open) return null;
  return (
    <aside
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      className={['drawer', `drawer--${side}`, `drawer--${position}`, className].filter(Boolean).join(' ')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <IconButton icon="close" label={closeLabel} className="drawer__close" onClick={onClose} />
      <div className="drawer__body">{children}</div>
    </aside>
  );
}
