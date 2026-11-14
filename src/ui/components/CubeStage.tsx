import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { IsoCube, type IsoCubeProps } from './IsoCube'

export type CubeStageFit = 'fill' | 'square' | 'wide'

export interface CubeStageProps {
  /**
   * The cube. Mount <Cube3D> here: it should fill its parent (`absolute inset-0`), with a
   * transparent canvas so the stage's light and floor show through. Transient overlays (a
   * "Solved!" pop) may sit here too; controls may not.
   * When omitted, a still isometric cube stands in.
   */
  children?: ReactNode
  /**
   * The control bar under the cube — use `<StageControls>` from `src/three` (turn the whole
   * cube, mirrors, peek, reset view, a status badge). It is a row of its own, so nothing in it
   * ever covers the cube.
   */
  controls?: ReactNode
  /**
   * Older corner slots. They are no longer drawn over the cube: they go in the control bar
   * (before `controls`: topLeft, bottomLeft · after it: bottomRight, topRight). Prefer `controls`
   * (its `status` is the place for a badge or a meter).
   */
  topLeft?: ReactNode
  topRight?: ReactNode
  bottomLeft?: ReactNode
  bottomRight?: ReactNode
  /**
   * How the cube's view is sized.
   * - `'fill'` (default): the view takes whatever height the stage is given (size the stage
   *   with `className`, e.g. `h-80` or `aspect-square`; the bar comes out of that height).
   * - `'square'` / `'wide'` (4:3): the view is as wide as the stage and as tall as that ratio
   *   allows, but never taller than `--stage-max-h` (default: the viewport less 12rem; set the
   *   variable on the stage or a parent, or use `maxViewHeight`), so on a short screen it stays
   *   in view. Don't set a height on the stage; the bar adds below.
   */
  fit?: CubeStageFit
  /** Smallest height of the view for `'square'` / `'wide'` (CSS length). Default 14rem. */
  minViewHeight?: string
  /** Largest height of the view for `'square'` / `'wide'` (CSS length). Default `calc(100dvh - 12rem)`. */
  maxViewHeight?: string
  /** Props for the stand-in cube (e.g. scrambled faces). */
  placeholder?: Partial<IsoCubeProps>
  /** Accessible name of the region. */
  label?: string
  className?: string
}

const FIT: Record<CubeStageFit, string> = {
  fill: 'min-h-0 flex-1',
  square: 'w-full shrink-0 aspect-square max-h-[var(--stage-max-h,calc(100dvh-12rem))] min-h-[var(--stage-min-h,14rem)]',
  wide: 'w-full shrink-0 aspect-[4/3] max-h-[var(--stage-max-h,calc(100dvh-12rem))] min-h-[var(--stage-min-h,14rem)]',
}

/**
 * The lit plinth every cube sits on: soft spotlight from above, a floor grid fading to the
 * horizon, a contact shadow — and under it, a control bar of its own. The cube's view never
 * has anything drawn over it, so the camera can frame the cube large.
 *
 *   <CubeStage fit="square" controls={<StageControls view={cube.view} onTurnCube={turn} />}>
 *     <Cube3D {...cube.bind} />
 *   </CubeStage>
 */
export function CubeStage({
  children,
  controls,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  fit = 'fill',
  minViewHeight,
  maxViewHeight,
  placeholder,
  label = 'Cube',
  className,
}: CubeStageProps) {
  const left = topLeft || bottomLeft
  const right = topRight || bottomRight
  const bar =
    controls || left || right ? (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
        {left && (
          <div className="flex min-w-0 items-center gap-2">
            {topLeft}
            {bottomLeft}
          </div>
        )}
        {controls}
        {right && (
          <div className="ml-auto flex items-center gap-1.5">
            {bottomRight}
            {topRight}
          </div>
        )}
      </div>
    ) : null
  const style = {
    ...(minViewHeight ? { '--stage-min-h': minViewHeight } : {}),
    ...(maxViewHeight ? { '--stage-max-h': maxViewHeight } : {}),
  } as CSSProperties
  return (
    <div role="group" aria-label={label} className={cx('stage @container/stage flex flex-col', className)} data-stage-fit={fit}>
      <div className={cx('relative', FIT[fit])} style={style} data-stage-view>
        {children ? (
          <div className="absolute inset-0">{children}</div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex h-[70%] w-[78%] items-center justify-center motion-ok:animate-[rk-float_7s_ease-in-out_infinite]">
              <IsoCube size={300} {...placeholder} style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%' }} />
            </div>
            <span className="stage-shadow motion-ok:animate-[rk-shadow-breathe_7s_ease-in-out_infinite]" aria-hidden="true" />
          </div>
        )}
      </div>
      {bar && (
        <div className="relative z-10 flex min-h-13 shrink-0 items-center gap-2 border-t border-line bg-surface px-2 py-1.5" data-stage-bar>
          {bar}
        </div>
      )}
    </div>
  )
}
