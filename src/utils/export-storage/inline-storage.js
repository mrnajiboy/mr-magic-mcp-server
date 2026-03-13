import { ExportStorageResult } from '../export-storage.js';

export default class InlineStorage {
  async store({ content }) {
    return new ExportStorageResult({ content, skipped: true });
  }
}