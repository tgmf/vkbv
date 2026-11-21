// Parses and cross-checks content (spec 02 §5). Every problem is collected and thrown as one error.
// M0 covers tuning.json and the interface text; ch1/ is validated from M1 on.
import type { z } from 'zod';
import { TextSchema, TuningSchema, type TextTable, type Tuning } from './schemas';

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Content has ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
}

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let v = data;
  for (const key of path)
    v = v !== null && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[key] : undefined;
  return v;
}

/** Parses `data` with `schema`, adding one line per issue to `problems`: `<file>: <key.path>: <message> (got <value>)`. */
function parse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  file: string,
  problems: string[],
): T | undefined {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '<root>';
    const got = valueAt(data, issue.path);
    problems.push(
      `${file}: ${key}: ${issue.message}${got === undefined ? '' : ` (got ${JSON.stringify(got)})`}`,
    );
  }
  return undefined;
}

export function loadTuning(data: unknown): Tuning {
  const problems: string[] = [];
  const tuning = parse(TuningSchema, data, 'tuning.json', problems);
  if (!tuning) throw new ContentError(problems);
  return tuning;
}

/** Loads a pair of text tables that must have the same key set. */
export function loadText(name: string, en: unknown, ru: unknown): Record<'en' | 'ru', TextTable> {
  const problems: string[] = [];
  const a = parse(TextSchema, en, `${name}/en.json`, problems);
  const b = parse(TextSchema, ru, `${name}/ru.json`, problems);
  if (a && b) {
    for (const k of Object.keys(a))
      if (!(k in b)) problems.push(`${name}/ru.json: missing key ${k}`);
    for (const k of Object.keys(b))
      if (!(k in a)) problems.push(`${name}/en.json: missing key ${k}`);
  }
  if (!a || !b || problems.length > 0) throw new ContentError(problems);
  return { en: a, ru: b };
}

/** Everything the app needs at startup. Throws one ContentError listing every problem. */
export function loadAll(files: { tuning: unknown; uiEn: unknown; uiRu: unknown }) {
  const problems: string[] = [];
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof ContentError) problems.push(...e.problems);
      else throw e;
      return undefined;
    }
  };
  const tuning = attempt(() => loadTuning(files.tuning));
  const ui = attempt(() => loadText('ui', files.uiEn, files.uiRu));
  if (!tuning || !ui) throw new ContentError(problems);
  return { tuning, ui };
}
