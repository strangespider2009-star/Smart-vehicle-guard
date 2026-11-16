// Store demo licence uploads privately, outside the static frontend directory.
// Do not upload real identity documents to this educational prototype.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const base = path.resolve(process.env.DATA_DIR || './server/local-data');
const folder = path.join(base, 'licences');
export const MAX_LICENCE_BYTES = 2 * 1024 * 1024;
const typeFor = bytes => {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString() === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mime: 'image/png', ext: '.png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: 'image/jpeg', ext: '.jpg' };
  return null;
};
export function validateLicence(file) {
  if (!file) return null;
  if (!file.buffer?.length || file.buffer.length > MAX_LICENCE_BYTES) throw new Error('Licence must be a nonempty PDF, PNG or JPEG under 2 MB.');
  const type = typeFor(file.buffer);
  if (!type || type.mime !== file.mimetype) throw new Error('Unsupported document content. Upload a valid PDF, PNG or JPEG.');
  return type;
}
export function storeLicence(file) {
  if (!file) return null;
  const { mime, ext } = validateLicence(file);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(folder, filename), file.buffer, { mode: 0o600, flag: 'wx' });
  return { file: filename, mime, uploadedAt: new Date().toISOString() };
}
export function readLicence(record) {
  if (!record || !/^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(record.file)) return null;
  const full = path.join(folder, record.file);
  return fs.existsSync(full) ? { bytes: fs.readFileSync(full), mime: record.mime } : null;
}
export function removeLicence(record) {
  if (record?.file && /^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(record.file))
    fs.rmSync(path.join(folder, record.file), { force: true });
}
