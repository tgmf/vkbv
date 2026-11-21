// Node-only: reads a chapter folder (same layout as src/content/data/ch1/) for the CLI and tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChapterFiles } from '../content/load';

const read = (dir: string, file: string): unknown =>
  JSON.parse(readFileSync(join(dir, file), 'utf8'));

export function readChapterDir(dir: string): ChapterFiles {
  const names = [
    'world',
    'map',
    'cast',
    'hooks',
    'activities',
    'objects',
    'cards',
    'powers',
    'storylets',
    'detectors',
    'anchor',
    'economy',
  ] as const;
  const files = Object.fromEntries(names.map((n) => [n, read(dir, `${n}.json`)]));
  return {
    ...files,
    textEn: read(dir, 'text/en.json'),
    textRu: read(dir, 'text/ru.json'),
  } as ChapterFiles;
}

export const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
