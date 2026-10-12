import { esc, tokens, normEn, normT, loose, shuffle } from './text.js'
import { mount, icon, word, glyph, scriptFont } from './ui.js'
import { state, hearts, loseHeart } from './store.js'
import { canSpeak, say, spoken, speakButton } from './speech.js'
import { play } from './sound.js'

const PRAISE = ['Nicely done!', 'Correct!', 'Excellent!', 'Exactly right.', 'Spot on!', 'Well read.']

export function runLesson({ course, exercises, practice, onQuit, onFinish, onOutOfHearts, onAnswer }) {
  const queue = exercises.map(ex => ({ ex }))
  const total = queue.length
  const started = Date.now()
  const gloss = new Map(course.units.flatMap(u => u.items).map(it => [normT(it.t), it.en]))
  let done = 0, firstTry = 0, cur, st, phase, result

  mount(`
    <div class="lesson" data-script="${scriptFont(course)}" style="--accent:${course.accent}">
      <header class="l-head">
        <button class="icon-btn" data-act="quit" aria-label="Quit lesson">${icon('x')}</button>
        <div class="bar"><i id="bar"></i></div>
        <div class="l-hearts" id="hearts"></div>
      </header>
      <main class="l-body" id="body"></main>
      <footer class="l-foot" id="foot"></footer>
      <div class="sheet-wrap" id="sheet" hidden></div>
    </div>`, {
    quit: askQuit,
    stay: () => { $('sheet').hidden = true },
    leave: onQuit,
    opt: el => select(+el.dataset.i),
    tile: el => pickTile(+el.dataset.i),
    untile: el => { st.picked.splice(+el.dataset.i, 1); play('tap'); renderBody() },
    hint: useHint,
    say: el => say(course, el.dataset.text),
    gloss: el => { const i = +el.dataset.i; st.glossed.has(i) ? st.glossed.delete(i) : st.glossed.add(i); renderBody() },
    char: el => typeChar(el.dataset.c),
    ml: el => matchTap('left', +el.dataset.i),
    mr: el => matchTap('right', +el.dataset.i),
    check,
    skip: () => grade({ ok: false, solution: solution(cur.ex) }),
    next: advance,
    input: el => { if (el.id === 'typed') { st.text = el.value; syncCheck() } },
    key: onKey,
  })

  const $ = id => document.getElementById(id)

  function renderHeader() {
    $('bar').style.width = `${(done / total) * 100}%`
    $('hearts').innerHTML = practice
      ? `<span class="pill">Practice</span>`
      : `${icon('heart')}<span>${hearts()}</span>`
  }

  function advance() {
    if (!practice && hearts() === 0) return onOutOfHearts()
    cur = queue.shift()
    if (!cur) return finish()
    if (cur.missed && cur.ex.options) {
      const right = cur.ex.options[cur.ex.answer]
      cur.ex.options = shuffle(cur.ex.options)
      cur.ex.answer = cur.ex.options.indexOf(right)
    }
    st = { sel: null, picked: [], text: '', matched: new Set(), left: null, right: null, bad: null, out: new Set(), glossed: new Set(), slips: new Set() }
    phase = 'answer'
    result = null
    renderHeader()
    renderBody()
    renderFoot()
    $('typed')?.focus()
    autoplay(cur.ex)
  }

  // Read the prompt aloud, as Duolingo does, for languages with a usable voice
  function autoplay(ex) {
    if (!state.sound || !canSpeak(course)) return
    if (ex.type === 'choice' && ex.mode === 'meaning') say(course, spoken(course, ex.item))
    if (ex.type === 'build' && ex.dir === 'en') say(course, spoken(course, ex.sentence))
  }

  function finish() {
    const perfect = firstTry === total
    onFinish({
      xp: practice ? 5 : 10 + (perfect ? 5 : 0),
      accuracy: Math.round((firstTry / total) * 100),
      seconds: Math.round((Date.now() - started) / 1000),
      perfect,
    })
  }

  // ---------- exercise views ----------

  function renderBody() {
    const ex = cur.ex
    const view = { choice: viewChoice, build: viewBuild, spell: viewSpell, fill: viewFill, type: viewType, match: viewMatch }[ex.type]
    $('body').innerHTML = `<div class="ex ex-${ex.type} ${phase !== 'answer' ? 'is-locked' : ''}">${view(ex)}</div>`
  }

  const title = (text, badge) => `${badge ? `<span class="badge">${badge}</span>` : ''}<h2 class="ex-title">${text}</h2>`

  function optState(i, ex) {
    if (phase === 'answer') return st.out.has(i) ? 'out' : st.sel === i ? 'sel' : ''
    if (i === ex.answer) return 'right'
    return st.sel === i ? 'wrong' : 'dim'
  }

  function viewChoice(ex) {
    const it = ex.item
    // a hint only ever removes wrong answers; it never shows the right one
    const hint = ex.isNew && ex.options.length > 2
      ? `<button class="hint" data-act="hint" ${st.out.size || phase !== 'answer' ? 'disabled' : ''}>${st.out.size ? 'Two wrong answers removed' : 'Hint: remove two wrong answers'}</button>`
      : ''
    const opts = (render, layout) => `<div class="opts ${layout}">${ex.options.map((o, i) =>
      `<button class="opt ${optState(i, ex)}" data-act="opt" data-i="${i}" ${phase === 'answer' && st.out.has(i) ? 'disabled' : ''}><kbd>${i + 1}</kbd>${render(o)}</button>`).join('')}</div>`
    switch (ex.mode) {
      case 'meaning':
        return title('What does this mean?', ex.isNew && 'New word') +
          `<div class="prompt">${word(it, 'xl')}${speakButton(course, it)}${hint}</div>` + opts(o => `<span>${esc(o.en)}</span>`, 'list')
      case 'word':
        return title(`Which one is “${esc(it.en)}”?`) + opts(o => word(o, 'lg'), 'cards')
      case 'sound':
        return title(`What sound does this ${ex.isNew ? 'new sign ' : ''}make?`, ex.isNew && 'New sign') +
          `<div class="prompt">${glyph(it.g, 'xxl')}${hint}</div>` + opts(o => `<span class="tt">${esc(o.t)}</span>`, 'list')
      case 'sign':
        return title(`Which sign is “${esc(it.t)}”?`) + opts(o => glyph(o.g, 'xl'), 'cards')
      case 'glyph':
        return title(`How is <em>${esc(it.t)}</em> written?`) + `<p class="sub">“${esc(it.en)}”</p>` + opts(o => glyph(o.g, 'xl'), 'cards')
    }
  }

  // Tokens of a target sentence; tapping a known word shows its meaning
  function sentence(s) {
    const g = s.g ? tokens(s.g) : []
    return `<div class="sent">${tokens(s.t).map((t, i) => {
      const meaning = gloss.get(normT(t))
      if (!meaning) return `<span class="tok">${word({ t, g: g[i] })}</span>`
      return `<span class="tok known ${st.glossed.has(i) ? 'show' : ''}" data-act="gloss" data-i="${i}">${word({ t, g: g[i] })}<span class="gloss">${esc(meaning)}</span></span>`
    }).join('')}</div>`
  }

  const tileHtml = t => t.g ? `<span class="g">${esc(t.g)}</span><span class="tl">${esc(t.text)}</span>` : esc(t.text)

  function viewBuild(ex) {
    const s = ex.sentence
    const said = ex.dir === 'en' ? sentence(s) : `<p class="prompt-en">${esc(s.en)}</p>`
    const prompt = `<div class="speaker"><span class="avatar g">${esc(course.script ? [...course.emblem.replace(/\s/g, '')][0] : course.emblem)}</span><div class="bubble">${said}${ex.dir === 'en' ? speakButton(course, s) : ''}</div></div>`
    const line = st.picked.map((ti, i) => `<button class="tile" data-act="untile" data-i="${i}">${tileHtml(ex.tiles[ti])}</button>`).join('')
    const bank = ex.tiles.map((t, i) => st.picked.includes(i)
      ? `<span class="tile ghost">${tileHtml(t)}</span>`
      : `<button class="tile" data-act="tile" data-i="${i}">${tileHtml(t)}</button>`).join('')
    return title(ex.dir === 'en' ? 'Translate this sentence' : `Write this in ${esc(course.name)}`) +
      `<div class="prompt left">${prompt}</div>
       <div class="answer-line ${ex.dir === 'en' ? 'en' : 'target'}">${line}</div>
       <div class="bank ${ex.dir === 'en' ? 'en' : 'target'}">${bank}</div>`
  }

  function viewSpell(ex) {
    const sign = (t, i, act) => act
      ? `<button class="tile sign" data-act="${act}" data-i="${i}"><span class="g">${esc(t.g)}</span></button>`
      : `<span class="tile sign ghost"><span class="g">${esc(t.g)}</span></span>`
    const line = st.picked.map((ti, i) => sign(ex.tiles[ti], i, 'untile')).join('')
    const bank = ex.tiles.map((t, i) => sign(t, i, st.picked.includes(i) ? null : 'tile')).join('')
    return title(`Spell <em>${esc(ex.item.t)}</em> with signs`) + `<p class="sub">“${esc(ex.item.en)}”</p>
      <div class="answer-line target spell">${line}</div>
      <div class="bank target">${bank}</div>`
  }

  function viewFill(ex) {
    const chosen = st.sel != null ? ex.options[st.sel] : null
    const shown = phase === 'answer' ? chosen : ex.options[ex.answer]
    const toks = ex.toks.map((t, i) => i === ex.blank
      ? `<span class="tok blank ${shown ? 'filled' : ''}">${shown ? word({ t: shown.text, g: shown.g }) : '&nbsp;'}</span>`
      : `<span class="tok">${word({ t: t.text, g: t.g })}</span>`).join('')
    return title('Complete the sentence') + `<p class="sub">“${esc(ex.sentence.en)}”</p>
      <div class="prompt left"><div class="sent">${toks}</div></div>
      <div class="opts cards">${ex.options.map((o, i) =>
        `<button class="opt ${optState(i, ex)}" data-act="opt" data-i="${i}"><kbd>${i + 1}</kbd>${word({ t: o.text, g: o.g })}</button>`).join('')}</div>`
  }

  function viewType(ex) {
    const it = ex.item
    const head = ex.from === 'g'
      ? title('Type the sound of this sign') + `<div class="prompt">${glyph(it.g, 'xxl')}</div>`
      : title(`Type this in ${esc(course.name)}`) + `<div class="prompt"><p class="prompt-en big">${esc(it.en)}</p></div>`
    const keys = (course.keys ?? []).map(k => `<button class="key" data-act="char" data-c="${esc(k)}">${esc(k)}</button>`).join('')
    return head + `<input id="typed" class="type-in" value="${esc(st.text)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${course.script ? 'Type the transliteration' : `Type in ${esc(course.name)}`}" ${phase !== 'answer' ? 'disabled' : ''}>
      ${keys ? `<div class="keys">${keys}</div>` : ''}`
  }

  function viewMatch(ex) {
    const cell = (side, i, inner) => {
      const pair = side === 'left' ? i : ex.right[i]
      const cls = st.matched.has(pair) ? 'done' : st.bad?.[side] === i ? 'wrong' : st[side] === i ? 'sel' : ''
      return `<button class="opt m ${cls}" data-act="${side === 'left' ? 'ml' : 'mr'}" data-i="${i}" ${st.matched.has(pair) ? 'disabled' : ''}>${inner}</button>`
    }
    const left = ex.pairs.map((p, i) => cell('left', i, ex.script ? glyph(p.g, 'lg') : word(p, 'md')))
    const right = ex.right.map((pi, i) => cell('right', i, ex.script ? `<span class="tt">${esc(ex.pairs[pi].t)}</span>` : `<span>${esc(ex.pairs[pi].en)}</span>`))
    return title('Tap the matching pairs') + `<div class="match"><div>${left.join('')}</div><div>${right.join('')}</div></div>`
  }

  // ---------- interaction ----------

  function select(i) {
    if (phase !== 'answer' || !cur.ex.options || i >= cur.ex.options.length || st.out.has(i)) return
    st.sel = i
    play('tap')
    renderBody()
    syncCheck()
  }

  function useHint() {
    const ex = cur.ex
    if (phase !== 'answer' || st.out.size || ex.options.length < 3) return
    const wrong = shuffle(ex.options.map((_, i) => i).filter(i => i !== ex.answer))
    wrong.slice(0, ex.options.length - 2).forEach(i => st.out.add(i))
    if (st.out.has(st.sel)) st.sel = null
    play('tap')
    renderBody()
    syncCheck()
  }

  function pickTile(i) {
    if (phase !== 'answer' || st.picked.includes(i)) return
    st.picked.push(i)
    play('tap')
    renderBody()
    syncCheck()
  }

  function typeChar(c) {
    const el = $('typed')
    if (!el || phase !== 'answer') return
    const [a, b] = [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]
    el.value = el.value.slice(0, a) + c + el.value.slice(b)
    st.text = el.value
    el.focus()
    el.setSelectionRange(a + c.length, a + c.length)
    syncCheck()
  }

  function matchTap(side, i) {
    if (phase !== 'answer' || st.bad) return
    st[side] = st[side] === i ? null : i
    play('tap')
    if (st.left != null && st.right != null) {
      const ex = cur.ex
      if (ex.right[st.right] === st.left) {
        st.matched.add(st.left)
        st.left = st.right = null
        if (st.matched.size === ex.pairs.length) return grade({ ok: true })
      } else {
        st.bad = { left: st.left, right: st.right }
        st.slips.add(st.left).add(ex.right[st.right])
        st.missed = true
        play('wrong')
        setTimeout(() => { st.bad = null; st.left = st.right = null; renderBody() }, 450)
      }
    }
    renderBody()
  }

  function ready() {
    const ex = cur.ex
    if (ex.type === 'build' || ex.type === 'spell') return st.picked.length > 0
    if (ex.type === 'type') return st.text.trim() !== ''
    return st.sel != null
  }

  function syncCheck() {
    const btn = document.querySelector('[data-act="check"]')
    if (btn) btn.disabled = !ready()
  }

  function solution(ex) {
    const it = ex.item
    switch (ex.type) {
      case 'build': return ex.dir === 'en' ? ex.sentence.en : ex.sentence.t
      case 'fill': return ex.sentence.t
      case 'type': return it.t
      case 'spell': return `${it.g}  ${it.t}`
      case 'match': return ''
    }
    return { meaning: it.en, word: it.t, sound: it.t, sign: `${it.g}  ${it.t}`, glyph: `${it.g}  ${it.t}` }[ex.mode]
  }

  function evaluate(ex) {
    if (ex.type === 'build') {
      const said = st.picked.map(i => ex.tiles[i].text).join(' ')
      const norm = ex.dir === 'en' ? normEn : normT
      return { ok: ex.accept.some(a => norm(a) === norm(said)) }
    }
    if (ex.type === 'spell') return { ok: st.picked.map(i => ex.tiles[i].g).join('') === ex.answer }
    if (ex.type === 'type') {
      if (ex.accept.some(a => normT(a) === normT(st.text))) return { ok: true }
      const close = loose(st.text) && ex.accept.some(a => loose(a) === loose(st.text))
      return { ok: !!close, note: close ? `Watch the marks: ${ex.item.t}` : '' }
    }
    return { ok: st.sel === ex.answer }
  }

  function check() {
    if (phase !== 'answer' || !ready()) return
    grade({ ...evaluate(cur.ex), solution: solution(cur.ex) })
  }

  function grade(r) {
    result = r
    onAnswer?.(cur.ex, !!r.ok, st.slips)
    if (r.ok && !st.missed) {
      phase = 'right'
      done++
      if (!cur.missed) firstTry++
      play('right')
    } else if (r.ok) {
      // a match finished after a slip: counts, but not as first-try
      phase = 'right'
      done++
      play('right')
    } else {
      phase = 'wrong'
      cur.missed = true
      queue.push(cur)
      play('wrong')
      // guessing a word you have never seen shouldn't cost a heart
      if (!practice && !cur.ex.isNew) loseHeart()
    }
    renderHeader()
    renderBody()
    renderFoot()
  }

  function renderFoot() {
    const foot = $('foot')
    if (phase === 'answer') {
      foot.className = 'l-foot'
      foot.innerHTML = `<div class="foot-in">
        <button class="btn ghost" data-act="skip">Skip</button>
        ${cur.ex.type === 'match' ? '' : `<button class="btn primary" data-act="check" ${ready() ? '' : 'disabled'}>Check</button>`}
      </div>`
      return
    }
    const ok = phase === 'right'
    const body = ok
      ? (result.note ? `<p>${esc(result.note)}</p>` : '')
      : (result.solution ? `<p class="sol">${esc(result.solution)}</p>` : '')
    const aside = cur.ex.isNew && cur.ex.item.note ? `<p class="aside">${esc(cur.ex.item.note)}</p>` : ''
    foot.className = `l-foot ${ok ? 'is-right' : 'is-wrong'}`
    foot.innerHTML = `<div class="foot-in">
      <div class="verdict">
        <span class="verdict-ic">${icon(ok ? 'check' : 'x')}</span>
        <div><strong>${ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : result.solution ? 'Correct answer:' : 'Not quite.'}</strong>${body}${aside}</div>
      </div>
      <button class="btn ${ok ? 'good' : 'bad'}" data-act="next">Continue</button>
    </div>`
    foot.querySelector('[data-act="next"]').focus({ preventScroll: true })
  }

  function askQuit() {
    const sheet = $('sheet')
    sheet.hidden = false
    sheet.innerHTML = `<div class="sheet">
      <h3>Leave this lesson?</h3>
      <p>You will lose the progress you have made in it.</p>
      <div class="row"><button class="btn primary" data-act="stay">Keep learning</button><button class="btn ghost" data-act="leave">End lesson</button></div>
    </div>`
  }

  function onKey(e) {
    if (!$('sheet').hidden) {
      if (e.key === 'Escape') $('sheet').hidden = true
      return
    }
    if (e.key === 'Escape') return askQuit()
    if (e.key === 'Enter') {
      e.preventDefault()
      return phase === 'answer' ? check() : advance()
    }
    if (phase !== 'answer' || document.activeElement?.id === 'typed') return
    const n = Number(e.key)
    if (n >= 1 && n <= 9) {
      if (cur.ex.options) select(n - 1)
      else if (cur.ex.tiles && n <= cur.ex.tiles.length) pickTile(n - 1)
    }
    if (e.key === 'Backspace' && cur.ex.tiles && st.picked.length) {
      st.picked.pop()
      renderBody()
      syncCheck()
    }
  }

  // ?debug exposes a solver so tools can play through lessons
  if (location.search.includes('debug')) {
    window.__lesson = {
      ex: () => cur?.ex,
      phase: () => phase,
      solve() {
        const ex = cur.ex
        if (ex.type === 'match') return grade({ ok: true })
        if (ex.type === 'type') st.text = ex.item.t
        else if (ex.type === 'spell') {
          st.picked = []
          for (const g of ex.answer) st.picked.push(ex.tiles.findIndex((t, j) => !st.picked.includes(j) && t.g === g))
        } else if (ex.type === 'build') {
          st.picked = []
          for (const w of tokens(ex.accept[0])) {
            const i = ex.tiles.findIndex((t, j) => !st.picked.includes(j) && t.text.toLowerCase() === w.toLowerCase())
            if (i < 0) throw new Error(`no tile for "${w}" in "${ex.accept[0]}"`)
            st.picked.push(i)
          }
        } else st.sel = ex.answer
        check()
      },
    }
  }

  advance()
}
