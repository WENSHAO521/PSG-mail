// Deterministic grayscale palette — stays on-brand without being uniform
const PALETTE = [
  '#121212', '#2b2b2b', '#1a1a1a', '#333333',
  '#555555', '#707070', '#444444', '#000000'
]

export function avatarBg(seed) {
  if (!seed) return PALETTE[0]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export function avatarLetter(name, email) {
  return ((name || email || '?')[0] || '?').toUpperCase()
}

export function normalizeAvatarEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function storedAvatar(email) {
  const rawEmail = String(email || '').trim()
  if (!rawEmail) return ''

  const normalizedEmail = normalizeAvatarEmail(rawEmail)
  return localStorage.getItem(`psg_avatar_${normalizedEmail}`)
    ?? (rawEmail === normalizedEmail ? '' : localStorage.getItem(`psg_avatar_${rawEmail}`))
    ?? ''
}

// ── Gravatar ──────────────────────────────────────────────────────────────────

// Tiny self-contained MD5 (Gravatar requires MD5, not SHA)
function md5(str) {
  function safe(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff)
  }
  function r(n, c) { return (n << c) | (n >>> (32 - c)) }
  function T(q, a, b, x, s, t) { return safe(r(safe(safe(a, q), safe(x, t)), s), b) }
  function FF(a,b,c,d,x,s,t) { return T((b&c)|(~b&d),a,b,x,s,t) }
  function GG(a,b,c,d,x,s,t) { return T((b&d)|(c&~d),a,b,x,s,t) }
  function HH(a,b,c,d,x,s,t) { return T(b^c^d,a,b,x,s,t) }
  function II(a,b,c,d,x,s,t) { return T(c^(b|~d),a,b,x,s,t) }

  str = unescape(encodeURIComponent(str))
  const x = []
  for (let i = 0; i < str.length; i++) x[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8)
  x[str.length >> 2] |= 0x80 << ((str.length % 4) * 8)
  x[(((str.length + 8) >> 6) << 4) + 14] = str.length * 8

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878
  for (let i = 0; i < x.length; i += 16) {
    const [A, B, C, D] = [a, b, c, d]
    a=FF(a,b,c,d,x[i+0],7,-680876936);d=FF(d,a,b,c,x[i+1],12,-389564586);c=FF(c,d,a,b,x[i+2],17,606105819);b=FF(b,c,d,a,x[i+3],22,-1044525330)
    a=FF(a,b,c,d,x[i+4],7,-176418897);d=FF(d,a,b,c,x[i+5],12,1200080426);c=FF(c,d,a,b,x[i+6],17,-1473231341);b=FF(b,c,d,a,x[i+7],22,-45705983)
    a=FF(a,b,c,d,x[i+8],7,1770035416);d=FF(d,a,b,c,x[i+9],12,-1958414417);c=FF(c,d,a,b,x[i+10],17,-42063);b=FF(b,c,d,a,x[i+11],22,-1990404162)
    a=FF(a,b,c,d,x[i+12],7,1804603682);d=FF(d,a,b,c,x[i+13],12,-40341101);c=FF(c,d,a,b,x[i+14],17,-1502002290);b=FF(b,c,d,a,x[i+15],22,1236535329)
    a=GG(a,b,c,d,x[i+1],5,-165796510);d=GG(d,a,b,c,x[i+6],9,-1069501632);c=GG(c,d,a,b,x[i+11],14,643717713);b=GG(b,c,d,a,x[i+0],20,-373897302)
    a=GG(a,b,c,d,x[i+5],5,-701558691);d=GG(d,a,b,c,x[i+10],9,38016083);c=GG(c,d,a,b,x[i+15],14,-660478335);b=GG(b,c,d,a,x[i+4],20,-405537848)
    a=GG(a,b,c,d,x[i+9],5,568446438);d=GG(d,a,b,c,x[i+14],9,-1019803690);c=GG(c,d,a,b,x[i+3],14,-187363961);b=GG(b,c,d,a,x[i+8],20,1163531501)
    a=GG(a,b,c,d,x[i+13],5,-1444681467);d=GG(d,a,b,c,x[i+2],9,-51403784);c=GG(c,d,a,b,x[i+7],14,1735328473);b=GG(b,c,d,a,x[i+12],20,-1926607734)
    a=HH(a,b,c,d,x[i+5],4,-378558);d=HH(d,a,b,c,x[i+8],11,-2022574463);c=HH(c,d,a,b,x[i+11],16,1839030562);b=HH(b,c,d,a,x[i+14],23,-35309556)
    a=HH(a,b,c,d,x[i+1],4,-1530992060);d=HH(d,a,b,c,x[i+4],11,1272893353);c=HH(c,d,a,b,x[i+7],16,-155497632);b=HH(b,c,d,a,x[i+10],23,-1094730640)
    a=HH(a,b,c,d,x[i+13],4,681279174);d=HH(d,a,b,c,x[i+0],11,-358537222);c=HH(c,d,a,b,x[i+3],16,-722521979);b=HH(b,c,d,a,x[i+6],23,76029189)
    a=HH(a,b,c,d,x[i+9],4,-640364487);d=HH(d,a,b,c,x[i+12],11,-421815835);c=HH(c,d,a,b,x[i+15],16,530742520);b=HH(b,c,d,a,x[i+2],23,-995338651)
    a=II(a,b,c,d,x[i+0],6,-198630844);d=II(d,a,b,c,x[i+7],10,1126891415);c=II(c,d,a,b,x[i+14],15,-1416354905);b=II(b,c,d,a,x[i+5],21,-57434055)
    a=II(a,b,c,d,x[i+12],6,1700485571);d=II(d,a,b,c,x[i+3],10,-1894986606);c=II(c,d,a,b,x[i+10],15,-1051523);b=II(b,c,d,a,x[i+1],21,-2054922799)
    a=II(a,b,c,d,x[i+8],6,1873313359);d=II(d,a,b,c,x[i+15],10,-30611744);c=II(c,d,a,b,x[i+6],15,-1560198380);b=II(b,c,d,a,x[i+13],21,1309151649)
    a=II(a,b,c,d,x[i+4],6,-145523070);d=II(d,a,b,c,x[i+11],10,-1120210379);c=II(c,d,a,b,x[i+2],15,718787259);b=II(b,c,d,a,x[i+9],21,-343485551)
    a=safe(a,A); b=safe(b,B); c=safe(c,C); d=safe(d,D)
  }

  return [a,b,c,d].map(n =>
    ('0'.repeat(8) + (n < 0 ? n + 0x100000000 : n).toString(16)).slice(-8)
      .match(/../g).map(h => h[1]+h[0]).join('')
  ).join('')
}

// In-memory cache: email → 'hit'|'miss' (avoids repeated network probes)
const gravatarCache = new Map()

export function gravatarUrl(email) {
  if (!email) return ''
  const hash = md5(email.trim().toLowerCase())
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=80`
}

// Returns '' immediately if already known to be a miss; otherwise returns the URL.
// Call this to get a candidate URL, then handle onError on the <img>.
export function gravatarCandidate(email) {
  if (!email) return ''
  if (gravatarCache.get(email) === 'miss') return ''
  return gravatarUrl(email)
}

export function markGravatarMiss(email) {
  if (email) gravatarCache.set(email, 'miss')
}
