const paths = {
  outline: '<circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="18" r="1.4"/><path d="M10 6h10m-10 6h7m-7 6h10"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  more: '<circle cx="5" cy="12" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="19" cy="12" r=".6"/>',
  expand: '<path d="M14 3h7v7M21 3l-7 7M10 21H3v-7m0 7 7-7"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m-4-11-3 3 3 3"/>',
  review: '<path d="M5 3h10l4 4v14H5Zm10 0v5h4M8 12h8m-4-4v8"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.1m3 0h.1"/>',
  logo: '<path d="m9 7-5 5 5 5m6-10 5 5-5 5"/><path d="m13 5-2 14"/>',
  sidebar:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  new: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 12h8m-4-4v8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  settings:
    '<path d="m9 3-.6 2.2-2 .9-2-.6L2.5 9l1.6 1.6v2.8L2.5 15l1.9 3.5 2-.6 2 .9L9 21h4l.6-2.2 2-.9 2 .6 1.9-3.5-1.6-1.6v-2.8L19.5 9l-1.9-3.5-2 .6-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  wechat:
    '<path d="M14.8 13.3a6.2 6.2 0 0 1-5.6 2.4l-3.8 1.6.9-3A5.6 5.6 0 0 1 3 9.4C3 6.4 6 4 9.7 4s6.7 2.4 6.7 5.4"/><path d="M21 14.3c0 1.5-.8 2.8-2.1 3.7l.6 2.2-2.8-1.2c-.5.1-1 .2-1.5.2-3.2 0-5.8-2.2-5.8-4.9s2.6-4.8 5.8-4.8 5.8 2.1 5.8 4.8Z"/><path d="M7 8.6h.1m5.1 0h.1m.4 5h.1m4.2 0h.1" stroke-width="2.7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-10v.1"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4"/>',
  arrow: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
  spark:
    '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z"/>',
  box: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M9 5v4m6-4v4"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  sliders:
    '<path d="M4 6h5m4 0h7M9 3v6M4 12h10m4 0h2m-6-3v6M4 18h3m4 0h9m-13-3v6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  minus: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  undo: '<path d="m9 4-6 6 6 6M3 10h11a7 7 0 0 1 0 14" transform="translate(1 -2) scale(.9)"/>',
  redo: '<path d="m9 4-6 6 6 6M3 10h11a7 7 0 0 1 0 14" transform="translate(23 -2) scale(-.9 .9)"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash: '<path d="M4 6h16m-13 0 1 15h8l1-15M9 6V3h6v3m-5 4v7m4-7v7"/>',
  external: '<path d="M14 3h7v7m0-7-11 11m0-10H3v17h17v-7"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  terminal: '<path d="m5 6 5 6-5 6m8 0h6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  file: '<path d="M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h6"/>',
  model:
    '<rect x="5" y="6" width="14" height="13" rx="3"/><path d="M12 3v3M2 11h3m14 0h3M9 10v2m6-2v2m-6 4h6"/>',
};
export function icon(name, cls = "") {
  return `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.circle}</svg>`;
}
