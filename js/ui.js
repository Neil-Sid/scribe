import { esc } from './text.js'

const app = document.getElementById('app')
let acts = {}

export function mount(html, handlers = {}) {
  app.innerHTML = html
  acts = handlers
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]')
  if (el && !el.disabled) acts[el.dataset.act]?.(el, e)
  else if (!el) acts.blank?.(e)
})
document.addEventListener('keydown', e => acts.key?.(e))
document.addEventListener('input', e => acts.input?.(e.target, e))

const ICONS = {
  x: '<path d="M6 6l12 12M18 6 6 18" class="s"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" class="s"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.6-9.4C.9 7.6 3.3 4 6.9 4c2.2 0 3.9 1.2 5.1 3 1.2-1.8 2.9-3 5.1-3 3.6 0 6 3.6 4.5 7.1-2.1 4.8-9.6 9.4-9.6 9.4z"/>',
  flame: '<path d="M12.6 2.5c.6 3.2 4.9 5.6 4.9 10.6a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.3 2.4-5.4.2 1.7.9 3 2.2 3.7-.5-3.4.2-6.5 1.5-8.9z"/>',
  bolt: '<path d="M13.5 2 4.5 13.5h6.6L10 22l9.5-12h-6.7z"/>',
  star: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" class="s"/>',
  trophy: '<path d="M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 5.5H4v1.5A3.5 3.5 0 0 0 7.5 10.5M17 5.5h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 20.5h8" class="s"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h3V6a2 2 0 0 1 2-2" class="s"/><path d="M10 9h4M10 12.5h4" class="s"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c.8-4 4-6 8-6s7.2 2 8 6z"/>',
  globe: '<circle cx="12" cy="12" r="8.5" class="s"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" class="s"/>',
  back: '<path d="M15 5l-7 7 7 7" class="s"/>',
  dumbbell: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12" class="s"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" class="s"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" class="s"/>',
  temple: '<path d="M3 9.5 12 4.5l9 5M5.5 10.5v7.5M10 10.5v7.5M14 10.5v7.5M18.5 10.5v7.5M3.5 20.5h17" class="s"/>',
  book: '<path d="M12 6.5c-2-1.5-4.5-2-8-2v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2zM12 6.5v13" class="s"/>',
}

export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`

// --n (sign count) lets CSS shrink long words to fit their box
const signs = g => [...g.replace(/\s/g, '')].length

// A word in its native script with the transliteration underneath, or just the romanised form
export function word(it, size = '') {
  if (!it.g) return `<span class="w ${size}"><span class="tt">${esc(it.t)}</span></span>`
  return `<span class="w ${size}" style="--n:${signs(it.g)}"><span class="g">${esc(it.g)}</span><span class="tl">${esc(it.t)}</span></span>`
}

export const glyph = (g, size = '') => `<span class="w ${size}" style="--n:${signs(g)}"><span class="g">${esc(g)}</span></span>`

export const scriptFont = course => course.script?.font ?? 'latin'
