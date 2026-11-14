import type { IconName } from '../ui'

export interface NavItem {
  to: string
  label: string
  /** Shorter label for the phone tab bar. */
  short?: string
  icon: IconName
  /** Match only the exact path (for Home). */
  end?: boolean
}

/** Navigation, grouped: start · learn · cube · you. Order here is the order on screen. */
export const NAV_GROUPS: readonly (readonly NavItem[])[] = [
  [{ to: '/', label: 'Home', icon: 'home', end: true }],
  [
    { to: '/learn', label: 'Learn', icon: 'route' },
    { to: '/notation', label: 'Notation', icon: 'notation' },
    { to: '/algorithms', label: 'Algorithms', icon: 'cards' },
  ],
  [
    { to: '/play', label: 'Free play', short: 'Play', icon: 'cube' },
    { to: '/solve', label: 'Solve my cube', short: 'Solve', icon: 'wand' },
    { to: '/timer', label: 'Timer', icon: 'timer' },
    { to: '/patterns', label: 'Patterns', icon: 'grid' },
  ],
  [
    { to: '/progress', label: 'Progress', icon: 'trophy' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
  ],
]

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flat()

const byPath = (path: string) => NAV_ITEMS.find((item) => item.to === path)!

/** The four destinations on the phone tab bar; everything else is under "More". */
export const PHONE_TABS: readonly NavItem[] = [byPath('/'), byPath('/learn'), byPath('/play'), byPath('/timer')]
export const PHONE_MORE: readonly NavItem[] = NAV_ITEMS.filter((item) => !PHONE_TABS.includes(item))

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(item.to + '/')
}
