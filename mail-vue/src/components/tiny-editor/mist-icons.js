// Mist icon set for the TinyMCE toolbar and its menus — one stroke family
// (24px grid, 1.75 stroke, round caps/joins) matching the app's psg:* icons,
// registered over TinyMCE's stock "oxide" glyphs in the editor's setup().
//
// Oxide's CSS paints `fill` on the <svg> itself, so every drawing sits in a
// <g fill="none"> to keep strokes from being flood-filled. The colour bars of
// text-color / highlight keep TinyMCE's element ids: the editor recolours
// those to the picked colour.

const wrap = (body, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" focusable="false">` +
  `<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`

const dots = (cy) => [6, 12, 18].map(cx => `<circle cx="${cx}" cy="${cy}" r="1.1" fill="currentColor" stroke="none"/>`).join('')

export const MIST_ICONS = {
  bold: wrap('<path d="M7.5 5h5a3.5 3.5 0 0 1 0 7h-5z" stroke-width="2.1"/><path d="M7.5 12h6a3.5 3.5 0 0 1 0 7h-6z" stroke-width="2.1"/>'),
  italic: wrap('<path d="M10.5 5H18"/><path d="M6 19h7.5"/><path d="M14.2 5 9.8 19"/>'),
  underline: wrap('<path d="M7 4.5V11a5 5 0 0 0 10 0V4.5"/><path d="M5.5 20h13"/>'),
  'strike-through': wrap('<path d="M16.5 7.2A4 4 0 0 0 12.8 5h-1.6a3.4 3.4 0 0 0-1.4 6.5"/><path d="M8 17a4 4 0 0 0 3.6 2h1.3a3.4 3.4 0 0 0 2.6-5.6"/><path d="M4.5 12h15"/>'),

  'text-color': `<svg width="24" height="24" viewBox="0 0 24 24" focusable="false">` +
    `<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 15 4.5-11 4.5 11"/><path d="M9.2 11h5.6"/></g>` +
    `<rect id="tox-icon-text-color__color" x="4.5" y="17.5" width="15" height="3" rx="1.5"/></svg>`,
  'highlight-bg-color': `<svg width="24" height="24" viewBox="0 0 24 24" focusable="false">` +
    `<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m13.5 4.5 4 4-6.3 6.3H7.2v-4z"/><path d="m7.2 14.8-1.7 1.7"/></g>` +
    `<rect id="tox-icon-highlight-bg-color__color" x="4.5" y="17.5" width="15" height="3" rx="1.5"/></svg>`,

  'align-left': wrap('<path d="M4.5 6h15"/><path d="M4.5 10h9"/><path d="M4.5 14h15"/><path d="M4.5 18h9"/>'),
  'align-center': wrap('<path d="M4.5 6h15"/><path d="M7.5 10h9"/><path d="M4.5 14h15"/><path d="M7.5 18h9"/>'),
  'align-right': wrap('<path d="M4.5 6h15"/><path d="M10.5 10h9"/><path d="M4.5 14h15"/><path d="M10.5 18h9"/>'),
  'align-justify': wrap('<path d="M4.5 6h15"/><path d="M4.5 10h15"/><path d="M4.5 14h15"/><path d="M4.5 18h15"/>'),

  'unordered-list': wrap('<circle cx="5.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="5.5" cy="17" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 7h10"/><path d="M9.5 12h10"/><path d="M9.5 17h10"/>'),
  'ordered-list': wrap('<path d="M4.5 5.5 6 4.8V9.5"/><path d="M4.6 14.4a1.6 1.6 0 1 1 2.7 1.1L4.6 19.2h3"/><path d="M10.5 7h9"/><path d="M10.5 12h9"/><path d="M10.5 17h9"/>'),
  indent: wrap('<path d="M4.5 5.5h15"/><path d="M11 10h8.5"/><path d="M11 14h8.5"/><path d="M4.5 18.5h15"/><path d="m4.5 9.5 3 2.5-3 2.5"/>'),
  outdent: wrap('<path d="M4.5 5.5h15"/><path d="M11 10h8.5"/><path d="M11 14h8.5"/><path d="M4.5 18.5h15"/><path d="M7.5 9.5 4.5 12l3 2.5"/>'),

  link: wrap('<path d="M10 14a4.2 4.2 0 0 0 6 0l2.6-2.6a4.2 4.2 0 0 0-6-6L11.3 6.7"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-2.6 2.6a4.2 4.2 0 0 0 6 6l1.3-1.3"/>'),
  unlink: wrap('<path d="M15.5 13.2 18.6 10a4.2 4.2 0 0 0-6-6l-1.3 1.3"/><path d="M8.5 10.8 5.4 14a4.2 4.2 0 0 0 6 6l1.3-1.3"/><path d="m4 4 16 16"/>'),
  'more-drawer': wrap(dots(12)),
  quote: wrap('<path d="M5 11.5h4.5V17H5z"/><path d="M5 11.5C5 8.6 6.3 6.8 8.5 6"/><path d="M14 11.5h4.5V17H14z"/><path d="M14 11.5c0-2.9 1.3-4.7 3.5-5.5"/>'),
  emoji: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0"/><circle cx="9.2" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10" r=".9" fill="currentColor" stroke="none"/>'),
  table: wrap('<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16"/><path d="M4 14.5h16"/><path d="M10 9.5v10"/>'),
  image: wrap('<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="m4.5 17 4.5-4.2 3.2 3 2.6-2.4 4.7 4.1"/>'),
  sourcecode: wrap('<path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/><path d="m13.6 5.5-3.2 13"/>'),
  preview: wrap('<path d="M2.8 12S6.2 5.5 12 5.5 21.2 12 21.2 12 17.8 18.5 12 18.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  fullscreen: wrap('<path d="M4.5 9V4.5H9"/><path d="M15 4.5h4.5V9"/><path d="M19.5 15v4.5H15"/><path d="M9 19.5H4.5V15"/>'),
  'remove-formatting': wrap('<path d="M7 5h11"/><path d="M12.8 5 10.2 13"/><path d="M4.5 4.5l15 15"/><path d="M8 19h5"/>'),
  undo: wrap('<path d="M8.5 9.5H15a4.5 4.5 0 0 1 0 9h-4"/><path d="m11.5 6.5-3 3 3 3"/>'),
  redo: wrap('<path d="M15.5 9.5H9a4.5 4.5 0 0 0 0 9h4"/><path d="m12.5 6.5 3 3-3 3"/>'),
  close: wrap('<path d="m6.5 6.5 11 11"/><path d="m17.5 6.5-11 11"/>'),
  checkmark: wrap('<path d="m5.5 12.5 4 4 9-9.5"/>'),
  'chevron-down': wrap('<path d="m6 9 6 6 6-6" stroke-width="2.4"/>', 10),
  'chevron-up': wrap('<path d="m6 15 6-6 6 6" stroke-width="2.4"/>', 10),
  'chevron-right': wrap('<path d="m9 6 6 6-6 6" stroke-width="2.4"/>', 10),
  'chevron-left': wrap('<path d="m15 6-6 6 6 6" stroke-width="2.4"/>', 10),
}

export function registerMistIcons(editor) {
  for (const [name, svg] of Object.entries(MIST_ICONS)) editor.ui.registry.addIcon(name, svg)
}
