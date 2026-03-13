import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function resolveTempPath(fileName) {
  const base = process.env.MR_MAGIC_TMP_DIR || os.tmpdir();
  return path.join(base, fileName);
}

export function writeTempFile(fileName, contents) {
  const filePath = resolveTempPath(fileName);
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}
