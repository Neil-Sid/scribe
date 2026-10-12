import { state, grantBadge } from './store.js'

const sum = o => Object.values(o).reduce((a, b) => a + b, 0)

// c: progress facts that need course data, computed in main.js (see progressFacts)
export const BADGES = [
  { id: 'first', name: 'First Words', about: 'Finish your first lesson', g: '𓏞', font: 'hieroglyphs', test: () => sum(state.done) >= 1 },
  { id: 'unit', name: 'Tablet Filled', about: 'Finish a whole unit', g: '𒁾', font: 'cuneiform', test: c => c.unitsDone >= 1 },
  { id: 'perfect', name: 'Nefer', about: 'Finish 5 lessons without a mistake', g: '𓄤', font: 'hieroglyphs', test: () => state.stats.perfect >= 5 },
  { id: 'streak7', name: 'Seven Suns', about: 'Keep a 7-day streak', g: '𓇳', font: 'hieroglyphs', test: () => state.streak >= 7 },
  { id: 'streak30', name: 'Full Moon', about: 'Keep a 30-day streak', g: '𓇹', font: 'hieroglyphs', test: () => state.streak >= 30 },
  { id: 'xp100', name: 'Centurion', about: 'Earn 100 XP', g: 'C', font: 'latin', test: () => state.xp >= 100 },
  { id: 'xp1000', name: 'Legate', about: 'Earn 1,000 XP', g: 'M', font: 'latin', test: () => state.xp >= 1000 },
  { id: 'story', name: 'Reader', about: 'Read your first story', g: '𓏛', font: 'hieroglyphs', test: c => c.storiesRead >= 1 },
  { id: 'spell', name: 'Stylus', about: 'Spell 25 words with signs', g: '𒊬', font: 'cuneiform', test: () => state.stats.spelled >= 25 },
  { id: 'practice', name: 'Heart of Memory', about: 'Finish 10 practice sessions', g: '𓄣', font: 'hieroglyphs', test: () => state.stats.practices >= 10 },
  { id: 'comeback', name: 'Wedjat', about: 'Bring a word you missed back to full strength', g: '𓂀', font: 'hieroglyphs',
    test: () => Object.values(state.words).some(book => Object.values(book).some(w => w.miss > 0 && w.s === 5)) },
  { id: 'freeze', name: 'Ísa', about: 'Have a streak freeze save your streak', g: 'ᛁ', font: 'runic', test: () => state.stats.frozen >= 1 },
  { id: 'polyglot', name: 'Polyglot', about: 'Start three languages', g: '𒅴', font: 'cuneiform', test: c => c.started >= 3 },
  { id: 'babel', name: 'Babel', about: 'Start every language', g: '𓂋', font: 'hieroglyphs', test: c => c.started >= c.courses },
  { id: 'course', name: 'Omega', about: 'Finish a whole course', g: 'Ω', font: 'greek', test: c => c.coursesDone >= 1 },
]

export const storyBadge = (course, story) => story.badge && {
  id: `story:${course.id}:${story.id}`,
  name: story.badge.name,
  about: story.badge.about,
  g: course.emblem,
  font: course.script?.font ?? 'latin',
}

// Grants every badge whose condition now holds and returns the new ones
export function award(c, extra = []) {
  return [...BADGES.filter(b => b.test(c)), ...extra].filter(b => grantBadge(b.id))
}
