import {
  state, save, streak, todayXp, hearts, nextHeartIn, finishLesson, finishStory, gainHeart, earnFreeze,
  recordWord, wordOf, strength, reset,
} from './store.js'
import { lessonCount, lessonLabel, buildLesson, buildPractice } from './exercises.js'
import { BADGES, storyBadge, award } from './badges.js'
import { runLesson } from './lesson.js'
import { runStory } from './story.js'
import { mount, icon, word, scriptFont } from './ui.js'
import { esc, tokens, normT, loose } from './text.js'
import { canSpeak, say, speakButton, voiceInfo } from './speech.js'
import { play } from './sound.js'

const courses = new Map()
let order = []
let dictQuery = '', dictAll = false
let openNode = null   // 'L<index>' for a lesson, 'S<id>' for a story

const get = path => fetch(path, { cache: 'no-cache' }).then(r => r.json())

async function loadCourses() {
  order = await get('data/index.json')
  const withStories = await get('data/stories/index.json').catch(() => [])
  await Promise.all(order.map(async id => {
    try {
      const c = await get(`data/${id}.json`)
      if (!c.units?.length) return
      c.stories = withStories.includes(id) ? await get(`data/stories/${id}.json`).catch(() => []) : []
      courses.set(id, c)
    } catch {}
  }))
}

// Grammar tables and the pronunciation guide load on first use
async function loadRef(course) {
  if (course.ref === undefined) course.ref = await get(`data/reference/${course.id}.json`).catch(() => null)
  return course.ref
}

// Every lesson in a course, numbered in the order they unlock
function lessonsOf(course) {
  let index = 0
  return course.units.flatMap((unit, u) =>
    Array.from({ length: lessonCount(unit) }, (_, l) => ({ u, l, unit, index: index++ })))
}

// Number of lessons in the first n units
const unitEnd = (course, n) => course.units.slice(0, n).reduce((sum, unit) => sum + lessonCount(unit), 0)
const doneIn = course => state.done[course.id] ?? 0
const lastUnit = course => { const ls = lessonsOf(course), d = doneIn(course); return d ? ls[Math.min(d, ls.length) - 1].u : 0 }
// The unit the learner is working in now
const currentUnit = course => { const ls = lessonsOf(course); return ls[Math.min(doneIn(course), ls.length - 1)].u }

const roman = n => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n)
const minutes = ms => Math.max(1, Math.ceil(ms / 60000))
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const theme = course => course ? `style="--accent:${course.accent}" data-script="${scriptFont(course)}"` : 'data-script="latin"'

function go(hash) {
  if (location.hash === hash) route()
  else location.hash = hash
}

// ---------- progress facts ----------

// Higher means the word needs practice more: weak, missed, or never reviewed
const weakness = course => it => {
  const w = wordOf(course.id, it)
  return w ? 5 - strength(w) + Math.min(w.miss, 4) * 0.5 : 2.5
}

function learnedItems(course) {
  return course.units.slice(0, lastUnit(course) + 1).flatMap(u => u.items).filter(it => wordOf(course.id, it))
}

const needsReview = course => learnedItems(course).filter(it => strength(wordOf(course.id, it)) <= 2).length

function progressFacts() {
  let unitsDone = 0, coursesDone = 0
  for (const c of courses.values()) {
    c.units.forEach((_, u) => { if (doneIn(c) >= unitEnd(c, u + 1)) unitsDone++ })
    if (doneIn(c) >= unitEnd(c, c.units.length)) coursesDone++
  }
  return {
    unitsDone,
    coursesDone,
    started: [...courses.keys()].filter(id => state.done[id]).length,
    courses: courses.size,
    storiesRead: Object.values(state.stories).reduce((sum, ids) => sum + ids.length, 0),
  }
}

const allBadges = () => [...BADGES, ...[...courses.values()].flatMap(c => c.stories.map(s => storyBadge(c, s)).filter(Boolean))]

