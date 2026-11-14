/**
 * Rubikku icon set: 24px grid, 2px rounded strokes, drawn inline so they inherit
 * `currentColor` and work offline. Usage: <Icon name="flame" size={20} />
 */
import type { ReactNode, SVGProps } from 'react'

const d = (path: string) => <path d={path} />

const ICONS = {
  // Navigation
  home: d('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'),
  route: (
    <>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5" />
    </>
  ),
  cube: d('M12 3 3.5 7.5v9L12 21l8.5-4.5v-9zM3.5 7.5 12 12l8.5-4.5M12 12v9'),
  notation: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="M9 16V8h3a2.5 2.5 0 0 1 0 5H9m3 0 2.5 3M16.5 8l-.5 2.5" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="7" width="13" height="14" rx="2.5" />
      <path d="M8 3.5h10.5A2.5 2.5 0 0 1 21 6v11.5" />
    </>
  ),
  wand: d('m3 21 9.5-9.5M15 3v2.5M15 12.5V15M9 9h2.5M18.5 9H21M18.2 5.8l1.3-1.3M18.2 12.2l1.3 1.3M11.8 5.8l-1.3-1.3'),
  timer: (
    <>
      <circle cx="12" cy="14" r="7.5" />
      <path d="M12 14V10.5M9.5 2.5h5M12 2.5v4" />
    </>
  ),
  trophy: d('M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H4.5a3.5 3.5 0 0 0 3.6 3.5M16 6h3.5a3.5 3.5 0 0 1-3.6 3.5M12 13.5V17M8 20.5h8M9.5 17h5v3.5h-5z'),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0" />
      <circle cx="15" cy="6" r="2.5" />
      <circle cx="9" cy="12" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
    </>
  ),
  // Theme
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: d('M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z'),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  // Rewards
  flame: d('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z'),
  bolt: d('M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z'),
  star: d('m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z'),
  medal: (
    <>
      <circle cx="12" cy="15" r="5.5" />
      <path d="M8.5 10.7 6 3h4l2 4.5L14 3h4l-2.5 7.7" />
    </>
  ),
  crown: d('m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z'),
  sparkle: d('m11 3 1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9zM18.5 15.5v5M16 18h5'),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  // Status
  check: d('m5 12.5 4.5 4.5L19 7.5'),
  x: d('M6 6l12 12M18 6 6 18'),
  plus: d('M12 5v14M5 12h14'),
  minus: d('M5 12h14'),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.1" />
    </>
  ),
  alert: d('M12 3.5 2.5 20h19zM12 10v4.5M12 17.2v.1'),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  lightbulb: d('M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-4 10.5c.7.7 1.2 1.5 1.3 2.5h5.4c.1-1 .6-1.8 1.3-2.5A6 6 0 0 0 12 3z'),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Arrows
  chevronRight: d('m9 6 6 6-6 6'),
  chevronLeft: d('m15 6-6 6 6 6'),
  chevronDown: d('m6 9 6 6 6-6'),
  chevronUp: d('m6 15 6-6 6 6'),
  arrowRight: d('M5 12h14M13 6l6 6-6 6'),
  arrowLeft: d('M19 12H5M11 6l-6 6 6 6'),
  // Playback
  play: d('M7.5 4.5v15l12-7.5z'),
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </>
  ),
  stepBack: d('M18 5.5v13L8.5 12zM6 5v14'),
  stepForward: d('M6 5.5v13l9.5-6.5zM18 5v14'),
  restart: d('M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8M3.5 3.5V8H8'),
  rotateCw: d('M20.5 12a8.5 8.5 0 1 1-2.8-6.3L20.5 8M20.5 3.5V8H16'),
  undo: d('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
  redo: d('m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13'),
  shuffle: d('M3 7h3c2 0 3.5 1 4.6 2.8l2.8 4.4C14.5 16 16 17 18 17h3M18 4l3 3-3 3M18 14l3 3-3 3M3 17h3c1.3 0 2.3-.4 3.2-1.2M14.8 8.2C15.7 7.4 16.7 7 18 7h3'),
  gauge: d('m12 14 4-4M4.2 18a9 9 0 1 1 15.6 0'),
  // Sound + files
  volume: d('M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9a4.5 4.5 0 0 1 0 6M18.8 6.5a8.5 8.5 0 0 1 0 11'),
  volumeOff: d('M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16.5 9.5l5 5M21.5 9.5l-5 5'),
  download: d('M12 3.5v11.5M7 10.5l5 5 5-5M4.5 20.5h15'),
  upload: d('M12 15.5V4M7 8.5l5-5 5 5M4.5 20.5h15'),
  trash: d('M4 7h16M9.5 7V4h5v3M6 7l1 13.5h10L18 7M10 11v5.5M14 11v5.5'),
  // Misc
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  layers: d('M12 3 3 8l9 5 9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5'),
  label: d('M5 7V4.5h14V7M12 4.5v15M9 19.5h6'),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="3" />
      <path d="M6.5 10h.1M10.2 10h.1M13.8 10h.1M17.5 10h.1M7.5 14h9" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  motion: d('M3 8h9M3 12h13M3 16h7M17 5l4 7-4 7'),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS
export const ICON_NAMES = Object.keys(ICONS) as IconName[]
export const isIconName = (name: string): name is IconName => name in ICONS

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Pixel size of the square. Default 20. */
  size?: number
  /** Stroke width on the 24px grid. Default 2. */
  weight?: number
  /** Fill the shape as well as stroking it (play, star, flame, bolt look good filled). */
  filled?: boolean
  /** Accessible name. Omit for decorative icons (the default): they are hidden from screen readers. */
  title?: string
}

export function Icon({ name, size = 20, weight = 2, filled = false, title, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {ICONS[name]}
    </svg>
  )
}
