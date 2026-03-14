import Hangul from 'hangul-js';

const HANGUL_REGEX = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

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
    grouped = Hangul.disassemble(word, true);
  } catch (error) {
    return word;
  }
  const romanized = grouped
    .map((characters) => characters.map((char) => ROMAN_MAP[char] ?? char).join(''))
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