// Turns each answer into word-strength updates
function tracker(course) {
  const byToken = new Map(course.units.flatMap(u => u.items).map(it => [normT(it.t), it]))
  const rec = (it, result) => recordWord(course.id, it, result)
  return (ex, right, slips) => {
    if (ex.item) rec(ex.item, right ? 'right' : ex.isNew ? 'seen' : 'wrong')
    if (ex.type === 'match' && right) ex.pairs.forEach((it, i) => rec(it, slips.has(i) ? 'wrong' : 'right'))
    if (ex.sentence && right) tokens(ex.sentence.t).forEach(t => byToken.has(normT(t)) && rec(byToken.get(normT(t)), 'seen'))
    if (ex.type === 'spell' && right) state.stats.spelled++
  }
}

// ---------- shell ----------

function frame(main, { course, active, rail = true }) {
  const nav = (key, href, ic, label) =>
    `<a class="nav ${active === key ? 'on' : ''}" href="${href}">${icon(ic)}<span>${label}</span></a>`
  return `<div class="frame ${rail ? '' : 'no-rail'}" ${theme(course)}>
    <nav class="side">
      <a class="brand" href="#/"><span class="brand-mark">𓅞</span><span class="brand-name">Scribe</span></a>
      ${course ? nav('learn', '#/', 'home', 'Learn') + nav('words', '#/words', 'dumbbell', 'Review') + nav('ref', '#/ref', 'temple', 'Reference') : ''}
      ${nav('courses', '#/courses', 'globe', 'Languages')}
      ${nav('profile', '#/profile', 'user', 'Profile')}
    </nav>
    <main class="main">
      ${course ? `<div class="top-stats">${statsRow(course)}</div>` : ''}
      ${main}
    </main>
    ${rail && course ? `<aside class="rail">${railHtml(course)}</aside>` : ''}
  </div>`
}

function statsRow(course) {
  const h = hearts()
  return `<div class="stats">
    <a class="stat chip" href="#/courses" title="${esc(course.name)}: change language"><span class="g">${esc(course.emblem)}</span></a>
    <span class="stat flame ${streak() ? 'on' : ''}" title="Day streak · ${plural(state.freezes, 'streak freeze')}">${icon('flame')}${streak()}${state.freezes && streak() ? `<i class="freeze-dot">${icon('snow')}</i>` : ''}</span>
    <span class="stat xp" title="Total XP">${icon('bolt')}${state.xp}</span>
    <span class="stat heart ${h ? '' : 'empty'}" title="${h < 5 ? `Next heart in ${minutes(nextHeartIn())} min` : 'Hearts full'}">${icon('heart')}${h}</span>
  </div>`
}

function railHtml(course) {
  const today = todayXp()
  const facts = course.facts ?? []
  const fact = facts[(new Date().getDate() + course.id.length) % Math.max(1, facts.length)]
  const review = needsReview(course)
  return `${statsRow(course)}
    <section class="panel">
      <h3>Daily goal</h3>
      <div class="goal"><div class="meter"><i style="width:${Math.min(100, (today / state.goal) * 100)}%"></i></div><span>${today} / ${state.goal} XP</span></div>
      <p class="muted">${today >= state.goal ? 'Goal met. The scribes are pleased.' : `Earn ${state.goal - today} more XP today to keep the habit.`}</p>
      <p class="freeze-line">${icon('snow')}<span>${state.freezes} of 2 streak freezes · finish a unit to earn one</span></p>
    </section>
    <section class="panel">
      <h3>Practice your mistakes</h3>
      <p class="muted">${review ? `${plural(review, 'word is', 'words are')} weak or fading.` : 'Your words are fresh.'} Practice brings back the weakest first and restores a heart.</p>
      <button class="btn outline" data-act="practice">${icon('dumbbell')} Practice</button>
      <a class="panel-link" href="#/words">See all your words</a>
    </section>
    ${fact ? `<section class="panel fact"><h3>Did you know?</h3><p>${esc(fact)}</p></section>` : ''}`
}

// ---------- learn path ----------

const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56]

function decorFor(course, unit, u) {
  const withGlyph = unit.items.filter(x => x.g).sort((a, b) => [...a.g].length - [...b.g].length)[0]
  if (withGlyph) return [...withGlyph.g.split(' ')[0]].slice(0, 3).join('')
  const signs = course.units.filter(x => x.kind === 'script').flatMap(x => x.items)
  return signs.length ? signs[(u * 3) % signs.length].g.split(' ')[0] : roman(u + 1)
}

