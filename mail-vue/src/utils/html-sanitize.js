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

// Returns an inert <body> element holding the cleaned markup.
export function parseMailHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const body = doc.body
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
  const body = new DOMParser().parseFromString(String(html || ''), 'text/html').body
  body.querySelectorAll('script, style, title').forEach(el => el.remove())
  return body.textContent || ''
}
