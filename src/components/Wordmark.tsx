import { PRODUCT } from '../config';

/** Original north-arrow glyph: a split needle, ink west half, brick east half, on a rule. */
export function NorthGlyph({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={['north-glyph', className].filter(Boolean).join(' ')} aria-hidden="true" focusable="false">
      <path d="M12 1.5 L12 17 L4.5 22 Z" fill="currentColor" />
      <path d="M12 1.5 L19.5 22 L12 17 Z" fill="var(--glyph-accent, #a63d2a)" />
    </svg>
  );
}

/** Product wordmark. The name comes from PRODUCT.name (configurable at build time). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={['wordmark', className].filter(Boolean).join(' ')}>
      <NorthGlyph />
      <span className="wordmark__name">{PRODUCT.name}</span>
    </span>
  );
}
