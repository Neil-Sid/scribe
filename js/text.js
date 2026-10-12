const PUNCT = /[,.?!;:]/g
const ARTICLES = new Set(['a', 'an', 'the'])

export const tokens = s => s.replace(PUNCT, '').split(/\s+/).filter(Boolean)

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// English answers ignore case, punctuation and articles
export const normEn = s => tokens(s.toLowerCase().replace(/’/g, "'")).filter(w => !ARTICLES.has(w)).join(' ')

export const normT = s => tokens(s.normalize('NFC').toLowerCase()).join(' ')

// Forgiving match for typed transliteration: drops diacritics, sign indices and separators
export const loose = s => s.normalize('NFD').toLowerCase()
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[ꜣꜥʾʿ'’=.\-₀-₉0-9,?!;:]/g, '')
  .replace(/ʀ/g, 'r').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o')
  .replace(/sz|sh/g, 's').replace(/j/g, 'i')
  .replace(/\s+/g, ' ').trim()

export const shuffle = arr => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const pick = (arr, n) => shuffle(arr).slice(0, n)
