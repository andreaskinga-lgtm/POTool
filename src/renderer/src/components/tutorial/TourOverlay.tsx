import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTutorialStore } from '../../stores/tutorial-store'
import { TOUR_STEPS, TourStep } from '../../tutorial/tour-definitions'

const EDGE_MARGIN = 12

interface AnchorPoint {
  /** Reference point the tooltip is anchored to, in viewport coordinates. */
  refX: number
  refY: number
  /** Fraction of the tooltip's own width/height to subtract from refX/refY to get its
   *  top-left corner — equivalent to what a CSS translate(-x%, -y%) would do, but computed
   *  in plain JS from a measured size so we never need to write an intermediate/unclamped
   *  position into the DOM just to measure it (which is what caused visible jumps). */
  originXFrac: number
  originYFrac: number
}

/** Reference point + origin fraction used to place the tooltip relative to its target. */
function anchorFor(rect: DOMRect | null, placement: TourStep['placement']): AnchorPoint {
  if (!rect || placement === 'center') {
    return {
      refX: window.innerWidth / 2,
      refY: window.innerHeight / 2,
      originXFrac: 0.5,
      originYFrac: 0.5
    }
  }

  const gap = 14
  switch (placement) {
    case 'top':
      return {
        refX: rect.left + rect.width / 2,
        refY: rect.top - gap,
        originXFrac: 0.5,
        originYFrac: 1
      }
    case 'left':
      return {
        refX: rect.left - gap,
        refY: rect.top + rect.height / 2,
        originXFrac: 1,
        originYFrac: 0.5
      }
    case 'right':
      return {
        refX: rect.right + gap,
        refY: rect.top + rect.height / 2,
        originXFrac: 0,
        originYFrac: 0.5
      }
    case 'bottom':
    default:
      return {
        refX: rect.left + rect.width / 2,
        refY: rect.bottom + gap,
        originXFrac: 0.5,
        originYFrac: 0
      }
  }
}

export function TourOverlay(): React.JSX.Element | null {
  const activeTour = useTutorialStore((s) => s.activeTour)
  const stepIndex = useTutorialStore((s) => s.stepIndex)
  const disabled = useTutorialStore((s) => s.disabled)
  const next = useTutorialStore((s) => s.next)
  const back = useTutorialStore((s) => s.back)
  const dismiss = useTutorialStore((s) => s.dismiss)
  const setDisabled = useTutorialStore((s) => s.setDisabled)

  const steps = activeTour ? TOUR_STEPS[activeTour] : null
  const step = steps ? steps[stepIndex] : null

  // The tooltip DOM node is never unmounted/remounted between steps (no key-based remount),
  // which keeps this ref stable and avoids stale-prop races between measuring the target and
  // positioning the tooltip.
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties | null>(null)

  // Synchronously (re)computes the spotlight + clamped tooltip position for the current step,
  // directly querying the DOM rather than relying on separately-polled state. If the step's
  // target isn't currently in the DOM (e.g. the OP-1 Slices button only appears for files with
  // embedded slice markers), it skips forward immediately.
  const recompute = useCallback(() => {
    if (!step) return

    let rect: DOMRect | null = null
    if (step.target) {
      const targets = Array.isArray(step.target) ? step.target : [step.target]
      const rects: DOMRect[] = []
      for (const target of targets) {
        const el = document.querySelector(`[data-tour="${target}"]`)
        if (!el) {
          setSpotlightStyle(null)
          next()
          return
        }
        rects.push(el.getBoundingClientRect())
      }
      // Union all target rects into a single bounding box so the spotlight/tooltip covers
      // every element the step points at (e.g. both the volume and speed controls).
      const left = Math.min(...rects.map((r) => r.left))
      const top = Math.min(...rects.map((r) => r.top))
      const right = Math.max(...rects.map((r) => r.right))
      const bottom = Math.max(...rects.map((r) => r.bottom))
      rect = new DOMRect(left, top, right - left, bottom - top)
    }

    setSpotlightStyle(
      rect
        ? {
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 8
          }
        : null
    )

    const tt = tooltipRef.current
    if (!tt) return

    // The tooltip's box size doesn't depend on its position (width is CSS-fixed, height is
    // driven only by its already-updated content), so we can measure it at its *current*
    // on-screen spot without ever moving it first. This avoids writing an unclamped/wrong
    // position into the live DOM, which previously caused a visible jump.
    const { width, height } = tt.getBoundingClientRect()

    const placement = step.placement ?? (rect ? 'bottom' : 'center')
    const anchor = anchorFor(rect, placement)
    const naturalLeft = anchor.refX - anchor.originXFrac * width
    const naturalTop = anchor.refY - anchor.originYFrac * height

    const viewportW = document.documentElement.clientWidth
    const viewportH = document.documentElement.clientHeight
    const maxLeft = Math.max(EDGE_MARGIN, viewportW - EDGE_MARGIN - width)
    const maxTop = Math.max(EDGE_MARGIN, viewportH - EDGE_MARGIN - height)
    const left = Math.min(Math.max(naturalLeft, EDGE_MARGIN), maxLeft)
    const top = Math.min(Math.max(naturalTop, EDGE_MARGIN), maxTop)

    setTooltipStyle({ position: 'fixed', left, top })
  }, [step, next])

  useLayoutEffect(() => {
    if (!activeTour || !step) return undefined
    // Measures the DOM synchronously to position the spotlight/tooltip for the current step;
    // there is no external-system subscription to derive this from other than layout itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recompute()
    window.addEventListener('resize', recompute)
    const interval = window.setInterval(recompute, 300)
    return () => {
      window.removeEventListener('resize', recompute)
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTour, stepIndex, recompute])

  if (!activeTour || !step) return null

  const isFirst = stepIndex === 0
  const isLast = stepIndex === (steps?.length ?? 1) - 1

  return createPortal(
    <div className="tour-overlay">
      <div
        className={`tour-overlay__catcher${spotlightStyle ? '' : ' tour-overlay__catcher--dim-all'}`}
      />
      {spotlightStyle && <div className="tour-spotlight" style={spotlightStyle} />}
      <div
        ref={tooltipRef}
        className="tour-tooltip"
        style={tooltipStyle ?? { position: 'fixed', top: -9999, left: -9999 }}
      >
        <button className="tour-tooltip__close" aria-label="Dismiss tutorial" onClick={dismiss}>
          ✕
        </button>
        <div className="tour-tooltip__title">{step.title}</div>
        <div className="tour-tooltip__body">{step.body}</div>
        <div className="tour-tooltip__footer">
          <label className="tour-tooltip__checkbox">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
            />
            Don&rsquo;t show tutorial tips again
          </label>
        </div>
        <div className="tour-tooltip__nav">
          <span className="tour-tooltip__step-count">
            Step {stepIndex + 1} of {steps?.length}
          </span>
          <div style={{ flex: 1 }} />
          {!isFirst && (
            <button className="btn-sm" onClick={back}>
              Back
            </button>
          )}
          <button className="btn-sm btn-sm--primary" onClick={next}>
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
