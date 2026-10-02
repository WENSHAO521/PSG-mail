// Shared touch / trackpad gesture helpers.
//
// One horizontal-drag recognizer used by the reader (swipe between mails,
// edge-swipe back), the folder sheet and the composer, so thresholds, axis
// locking and haptics feel the same everywhere. Vertical movement is always
// left to native scrolling: the recognizer only claims a gesture once it is
// clearly horizontal.

export const SWIPE_DISTANCE = 72     // px that commits a swipe
export const SWIPE_VELOCITY = 0.45   // px/ms that commits a short, fast flick
export const EDGE_ZONE = 28          // px from the left edge for edge gestures

export function reducedMotion() {
	try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function haptic(ms = 12) {
	try { navigator.vibrate?.(ms) } catch {}
}

export function isTouchLayout() {
	return window.innerWidth <= 1024
}

// Would any element between the touch target and `boundary` scroll
// horizontally in the drag direction? Then the drag belongs to it (wide
// HTML mail, tables, toolbars), not to us. Walks the composed path so it
// also sees inside the open shadow root mail bodies render into.
function innerCanScrollX(path, boundary, dx) {
	for (const el of path) {
		if (el === boundary || !(el instanceof Element)) break
		if (el.scrollWidth <= el.clientWidth + 1) continue
		const style = getComputedStyle(el)
		if (!/(auto|scroll)/.test(style.overflowX)) continue
		if (dx > 0 && el.scrollLeft > 0) return true
		if (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
	}
	return false
}

/**
 * Horizontal drag recognizer for touch/pen pointers.
 *
 * options:
 *   enabled()        → false to ignore the gesture entirely
 *   edge: true       → only start within EDGE_ZONE of the left edge;
 *                      otherwise the edge is left to the OS back gesture
 *   onStart()        → the gesture locked horizontally
 *   onMove(dx)       → finger moved; dx relative to the start
 *   onEnd(dx, vx)    → released; vx in px/ms (negative = leftwards)
 *   onCancel()       → aborted (second finger, pointercancel)
 *
 * Returns an unbind function.
 */
export function bindHorizontalDrag(el, options) {
	let s = null
	let pointers = 0

	const down = e => {
		if (e.pointerType === 'mouse') return
		pointers++
		if (pointers > 1) { abort(); return }
		if (options.enabled && !options.enabled(e)) return
		const fromEdge = e.clientX <= EDGE_ZONE
		if (options.edge ? !fromEdge : fromEdge) return
		s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0, path: e.composedPath() }
	}

	const move = e => {
		if (!s || e.pointerId !== s.id) return
		const dx = e.clientX - s.x
		const dy = e.clientY - s.y
		if (!s.axis) {
			if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
			const horizontal = Math.abs(dx) > Math.abs(dy) * 1.3
			if (!horizontal || (!options.edge && innerCanScrollX(s.path, el, dx))) { s = null; return }
			s.axis = 'x'
			options.onStart?.()
		}
		s.dx = dx
		options.onMove?.(dx)
	}

	const up = e => {
		pointers = Math.max(0, pointers - 1)
		if (!s || e.pointerId !== s.id) return
		const st = s
		s = null
		if (st.axis !== 'x') return
		const vx = st.dx / Math.max(performance.now() - st.t, 1)
		options.onEnd?.(st.dx, vx)
	}

	const abort = () => {
		const st = s
		s = null
		if (st?.axis === 'x') options.onCancel?.()
	}

	const cancel = e => {
		pointers = Math.max(0, pointers - 1)
		if (s && e.pointerId === s.id) abort()
	}

	el.addEventListener('pointerdown', down, { passive: true })
	el.addEventListener('pointermove', move, { passive: true })
	el.addEventListener('pointerup', up, { passive: true })
	el.addEventListener('pointercancel', cancel, { passive: true })
	return () => {
		el.removeEventListener('pointerdown', down)
		el.removeEventListener('pointermove', move)
		el.removeEventListener('pointerup', up)
		el.removeEventListener('pointercancel', cancel)
	}
}

// Did a released drag commit (distance or a quick flick in that direction)?
export function committed(dx, vx, direction) {
	const d = direction === 'left' ? -dx : dx
	const v = direction === 'left' ? -vx : vx
	return d > SWIPE_DISTANCE || (d > 24 && v > SWIPE_VELOCITY)
}

// Rubber-band resistance for drags that hit a limit.
export function resist(dx, limit = 120) {
	const sign = Math.sign(dx)
	const a = Math.abs(dx)
	return sign * (a < limit ? a : limit + (a - limit) * 0.25)
}