function showHome(course, { scroll } = {}) {
  const lessons = lessonsOf(course)
  const done = Math.min(doneIn(course), lessons.length)
  const units = course.units.map((unit, u) => {
    const ls = lessons.filter(x => x.u === u)
    const flip = u % 2 ? -1 : 1
    const offset = i => OFFSETS[i % OFFSETS.length] * flip
    const stories = course.stories.filter(s => s.unit === u + 1)
    const nodes = ls.map((x, i) => node(x, done, offset(i))).join('') +
      stories.map((s, j) => storyNode(course, s, done >= unitEnd(course, u + 1), offset(ls.length + j))).join('')
    return `<section class="unit">
      <header class="unit-head ${ls[0].index > done ? 'locked' : ''}">
        <div>
          <p class="eyebrow">Unit ${u + 1}${unit.kind === 'script' ? ' · Script' : ''}</p>
          <h2>${esc(unit.title)}</h2>
          <p>${esc(unit.about)}</p>
        </div>
        <a class="guide-btn" href="#/guide/${u}">${icon('book')}<span>Guidebook</span></a>
      </header>
      <div class="path">
        ${nodes}
        <span class="decor g ${flip > 0 ? 'left' : 'right'}" aria-hidden="true">${esc(decorFor(course, unit, u))}</span>
      </div>
    </section>`
  }).join('')
  const finished = done >= lessons.length
    ? `<div class="finished"><p class="eyebrow">Course complete</p><h2>You finished ${esc(course.name)}.</h2><p class="muted">Keep practising, or start another language.</p></div>`
    : ''
  const open = key => { openNode = openNode === key ? null : key; showHome(course) }
  mount(frame(`<div class="learn">${units}${finished}</div>`, { course, active: 'learn' }), {
    node: el => open(`L${el.dataset.i}`),
    snode: el => open(`S${el.dataset.id}`),
    start: el => { openNode = null; startLesson(course, +el.dataset.i) },
    read: el => { openNode = null; startStory(course, course.stories.find(s => s.id === el.dataset.id)) },
    practice: () => startPractice(course),
    blank: e => { if (openNode != null && !e.target.closest('.pop')) { openNode = null; showHome(course) } },
  })
  if (scroll) document.querySelector('.node.current')?.scrollIntoView({ block: 'center' })
}

function node(x, done, dx) {
  const st = x.index < done ? 'done' : x.index === done ? 'current' : 'locked'
  const last = x.l === lessonCount(x.unit) - 1
  const ic = last ? 'trophy' : st === 'done' ? 'check' : st === 'locked' ? 'lock' : 'star'
  const open = openNode === `L${x.index}`
  return `<div class="node-wrap ${open ? 'open' : ''}" style="--dx:${dx}px">
    ${st === 'current' && !open ? `<span class="start-tag">${done === 0 ? 'Start' : 'Next'}</span>` : ''}
    <button class="node ${st} ${last ? 'review' : ''}" data-act="node" data-i="${x.index}" aria-label="${esc(lessonLabel(x.unit, x.l))}">${icon(ic)}</button>
    ${open ? lessonPop(x, st) : ''}
  </div>`
}

function lessonPop(x, st) {
  const action = st === 'locked'
    ? `<button class="btn" disabled>Locked</button>`
    : `<button class="btn ${st === 'done' ? 'outline' : 'primary'} wide" data-act="start" data-i="${x.index}">${st === 'done' ? 'Redo lesson' : 'Start'} <span class="xp-tag">+10 XP</span></button>`
  return `<div class="pop ${st}">
    <p class="pop-kicker">${esc(lessonLabel(x.unit, x.l))}</p>
    <p class="pop-title">Lesson ${x.l + 1} of ${lessonCount(x.unit)}</p>
    ${st === 'locked' ? '<p class="muted">Finish the lessons above to unlock this one.</p>' : ''}
    ${action}
  </div>`
}

