import { describe, expect, it, vi } from 'vitest';
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning } from '../src/content/load';
import uiRu from '../src/content/data/ui/ru.json';
import { addTables, setLocale, t } from '../src/i18n/t';

describe('t()', () => {
  addTables({
    en: { 'ui.town': 'Town', 'ui.hi': 'Hi {name}' },
    ru: { 'ui.town': 'Город', 'ui.hi': 'Привет {name}' },
  });

  it('switches locale and fills params', () => {
    setLocale('en');
    expect(t('ui.town')).toBe('Town');
    expect(t('ui.hi', { name: 'Marti' })).toBe('Hi Marti');
    setLocale('ru');
    expect(t('ui.town')).toBe('Город');
    setLocale('en');
  });

  it('marks a missing key and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(t('ui.nope')).toBe('⟦ui.nope⟧');
    expect(t('ui.nope')).toBe('⟦ui.nope⟧');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('interface text (M7)', () => {
  it('ui/ru.json has no English left: no Latin letters outside {params}, but the language codes', () => {
    const english = Object.entries(uiRu as Record<string, string>)
      .filter(([k]) => !k.startsWith('ui.locale.'))
      .filter(([, v]) => /[A-Za-z]/.test(v.replace(/\{\w+\}/g, '')));
    expect(english).toEqual([]);
  });

  it("the hints' storylet states (tuning.flow) exist in Chapter 1", () => {
    const tuning = loadTuning(TUNING_FILE);
    const c = loadChapter(CHAPTER1_FILES, tuning);
    for (const k of [...tuning.flow.notreadyOn, ...tuning.flow.morningOn]) {
      const [s, st] = k.split('.');
      expect(c.storylet[s ?? '']?.states[st ?? ''], k).toBeDefined();
    }
  });
});
