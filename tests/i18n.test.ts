import { describe, expect, it, vi } from 'vitest';
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