function storyNode(course, story, unlocked, dx) {
  const read = state.stories[course.id]?.includes(story.id)
  const st = !unlocked ? 'locked' : read ? 'done' : 'current'
  const open = openNode === `S${story.id}`
  const pop = `<div class="pop ${st === 'locked' ? 'locked' : ''}">
    <p class="pop-kicker">Story · ${esc(story.title)}</p>
    <p class="pop-title">${esc(story.source)}</p>
    ${unlocked
      ? `<button class="btn ${read ? 'outline' : 'primary'} wide" data-act="read" data-id="${esc(story.id)}">${read ? 'Read again' : 'Read'} <span class="xp-tag">+10 XP</span></button>`
      : `<p class="muted">Finish unit ${story.unit} to unlock this story.</p><button class="btn" disabled>Locked</button>`}
  </div>`
  return `<div class="node-wrap ${open ? 'open' : ''}" style="--dx:${dx}px">
    <button class="node story ${st}" data-act="snode" data-id="${esc(story.id)}" aria-label="Story: ${esc(story.title)}">${icon(read ? 'check' : 'scroll')}</button>
    ${open ? pop : ''}
  </div>`
}

// ---------- lessons and stories ----------

function startLesson(course, index) {
  if (hearts() === 0) return showNoHearts(course)
  const x = lessonsOf(course)[index]
  runLesson({
    course,
    exercises: buildLesson(course, x.u, x.l),
    onAnswer: tracker(course),
    onQuit: () => go('#/'),
    onOutOfHearts: () => showNoHearts(course),
    onFinish: r => {
      const firstFinish = index === doneIn(course)
      const unitDone = firstFinish && x.l === lessonCount(x.unit) - 1
      const spent = finishLesson(course.id, index, r.xp, { perfect: r.perfect })
      const froze = unitDone && earnFreeze()
      showComplete(course, r, { spent, froze, badges: award(progressFacts()) })
    },
  })
}

function startPractice(course) {
  const { exercises, focus } = buildPractice(course, lastUnit(course), weakness(course))
  runLesson({
    course,
    practice: true,
    exercises,
    onAnswer: tracker(course),
    onQuit: () => go('#/'),
    onFinish: r => {
      gainHeart()
      const spent = finishLesson(course.id, -1, r.xp, { practice: true })
      showComplete(course, r, { practice: true, focus, spent, badges: award(progressFacts()) })
    },
  })
}

function startStory(course, story) {
  runStory({
    course,
    story,
    onQuit: () => go('#/'),
    onFinish: r => {
      const spent = finishStory(course.id, story.id, r.xp)
      showComplete(course, r, { story, spent, badges: award(progressFacts(), [storyBadge(course, story)].filter(Boolean)) })
    },
  })
}

const badgeCard = (b, earned = true) => `<div class="badge-card ${earned ? '' : 'locked'}">
  <span class="badge-glyph g ${[...b.g].length > 2 ? 'long' : ''}" data-script="${b.font}">${esc(b.g)}</span>
  <span><strong>${esc(b.name)}</strong><small>${esc(b.about)}</small></span>
</div>`

function showComplete(course, r, { practice, story, focus, spent, froze, badges = [] }) {
  play('done')
  const head = story ? 'Story complete' : practice ? 'Practice complete' : r.perfect ? 'A perfect lesson' : 'Lesson complete'
  const lede = story ? `You just read ${esc(story.source)}.`
    : practice ? `You reviewed ${plural(focus.length, 'weak word')} and earned a heart back.`
    : r.perfect ? 'No mistakes. A bonus 5 XP is yours.' : 'Every mistake you fixed is a word you will remember.'
  const notes = [
    spent && `${icon('snow')}<span>${plural(spent, 'streak freeze')} kept your streak alive.</span>`,
    froze && `${icon('snow')}<span>Unit finished: you earned a streak freeze (${state.freezes} of 2).</span>`,
  ].filter(Boolean)
  const middle = story
    ? `<div class="end-stat green"><span>Lines read</span><strong>${story.lines.length}</strong></div>`
    : `<div class="end-stat green"><span>Accuracy</span><strong>${r.accuracy}%</strong></div>`
  mount(`<div class="end" ${theme(course)}>
    <div class="end-in">
      <span class="end-mark g">${esc(course.emblem)}</span>
      <h1>${head}</h1>
      <p class="lede">${lede}</p>
      <div class="end-stats">
        <div class="end-stat gold"><span>Total XP</span><strong>${icon('bolt')}${r.xp}</strong></div>
        ${middle}
        <div class="end-stat blue"><span>Time</span><strong>${clock(r.seconds)}</strong></div>
      </div>
      ${notes.map(n => `<p class="end-note">${n}</p>`).join('')}
      ${badges.length ? `<div class="end-badges"><p class="eyebrow">New ${badges.length > 1 ? 'badges' : 'badge'}</p>${badges.map(b => badgeCard(b)).join('')}</div>` : ''}
      <button class="btn primary wide" data-act="home">Continue</button>
    </div>
  </div>`, {
    home: () => go('#/'),
    key: e => { if (e.key === 'Enter') go('#/') },
  })
}

