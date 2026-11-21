// Translation lookup (spec 02 §2: imports nothing outside src/i18n).
// The UI keeps the current locale in a Solid signal and re-reads t() when it changes.

export type Locale = 'en' | 'ru';
export const LOCALES: readonly Locale[] = ['en', 'ru'];

type Tables = Record<Locale, Readonly<Record<string, string>>>;

let tables: Tables = { en: {}, ru: {} };
let locale: Locale = 'en';
const warned = new Set<string>();

/** Adds key tables (interface text, content text); later calls merge into earlier ones. */
export function addTables(add: Partial<Tables>): void {
  tables = { en: { ...tables.en, ...add.en }, ru: { ...tables.ru, ...add.ru } };
}

export function setLocale(next: Locale): void {
  locale = next;
}

/** Text for `key` in the current locale, with `{name}` replaced from `params`. Missing → `⟦key⟧`. */
export function t(key: string, params?: Readonly<Record<string, string | number>>): string {
  const text = tables[locale][key];
  if (text === undefined) {
    if (!warned.has(`${locale}:${key}`)) {
      warned.add(`${locale}:${key}`);
      console.warn(`[i18n] missing ${locale} key: ${key}`);
    }
    return `⟦${key}⟧`;
  }
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m)) : text;
}
