import { esc } from './text.js'
import { icon } from './ui.js'

// Spoken audio only where a modern voice is a fair stand-in for the old language.
// field: which form to read aloud (Devanagari for Sanskrit, the normalized spelling for Old Norse)
const VOICES = {
  sanskrit: { lang: 'hi', field: 'g', label: 'a Hindi voice, close to how Sanskrit is recited in India today' },
  norse: { lang: 'is', field: 't', label: 'a modern Icelandic voice, the closest living relative' },
}

let voices = []
const load = () => { voices = window.speechSynthesis?.getVoices() ?? [] }
if (window.speechSynthesis) {
  load()
  speechSynthesis.addEventListener('voiceschanged', load)
}

export const voiceInfo = course => VOICES[course.id]

function voiceFor(course) {
  const want = VOICES[course.id]?.lang
  return want ? voices.find(v => v.lang.toLowerCase().startsWith(want)) : null
}

export const canSpeak = course => !!voiceFor(course)

// The text to read for an item or sentence: { t, g }
export const spoken = (course, it) => VOICES[course.id]?.field === 'g' && it.g ? it.g : it.t

export function say(course, text) {
  const voice = voiceFor(course)
  if (!voice || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.85
  speechSynthesis.speak(u)
}

// The Hindi voice can't read romanised Sanskrit, so a word without Devanagari gets no button
export const speakButton = (course, it) => canSpeak(course) && !(VOICES[course.id].field === 'g' && !it.g)
  ? `<button class="speak" data-act="say" data-text="${esc(spoken(course, it))}" aria-label="Listen">${icon('volume')}</button>`
  : ''
