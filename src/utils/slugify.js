/**
 * Convert a string into a URL/filename-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens,
 * strips leading/trailing hyphens, and trims to 80 chars.
 *
 * @param {string} value - Input string to slugify.
 * @param {string} [fallback='value'] - Returned when the result is empty.
 * @returns {string}
 */
export function slugify(value, fallback = 'value') {
  return (
    (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  );
}
