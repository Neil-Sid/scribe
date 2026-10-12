const KEY = 'scribe.v1'
const MAX_HEARTS = 5
const HEART_MS = 30 * 60 * 1000
const MAX_FREEZES = 2
const FADE_DAYS = [0, 1, 2, 4, 8, 16]   // a word drops a level after this many days unseen, by strength

const fresh = () => ({
  course: null,
  done: {},        // course id -> lessons completed (lessons unlock in order)
  courseXp: {},
  words: {},       // course id -> word key -> { s: strength 0-5, at: last seen, miss: times missed }
  stories: {},     // course id -> ids of stories read
  badges: {},      // badge id -> day earned
  stats: { perfect: 0, spelled: 0, practices: 0, frozen: 0 },
  xp: 0,
  streak: 0,
  lastDay: null,   // day numbers, see dayNum()
  freezes: 0,
  today: { day: null, xp: 0 },
  hearts: MAX_HEARTS,
  heartAt: Date.now(),
  goal: 20,
  sound: true,
  translit: true,
})

// Local calendar day as a plain number, so gaps between days are simple subtraction
export const dayNum = (t = Date.now()) => Math.floor((t - new Date(t).getTimezoneOffset() * 6e4) / 864e5)

// Older saves stored days as "Y-M-D" strings
const fromOld = d => {
  if (typeof d !== 'string') return d
  const [y, m, day] = d.split('-').map(Number)
  return dayNum(new Date(y, m - 1, day, 12).getTime())
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) ?? {}
    const s = { ...fresh(), ...saved, stats: { ...fresh().stats, ...saved.stats } }
    s.lastDay = fromOld(s.lastDay)
    s.today = { ...s.today, day: fromOld(s.today.day) }
    return s
  } catch { return fresh() }
}

export const state = load()

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

// ---------- streak ----------

const missedDays = () => state.lastDay == null ? Infinity : dayNum() - state.lastDay - 1

// Days missed since the last lesson are covered by freezes until the next lesson spends them
export function streak() {
  const gap = missedDays()
  return gap <= 0 || gap <= state.freezes ? state.streak : 0
}

export function earnFreeze() {
  if (state.freezes >= MAX_FREEZES) return false
  state.freezes++
  save()
  return true
}

export function todayXp() {
  return state.today.day === dayNum() ? state.today.xp : 0
}

// Returns how many freezes were spent to keep the streak alive
function addXp(courseId, xp) {
  let spent = 0
  const day = dayNum()
  if (state.lastDay !== day) {
    const gap = missedDays()
    if (gap <= 0) state.streak++
    else if (gap <= state.freezes) {
      spent = gap
      state.freezes -= gap
      state.stats.frozen += gap
      state.streak++
    } else state.streak = 1
  }
  state.lastDay = day
  state.xp += xp
  state.courseXp[courseId] = (state.courseXp[courseId] ?? 0) + xp
  state.today = { day, xp: todayXp() + xp }
  return spent
}

export function finishLesson(courseId, index, xp, { perfect, practice } = {}) {
  if (index === (state.done[courseId] ?? 0)) state.done[courseId] = index + 1
  if (perfect) state.stats.perfect++
  if (practice) state.stats.practices++
  const spent = addXp(courseId, xp)
  save()
  return spent
}

export function finishStory(courseId, storyId, xp) {
  const read = state.stories[courseId] ??= []
  if (!read.includes(storyId)) read.push(storyId)
  const spent = addXp(courseId, xp)
  save()
  return spent
}

// ---------- hearts ----------

export function hearts() {
  if (state.hearts < MAX_HEARTS) {
    const gained = Math.floor((Date.now() - state.heartAt) / HEART_MS)
    if (gained > 0) {
      state.hearts = Math.min(MAX_HEARTS, state.hearts + gained)
      state.heartAt += gained * HEART_MS
      save()
    }
  }
  return state.hearts
}

export function nextHeartIn() {
  return state.hearts >= MAX_HEARTS ? 0 : HEART_MS - (Date.now() - state.heartAt)
}

export function loseHeart() {
  if (hearts() === MAX_HEARTS) state.heartAt = Date.now()
  state.hearts = Math.max(0, state.hearts - 1)
  save()
}

export function gainHeart() {
  state.hearts = Math.min(MAX_HEARTS, hearts() + 1)
  save()
}

// ---------- word strength ----------

export const wordKey = it => `${it.t}|${it.en}`

export const wordOf = (courseId, it) => state.words[courseId]?.[wordKey(it)]

// result: 'right' | 'wrong' | 'seen' (seen in a sentence: refreshes without grading)
export function recordWord(courseId, it, result) {
  const book = state.words[courseId] ??= {}
  const w = book[wordKey(it)] ??= { s: 0, at: 0, miss: 0 }
  if (result === 'right') w.s = Math.min(5, w.s + 1)
  if (result === 'wrong') { w.s = Math.max(0, w.s - 2); w.miss++ }
  if (result === 'seen') w.s = Math.max(2, w.s)
  w.at = Date.now()
  save()
}

// Strength 0-5 after time has worn it down
export function strength(w) {
  if (!w) return 0
  const days = (Date.now() - w.at) / 864e5
  const fade = FADE_DAYS[w.s] ? Math.floor(days / FADE_DAYS[w.s]) : 0
  return Math.max(0, w.s - fade)
}

export function grantBadge(id) {
  if (state.badges[id]) return false
  state.badges[id] = dayNum()
  save()
  return true
}

export function reset() {
  localStorage.removeItem(KEY)
  Object.assign(state, fresh())
}
