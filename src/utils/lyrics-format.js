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

// ---------------------------------------------------------------------------
// Syllable decomposition
// ---------------------------------------------------------------------------

/**
 * Decompose a Hangul syllable block into its constituent jamo.
 * Returns { initial, vowel, final } where final may be null.
 * Returns null if the codepoint is not a composed Hangul syllable.
 */
function decomposeSyllable(cp) {
  if (cp < 0xac00 || cp > 0xd7a3) return null;
  const syllable = cp - 0xac00;
  const initialIdx = Math.floor(syllable / (21 * 28));
  const vowelIdx = Math.floor((syllable % (21 * 28)) / 28);
  const finalIdx = syllable % 28;
  return {
    initial: HANGUL_INITIALS[initialIdx],
    vowel: HANGUL_VOWELS[vowelIdx],
    final: finalIdx > 0 ? HANGUL_FINALS[finalIdx] : null
  };
}

/**
 * Decompose a word into an array of phoneme objects.
 * Hangul syllable blocks become { initial, vowel, final }.
 * Non-Hangul characters become { raw: char }.
 */
function decomposeSyllables(word) {
  const result = [];
  for (const char of word) {
    const cp = char.codePointAt(0);
    const syllable = decomposeSyllable(cp);
    if (syllable) {
      result.push(syllable);
    } else {
      result.push({ raw: char });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pronunciation rules
// ---------------------------------------------------------------------------

/**
 * Compound finals (겹받침).
 * Each entry: [representative coda, liaison consonant].
 *
 * "Representative" = what is pronounced before another consonant or at word end.
 * "Liaison consonant" = the second jamo that surfaces when the next syllable
 *   begins with silent ㅇ (vowel-initial).
 */
const COMPOUND_FINAL_MAP = {
  ㄳ: ['ㄱ', 'ㅅ'],
  ㄵ: ['ㄴ', 'ㅈ'],
  ㄶ: ['ㄴ', 'ㅎ'],
  ㄺ: ['ㄱ', 'ㄹ'],
  ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'],
  ㄿ: ['ㅍ', 'ㄹ'],
  ㅀ: ['ㄹ', 'ㅎ'],
  ㅄ: ['ㅂ', 'ㅅ']
};

/**
 * ㅎ-aspiration: final + ㅎ initial (or ㅎ final + consonant initial)
 * produces a single aspirated consonant.
 */
const ASPIRATE_MAP = {
  ㄱ: 'ㅋ',
  ㄷ: 'ㅌ',
  ㅂ: 'ㅍ',
  ㅈ: 'ㅊ'
};

/**
 * Nasalization table.
 * Maps a coda jamo to the nasal it becomes before ㄴ or ㅁ.
 * Returns null if the jamo does not nasalize.
 */
function nasalize(finalJamo, nextInitial) {
  if (nextInitial !== 'ㄴ' && nextInitial !== 'ㅁ') return null;
  const nasalMap = {
    // ㄱ-class → ㅇ
    ㄱ: 'ㅇ',
    ㄲ: 'ㅇ',
    ㄳ: 'ㅇ',
    ㄺ: 'ㅇ',
    // ㅂ-class → ㅁ
    ㅂ: 'ㅁ',
    ㅄ: 'ㅁ', // 없는 → 엄는 (Eomneun)
    ㄿ: 'ㅁ',
    ㄼ: 'ㅁ',
    ㄻ: 'ㅁ', // 삶는 → 삼는
    // ㄷ-class → ㄴ
    ㄷ: 'ㄴ',
    ㅅ: 'ㄴ',
    ㅆ: 'ㄴ',
    ㄵ: 'ㄴ',
    ㄶ: 'ㄴ',
    ㅈ: 'ㄴ',
    ㅊ: 'ㄴ',
    ㅌ: 'ㄴ',
    ㄾ: 'ㄴ',
    ㅎ: 'ㄴ',
    // ㄹ does NOT nasalize before ㄴ/ㅁ — liquidization handles it instead
    ㄹ: 'ㄹ',
    ㄽ: 'ㄴ', // representative ㄹ: liquidize; but ㄽ as compound → ㄹ first
    ㅀ: 'ㄴ'
  };
  return nasalMap[finalJamo] ?? null;
}

/**
 * Liquidization:
 *   ㄹ + ㄴ → ㄹ + ㄹ   (열나다 → 열라다)
 *   ㄴ + ㄹ → ㄹ + ㄹ   (문래 → 물래 → Mullae)
 * Returns [newFinal, newInitial] or null.
 */
function liquidize(finalJamo, nextInitial) {
  if (finalJamo === 'ㄹ' && nextInitial === 'ㄴ') return ['ㄹ', 'ㄹ'];
  if (finalJamo === 'ㄴ' && nextInitial === 'ㄹ') return ['ㄹ', 'ㄹ'];
  return null;
}

// ---------------------------------------------------------------------------
// Romanization tables
// ---------------------------------------------------------------------------

/** Initial consonants (onset). ㅇ is silent. */
const ROMAN_INITIAL = {
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
  ㅇ: '', // silent initial
  ㅈ: 'j',
  ㅉ: 'jj',
  ㅊ: 'ch',
  ㅋ: 'k',
  ㅌ: 't',
  ㅍ: 'p',
  ㅎ: 'h'
};

/**
 * Coda (final) consonants.
 * ㄹ in coda position = 'l' (lateral), not 'r'.
 */
const ROMAN_FINAL = {
  ㄱ: 'k',
  ㄲ: 'k',
  ㄴ: 'n',
  ㄷ: 't',
  ㄹ: 'l', // lateral 'l' in coda
  ㅁ: 'm',
  ㅂ: 'p',
  ㅅ: 't',
  ㅆ: 't',
  ㅇ: 'ng',
  ㅈ: 't',
  ㅊ: 't',
  ㅋ: 'k',
  ㅌ: 't',
  ㅍ: 'p',
  ㅎ: 't' // ㅎ coda is typically silent/unreleased; 't' as conservative fallback
};

/** Vowels. */
const ROMAN_VOWEL = {
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
  ㅚ: 'oe',
  ㅛ: 'yo',
  ㅜ: 'u',
  ㅝ: 'wo',
  ㅞ: 'we',
  ㅟ: 'wi',
  ㅠ: 'yu',
  ㅡ: 'eu',
  ㅢ: 'ui',
  ㅣ: 'i'
};

// ---------------------------------------------------------------------------
// Core romanization engine
// ---------------------------------------------------------------------------

/**
 * Romanize a single Korean word with pronunciation-aware processing:
 *   1. Liaison        — coda moved to next vowel-initial syllable
 *   2. ㅎ-aspiration  — ㅎ + consonant or consonant + ㅎ → aspirated consonant
 *   3. Liquidization  — ㄴ+ㄹ / ㄹ+ㄴ → ll
 *   4. Nasalization   — ㄱ/ㅂ/ㄷ-class before ㄴ/ㅁ
 *   5. Compound final reduction (before consonant onset or word end)
 *   6. ㄹ as coda → 'l';  ㄹ as initial → 'r'
 *
 * Examples:
 *   없는  → Eomneun   (ㅄ nasalizes before ㄴ: ㅂ→ㅁ)
 *   문래  → Mullae    (ㄴ+ㄹ liquidization)
 *   열우물로 → Yeolumul ro  (ㄹ coda = l; spacing preserved by caller)
 *   깻잎  → Kkaennip  (ㄷ-final + 잎 liaison then nasalization)
 */
function romanizeWord(word) {
  if (!word) return '';

  let syllables;
  try {
    syllables = decomposeSyllables(word);
  } catch {
    return word;
  }

  // Make a mutable copy
  const phones = syllables.map((s) => ({ ...s }));
  const n = phones.length;

  // Single forward pass: apply cross-syllable rules left-to-right.
  for (let i = 0; i < n; i++) {
    const cur = phones[i];
    if (cur.raw !== undefined) continue; // non-Hangul passthrough

    const next = i + 1 < n ? phones[i + 1] : null;
    const nextIsHangul = next !== null && next.raw === undefined;

    if (!cur.final) continue; // open syllable — no cross-boundary rules needed

    if (nextIsHangul) {
      // ── 1. Liaison: coda → next vowel-initial syllable ────────────────
      // ㄹ is excluded from liaison: it always stays as coda 'l' (lateral).
      // Moving it to an onset would render it as 'r', which contradicts the
      // intended spelling-preserving style (열우물 → Yeolumul, not Yeorumul).
      if (next.initial === 'ㅇ' && cur.final !== 'ㄹ') {
        const compound = COMPOUND_FINAL_MAP[cur.final];
        if (compound) {
          // Compound: liaison consonant (2nd jamo) moves to next initial;
          // representative (1st jamo) stays as the simplified coda.
          next.initial = compound[1];
          cur.final = compound[0];
          // Fall through — the simplified coda may still trigger other rules
          // with the syllable AFTER next, but that will be handled when i
          // advances to next. For now just continue to next i.
        } else {
          // Simple final: entire coda moves over, syllable becomes open.
          next.initial = cur.final;
          cur.final = null;
          continue;
        }
      }

      // ── 2. ㅎ-aspiration ──────────────────────────────────────────────
      if (cur.final === 'ㅎ' && ASPIRATE_MAP[next.initial]) {
        next.initial = ASPIRATE_MAP[next.initial];
        cur.final = null;
        continue;
      }
      if (cur.final !== null && ASPIRATE_MAP[cur.final] && next.initial === 'ㅎ') {
        next.initial = ASPIRATE_MAP[cur.final];
        cur.final = null;
        continue;
      }

      // ── 3. Liquidization (before nasalization check) ──────────────────
      // When ㄴ+ㄹ or ㄹ+ㄴ assimilate to ㄹ+ㄹ, the new onset ㄹ is a
      // lateral [l], not a flap [r].  Mark it so the renderer uses 'l'.
      if (cur.final !== null) {
        const liquid = liquidize(cur.final, next.initial);
        if (liquid) {
          cur.final = liquid[0];
          next.initial = liquid[1];
          next.lateralInitial = true; // render this ㄹ initial as 'l'
          continue;
        }
      }

      // ── 4. Nasalization ───────────────────────────────────────────────
      if (cur.final !== null) {
        const nasalized = nasalize(cur.final, next.initial);
        if (nasalized !== null) {
          cur.final = nasalized;
          continue;
        }
      }
    }

    // ── 5. Compound final reduction (before consonant onset or word end) ─
    if (cur.final !== null && COMPOUND_FINAL_MAP[cur.final]) {
      cur.final = COMPOUND_FINAL_MAP[cur.final][0];
    }
  }

  // Render phonemes to romanized string
  const parts = phones.map((p) => {
    if (p.raw !== undefined) return p.raw;
    // lateralInitial: ㄹ produced by liquidization is a lateral [l], not a flap [r].
    const init =
      p.initial === 'ㅇ'
        ? ''
        : p.lateralInitial && p.initial === 'ㄹ'
          ? 'l'
          : (ROMAN_INITIAL[p.initial] ?? p.initial);
    const vow = ROMAN_VOWEL[p.vowel] ?? p.vowel;
    const fin = p.final ? (ROMAN_FINAL[p.final] ?? p.final) : '';
    return init + vow + fin;
  });

  const romanized = parts.join('');
  if (!romanized) return word;
  return romanized[0].toUpperCase() + romanized.slice(1);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

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