function showNoHearts(course) {
  mount(`<div class="end" ${theme(course)}>
    <div class="end-in">
      <span class="end-mark heart">${icon('heart')}</span>
      <h1>You ran out of hearts</h1>
      <p class="lede">A heart comes back every 30 minutes; the next one in ${minutes(nextHeartIn())} min. Or earn one now by practising what you already know.</p>
      <button class="btn primary wide" data-act="practice">Practice for a heart</button>
      <button class="btn ghost wide" data-act="home">Not now</button>
    </div>
  </div>`, {
    practice: () => startPractice(course),
    home: () => go('#/'),
  })
}

// ---------- other pages ----------

function showCourses() {
  const course = courses.get(state.course)
  const cards = order.map(id => {
    const c = courses.get(id)
    if (!c) return `<div class="lang soon"><span class="lang-name">${esc(id[0].toUpperCase() + id.slice(1))}</span><span class="lang-meta">Being prepared</span></div>`
    const total = lessonsOf(c).length, done = Math.min(doneIn(c), total)
    return `<button class="lang ${state.course === id ? 'current' : ''}" data-act="pick" data-id="${id}" ${theme(c)}>
      <span class="lang-emblem g">${esc(c.emblem)}</span>
      <span class="lang-name">${esc(c.name)}</span>
      <span class="lang-native mixed">${esc(c.native)}</span>
      <span class="lang-blurb">${esc(c.blurb)}</span>
      <span class="lang-meta">${esc(c.era)}</span>
      ${done ? `<span class="lang-progress"><i style="width:${(done / total) * 100}%"></i></span>` : `<span class="lang-meta">${c.units.length} units · ${total} lessons${c.stories.length ? ` · ${plural(c.stories.length, 'story', 'stories')}` : ''}</span>`}
    </button>`
  }).join('')
  const main = `<div class="page">
    <header class="page-head">
      <p class="eyebrow">${course ? 'Languages' : 'Welcome to Scribe'}</p>
      <h1>${course ? 'Pick up another tongue' : 'Which dead language will you learn?'}</h1>
      <p class="lede">Languages nobody has spoken for centuries, taught the way you would learn a living one: a few words at a time, a few minutes a day.</p>
    </header>
    <div class="langs">${cards}</div>
  </div>`
  mount(frame(main, { course, active: 'courses', rail: false }), {
    pick: el => { state.course = el.dataset.id; save(); go('#/') },
  })
}

async function showGuide(course, u) {
  const unit = course.units[u]
  if (!unit) return go('#/')
  const tables = ((await loadRef(course))?.grammar ?? []).filter(tb => tb.unit === u + 1)
  const tips = (unit.guide ?? []).map(g => `<section class="tip">
      <h3>${esc(g.h)}</h3>
      <p>${esc(g.p)}</p>
      ${g.ex?.length ? `<dl class="examples">${g.ex.map(([t, en]) => `<div><dt class="mixed">${esc(t)}</dt><dd>${esc(en)}</dd></div>`).join('')}</dl>` : ''}
    </section>`).join('')
  const vocab = unit.items.map(it => `<div class="vocab-row">${word(it, 'md')}<span>${esc(it.en)}</span></div>`).join('')
  const phrases = (unit.sentences ?? []).map(s => {
    const g = s.g ? tokens(s.g) : []
    return `<div class="phrase"><div class="sent">${tokens(s.t).map((t, i) => word({ t, g: g[i] })).join('')}</div><p>${esc(s.en)}</p></div>`
  }).join('')
  const main = `<article class="page guide">
    <a class="back" href="#/">${icon('back')} Back to the path</a>
    <p class="eyebrow">Unit ${u + 1} guidebook</p>
    <h1>${esc(unit.title)}</h1>
    <p class="lede">${esc(unit.about)}</p>
    ${tips}
    <h2>${unit.kind === 'script' ? 'Signs in this unit' : 'Words in this unit'}</h2>
    <div class="vocab">${vocab}</div>
    ${phrases ? `<h2>Key phrases</h2><div class="phrases">${phrases}</div>` : ''}
    ${tables.length ? `<h2>Tables for this unit</h2>${tables.map(tb => grammarTable(tb, Infinity)).join('')}` : ''}
  </article>`
  mount(frame(main, { course, active: 'learn' }), { practice: () => startPractice(course) })
  scrollTo(0, 0)
}

