import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { cx, Icon, Logo, Sheet, springs } from '../ui'
import { isActive, NAV_GROUPS, PHONE_MORE, PHONE_TABS, type NavItem } from './nav'
import { prefetchRoute } from './routes'
import { PlayerCard, StreakPill, XpPill } from './PlayerStatus'
import { ThemeSwitch, ThemeToggleButton } from './ThemeToggle'

// ───────────────────────── Sidebar (tablet + desktop) ─────────────────────────

/** Fetch a page's code as soon as he shows interest in its link. */
const prefetchProps = (to: string) => ({
  onPointerEnter: () => prefetchRoute(to),
  onFocus: () => prefetchRoute(to),
  onTouchStart: () => prefetchRoute(to),
})

/**
 * Landscape tablet and up: icon + label in a row. Portrait tablet (the rail): the label sits
 * under the icon — never an unlabelled icon.
 */
function SideLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation()
  const active = isActive(item, pathname)
  return (
    <NavLink
      to={item.to}
      end={item.end}
      {...prefetchProps(item.to)}
      className={cx(
        'group relative flex items-center rounded-md font-bold transition-colors duration-150',
        'h-11 gap-3 px-3 text-[0.9375rem]',
        'max-lg:h-[3.375rem] max-lg:flex-col max-lg:justify-center max-lg:gap-0.5 max-lg:px-0.5 max-lg:text-xs max-lg:leading-[0.875rem]',
        active ? 'text-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      {active ? (
        <motion.span layoutId="side-active" transition={springs.layout} className="absolute inset-0 rounded-md border border-line bg-surface shadow-1" />
      ) : (
        <span className="absolute inset-0 rounded-md bg-inset opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      )}
      <span className={cx('relative grid place-items-center transition-colors duration-150', active && 'text-accent-text')}>
        <Icon name={item.icon} size={21} weight={active ? 2.3 : 2} />
      </span>
      <span className="relative max-w-full truncate max-lg:text-center">{item.short ?? item.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-(--rail-w) flex-col border-r border-line bg-bg md:flex lg:w-(--sidebar-w)">
      <Link to="/" aria-label="Rubikku home" className="flex h-[4.25rem] shrink-0 items-center px-5 max-lg:justify-center max-lg:px-0">
        <span className="lg:hidden">
          <Logo size={34} markOnly />
        </span>
        <span className="max-lg:hidden">
          <Logo size={30} />
        </span>
      </Link>

      <nav aria-label="Main" className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-2 max-lg:px-2">
        {NAV_GROUPS.map((group, i) => (
          <div key={i} className={cx('flex flex-col gap-0.5', i > 0 && 'mt-2 border-t border-line pt-2 max-lg:mt-1.5 max-lg:pt-1.5')}>
            {group.map((item) => (
              <SideLink key={item.to} item={item} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-2.5 p-3 max-lg:p-2">
        <div className="max-lg:hidden">
          <PlayerCard />
        </div>
        <div className="lg:hidden">
          <PlayerCard compact />
        </div>
        <ThemeSwitch compact className="max-lg:hidden" />
        <div className="lg:hidden">
          <ThemeToggleButton layout="stack" />
        </div>
      </div>
    </aside>
  )
}

// ───────────────────────── Phone: top bar + tab bar ─────────────────────────

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-(--topbar-h) items-center justify-between gap-2 border-b border-line bg-bg px-4 md:hidden">
      <Link to="/" aria-label="Rubikku home" className="flex min-h-11 items-center">
        <Logo size={26} />
      </Link>
      <div className="flex items-center gap-1.5">
        <Link to="/progress" aria-label="Open progress" className="flex min-h-11 items-center gap-1.5 rounded-full">
          <StreakPill />
          <XpPill />
        </Link>
        <ThemeToggleButton />
      </div>
    </header>
  )
}

function TabLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation()
  const active = isActive(item, pathname)
  return (
    <NavLink
      to={item.to}
      end={item.end}
      {...prefetchProps(item.to)}
      className={cx('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors duration-150', active ? 'text-ink' : 'text-ink-muted')}
    >
      <TabGlyph icon={item.icon} active={active} />
      {item.short ?? item.label}
    </NavLink>
  )
}

function TabGlyph({ icon, active }: { icon: NavItem['icon']; active: boolean }) {
  return (
    <span className="relative grid h-8 w-14 place-items-center">
      {active && <motion.span layoutId="tab-active" transition={springs.layout} className="absolute inset-0 rounded-full bg-accent-soft" />}
      <motion.span animate={{ y: active ? -1 : 0, scale: active ? 1.06 : 1 }} transition={springs.snappy} className={cx('relative', active && 'text-accent-text')}>
        <Icon name={icon} size={22} weight={active ? 2.3 : 2} />
      </motion.span>
    </span>
  )
}

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const moreActive = PHONE_MORE.some((item) => isActive(item, pathname))
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] items-stretch border-t border-line bg-surface px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {PHONE_TABS.map((item) => (
          <TabLink key={item.to} item={item} />
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={cx('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors duration-150', moreActive ? 'text-ink' : 'text-ink-muted')}
        >
          <TabGlyph icon="more" active={moreActive} />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" size="lg">
        <ul className="grid grid-cols-3 gap-2.5">
          {PHONE_MORE.map((item) => {
            const active = isActive(item, pathname)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  {...prefetchProps(item.to)}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-24 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-sm font-bold transition-transform duration-150 active:scale-95',
                    active ? 'border-transparent bg-accent-soft text-accent-text' : 'border-line bg-surface-2 text-ink',
                  )}
                >
                  <Icon name={item.icon} size={24} />
                  {item.short ?? item.label}
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="mt-5">
          <p className="eyebrow mb-2">Theme</p>
          <ThemeSwitch />
        </div>
      </Sheet>
    </>
  )
}
