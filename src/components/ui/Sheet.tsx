import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon } from './Icon';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. */
  label: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Always-visible compact summary. */
  peek: ReactNode;
  /** Shown when expanded (scrolls inside the sheet). */
  children?: ReactNode;
  focusKey?: string | number | null;
  className?: string;
}

/** Mobile bottom sheet: compact peek, expand via handle (tap or drag), Escape closes. */
export function Sheet({ open, onClose, label, expanded, onExpandedChange, peek, children, focusKey, className }: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (open && focusKey !== undefined && focusKey !== null) ref.current?.focus({ preventScroll: true });
  }, [open, focusKey]);
  if (!open) return null;
  return (
    <section
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      className={['sheet', expanded && 'is-expanded', className].filter(Boolean).join(' ')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          if (expanded) onExpandedChange(false);
          else onClose();
        }
      }}
    >
      <div className="sheet__bar">
        <button
          type="button"
          className="sheet__handle"
          aria-expanded={expanded}
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, moved: false };
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dy = e.clientY - d.y;
            if (Math.abs(dy) > 36 && !d.moved) {
              d.moved = true;
              if (dy < 0) onExpandedChange(true);
              else if (expanded) onExpandedChange(false);
              else onClose();
            }
          }}
          onPointerUp={() => {
            suppressClick.current = !!drag.current?.moved;
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onExpandedChange(!expanded);
          }}
        >
          <span className="sheet__grip" aria-hidden="true" />
          <span className="label">{expanded ? 'Show less' : 'Show details'}</span>
          <Icon name={expanded ? 'chevronDown' : 'chevronUp'} size={14} />
        </button>
        <IconButton icon="close" label="Close" size="sm" onClick={onClose} />
      </div>
      <div className="sheet__body">
        <div className="sheet__peek">{peek}</div>
        {expanded && children && <div className="sheet__more">{children}</div>}
      </div>
    </section>
  );
}
