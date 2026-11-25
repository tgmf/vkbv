// Lists for `npm run content:check -- --todos | --actions` (M4): the text keys that still hold a writer
// marker (docs/art-brief.md §5), and every activity and interrupt action each cat can show (the art
// brief's list of actions per character).
import type { TextTable } from '../content/schemas';
import type { CatId, Content } from '../sim/types';

const MARKER = '[[TODO writer:';

/** Every key whose text holds a writer marker, as `file: key`, per table in the order given. */
export function writerTodos(tables: Record<string, TextTable>): string[] {
  return Object.entries(tables).flatMap(([file, table]) =>
    Object.entries(table)
      .filter(([, text]) => text.includes(MARKER))
      .map(([key]) => `${file}: ${key}`),
  );
}

/** Activities every cat has without listing them (03 §8.2). */
const BUILT_IN = ['none', 'goTo', 'attracted', 'repelled'];

/**
 * Per cat, in cast order: what it can be seen doing. Activities: its own list, the built-ins, and
 * what a storylet starts on a role it can hold. Actions: interrupts and card `delay`s that can reach
 * it — a storylet's on its roles, a card's on a cat (only its bound cat, if any), on a place or an
 * object (any cat), a special's on its `target` (else any cat). Sorted.
 */
export function catActions(c: Content): { cat: CatId; activities: string[]; actions: string[] }[] {
  const all = c.cats.map((x) => x.id);
  const acts: Record<CatId, Set<string>> = {};
  const actions: Record<CatId, Set<string>> = {};
  for (const x of c.cats) {
    acts[x.id] = new Set([...x.activities, ...BUILT_IN]);
    actions[x.id] = new Set();
  }
  const add = (to: Record<CatId, Set<string>>, cats: readonly CatId[], what: string) => {
    for (const id of cats) to[id]?.add(what);
  };

  for (const sl of c.storylets) {
    const roleCats = (who: string): CatId[] => {
      if (!who.startsWith('@')) return [who];
      const spec = sl.roles[who.slice(1)];
      if (!spec) return [];
      if ('cat' in spec) return [spec.cat];
      if ('roleTag' in spec)
        return c.cats.filter((x) => x.roles?.includes(spec.roleTag)).map((x) => x.id);
      return all; // nearCat: whoever is near
    };
    for (const st of Object.values(sl.states))
      for (const e of st.onEnter ?? []) {
        if ('startActivity' in e) add(acts, roleCats(e.startActivity[0]), e.startActivity[1]);
        if ('interrupt' in e) add(actions, roleCats(e.interrupt[0]), e.interrupt[1]);
      }
  }

  for (const card of c.cards) {
    const branches = [
      { prims: card.on.cat ?? [], cats: card.bound ? [card.bound] : all },
      { prims: [...(card.on.place ?? []), ...(card.on.object ?? [])], cats: all },
      { prims: card.special?.effects ?? [], cats: all },
    ];
    for (const { prims, cats } of branches)
      for (const p of prims)
        if (p.prim === 'interrupt' || p.prim === 'delay')
          add(actions, 'target' in p && p.target ? [p.target] : cats, p.action);
  }
  for (const power of c.powers)
    for (const p of power.effects)
      if (p.prim === 'interrupt' || p.prim === 'delay')
        add(actions, 'target' in p && p.target ? [p.target] : all, p.action);

  return all.map((cat) => ({
    cat,
    activities: [...(acts[cat] ?? [])].sort(),
    actions: [...(actions[cat] ?? [])].sort(),
  }));
}
