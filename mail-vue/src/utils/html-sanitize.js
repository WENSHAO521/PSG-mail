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
  // A full HTML email keeps its stylesheet in <head>; carry it along.
  const headStyles = Array.from(doc.head.querySelectorAll('style'))
  for (const style of headStyles.reverse()) body.insertBefore(style, body.firstChild)
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
