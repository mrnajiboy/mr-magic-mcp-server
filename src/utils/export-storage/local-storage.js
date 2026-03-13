import path from 'node:path';
import fs from 'node:fs';

import { ExportStorageResult, buildId } from '../export-storage.js';

function ensureDirExists(dirPath) {
  if (!dirPath) return null;
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  } catch (error) {
    return null;
  }
}

export default class LocalStorage {
  constructor(baseDir) {
    this.baseDir = baseDir || process.env.MR_MAGIC_EXPORT_DIR || path.resolve(process.cwd(), 'exports');
  }

  async store({ content, extension, baseName }) {
    const dir = ensureDirExists(this.baseDir);
    if (!dir) {
      return new ExportStorageResult({ content, skipped: true });
    }
    const id = buildId('file');
    const filePath = path.join(dir, `${baseName || id}.${extension}`);
    fs.writeFileSync(filePath, content, 'utf8');
    return new ExportStorageResult({ filePath, content, skipped: false });
  }
}