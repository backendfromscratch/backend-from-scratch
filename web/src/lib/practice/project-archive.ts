/**
 * Each step of a guided project as a .tar.gz the reader downloads (`curl -O` and `tar -xzf`, which
 * macOS, Linux and WSL already have), so nobody gets stuck on a typo. A minimal ustar writer, with
 * a fixed date: the same files always give the same bytes.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

export interface ArchiveEntry {
  /** The path inside the archive, with `/`: `04-servidor-http/src/app.ts`. A directory ends in `/`. */
  path: string;
  content?: Uint8Array;
}

/** 2026-10-13, the day the projects were written: a fixed date, so builds are reproducible. */
const mtime = Date.UTC(2026, 9, 13) / 1000;
const block = 512;

function header(path: string, size: number, directory: boolean): Uint8Array {
  if (Buffer.byteLength(path) > 100) throw new Error(`Path too long for the archive: ${path}`);
  const bytes = Buffer.alloc(block);
  const field = (offset: number, length: number, value: string) =>
    bytes.write(value, offset, length, 'utf8');
  const octal = (value: number, length: number) =>
    `${value.toString(8).padStart(length - 1, '0')}\0`;
  field(0, 100, path);
  field(100, 8, octal(directory ? 0o755 : 0o644, 8));
  field(108, 8, octal(0, 8));
  field(116, 8, octal(0, 8));
  field(124, 12, octal(size, 12));
  field(136, 12, octal(mtime, 12));
  field(148, 8, '        '); // the checksum counts its own field as spaces
  field(156, 1, directory ? '5' : '0');
  field(257, 6, 'ustar\0');
  field(263, 2, '00');
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0);
  field(148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return bytes;
}

/** The archive, gzipped. */
export function tarGz(entries: ArchiveEntry[]): Buffer {
  const parts: Uint8Array[] = [];
  for (const { path, content } of entries) {
    const directory = path.endsWith('/');
    const data = content ?? new Uint8Array();
    parts.push(header(path, directory ? 0 : data.length, directory));
    if (!directory) {
      parts.push(data, Buffer.alloc((block - (data.length % block)) % block));
    }
  }
  parts.push(Buffer.alloc(block * 2));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

/** The `// #region` markers that let lessons show part of a file: the reader never sees them. */
const regionMarker = /^\s*\/\/ #(end)?region\b.*(\n|$)/gm;

/** A file as the reader gets it: code files without region markers, so line numbers match the lessons. */
function readerCopy(path: string): Buffer {
  const content = readFileSync(path);
  if (!/\.[jt]s$/.test(path)) return content;
  return Buffer.from(content.toString('utf8').replace(regionMarker, ''), 'utf8');
}

/** What never goes in a download: installed packages and the reader's own secrets. */
const skipped = new Set(['node_modules', '.env', '.DS_Store']);

/** A step's folder as entries, under its own name, in a stable order. */
export function stepEntries(stepDir: string, name: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [{ path: `${name}/` }];
  const walk = (dir: string) => {
    for (const child of readdirSync(dir).sort()) {
      // The tests' own .env (test/.env) is part of the project; only the top-level one is skipped.
      if (skipped.has(child) && !(child === '.env' && dir !== stepDir)) continue;
      const full = join(dir, child);
      const path = `${name}/${relative(stepDir, full).split(sep).join('/')}`;
      if (statSync(full).isDirectory()) {
        entries.push({ path: `${path}/` });
        walk(full);
      } else {
        entries.push({ path, content: readerCopy(full) });
      }
    }
  };
  walk(stepDir);
  return entries;
}