function ago(t) {
  const days = Math.floor((Date.now() - t) / 864e5)
  return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

function showWords(course) {
  const items = learnedItems(course)
    .map(it => ({ it, w: wordOf(course.id, it) }))
    .map(x => ({ ...x, s: strength(x.w) }))
    .sort((a, b) => a.s - b.s || b.w.miss - a.w.miss)
  const rows = items.map(({ it, w, s }) => `<div class="word-row">
      ${word(it, 'md')}
      <span class="word-en">${esc(it.en)}</span>
      <span class="word-meta">${w.miss ? `missed ${w.miss}× · ` : ''}${ago(w.at)}</span>
      <span class="strength s${s}" title="Strength ${s} of 5">${'<i></i>'.repeat(5)}</span>
    </div>`).join('')
  const weak = items.filter(x => x.s <= 2).length
  const main = `<div class="page">
    <header class="page-head">
      <p class="eyebrow">Review</p>
      <h1>Your words</h1>
      <p class="lede">Words get weaker when you miss them or leave them alone for a while. Practice picks the weakest ones first.</p>
    </header>
    <div class="review-bar">
      <span><strong>${items.length}</strong> learned · <strong>${weak}</strong> need review</span>
      <button class="btn primary" data-act="practice">${icon('dumbbell')} Practice weakest words</button>
    </div>
    ${rows ? `<div class="word-list">${rows}</div>` : '<p class="muted">Finish a lesson and the words you learn will show up here.</p>'}
  </div>`
  mount(frame(main, { course, active: 'words' }), { practice: () => startPractice(course) })
}

// ---------- reference: dictionary, grammar, pronunciation ----------

const notYet = (what, course) => `<p class="muted ref-empty">The ${what} for ${esc(course.name)} is still being written.</p>`

function dictionaryEntries(course, all = dictAll) {
  const reach = all ? course.units.length : currentUnit(course) + 1
  const seen = new Set()
  return course.units.slice(0, reach)
    .flatMap((u, i) => u.kind === 'script' ? [] : u.items.map(it => ({ it, unit: i + 1 })))
    .filter(({ it }) => {
      const key = `${it.t}|${it.en}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.it.t.localeCompare(b.it.t, undefined, { sensitivity: 'base' }))
}

function dictionaryRows(course) {
  const q = dictQuery.trim().toLowerCase()
  const matches = it => !q || loose(it.t).includes(loose(q)) || it.g?.includes(q) ||
    [it.en, ...(it.alt ?? [])].some(e => e.toLowerCase().includes(q))
  const hits = dictionaryEntries(course).filter(({ it }) => matches(it))
  if (!hits.length) return `<p class="muted ref-empty">No words match “${esc(dictQuery)}”.</p>`
  return hits.map(({ it, unit }) => {
    const w = wordOf(course.id, it)
    return `<div class="dict-row">
      ${word(it, 'md')}
      <span class="dict-en">${esc(it.en)}${it.alt?.length ? `<small>${esc(it.alt.join(', '))}</small>` : ''}</span>
      <span class="dict-unit">Unit ${unit}</span>
      <span class="strength s${w ? strength(w) : 0}" title="${w ? `Strength ${strength(w)} of 5` : 'Not practised yet'}">${'<i></i>'.repeat(5)}</span>
      <span class="dict-say">${speakButton(course, it)}</span>
    </div>`
  }).join('')
}

const dictionaryHtml = course => `<div class="dict-tools">
    <input id="dict-q" class="type-in" type="search" value="${esc(dictQuery)}" placeholder="Search in ${esc(course.name)} or English" autocomplete="off" spellcheck="false">
    <div class="segs">
      <button class="seg ${dictAll ? '' : 'on'}" data-act="scope" data-all="0">Words I've met · ${dictionaryEntries(course, false).length}</button>
      <button class="seg ${dictAll ? 'on' : ''}" data-act="scope" data-all="1">All words · ${dictionaryEntries(course, true).length}</button>
    </div>
  </div>
  <div class="dict-list" id="dict-list">${dictionaryRows(course)}</div>`

const cell = c => typeof c === 'string' ? esc(c) : word(c)

function grammarTable(tb, reach) {
  return `<section class="gram">
    <div class="gram-head"><h3>${esc(tb.title)}</h3><span class="unit-tag ${tb.unit > reach ? 'ahead' : ''}">Unit ${tb.unit}</span></div>
    ${tb.note ? `<p class="muted">${esc(tb.note)}</p>` : ''}
    <div class="table-wrap"><table class="gram-table">
      <thead><tr>${tb.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${tb.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${cell(c)}</td>` : `<th scope="row">${cell(c)}</th>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </section>`
}

const grammarHtml = course => course.ref?.grammar?.length
  ? `<p class="lede ref-lede">Every table in the course, in the order the units teach them. Tables from units you haven't reached yet are marked.</p>${course.ref.grammar.map(tb => grammarTable(tb, currentUnit(course) + 1)).join('')}`
  : notYet('grammar reference', course)

function soundsHtml(course) {
  const s = course.ref?.sounds
  if (!s) return notYet('pronunciation guide', course)
  const voice = voiceInfo(course)
  const byT = new Map(course.units.flatMap(u => u.items).map(it => [normT(it.t), it]))
  const audio = !voice
    ? `There is no audio here on purpose. Nobody alive has heard ${esc(course.name)} spoken, and a modern voice would teach the wrong sounds.`
    : canSpeak(course)
      ? `Tap ${icon('volume')} to hear an example read by ${voice.label}. Treat it as an approximation.`
      : `Examples can be read aloud by ${voice.label}, but this browser has no such voice installed. Microsoft Edge includes one.`
  const row = r => `<div class="snd-row">
      <span class="snd-letter">${r.g ? `<span class="g">${esc(r.g)}</span>` : ''}<span class="tt">${esc(r.t)}</span></span>
      <span class="snd-ipa">${r.ipa ? `/${esc(r.ipa)}/` : ''}</span>
      <span class="snd-like">${esc(r.like)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
      <span class="snd-ex">${r.ex ? `<span class="tt">${esc(r.ex)}</span>${speakButton(course, byT.get(normT(r.ex)) ?? { t: r.ex })}` : ''}</span>
    </div>`
  return `<p class="lede ref-lede">${esc(s.intro)}</p>
    <p class="audio-note">${audio}</p>
    ${s.groups.map(g => `<section class="snd-group"><h3>${esc(g.h)}</h3><div class="snd-list">${g.rows.map(row).join('')}</div></section>`).join('')}
    ${(s.tips ?? []).map(t => `<section class="tip"><h3>${esc(t.h)}</h3><p>${esc(t.p)}</p></section>`).join('')}`
}

async function showReference(course, tab = 'words') {
  await loadRef(course)
  const tabs = [['words', 'Dictionary'], ['grammar', 'Grammar'], ['sounds', 'Pronunciation']]
  const body = { words: dictionaryHtml, grammar: grammarHtml, sounds: soundsHtml }[tab] ?? dictionaryHtml
  const main = `<div class="page ref">
    <header class="page-head"><p class="eyebrow">Reference</p><h1>${esc(course.name)} at a glance</h1></header>
    <nav class="tabs">${tabs.map(([k, label]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/ref/${k}">${label}</a>`).join('')}</nav>
    ${body(course)}
  </div>`
  mount(frame(main, { course, active: 'ref', rail: false }), {
    say: el => say(course, el.dataset.text),
    scope: el => { dictAll = el.dataset.all === '1'; showReference(course, 'words') },
    input: el => {
      if (el.id !== 'dict-q') return
      dictQuery = el.value
      document.getElementById('dict-list').innerHTML = dictionaryRows(course)
    },
  })
}

function showProfile() {
  const course = courses.get(state.course)
  const started = order.filter(id => courses.has(id) && state.done[id])
  const lessonsDone = Object.values(state.done).reduce((a, b) => a + b, 0)
  const rows = started.map(id => {
    const c = courses.get(id), total = lessonsOf(c).length, done = Math.min(state.done[id], total)
    return `<a class="course-row" href="#/" data-act="pick" data-id="${id}" ${theme(c)}>
      <span class="g">${esc(c.emblem)}</span>
      <span class="course-row-main"><strong>${esc(c.name)}</strong><span class="lang-progress"><i style="width:${(done / total) * 100}%"></i></span></span>
      <span class="muted">${done}/${total} lessons · ${state.courseXp[id] ?? 0} XP</span>
    </a>`
  }).join('')
  const badges = allBadges()
  const earned = badges.filter(b => state.badges[b.id])
  const badgeGrid = [...earned, ...badges.filter(b => !state.badges[b.id])].map(b => badgeCard(b, !!state.badges[b.id])).join('')
  const toggle = (k, label, hint) => `<label class="setting"><span><strong>${label}</strong><small>${hint}</small></span>
    <button class="switch ${state[k] ? 'on' : ''}" data-act="toggle" data-k="${k}" role="switch" aria-checked="${state[k]}"><i></i></button></label>`
  const goals = [10, 20, 30, 50].map(g => `<button class="seg ${state.goal === g ? 'on' : ''}" data-act="goal" data-g="${g}">${g} XP</button>`).join('')
  const main = `<div class="page">
    <header class="page-head"><p class="eyebrow">Profile</p><h1>Your tablets so far</h1></header>
    <div class="big-stats">
      <div><span class="flame on">${icon('flame')}</span><strong>${streak()}</strong><small>day streak · ${plural(state.freezes, 'freeze')}</small></div>
      <div><span class="xp">${icon('bolt')}</span><strong>${state.xp}</strong><small>total XP</small></div>
      <div><span class="done-ic">${icon('check')}</span><strong>${lessonsDone}</strong><small>lessons done</small></div>
      <div><span class="globe">${icon('globe')}</span><strong>${started.length}</strong><small>languages</small></div>
    </div>
    <h2>Badges <span class="h2-count">${earned.length} of ${badges.length}</span></h2>
    <div class="badge-grid">${badgeGrid}</div>
    <h2>Languages</h2>
    ${rows || '<p class="muted">Finish a lesson and your languages will show up here.</p>'}
    <h2>Settings</h2>
    <div class="settings">
      ${toggle('sound', 'Sound effects', 'Chimes for right and wrong answers')}
      ${toggle('translit', 'Show transliteration', 'Romanised forms under cuneiform, hieroglyphs and other scripts')}
      <div class="setting"><span><strong>Daily goal</strong><small>XP to earn each day</small></span><div class="segs">${goals}</div></div>
      <div class="setting"><span><strong>Reset progress</strong><small>Clears every course, XP and streak on this device</small></span><button class="btn ghost danger" data-act="reset">Reset</button></div>
    </div>
  </div>`
  mount(frame(main, { course, active: 'profile', rail: false }), {
    toggle: el => { state[el.dataset.k] = !state[el.dataset.k]; save(); showProfile() },
    goal: el => { state.goal = +el.dataset.g; save(); showProfile() },
    pick: (el, e) => { e.preventDefault(); state.course = el.dataset.id; save(); go('#/') },
    reset: () => { if (confirm('Reset all progress on this device?')) { reset(); go('#/courses') } },
  })
}

// ---------- routing ----------

function route() {
  document.body.classList.toggle('no-tl', !state.translit)
  const [screen, arg] = location.hash.replace(/^#\/?/, '').split('/')
  const course = courses.get(state.course)
  if (screen === 'courses' || (!course && screen !== 'profile')) return showCourses()
  if (screen === 'profile') return showProfile()
  if (screen === 'guide') return showGuide(course, +arg)
  if (screen === 'words') return showWords(course)
  if (screen === 'ref') return showReference(course, arg)
  openNode = null
  showHome(course, { scroll: true })
}

window.addEventListener('hashchange', route)
loadCourses().then(route)

if (location.search.includes('debug')) {
  window.__app = {
    courses,
    lessonsOf,
    start(id, index) { state.course = id; startLesson(courses.get(id), index) },
    practice(id) { state.course = id; startPractice(courses.get(id)) },
    story(id, storyId) { state.course = id; const c = courses.get(id); startStory(c, c.stories.find(s => s.id === storyId)) },
  }
}
