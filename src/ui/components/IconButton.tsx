import type { ButtonHTMLAttributes, Ref } from 'react'
import { cx } from '../cx'
import { Icon, type IconName } from '../icons'
import type { ButtonVariant } from './Button'
import { Tooltip } from './Tooltip'

export type IconButtonSize = 'sm' | 'md' | 'lg'

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-10 rounded-sm before:absolute before:-inset-1 before:content-[""]',
  md: 'size-12 rounded-md',
  lg: 'size-14 rounded-md',
}
const ICON_SIZE: Record<IconButtonSize, number> = { sm: 18, md: 22, lg: 26 }

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /** Required: the accessible name, also shown as a tooltip. */
  label: string
  variant?: ButtonVariant
  size?: IconButtonSize
  /** Fill the icon shape (for play / star style icons). */
  filled?: boolean
  /** Set false to skip the hover tooltip (the aria-label stays). */
  tooltip?: boolean
  /** Pressed state for toggle buttons. */
  pressed?: boolean
  ref?: Ref<HTMLButtonElement>
}

/** <IconButton icon="undo" label="Undo" onClick={…} /> */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  filled,
  tooltip = true,
  pressed,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cx('key shrink-0', `key-${variant}`, SIZES[size], pressed && 'bg-accent-soft! text-accent-text!', className)}
      {...rest}
    >
      <Icon name={icon} size={ICON_SIZE[size]} filled={filled} />
    </button>
  )
  return tooltip ? <Tooltip label={label}>{button}</Tooltip> : button
}
