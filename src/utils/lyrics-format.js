const HANGUL_REGEX = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

// Hangul syllable decomposition tables (Unicode standard)
const HANGUL_INITIALS = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ'
];
const HANGUL_VOWELS = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅘ',
  'ㅙ',
  'ㅚ',
  'ㅛ',
  'ㅜ',
  'ㅝ',
  'ㅞ',
  'ㅟ',
  'ㅠ',
  'ㅡ',
  'ㅢ',
  'ㅣ'
];
const HANGUL_FINALS = [
  null,
  'ㄱ',
  'ㄲ',
  'ㄳ',
  'ㄴ',
  'ㄵ',
  'ㄶ',
  'ㄷ',
  'ㄹ',
  'ㄺ',
  'ㄻ',
  'ㄼ',
  'ㄽ',
  'ㄾ',
  'ㄿ',
  'ㅀ',
  'ㅁ',
  'ㅂ',
  'ㅄ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ'
];

/**
 * Decompose a word into grouped jamo arrays — one sub-array per syllable block.
 * Non-Hangul characters are wrapped in a single-element array.
 * Equivalent to hangul-js Hangul.disassemble(word, true).
 */
function disassembleGrouped(word) {
  const result = [];
  for (const char of word) {
    const cp = char.codePointAt(0);
    if (cp >= 0xac00 && cp <= 0xd7a3) {
      const syllable = cp - 0xac00;
      const initialIdx = Math.floor(syllable / (21 * 28));
      const vowelIdx = Math.floor((syllable % (21 * 28)) / 28);
      const finalIdx = syllable % 28;
      const jamo = [HANGUL_INITIALS[initialIdx], HANGUL_VOWELS[vowelIdx]];
      if (finalIdx > 0) jamo.push(HANGUL_FINALS[finalIdx]);
      result.push(jamo);
    } else {
      result.push([char]);
    }
  }
  return result;
}

const ROMAN_MAP = {
  ㄱ: 'g',
  ㄲ: 'kk',
  ㄴ: 'n',
  ㄷ: 'd',
  ㄸ: 'tt',
  ㄹ: 'r',
  ㅁ: 'm',
  ㅂ: 'b',
  ㅃ: 'pp',
  ㅅ: 's',
  ㅆ: 'ss',
  ㅇ: 'ng',
  ㅈ: 'j',
  ㅉ: 'jj',
  ㅊ: 'ch',
  ㅋ: 'k',
  ㅌ: 't',
  ㅍ: 'p',
  ㅎ: 'h',
  ㅏ: 'a',
  ㅐ: 'ae',
  ㅑ: 'ya',
  ㅒ: 'yae',
  ㅓ: 'eo',
  ㅔ: 'e',
  ㅕ: 'yeo',
  ㅖ: 'ye',
  ㅗ: 'o',
  ㅘ: 'wa',
  ㅙ: 'wae',
  ㅚ: 'wae',
  ㅛ: 'yo',
  ㅜ: 'u',
  ㅝ: 'weo',
  ㅞ: 'we',
  ㅟ: 'wi',
  ㅠ: 'yu',
  ㅡ: 'eu',
  ㅢ: 'ui',
  ㅣ: 'i'
};

function normalizeLines(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildTimestamp(ms) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

export function containsHangul(text) {
  return Boolean(text) && HANGUL_REGEX.test(text);
}

function romanizeWord(word) {
  if (!word) return '';
  let grouped = [];
  try {
    grouped = disassembleGrouped(word);
  } catch (error) {
    return word;
  }
  const romanized = grouped
    .map((characters) =>
      characters
        .map((char, idx) => {
          // ㅇ is silent as the initial consonant (position 0 in every syllable group)
          // and pronounced 'ng' only when it appears as a final consonant.
          if (char === 'ㅇ' && idx === 0) return '';
          return ROMAN_MAP[char] ?? char;
        })
        .join('')
    )
    .join('');
  if (!romanized) return word;
  return romanized[0]?.toUpperCase() + romanized.slice(1);
}

function romanizeLine(text) {
  if (!text) return '';
  return text
    .split(/(\s+)/)
    .map((token) => (token.trim() ? romanizeWord(token.trim()) : token))
    .join('');
}

export function romanizeSyncedLyrics(syncedLyrics) {
  if (!syncedLyrics) return '';
  return syncedLyrics
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\[[^\]]+\])(.*)$/);
      if (!match) {
        return romanizeLine(line);
      }
      const [, timestamp, content] = match;
      const trimmed = content?.trim() ?? '';
      const converted = trimmed ? romanizeLine(trimmed) : '';
      return converted ? `${timestamp} ${converted}` : timestamp;
    })
    .join('\n');
}

export function formatPlainStanzas(plainLyrics) {
  if (!plainLyrics) return '';
  const paragraphs = plainLyrics
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    return paragraphs.map((paragraph) => normalizeLines(paragraph).join('\n')).join('\n\n');
  }
  const lines = normalizeLines(plainLyrics);
  if (!lines.length) return '';
  const stanzas = [];
  for (let i = 0; i < lines.length; i += 3) {
    stanzas.push(lines.slice(i, i + 3).join('\n'));
  }
  return stanzas.join('\n\n');
}

export function romanizePlainLyrics(plainLyrics, { formatted = false } = {}) {
  if (!plainLyrics) return '';
  const romanized = plainLyrics
    .split('\n')
    .map((line) => (line.trim() ? romanizeLine(line) : ''))
    .join('\n');
  if (!formatted) {
    return romanized;
  }
  return formatPlainStanzas(romanized);
}

export function buildLrc(syncedLyrics) {
  if (!syncedLyrics) return '';
  return normalizeLines(syncedLyrics).join('\n');
}

export function buildSrt(syncedLyrics) {
  if (!syncedLyrics) return '';
  const lines = normalizeLines(syncedLyrics);
  const entries = lines
    .map((line, idx) => {
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2})\](.*)$/);
      if (!match) {
        return null;
      }
      const [, minutes, seconds, centiseconds, text] = match;
      const startMs = Number(minutes) * 60000 + Number(seconds) * 1000 + Number(centiseconds) * 10;
      return { startMs, text: text.trim(), index: idx };
    })
    .filter(Boolean);
  return entries
    .map((entry, idx) => {
      const next = entries[idx + 1];
      const endMs = next ? next.startMs : entry.startMs + 2500;
      return `${idx + 1}\n${buildTimestamp(entry.startMs)} --> ${buildTimestamp(endMs)}\n${entry.text}`;
    })
    .join('\n\n');
}

export function romanizeSrtLyrics(syncedLyrics) {
  if (!syncedLyrics) return '';
  const romanizedLrc = romanizeSyncedLyrics(syncedLyrics);
  return buildSrt(romanizedLrc);
}
