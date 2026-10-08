// Untrusted mail HTML must be parsed in an inert document. Assigning it to
// element.innerHTML (even on a detached <div>) starts loading <img> and fires
// their onerror handlers before any cleanup can run, which is script
// execution in the app's origin.

const DROP_TAGS = 'script, noscript, iframe, frame, frameset, object, embed, applet, base, meta[http-equiv]'
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc', 'background'])

function isDangerousUrl(value) {
  const v = String(value).replace(/[\u0000- ]/g, '').toLowerCase()
  return v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:text/html')
}

// Remote fetches from a stylesheet (@import, url(http…)) would tell the sender
// the mail was opened, bypassing the worker's tracker blocking.
function stripRemoteCssFetches(css) {
  // Decode CSS escapes first: `@\69mport` and `u\72l(` are the same tokens to
  // the browser, so filtering the raw spelling would miss them. What we emit is
  // the decoded text, i.e. exactly what we filtered.
  const decoded = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {
      const code = parseInt(hex, 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/\\(\r\n|[\s\S])/g, (_, ch) => (/[\r\n]/.test(ch) ? '' : ch))
  return decoded
    .replace(/@import\b[^;]*;?/gi, '')
    .replace(/(?:-webkit-)?image-set\([^)]*\)/gi, 'none')
    .replace(/url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*\)/gi, 'none')
}

// Returns an inert <body> element holding the cleaned markup.
// keepHeadStyles: carry a full email's <head> stylesheet along. Only for
// callers that render inside an isolated (shadow) root; the rules are not
// scoped, so they must not land in the app's own document.
export function parseMailHtml(html, { keepHeadStyles = false } = {}) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const body = doc.body
  // A full HTML email keeps its stylesheet in <head>; carry it along.
  if (keepHeadStyles) {
    const headStyles = Array.from(doc.head.querySelectorAll('style'))
    for (const style of headStyles.reverse()) {
      style.textContent = stripRemoteCssFetches(style.textContent || '')
      body.insertBefore(style, body.firstChild)
    }
  }
  body.querySelectorAll(DROP_TAGS).forEach(el => el.remove())
  body.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || (URL_ATTRS.has(name) && isDangerousUrl(attr.value))) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return body
}

export function htmlToPlainText(html) {
  // Drop resource-bearing tags before parsing so preview text can never make
  // the browser contact sender-controlled URLs.
  const stripped = String(html || '').replace(/<(img|iframe|object|embed|video|audio|source|link|image|input)\b[^>]*>/gi, '')
  const body = new DOMParser().parseFromString(stripped, 'text/html').body
  body.querySelectorAll('script, style, title').forEach(el => el.remove())
  return body.textContent || ''
}
