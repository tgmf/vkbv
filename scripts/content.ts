import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contentSchemas } from '../src/content/schemas/index';

export const CONTENT_DIR = join(import.meta.dirname, '..', 'src', 'content', 'data');

export interface ContentError {
  readonly file: string;
  readonly message: string;
}

export interface ContentReport {
  readonly checked: number;
  readonly errors: readonly ContentError[];
}

/** Validates every src/content/data/<kind>/*.json against the schema registered for <kind>. */
export function validateContent(root: string = CONTENT_DIR): ContentReport {
  const errors: ContentError[] = [];
  let checked = 0;

  for (const kind of readdirSync(root)) {
    const dir = join(root, kind);
    const rel = (p: string) => relative(root, p).replaceAll('\\', '/');
    if (!statSync(dir).isDirectory()) {
      errors.push({ file: rel(dir), message: 'content files must live in a <kind>/ folder' });
      continue;
    }
    const schema = contentSchemas[kind];
    if (!schema) {
      errors.push({ file: rel(dir), message: `no schema registered for kind '${kind}'` });
      continue;
    }
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (!name.endsWith('.json')) {
        errors.push({ file: rel(file), message: 'only .json files are allowed' });
        continue;
      }
      checked++;
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        errors.push({ file: rel(file), message: `invalid JSON: ${(e as Error).message}` });
        continue;
      }
      const result = schema.safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            file: rel(file),
            message: `${issue.path.join('.') || '<root>'}: ${issue.message}`,
          });
        }
      }
    }
  }
  return { checked, errors };
}
