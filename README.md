# Scribe

Learn the languages nobody speaks anymore, the way you'd learn a living one: a few words at a time, a few
minutes a day.

| Language | Script | Period taught |
| --- | --- | --- |
| Latin | Latin alphabet | Classical, 1st century BC to 2nd century AD |
| Sumerian | Cuneiform | Old Sumerian to Old Babylonian copies |
| Akkadian | Cuneiform | Old Babylonian |
| Ancient Egyptian | Hieroglyphs | Middle Egyptian |
| Ancient Greek | Greek alphabet | Classical Attic |
| Old Norse | Runes and Latin alphabet | Old West Norse / Old Icelandic |
| Sanskrit | Devanagari | Classical |
| Old English | Runes and Latin alphabet | West Saxon |

Each course has 12 units, about 47 lessons and 5 to 6 guided readings of real texts, from Caesar and the
Iliad to Gilgamesh, the Rosetta Stone, Hávamál, the Bhagavad Gītā and Beowulf.

## Features

- **Lessons** built from each unit's words and sentences: multiple choice, matching pairs, sentence building
  from word tiles, fill in the blank, typing, and spelling words sign by sign in cuneiform and hieroglyphs
- **Stories**: real inscriptions and literature read line by line, with tap-to-translate words and
  comprehension questions
- **Practice your mistakes**: every word has a strength that drops when you miss it or leave it alone, and
  practice goes after the weakest ones first
- **Reference**: a searchable dictionary, grammar tables and a pronunciation guide for each language
- **Streaks, hearts, XP, badges and streak freezes**
- **Audio** for Sanskrit and Old Norse where the browser has a Hindi or Icelandic voice. The other
  languages have no audio on purpose: a modern voice would teach the wrong sounds.
- Works on phones and in dark mode

There are no accounts and no tracking. Progress is saved in your browser's `localStorage`.

## Run it

It's a static site with no build step. Serve the folder with any static file server:

```
python -m http.server 5330
```

Then open http://localhost:5330. Opening `index.html` directly from disk won't work, because browsers block
`fetch` for local files.

To publish, upload the folder to any static host, such as GitHub Pages, Netlify, Vercel or Cloudflare Pages.

## Develop

| path | what it does |
| --- | --- |
| `data/*.json` | one course per language (format in `COURSES.md`) |
| `data/stories/*.json` | guided readings of real texts, listed in `data/stories/index.json` |
| `data/reference/*.json` | pronunciation guide and grammar tables per language |
| `js/exercises.js` | turns a unit into lessons |
| `js/lesson.js` | the lesson screen: hearts, check/continue, retrying missed exercises |
| `js/story.js` | the story screen |
| `js/main.js` | path, guidebooks, review, reference, languages, profile, routing |
| `js/store.js` | progress, XP, streaks, hearts, word strength |
| `js/badges.js`, `js/speech.js`, `js/sound.js` | badges, spoken audio, sound effects |
| `tools/check.py` | validates every course, story and reference file |
| `tools/play.mjs` | plays every lesson, practice session and story in headless Chrome |

```
python tools/check.py
```

```
npm install
```

```
npm test
```

`check.py names <id>` lists every cuneiform, hieroglyph and rune with its Unicode name, and
`check.py find <text>` searches Unicode sign names. `npm test` needs Chrome or Chromium. Set `CHROME_PATH`
if it isn't found. Open the app with `?debug` to get `window.__app`, `window.__lesson` and
`window.__story` for scripted play.

## Content and accuracy

The courses were compiled using standard references, among them:

- ePSD2, ETCSL and CDLI for Sumerian
- the CAD, Huehnergard, eBL and George's Gilgamesh for Akkadian
- Allen, Gardiner, Faulkner and the Thesaurus Linguae Aegyptiae for Egyptian
- Perseus, LSJ and Smyth for Greek
- Lewis & Short and Allen & Greenough for Latin
- Zoëga, Cleasby-Vigfusson and Rundata for Old Norse
- Monier-Williams and GRETIL for Sanskrit
- Bosworth-Toller and Mitchell & Robinson for Old English

Some readings are disputed among scholars, and the guidebooks and pronunciation pages say so where it matters.
Corrections are welcome: the content is plain JSON, and `COURSES.md` explains the format.

Fonts: Noto Sans Cuneiform, Noto Sans Egyptian Hieroglyphs, Noto Sans Runic, Noto Serif and Noto Serif
Devanagari, loaded from Google Fonts under the SIL Open Font License.

## License

MIT. See `LICENSE`. The ancient texts themselves are in the public domain.
