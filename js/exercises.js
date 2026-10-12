import { tokens, normT, shuffle, pick } from './text.js'

export const lessonCount = unit => unit.kind === 'script' ? 3 : 4

export const lessonLabel = (unit, l) =>
  l === lessonCount(unit) - 1 ? 'Unit review' : unit.kind === 'script' ? `Signs ${l + 1}` : ['New words', 'More words', 'Sentences'][l]

// Unique distractors: same unit first, then everything learned so far
function distractors(item, near, far, key, n = 3) {
  const seen = new Set([key(item)])
  const out = []
  for (const x of [...shuffle(near), ...shuffle(far)]) {
    if (out.length === n) break
    if (seen.has(key(x))) continue
    seen.add(key(x))
    out.push(x)
  }
  return out
}

function choice(mode, item, near, far, extra = {}) {
  const key = mode === 'meaning' || mode === 'word' ? x => x.en : mode === 'sound' ? x => x.t : x => x.g
  if (mode === 'glyph' || mode === 'sign') [near, far] = [near.filter(x => x.g), far.filter(x => x.g)]
  const options = shuffle([item, ...distractors(item, near, far, key)])
  return { type: 'choice', mode, item, options, answer: options.indexOf(item), ...extra }
}

function match(items, script) {
  const seen = new Set()
  const pairs = shuffle(items).filter(x => {
    const k = script ? x.t : x.en
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 5)
  return pairs.length >= 3 && { type: 'match', script, pairs, right: shuffle(pairs.map((_, i) => i)) }
}

function sentenceTokens(s) {
  const t = tokens(s.t), g = s.g ? tokens(s.g) : []
  return t.map((text, i) => ({ text, g: g[i] }))
}

function build(s, dir, pool) {
  const others = pool.filter(x => x !== s)
  if (dir === 'en') {
    const answer = tokens(s.en)
    const used = new Set(answer.map(w => w.toLowerCase()))
    const extra = [...new Set(others.flatMap(x => tokens(x.en)))]
      .filter(w => !used.has(w.toLowerCase()) && !['a', 'an', 'the'].includes(w.toLowerCase()))
    const tiles = shuffle([...answer, ...pick(extra, Math.min(4, Math.max(2, 7 - answer.length)))].map(text => ({ text })))
    return { type: 'build', dir, sentence: s, tiles, accept: [s.en, ...(s.alt ?? [])] }
  }
  const answer = sentenceTokens(s)
  const used = new Set(answer.map(x => x.text.toLowerCase()))
  const extra = []
  for (const x of shuffle(others).flatMap(sentenceTokens)) {
    if (!used.has(x.text.toLowerCase())) { used.add(x.text.toLowerCase()); extra.push(x) }
  }
  const tiles = shuffle([...answer, ...extra.slice(0, Math.min(4, Math.max(2, 7 - answer.length)))])
  return { type: 'build', dir, sentence: s, tiles, accept: [s.t, ...(s.talt ?? [])] }
}

function fill(s, pool) {
  if (!s) return null
  const toks = sentenceTokens(s)
  if (toks.length < 2) return null
  const candidates = toks.map((x, i) => i).filter(i => toks[i].text.length > 2)
  const blank = (candidates.length ? pick(candidates, 1) : [0])[0]
  const correct = toks[blank]
  const seen = new Set([correct.text.toLowerCase()])
  const wrong = []
  for (const x of shuffle(pool.filter(p => p !== s)).flatMap(sentenceTokens)) {
    if (wrong.length === 3) break
    if (!seen.has(x.text.toLowerCase())) { seen.add(x.text.toLowerCase()); wrong.push(x) }
  }
  const options = shuffle([correct, ...wrong])
  return { type: 'fill', sentence: s, toks, blank, options, answer: options.indexOf(correct) }
}

const signsOf = g => [...g.replace(/\s/g, '')]

// Words written with 2-6 signs can be built sign by sign
const spellable = it => it.g && signsOf(it.g).length >= 2 && signsOf(it.g).length <= 6

function spell(item, pool) {
  const signs = signsOf(item.g)
  const others = [...new Set(pool.filter(x => x.g && x !== item).flatMap(x => signsOf(x.g)))].filter(g => !signs.includes(g))
  const tiles = shuffle([...signs, ...pick(others, Math.max(2, 6 - signs.length))].map(g => ({ g })))
  return { type: 'spell', item, tiles, answer: signs.join('') }
}

function typed(item, from) {
  return { type: 'type', item, from, accept: [item.t, from === 'en' && item.g].filter(Boolean) }
}

function context(course, u) {
  const units = course.units.slice(0, u + 1)
  return {
    words: units.filter(x => x.kind !== 'script').flatMap(x => x.items),
    signs: units.filter(x => x.kind === 'script').flatMap(x => x.items),
    sentences: units.flatMap(x => x.sentences ?? []),
    spell: ['cuneiform', 'hieroglyphs'].includes(course.script?.font),
  }
}

// New words get introduced one at a time, with a quick recall check after every second one
function introduce(focus, near, far, mode, recall) {
  const out = []
  focus.forEach((it, i) => {
    out.push(choice(mode, it, near, far, { isNew: true }))
    if (i % 2 === 1) out.push(choice(recall, pick(focus.slice(0, i + 1), 1)[0], near, far))
  })
  return out
}

function wordLesson(unit, l, ctx) {
  const { items } = unit, sents = unit.sentences ?? []
  const glyphs = items.some(x => x.g)
  const half = Math.ceil(items.length / 2), sHalf = Math.ceil(sents.length / 2)
  const near = items, far = ctx.words, pool = ctx.sentences
  if (l < 2) {
    const focus = l === 0 ? items.slice(0, half) : items.slice(half)
    const ss = l === 0 ? sents.slice(0, sHalf) : sents.slice(sHalf)
    return [
      ...introduce(focus, near, far, 'meaning', 'word'),
      match(focus, false),
      ...pick(ss, 2).map((s, i) => build(s, i ? 't' : 'en', pool)),
    ]
  }
  if (l === 2) {
    const ss = shuffle(sents)
    return shuffle([
      ...ss.slice(0, 5).map((s, i) => build(s, i % 2 ? 't' : 'en', pool)),
      fill(ss[5] ?? ss[0], pool),
      fill(ss[6] ?? ss[1], pool),
      ...pick(items, 2).map(it => choice('meaning', it, near, far)),
      match(pick(items, 5), false),
      ...(glyphs ? pick(items.filter(x => x.g), 1).map(it => choice('glyph', it, near, far)) : []),
      ...(ctx.spell ? pick(items.filter(spellable), 1).map(it => spell(it, far)) : []),
    ])
  }
  return shuffle([
    ...pick(items, 3).map(it => typed(it, 'en')),
    ...pick(sents, 3).map((s, i) => build(s, i % 2 ? 'en' : 't', pool)),
    ...pick(items, 2).map(it => choice('word', it, near, far)),
    ...(glyphs ? pick(items.filter(x => x.g), 1).map(it => choice('glyph', it, near, far)) : []),
    ...(ctx.spell ? pick(items.filter(spellable), 2).map(it => spell(it, far)) : []),
    fill(pick(sents, 1)[0], pool),
    match(pick(items, 5), false),
  ])
}

function scriptLesson(unit, l, ctx) {
  const { items } = unit
  const near = items, far = ctx.signs
  const half = Math.ceil(items.length / 2)
  if (l < 2) {
    const focus = l === 0 ? items.slice(0, half) : items.slice(half)
    return [
      ...introduce(focus, near, far, 'sound', 'sign'),
      match(focus, true),
      ...pick(focus, 2).map(it => choice('sound', it, focus, far)),
    ]
  }
  return shuffle([
    ...pick(items, 4).map(it => choice('sound', it, near, far)),
    ...pick(items, 3).map(it => choice('sign', it, near, far)),
    ...pick(items, 3).map(it => typed(it, 'g')),
    match(items, true),
    match(items, true),
  ])
}

export function buildLesson(course, u, l) {
  const unit = course.units[u]
  const ctx = context(course, u)
  const list = unit.kind === 'script' ? scriptLesson(unit, l, ctx) : wordLesson(unit, l, ctx)
  return list.filter(Boolean)
}

// Practice goes after the weakest words: missed, fading, or not seen for a while.
// weakness(item) is higher for words that need it more.
export function buildPractice(course, lastUnit, weakness) {
  const ctx = context(course, lastUnit)
  const weak = shuffle([...ctx.words, ...ctx.signs]).sort((a, b) => weakness(b) - weakness(a)).slice(0, 8)
  const words = weak.filter(it => ctx.words.includes(it))
  const signs = weak.filter(it => ctx.signs.includes(it))
  const drills = [
    it => choice('meaning', it, words, ctx.words),
    it => choice('word', it, words, ctx.words),
    it => typed(it, 'en'),
    it => ctx.spell && spellable(it) ? spell(it, ctx.words) : choice('meaning', it, words, ctx.words),
  ]
  const uses = s => words.some(it => tokens(s.t).some(t => normT(t) === normT(it.t)))
  const list = [
    ...words.map((it, i) => drills[i % drills.length](it)),
    ...signs.map((it, i) => choice(i % 2 ? 'sign' : 'sound', it, signs, ctx.signs)),
    words.length >= 3 ? match(words, false) : match(signs.length >= 3 ? signs : ctx.signs, true),
    ...pick(ctx.sentences.filter(uses), 2).map((s, i) => build(s, i ? 't' : 'en', ctx.sentences)),
  ]
  return { exercises: shuffle(list.filter(Boolean)), focus: weak }
}
