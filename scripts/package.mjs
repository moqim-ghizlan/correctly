// Builds release/Correctly-V5.17-Extension.zip from an audited dist/.
// manifest.json sits at the archive root, ready for "Load unpacked" after
// extraction. Minimal ZIP writer (deflate) to avoid a new dependency.
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { auditDist } from './audit-dist.mjs';

const dist = resolve('dist');
const { errors, files } = auditDist(dist);
if (errors.length) {
  console.error('Refusing to package: dist/ audit failed.');
  for (const error of errors) console.error('  - ' + error);
  process.exit(1);
}

// Fixed DOS timestamp (2026-01-01 00:00) keeps archives reproducible.
const DOS_TIME = 0,
  DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const locals = [],
  centrals = [];
let offset = 0;
for (const file of files) {
  const data = readFileSync(join(dist, file));
  const compressed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(file, 'utf8');
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8 names
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  locals.push(header, name, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += header.length + name.length + compressed.length;
}
const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, ...centrals, end]);

mkdirSync('release', { recursive: true });
const target = join('release', 'Correctly-V5.17-Extension.zip');
writeFileSync(target, zip);
const sha = createHash('sha256').update(zip).digest('hex');
writeFileSync(target + '.sha256', `${sha}  ${basename(target)}\n`);
console.info(`${target} (${files.length} files, ${zip.length} bytes)`);
console.info('SHA-256 ' + sha);
