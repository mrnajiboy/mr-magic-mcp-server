function normalizeStructuredContent(result) {
  if (Array.isArray(result)) {
    return { items: result };
  }

  if (result && typeof result === 'object') {
    return result;
  }

  if (typeof result === 'string') {
    return { value: result };
  }

  if (result == null) {
    return { value: null };
  }

  return { value: result };
}

/**
 * Build a safe MCP tool response.
 *
 * Rules:
 *  - Always exactly ONE content block — the complete, pretty-printed JSON of the
 *    structured result. No summary text, no truncated preview fragments.
 *  - This prevents LLMs from reading a partially-truncated preview as the
 *    authoritative lyric value when constructing downstream payloads (e.g. Airtable).
 *  - Preview/summary logic lives in the CLI layer only (src/tools/cli.js).
 */
export function buildMcpResponse(result) {
  const structuredContent = normalizeStructuredContent(result);
  const content = [
    {
      type: 'text',
      text: JSON.stringify(structuredContent, null, 2)
    }
  ];

  return {
    structuredContent,
    content
  };
}
