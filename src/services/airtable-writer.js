import '../utils/config.js';

import { createLogger } from '../utils/logger.js';

const logger = createLogger('airtable-writer');

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

/**
 * Returns the configured Airtable personal access token, or throws if missing.
 */
function getAirtableToken() {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'AIRTABLE_PERSONAL_ACCESS_TOKEN is not set. ' +
        'Add it to your .env file. See .env.example for details.'
    );
  }
  return token;
}

/**
 * Build the Airtable REST API URL for a table.
 * @param {string} baseId
 * @param {string} tableId
 * @returns {string}
 */
function tableUrl(baseId, tableId) {
  return `${AIRTABLE_API_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`;
}

/**
 * Make a request to the Airtable REST API.
 * @param {string} method
 * @param {string} url
 * @param {object} [body]
 * @returns {Promise<object>}
 */
async function airtableRequest(method, url, body) {
  const token = getAirtableToken();
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body != null) {
    init.body = JSON.stringify(body);
  }

  const timeoutMs = Number(process.env.MR_MAGIC_HTTP_TIMEOUT_MS || 10000);
  let controller;
  let timeoutId;
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    init.signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let res;
  try {
    res = await fetch(url, init);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _rawBody: text };
  }

  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      json?.error ||
      text ||
      `Airtable API error ${res.status}`;
    const err = new Error(`Airtable ${res.status}: ${message}`);
    err.status = res.status;
    err.airtableError = json;
    throw err;
  }

  return json;
}

/**
 * Create a new record in an Airtable table.
 *
 * @param {object} opts
 * @param {string} opts.baseId
 * @param {string} opts.tableId
 * @param {Record<string, unknown>} opts.fields  - { fieldIdOrName: value, ... }
 * @returns {Promise<{ id: string, createdTime: string, fields: Record<string, unknown> }>}
 */
export async function createAirtableRecord({ baseId, tableId, fields }) {
  logger.debug('Creating Airtable record', { baseId, tableId, fieldKeys: Object.keys(fields) });
  const url = tableUrl(baseId, tableId);
  const result = await airtableRequest('POST', url, { records: [{ fields }] });
  const record = result?.records?.[0];
  if (!record) {
    throw new Error('Airtable create returned no record');
  }
  logger.info('Airtable record created', { baseId, tableId, recordId: record.id });
  return record;
}

/**
 * Update an existing record in an Airtable table (PATCH — only named fields are changed).
 *
 * @param {object} opts
 * @param {string} opts.baseId
 * @param {string} opts.tableId
 * @param {string} opts.recordId
 * @param {Record<string, unknown>} opts.fields  - { fieldIdOrName: value, ... }
 * @returns {Promise<{ id: string, createdTime: string, fields: Record<string, unknown> }>}
 */
export async function updateAirtableRecord({ baseId, tableId, recordId, fields }) {
  logger.debug('Updating Airtable record', {
    baseId,
    tableId,
    recordId,
    fieldKeys: Object.keys(fields)
  });
  const url = `${tableUrl(baseId, tableId)}`;
  const result = await airtableRequest('PATCH', url, {
    records: [{ id: recordId, fields }]
  });
  const record = result?.records?.[0];
  if (!record) {
    throw new Error('Airtable update returned no record');
  }
  logger.info('Airtable record updated', { baseId, tableId, recordId: record.id });
  return record;
}

/**
 * Push catalog fields to Airtable.
 *
 * Resolves field values from the provided `fieldValues` map plus an optional
 * `lyricsText` string that arrives server-side (never through the LLM).
 *
 * If `recordId` is supplied → PATCH update.
 * If `recordId` is omitted → POST create.
 * If `splitLyricsUpdate` is true → create the record without lyrics first,
 * then PATCH lyrics in a second call (safe for very large lyric payloads).
 *
 * @param {object} opts
 * @param {string} opts.baseId
 * @param {string} opts.tableId
 * @param {string} [opts.recordId]
 * @param {Record<string, string>} opts.fieldValues   - { fieldId: scalarValue }
 * @param {string} [opts.lyricsFieldId]               - field ID where lyrics should go
 * @param {string} [opts.lyricsText]                  - raw lyrics text (fetched server-side)
 * @param {boolean} [opts.splitLyricsUpdate]          - force two-step create+update
 * @returns {Promise<{ record: object, lyricsRecord?: object, steps: string[] }>}
 */
export async function pushCatalogToAirtable({
  baseId,
  tableId,
  recordId,
  fieldValues = {},
  lyricsFieldId,
  lyricsText,
  splitLyricsUpdate = false
}) {
  const steps = [];
  const hasLyrics = lyricsFieldId && lyricsText;

  // ------------------------------------------------------------------
  // Build the non-lyrics fields object
  // ------------------------------------------------------------------
  const baseFields = { ...fieldValues };

  // ------------------------------------------------------------------
  // Decide flow
  // ------------------------------------------------------------------
  const isUpdate = Boolean(recordId);
  const forceSplit = splitLyricsUpdate || false;

  let record;

  if (isUpdate) {
    // --- UPDATE existing record ---
    if (hasLyrics && !forceSplit) {
      // Include lyrics in the single PATCH
      const fields = { ...baseFields, [lyricsFieldId]: lyricsText };
      record = await updateAirtableRecord({ baseId, tableId, recordId, fields });
      steps.push(`updated record ${record.id} with all fields including lyrics`);
      return { record, steps };
    }

    if (hasLyrics && forceSplit) {
      // Two-step: update base fields first, then lyrics
      record = await updateAirtableRecord({ baseId, tableId, recordId, fields: baseFields });
      steps.push(`updated record ${record.id} base fields`);
      const lyricsRecord = await updateAirtableRecord({
        baseId,
        tableId,
        recordId: record.id,
        fields: { [lyricsFieldId]: lyricsText }
      });
      steps.push(`updated record ${lyricsRecord.id} lyrics field`);
      return { record, lyricsRecord, steps };
    }

    // No lyrics — plain update
    record = await updateAirtableRecord({ baseId, tableId, recordId, fields: baseFields });
    steps.push(`updated record ${record.id} base fields`);
    return { record, steps };
  }

  // --- CREATE new record ---
  if (hasLyrics && !forceSplit) {
    // Single create with all fields
    const fields = { ...baseFields, [lyricsFieldId]: lyricsText };
    record = await createAirtableRecord({ baseId, tableId, fields });
    steps.push(`created record ${record.id} with all fields including lyrics`);
    return { record, steps };
  }

  if (hasLyrics && forceSplit) {
    // Two-step: create without lyrics, then PATCH lyrics
    record = await createAirtableRecord({ baseId, tableId, fields: baseFields });
    steps.push(`created record ${record.id} without lyrics`);
    const lyricsRecord = await updateAirtableRecord({
      baseId,
      tableId,
      recordId: record.id,
      fields: { [lyricsFieldId]: lyricsText }
    });
    steps.push(`updated record ${lyricsRecord.id} lyrics field`);
    return { record, lyricsRecord, steps };
  }

  // No lyrics — plain create
  record = await createAirtableRecord({ baseId, tableId, fields: baseFields });
  steps.push(`created record ${record.id} base fields only`);
  return { record, steps };
}
