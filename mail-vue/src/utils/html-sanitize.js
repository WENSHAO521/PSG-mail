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

// A stylesheet can contact the sender (@import, url(), image-set(), @font-face)
// and so reveal that the mail was opened, bypassing the worker's tracker
// blocking. Filtering the raw text is a losing game (CSS escapes, comments),
// so let the browser's own CSS parser normalize it first: constructable
// stylesheets never fetch on replaceSync(), @import is ignored, and
// declaration values come back decoded, so one check on those is enough.
const FETCHING_VALUE = /url\(|image-set\(|\bsrc\(|\bimage\(|\bcross-fade\(|\belement\(/i

function safeRules(rules, out) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      for (const prop of Array.from(rule.style)) {
        if (FETCHING_VALUE.test(rule.style.getPropertyValue(prop))) rule.style.removeProperty(prop)
      }
      out.push(rule.cssText)
    } else if (rule instanceof CSSMediaRule) {
      const inner = []
      safeRules(rule.cssRules, inner)
      out.push(`@media ${rule.conditionText || rule.media.mediaText} { ${inner.join('\n')} }`)
    }
    // @import, @font-face, @namespace, @supports, @keyframes ... are dropped.
  }
}

function safeCss(css) {
  if (typeof CSSStyleSheet !== 'function') return ''
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(String(css || ''))
    const out = []
    safeRules(sheet.cssRules, out)
    return out.join('\n')
  } catch {
    return ''
  }
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
      style.textContent = safeCss(style.textContent || '')
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
