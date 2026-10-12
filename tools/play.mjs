// Plays every lesson of every course in headless Chrome with the debug solver.
//   node tools/play.mjs [courseId...] [--shots <dir>] [--dark]   (--shots saves one screenshot per exercise kind)
// Needs Chrome or Chromium installed; set CHROME_PATH if it isn't found automatically.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    const file = path.join(root, url === '/' ? 'index.html' : url)
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

function chrome() {
  const candidates = {
    win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
      .map(dir => path.join(dir, 'Google/Chrome/Application/chrome.exe')),
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  }[process.platform] ?? []
  const found = process.env.CHROME_PATH || candidates.find(f => fs.existsSync(f))
  if (!found) throw new Error('Chrome not found: set CHROME_PATH to a Chrome or Chromium executable')
  return found
}

const launch = ({ width, height }) => puppeteer.launch({ executablePath: chrome(), headless: true, defaultViewport: { width, height }, args: ['--mute-audio'] })
const args = process.argv.slice(2)
const dark = args.includes('--dark')
if (dark) args.splice(args.indexOf('--dark'), 1)
const shotsAt = args.indexOf('--shots')
const shots = shotsAt >= 0 ? path.resolve(args.splice(shotsAt, 2)[1]) : null
if (shots) fs.mkdirSync(shots, { recursive: true })

const server = await serve()
const url = `http://localhost:${server.address().port}/?debug`
const browser = await launch({ width: 1280, height: 860 })
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }])
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => m.type() === 'error' && errors.push(m.text()))
await page.goto(url, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })

const ids = args.length ? args : await page.evaluate(() => [...__app.courses.keys()])
const seen = new Set()
let failed = false

// Answers every exercise with the solver until the end screen appears
async function playLesson(id, label, kinds) {
  for (let step = 0; step < 300; step++) {
    const s = await page.evaluate(() => {
      if (document.querySelector('.end')) return { end: true }
      const ex = __lesson.ex()
      return { phase: __lesson.phase(), kind: [ex.type, ex.mode, ex.dir].filter(Boolean).join(':') }
    })
    if (s.end) return
    if (s.phase === 'answer') {
      kinds[s.kind] = (kinds[s.kind] ?? 0) + 1
      if (shots && !seen.has(`${id}/${s.kind}`)) {
        seen.add(`${id}/${s.kind}`)
        await new Promise(r => setTimeout(r, 350))
        await page.screenshot({ path: path.join(shots, `${id}-${s.kind.replace(/:/g, '-')}.png`) })
      }
      const err = await page.evaluate(() => { try { __lesson.solve() } catch (e) { return e.message } })
      if (err) return errors.push(`${id} ${label}: ${err}`)
      if (await page.evaluate(() => __lesson.phase()) !== 'right') errors.push(`${id} ${label}: solver answer graded wrong (${s.kind})`)
    } else {
      await page.click('[data-act="next"]')
    }
  }
  errors.push(`${id} ${label}: never finished`)
}

async function playStory(id, storyId) {
  for (let step = 0; step < 100; step++) {
    if (await page.evaluate(() => !!document.querySelector('.end'))) return
    await page.evaluate(() => __story.waiting() ? __story.solve() : __story.next())
  }
  errors.push(`${id} story ${storyId}: never finished`)
}

for (const id of ids) {
  const count = await page.evaluate(id => __app.lessonsOf(__app.courses.get(id)).length, id)
  const kinds = {}
  for (let i = 0; i < count; i++) {
    await page.evaluate((id, i) => __app.start(id, i), id, i)
    await playLesson(id, `lesson ${i + 1}`, kinds)
  }
  await page.evaluate(id => __app.practice(id), id)
  await playLesson(id, 'practice', kinds)
  const stories = await page.evaluate(id => __app.courses.get(id).stories.map(s => s.id), id)
  for (const sid of stories) {
    await page.evaluate((id, sid) => __app.story(id, sid), id, sid)
    if (shots) { await new Promise(r => setTimeout(r, 300)); await page.screenshot({ path: path.join(shots, `${id}-story-${sid}.png`) }) }
    await playStory(id, sid)
  }
  // every guidebook and reference tab should render without errors
  const units = await page.evaluate(id => __app.courses.get(id).units.length, id)
  for (const hash of [...Array.from({ length: units }, (_, u) => `#/guide/${u}`), '#/ref/words', '#/ref/grammar', '#/ref/sounds']) {
    await page.evaluate(h => { location.hash = h }, hash)
    await new Promise(r => setTimeout(r, 120))
  }
  console.log(`${id}: ${count} lessons, practice, ${stories.length} stories ·`, Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', '))
}

if (errors.length) { failed = true; console.log('\nproblems:\n' + [...new Set(errors)].map(e => '  ' + e).join('\n')) }
else console.log('\nall lessons, practice and stories completed, no errors')
await browser.close()
server.close()
process.exit(failed ? 1 : 0)
