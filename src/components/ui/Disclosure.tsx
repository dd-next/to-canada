import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'plain' | 'boxed' | 'rule';
  className?: string;
}

/** Button + region disclosure (aria-expanded / aria-controls). */
export function Disclosure({ summary, children, defaultOpen = false, open, onOpenChange, variant = 'rule', className }: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const id = useId();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return (
    <div className={['disclosure', `disclosure--${variant}`, isOpen && 'is-open', className].filter(Boolean).join(' ')}>
      <button type="button" className="disclosure__summary" aria-expanded={isOpen} aria-controls={id} onClick={toggle}>
        <span className="disclosure__title">{summary}</span>
        <Icon name="chevronDown" size={16} className="disclosure__chev" />
      </button>
      <div id={id} className="disclosure__body" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
