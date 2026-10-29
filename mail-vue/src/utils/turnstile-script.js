// Loads (or reloads) Cloudflare's Turnstile script. index.html loads it once
// at start-up; when that request fails (blocked or flaky networks), the
// widget can never render and the only way out used to be a full page
// reload. This lets the "retry" button fetch it again in place.
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const TIMEOUT = 10000

let loading = null

export function loadTurnstile({ force = false } = {}) {
  if (window.turnstile && !force) return Promise.resolve(window.turnstile)
  if (loading) return loading

  loading = new Promise((resolve, reject) => {
    document.querySelectorAll(`script[src^="${SRC}"]`).forEach(el => el.remove())
    if (force) delete window.turnstile

    const script = document.createElement('script')
    script.src = `${SRC}?render=explicit&_=${Date.now()}`
    script.async = true
    const timer = setTimeout(() => done(new Error('turnstile load timeout')), TIMEOUT)
    function done(err) {
      clearTimeout(timer)
      loading = null
      if (err || !window.turnstile) reject(err || new Error('turnstile unavailable'))
      else resolve(window.turnstile)
    }
    script.onload = () => done()
    script.onerror = () => done(new Error('turnstile load failed'))
    document.head.appendChild(script)
  })
  return loading
}
