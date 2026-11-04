import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  /** primary = solid ink, accent = brick, outline = ink rule, ghost = text only */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  /** Stretch to the container width. */
  block?: boolean;
  children?: ReactNode;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const classes = (variant: ButtonVariant, size: ButtonSize, block?: boolean, extra?: string) =>
  cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', extra);

function Inner({ icon, iconRight, children, size }: CommonProps) {
  const s = size === 'sm' ? 16 : 18;
  return (
    <>
      {icon && <Icon name={icon} size={s} />}
      {children !== undefined && children !== null && <span className="btn__label">{children}</span>}
      {iconRight && <Icon name={iconRight} size={s} />}
    </>
  );
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** Text button. Defaults to type="button". */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon, iconRight, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={classes(variant, size, block, className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </button>
  );
});

export type ButtonLinkProps = CommonProps & LinkProps;

/** react-router Link styled as a button. */
export function ButtonLink({ variant = 'outline', size = 'md', icon, iconRight, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={classes(variant, size, block, className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </Link>
  );
}

export type ButtonAnchorProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** External link styled as a button (opens in a new tab by default). */
export function ButtonAnchor({ variant = 'outline', size = 'md', icon, iconRight = 'external', block, className, children, ...rest }: ButtonAnchorProps) {
  return (
    <a className={classes(variant, size, block, className)} target="_blank" rel="noreferrer noopener" {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </a>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required accessible name (also used as the tooltip). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Toggle state -> aria-pressed. */
  pressed?: boolean;
}

/** Square icon-only button with an accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', pressed, className, type = 'button', title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      className={cx('icon-btn', `icon-btn--${variant}`, `icon-btn--${size}`, pressed && 'is-pressed', className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : size === 'lg' ? 20 : 18} />
    </button>
  );
});
