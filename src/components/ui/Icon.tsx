import type { SVGProps } from 'react';

/** Square-capped 20×20 line icons that match the ink-and-rule language. */
const PATHS = {
  plus: 'M10 4v12M4 10h12',
  minus: 'M4 10h12',
  close: 'M5 5l10 10M15 5L5 15',
  check: 'M4 10.5l4 4 8-9',
  chevronDown: 'M5 8l5 5 5-5',
  chevronUp: 'M5 12l5-5 5 5',
  chevronRight: 'M8 5l5 5-5 5',
  chevronLeft: 'M12 5l-5 5 5 5',
  arrowRight: 'M4 10h11M11 5.5l4.5 4.5-4.5 4.5',
  arrowUpRight: 'M6 14L14 6M7.5 6H14v6.5',
  search: 'M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2L16.5 16.5',
  menu: 'M3.5 6h13M3.5 10h13M3.5 14h13',
  reset: 'M10 3.5v3M10 13.5v3M3.5 10h3M13.5 10h3M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
  compare: 'M3.5 16V8M8.5 16V4M13.5 16v-6M16.5 16H2',
  list: 'M7 5.5h9.5M7 10h9.5M7 14.5h9.5M3.5 5.5h.5M3.5 10h.5M3.5 14.5h.5',
  map: 'M2.5 5l5-1.8 5 1.8 5-1.8v11.6l-5 1.8-5-1.8-5 1.8zM7.5 3.2v11.6M12.5 5v11.6',
  layers: 'M10 3l7.5 4-7.5 4-7.5-4zM2.5 11l7.5 4 7.5-4',
  filter: 'M3 5h14M5.5 10h9M8 15h4',
  info: 'M10 9v5.5M10 6.2v.3M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4z',
  external: 'M11.5 3.5h5v5M16.5 3.5L9.5 10.5M14 11.5v5H3.5V6h5',
  expand: 'M5 12l5-5 5 5',
  pin: 'M10 17s-5.5-5.1-5.5-9a5.5 5.5 0 0 1 11 0c0 3.9-5.5 9-5.5 9zM10 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  sort: 'M7 4v12M4 7l3-3 3 3M13 16V4M10 13l3 3 3-3',
  briefcase: 'M3 7h14v9H3zM7.5 7V4.5h5V7M3 11h14',
} as const;

const STAR = 'M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z';

export type IconName = keyof typeof PATHS | 'star' | 'starFilled';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Accessible label; omit for decorative icons (aria-hidden). */
  title?: string;
}

export function Icon({ name, size = 18, title, className, ...rest }: IconProps) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const, focusable: 'false' as const };
  const cls = ['icon', className].filter(Boolean).join(' ');
  if (name === 'star' || name === 'starFilled')
    return (
      <svg viewBox="0 0 20 20" width={size} height={size} className={cls} {...a11y} {...rest}>
        <path d={STAR} fill={name === 'starFilled' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="miter" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} className={cls} {...a11y} {...rest}>
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
