// `npm run content:check -- --todos | --actions` (M4) on Chapter 1.
import { describe, expect, it } from 'vitest';
import { catActions, writerTodos } from '../../src/cli/content-lists';
import { ch1 } from '../sim/helpers';

describe('content lists', () => {
  it('--todos: every key holding a writer marker, per file', () => {
    const todos = writerTodos({ en: ch1.text.en, ru: ch1.text.ru });
    expect(todos).toContain('en: sl.rokko_morning.sails');
    expect(todos).toContain('ru: sl.rokko_morning.sails');
    expect(writerTodos({ x: { a: 'plain', b: 'a [[TODO writer: say hi]] here' } })).toEqual([
      'x: b',
    ]);
  });

  it('--actions: activities and interrupt actions each cat can show', () => {
    const of = Object.fromEntries(catActions(ch1).map((x) => [x.cat, x]));
    expect(Object.keys(of)).toEqual(ch1.cats.map((x) => x.id)); // cast order
    const marti = of['marti'];
    // a storylet's interrupt on his role; card specials aimed at him (the box's delay, the comb)
    expect(marti?.actions).toEqual(expect.arrayContaining(['blow_whistle', 'sit_in_box', 'groom']));
    expect(marti?.activities).toEqual(expect.arrayContaining(['shop_tea', 'none', 'goTo']));
    // the crew's tea break is started by roadworks_day on its list role
    for (const x of ch1.cats.filter((x) => x.roles?.includes('crew')))
      expect(of[x.id]?.activities).toContain('tea_break');
    // a special aimed at Marti reaches no one else
    expect(of['rokko']?.actions).not.toContain('sit_in_box');
    for (const x of Object.values(of)) expect(x.activities).toEqual([...x.activities].sort());
  });
});
