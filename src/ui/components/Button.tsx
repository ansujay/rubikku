import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../cx'
import { Icon, type IconName } from '../icons'

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'success' | 'reward' | 'danger' | 'ink'
export type ButtonSize = 'sm' | 'md' | 'lg'

const SIZES: Record<ButtonSize, string> = {
  // `sm` is 40px tall; the ::before pad keeps the touch target at 44px+.
  sm: 'h-10 px-3.5 text-sm rounded-sm gap-1.5 before:absolute before:-inset-1 before:content-[""]',
  md: 'h-12 px-5 text-base rounded-md gap-2',
  lg: 'h-14 px-7 text-lg rounded-md gap-2.5',
}
const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

export interface ButtonStyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

/** Class string for anything that should look like a button (links, labels for file inputs). */
export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false }: ButtonStyleProps = {}, extra?: string) {
  return cx(
    'key font-sans font-bold tracking-[-0.005em] whitespace-nowrap',
    `key-${variant}`,
    SIZES[size],
    fullWidth && 'w-full',
    extra,
  )
}

interface ContentProps {
  size: ButtonSize
  iconLeft?: IconName
  iconRight?: IconName
  loading?: boolean
  children?: ReactNode
}

function Content({ size, iconLeft, iconRight, loading, children }: ContentProps) {
  return (
    <>
      {loading ? <Spinner size={ICON_SIZE[size]} /> : iconLeft ? <Icon name={iconLeft} size={ICON_SIZE[size]} weight={2.4} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={ICON_SIZE[size]} weight={2.4} /> : null}
    </>
  )
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'rk-spin 0.7s linear infinite' }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  iconLeft?: IconName
  iconRight?: IconName
  /** Shows a spinner and blocks clicks, keeping the button's width. */
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * The keycap button: a face on an edge that sinks when pressed.
 * <Button variant="primary" size="lg" iconRight="arrowRight">Start lesson</Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  iconLeft,
  iconRight,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content size={size} iconLeft={iconLeft} iconRight={iconRight} loading={loading}>
        {children}
      </Content>
    </button>
  )
}

export interface ButtonLinkProps extends LinkProps, ButtonStyleProps {
  iconLeft?: IconName
  iconRight?: IconName
}

/** A router link that looks and presses like a Button. */
export function ButtonLink({ variant = 'primary', size = 'md', fullWidth, iconLeft, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth }, className)} {...rest}>
      <Content size={size} iconLeft={iconLeft} iconRight={iconRight}>
        {children as ReactNode}
      </Content>
    </Link>
  )
}
