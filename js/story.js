import { esc, tokens, shuffle } from './text.js'
import { mount, icon, word, scriptFont } from './ui.js'
import { play } from './sound.js'
import { say, speakButton } from './speech.js'

// Lines without a written question sometimes get a "which word means…" one
function wordQuestion(ln) {
  const toks = tokens(ln.t), g = ln.g ? tokens(ln.g) : []
  const cands = toks.map((t, i) => ({ t, g: g[i], gloss: ln.gloss[i] }))
    .filter((x, i, all) => all.findIndex(y => y.gloss === x.gloss) === i)
  if (cands.length < 3) return null
  const [target, ...rest] = shuffle(cands)
  const options = shuffle([target, ...rest.slice(0, 2)])
  return { prompt: `Which word means “${esc(target.gloss)}”?`, options: options.map(o => word(o)), answer: options.indexOf(target) }
}

// Written questions often list the right answer first, so options are shuffled
function asQuestion(q) {
  const order = shuffle(q.options.map((_, i) => i))
  return { prompt: esc(q.prompt), options: order.map(i => `<span>${esc(q.options[i])}</span>`), answer: order.indexOf(q.answer) }
}

export function runStory({ course, story, onQuit, onFinish }) {
  const lines = story.lines.map((ln, i) => ({ ...ln, ask: ln.q ? asQuestion(ln.q) : i % 2 ? wordQuestion(ln) : null }))
  const solved = new Set(), wrong = {}, glossed = new Set(), translated = new Set()
  const started = Date.now()
  let shown = 0, mistakes = 0

  mount(`
    <div class="lesson story" data-script="${scriptFont(course)}" style="--accent:${course.accent}">
      <header class="l-head">
        <button class="icon-btn" data-act="quit" aria-label="Close story">${icon('x')}</button>
        <div class="bar"><i id="bar"></i></div>
        <span class="pill">Story</span>
      </header>
      <main class="l-body s-body" id="body"></main>
      <footer class="l-foot"><div class="foot-in"><span></span><button class="btn primary" data-act="next" id="next"></button></div></footer>
    </div>`, {
    quit: onQuit,
    next: advance,
    ans: el => answer(+el.dataset.line, +el.dataset.i),
    gloss: el => toggle(glossed, el.dataset.k),
    tr: el => toggle(translated, +el.dataset.i),
    say: el => say(course, el.dataset.text),
    key: onKey,
  })

  const $ = id => document.getElementById(id)
  const waiting = () => shown > 0 && lines[shown - 1].ask && !solved.has(shown - 1)

  function toggle(set, k) {
    set.has(k) ? set.delete(k) : set.add(k)
    render()
  }

  function lineHtml(ln, i) {
    const g = ln.g ? tokens(ln.g) : []
    const toks = tokens(ln.t).map((t, j) => `<span class="tok known ${glossed.has(`${i}:${j}`) ? 'show' : ''}" data-act="gloss" data-k="${i}:${j}">${word({ t, g: g[j] })}<span class="gloss">${esc(ln.gloss[j])}</span></span>`).join('')
    const open = translated.has(i) || solved.has(i)
    const ask = ln.ask && `<div class="s-q">
      <p class="s-q-prompt">${ln.ask.prompt}</p>
      <div class="opts list">${ln.ask.options.map((o, k) => {
        const cls = solved.has(i) ? (k === ln.ask.answer ? 'right' : 'dim') : wrong[i]?.has(k) ? 'wrong' : ''
        return `<button class="opt ${cls}" data-act="ans" data-line="${i}" data-i="${k}" ${solved.has(i) || wrong[i]?.has(k) ? 'disabled' : ''}><kbd>${k + 1}</kbd>${o}</button>`
      }).join('')}</div>
    </div>`
    return `<section class="s-line" id="line-${i}">
      <div class="sent">${toks}${speakButton(course, ln)}</div>
      ${open ? `<p class="s-en">${esc(ln.en)}</p>` : `<button class="s-tr" data-act="tr" data-i="${i}">Show translation</button>`}
      ${ask || ''}
    </section>`
  }

  function render() {
    $('body').innerHTML = `
      <header class="s-intro">
        <span class="s-mark g">${esc(course.emblem)}</span>
        <h1>${esc(story.title)}</h1>
        <p class="s-source">${esc(story.source)}</p>
        <p class="lede">${esc(story.about)}</p>
        <p class="s-tip">Tap any word for its meaning.</p>
      </header>
      ${lines.slice(0, shown).map(lineHtml).join('')}`
    $('bar').style.width = `${(shown / lines.length) * 100}%`
    const btn = $('next')
    btn.textContent = shown === 0 ? 'Start reading' : shown < lines.length ? 'Continue' : 'Finish'
    btn.disabled = waiting()
  }

  function answer(i, k) {
    if (solved.has(i) || wrong[i]?.has(k)) return
    if (k === lines[i].ask.answer) {
      solved.add(i)
      play('right')
    } else {
      (wrong[i] ??= new Set()).add(k)
      mistakes++
      play('wrong')
    }
    render()
  }

  function advance() {
    if (waiting()) return
    if (shown === lines.length) {
      return onFinish({ xp: 10 + (mistakes ? 0 : 5), perfect: !mistakes, seconds: Math.round((Date.now() - started) / 1000) })
    }
    shown++
    play('tap')
    render()
    $(`line-${shown - 1}`).scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function onKey(e) {
    if (e.key === 'Escape') return onQuit()
    if (e.key === 'Enter') { e.preventDefault(); return advance() }
    const n = Number(e.key)
    if (waiting() && n >= 1 && n <= lines[shown - 1].ask.options.length) answer(shown - 1, n - 1)
  }

  if (location.search.includes('debug')) {
    window.__story = {
      waiting,
      solve: () => answer(shown - 1, lines[shown - 1].ask.answer),
      next: advance,
    }
  }

  render()
}
