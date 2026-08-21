'use strict'
const fs   = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')

const root      = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const buildDir  = path.join(root, 'build')

// ── Full icon (legacy ic_launcher.png / ic_launcher_round.png) ───────────────
// Turned-letter mark on the brand-green tile: a portrait card with a folded
// top-right corner (the letter cue) and a punched accent square bottom-left
// (the brand's read/unread pixel). Both accents are painted the same green
// as the tile so they read as cut-through notches, not separate shapes.
const TILE_BG = '#1E5940'

const MARK = `<g transform="translate(100 100) scale(1.6) translate(-50 -50)">
    <rect x="22" y="16" width="56" height="68" fill="#F4F4F0"/>
    <path d="M58 16 L78 16 L78 36 Z" fill="${TILE_BG}"/>
    <rect x="30" y="66" width="12" height="12" fill="${TILE_BG}"/>
  </g>`

const SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="12" width="176" height="176" rx="38" fill="${TILE_BG}"/>
  ${MARK}
</svg>`

// ── Adaptive icon foreground (artwork inset to safe zone of 108dp canvas) ─────
// Mark centered at (100,100) in 200×200 viewport. No background fill —
// background comes from ic_launcher_background color (must match TILE_BG).
const FOREGROUND_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  ${MARK}
</svg>`

function renderPng(size) {
  const resvg = new Resvg(SVG, { fitTo: { mode: 'width', value: size } })
  return Buffer.from(resvg.render().asPng())
}

function makeIco(sizes) {
  const pngs  = sizes.map(size => ({ size, data: renderPng(size) }))
  const count = pngs.length
  let offset  = 6 + count * 16
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(count * 16)
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16
    dir[o]     = size >= 256 ? 0 : size
    dir[o + 1] = size >= 256 ? 0 : size
    dir[o + 2] = 0; dir[o + 3] = 0
    dir.writeUInt16LE(1,  o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset,      o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map(p => p.data)])
}

function writePng(relativePath, size) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, renderPng(size))
  console.log(`Generated ${relativePath}`)
}

function writeIco(relativePath, sizes) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, makeIco(sizes))
  console.log(`Generated ${relativePath}`)
}

fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(buildDir,  { recursive: true })

// PWA / web icons
writePng('public/pwa-192.png',          192)
writePng('public/pwa-512.png',          512)
writePng('public/pwa-maskable-512.png', 512)
writePng('public/apple-touch-icon.png', 180)
writePng('public/mail.png',             128)
writePng('public/mail-pwa.png',         512)

// Electron build icons
writePng('build/icon.png',         512)
writePng('build/desktop-icon.png', 512)
writeIco('build/icon.ico',         [16, 24, 32, 48, 64, 128, 256])
writeIco('build/desktop-icon.ico', [16, 24, 32, 48, 64, 128, 256])

// Favicon SVG (verbatim from branding source)
fs.writeFileSync(
  path.join(publicDir, 'favicon.svg'),
  fs.readFileSync(path.join(publicDir, 'image', 'psg-icon-logo.svg'))
)
console.log('Generated public/favicon.svg')

// Android mipmap icons
const androidResDir = path.join(root, 'android', 'app', 'src', 'main', 'res')
if (fs.existsSync(androidResDir)) {
  const densities = [
    ['mipmap-mdpi',     48],
    ['mipmap-hdpi',     72],
    ['mipmap-xhdpi',    96],
    ['mipmap-xxhdpi',  144],
    ['mipmap-xxxhdpi', 192],
  ]
  for (const [dir, size] of densities) {
    const densityDir = path.join(androidResDir, dir)
    fs.mkdirSync(densityDir, { recursive: true })
    const png = renderPng(size)
    const fgResvg = new Resvg(FOREGROUND_SVG, { fitTo: { mode: 'width', value: size } })
    const fgPng   = Buffer.from(fgResvg.render().asPng())
    fs.writeFileSync(path.join(densityDir, 'ic_launcher.png'),            png)
    fs.writeFileSync(path.join(densityDir, 'ic_launcher_round.png'),      png)
    fs.writeFileSync(path.join(densityDir, 'ic_launcher_foreground.png'), fgPng)
    console.log(`Generated android/app/src/main/res/${dir}/ic_launcher*.png`)
  }
}
