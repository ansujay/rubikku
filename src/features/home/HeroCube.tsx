import { useEffect, useRef } from 'react'
import { applyAlg, BEGINNER_HOLD, SOLVED } from '../../cube'
import { Cube3D } from '../../three'
import { usePlay } from '../play/playStore'

/**
 * The live cube in the Home hero: the free-play cube exactly as he left it. Drag to look
 * around; "Pick it up" carries on in Free play. Loaded lazily so three.js never delays Home;
 * `onReady` fires once the cube is really drawn, so the flat stand-in can fade away.
 */
/** No cube saved yet: a solved cube in the method's hold — yellow on top, green in front. */
const HELD = applyAlg(SOLVED, BEGINNER_HOLD)

const HERO_POSE = { zoom: 0.86 } as const

export default function HeroCube({ onReady }: { onReady?: () => void }) {
  const state = usePlay((s) => s.session?.state ?? HELD)
  const wrapper = useRef<HTMLDivElement>(null)
  const ready = useRef(onReady)
  ready.current = onReady

  useEffect(() => {
    let frame = 0
    let settle = 0
    const check = () => {
      const node = wrapper.current
      // Drawn = the WebGL canvas exists, or Cube3D has fallen back to its own flat drawing.
      const drawn = node?.querySelector('[data-renderer="webgl"] canvas, canvas, [data-cube-fallback]')
      if (drawn && ++settle > 3) ready.current?.()
      else frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div ref={wrapper} className="absolute inset-0">
      {/* A little further back than a working cube: the hero stage is short and wide, and the
          cube needs air above it, not to brush the top edge. */}
      <Cube3D state={state} mode="view" pageScroll initialPose={HERO_POSE} debugId="home" label="Your cube. Drag to look around." />
    </div>
  )
}
