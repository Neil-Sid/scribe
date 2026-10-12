# Course files

Each language is one JSON file in `data/<id>.json`, listed in `data/index.json`.
Run `python tools/check.py` after editing. It validates every course.

## Shape

```json
{
  "id": "latin",
  "name": "Latin",
  "native": "Lingua Latina",
  "era": "75 BC – AD 200 (Classical)",
  "place": "Rome and its empire",
  "blurb": "One sentence on why it matters.",
  "emblem": "SPQR",
  "script": null,
  "accent": "#9b2f24",
  "keys": ["ā", "ē", "ī", "ō", "ū"],
  "facts": ["Short 'did you know' line.", "..."],
  "units": [
    {
      "title": "Salvē",
      "about": "Greet people and name the family",
      "kind": "words",
      "guide": [
        { "h": "No articles", "p": "Latin has no word for 'the' or 'a'.", "ex": [["puella", "a girl / the girl"]] }
      ],
      "items": [
        { "t": "salvē", "en": "hello", "alt": ["hi"] }
      ],
      "sentences": [
        { "t": "salvē, puella", "en": "hello, girl" }
      ]
    }
  ]
}
```

| field | meaning |
| --- | --- |
| `emblem` | 1–4 characters shown large on the course card (a sign, a letter, a word) |
| `script` | `null` for Latin-alphabet languages, otherwise `{ "name": "Cuneiform", "font": "cuneiform" }`. Fonts: `cuneiform`, `hieroglyphs`, `runic`, `greek`, `devanagari` |
| `accent` | course colour, mid-dark so white text reads on it |
| `keys` | special letters shown as buttons under typing exercises |
| `kind` | `words` (vocabulary + sentences) or `script` (signs/letters, no sentences) |
| `guide` | the unit guidebook: short tips, each with optional examples `[target, english]` |
| `t` | transliteration / romanisation. This is what learners type |
| `g` | native script form. Omit for Latin and Old Norse word units |
| `en` | main English meaning. `alt` lists other accepted English answers |
| `talt` | other accepted target-language orders for a sentence (space separated like `t`) |
| `note` | optional one-line hint shown when the word is introduced |

### Sentences

- Tokens are split on spaces after removing `, . ? ! ; :`. When `g` is present it must have the
  same number of space-separated tokens as `t`, in the same order (token *i* of `g` writes token *i* of `t`).
- English answers are compared case-insensitively with punctuation and articles (`a`, `an`, `the`) ignored,
  so do not add `alt` entries that only differ by articles.
- 2–7 tokens per sentence. Keep them short and natural; prefer attested phrasing.

### Script units

`items` are signs: `{ "g": "𓄿", "t": "ꜣ", "en": "vulture" }`. `t` is the sound value the learner
picks or types, `en` is the sign's name or what it depicts (shown as a hint only).
Try to keep `t` unique within a script unit.

## Content rules

- 12 units per course. A `words` unit has 9–12 items and 6–9 sentences; a `script` unit has 10–24 items.
- Units build on each other: sentences may only use grammar the guidebooks have introduced.
- Keep `en` short (1–3 words) and unique within the course where possible: it appears in multiple-choice and matching.
- Accuracy over breadth. Use standard scholarly forms and conventions; if unsure about a form, leave it out.
- Every native-script glyph must be the real sign for that word. Verify Unicode sign names with
  `python tools/check.py names <id>` and search with `python tools/check.py find "HIEROGLYPH G017"`.

# Story files

Stories are guided readings of real ancient texts. Each course can have a `data/stories/<id>.json`
file holding an array of stories. Run `python tools/check.py` to validate them along with the courses.

```json
[
  {
    "id": "gallic-war",
    "title": "Gallia est omnis dīvīsa",
    "source": "Caesar, Dē Bellō Gallicō 1.1 (c. 50 BC)",
    "about": "Caesar opens his war memoir with a tour of Gaul.",
    "unit": 4,
    "badge": { "name": "Commentator", "about": "Read the opening of Caesar's Gallic War" },
    "lines": [
      {
        "t": "Gallia est omnis dīvīsa in partēs trēs",
        "en": "Gaul as a whole is divided into three parts",
        "gloss": ["Gaul", "is", "as a whole", "divided", "into", "parts", "three"],
        "q": { "prompt": "Into how many parts is Gaul divided?", "options": ["three", "two", "four"], "answer": 0 }
      }
    ]
  }
]
```

| field | meaning |
| --- | --- |
| `unit` | 1-based unit after which the story unlocks (it appears on the path after that unit) |
| `source` | exact citation: author/work and passage, or museum number for inscriptions; add "(trimmed)" if lines were left out |
| `about` | one or two sentences of context shown before reading |
| `badge` | optional badge earned for finishing the story: a short name and one line |
| `lines` | 4–10 lines in reading order. Each is one sentence or clause of the original |
| `t`, `g` | as in courses: transliteration and, for script languages, the native script with tokens aligned to `t` |
| `en` | a faithful but natural translation of the line |
| `gloss` | one short English gloss per token of `t` (same count, same order), meaning in this context |
| `q` | optional comprehension question in English about this line: 2–4 options, `answer` is the index of the right one. Put one on roughly every other line. |

Rules: the text must be genuine and quoted accurately from a standard edition (you may trim lines, never rewrite
them). Keep lines under 12 tokens by splitting at clause boundaries. The app adds its own "which word means…"
questions, so `q` should test understanding, not vocabulary.

List every course that has a story file in `data/stories/index.json` (the app only loads listed files).

# Reference files

Each course has `data/reference/<id>.json` with a pronunciation guide and grammar tables, shown on the
Reference page next to the dictionary (the dictionary itself is built from the course words).

```json
{
  "sounds": {
    "intro": "How scholars reconstruct the sound of the language and how sure we can be.",
    "groups": [
      { "h": "Vowels", "rows": [
        { "t": "a, ā", "ipa": "a, aː", "like": "short like 'cup', long like 'father'", "ex": "pater, māter" }
      ] }
    ],
    "tips": [ { "h": "Stress", "p": "Stress falls on the second-to-last syllable when it is long." } ]
  },
  "grammar": [
    {
      "title": "First declension: puella 'girl'",
      "unit": 2,
      "note": "Most nouns ending in -a. The case shows the word's job in the sentence.",
      "head": ["", "Singular", "Plural"],
      "rows": [["Nominative", "puella", "puellae"], ["Accusative", "puellam", "puellās"]]
    }
  ]
}
```

| field | meaning |
| --- | --- |
| `sounds.groups[].rows[]` | one letter or sign group: `t` (letters as transliterated), optional `g` (native script), `ipa`, `like` (an English comparison or plain description), `ex` (an example word from the course), optional `note` |
| `sounds.tips` | short notes on stress, accent, length, what is uncertain |
| `grammar[]` | one table each: `title`, `unit` (1-based unit where it is taught), `note`, `head` (column headers), `rows` (each row the same length as `head`) |
| cells | a string, or `{ "t": "šarrum", "g": "𒈗" }` to show native script above the transliteration |

Aim for 3–6 sound groups and 10–20 grammar tables covering the whole course, in unit order. Be honest about
uncertainty: say when a sound is a reconstruction or disputed.
