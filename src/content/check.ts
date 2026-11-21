// Cross-checks for a parsed chapter (spec 02 §5), ported from docs/reference/ch1-slice-validate.mjs.
// Zod has already checked shapes and integers; this checks that every reference resolves.
import type { z } from 'zod';
import type * as S from './schemas/chapter';
import type { TextTable } from './schemas';

export interface ParsedChapter {
  world: z.infer<typeof S.WorldSchema>;
  map: z.infer<typeof S.MapSchema>;
  cast: z.infer<typeof S.CastSchema>;
  hooks: z.infer<typeof S.HooksSchema>;
  activities: z.infer<typeof S.ActivitiesSchema>;
  objects: z.infer<typeof S.ObjectsSchema>;
  cards: z.infer<typeof S.CardsSchema>;
  powers: z.infer<typeof S.PowersSchema>;
  storylets: z.infer<typeof S.StoryletsSchema>;
  detectors: z.infer<typeof S.DetectorsSchema>;
  anchor: z.infer<typeof S.AnchorSchema>;
  economy: z.infer<typeof S.EconomySchema>;
}

/** Activities every cat has without listing them (03 §8.2). */
export const BUILT_IN_ACTIVITIES = ['none', 'goTo', 'attracted', 'repelled'];
const TRAITS = ['O', 'C', 'E', 'A', 'N'];
/** Events the engine emits itself (03 §7, §10.3). */
const ENGINE_EVENTS = ['rainStarted', 'rainStopped', 'voice'];

type Json = unknown;
type Obj = Record<string, Json>;
const isObj = (v: Json): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Calls fn on every object inside v, with a readable path. */
function walk(v: Json, fn: (o: Obj, path: string) => void, path = ''): void {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, fn, `${path}[${i}]`));
  else if (isObj(v)) {
    fn(v, path);
    for (const [k, x] of Object.entries(v)) walk(x, fn, `${path}.${k}`);
  }
}

export function checkChapter(ch: ParsedChapter, text: Record<'en' | 'ru', TextTable>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  const ids = (list: { id: string }[], what: string): Set<string> => {
    const s = new Set<string>();
    for (const x of list) {
      if (s.has(x.id)) err(`duplicate ${what} id ${x.id}`);
      s.add(x.id);
    }
    return s;
  };
  const nodes = ids(ch.map.nodes, 'node');
  const regions = ids(ch.map.regions, 'region');
  const hooks = ids(ch.hooks.hooks, 'hook');
  const cats = ids(ch.cast.cats, 'cat');
  const activities = ids(ch.activities.activities, 'activity');
  const objects = ids(ch.objects.objects, 'object');
  const cards = ids(ch.cards.cards, 'card');
  const powers = ids(ch.powers.powers, 'power');
  const storylets = ids(ch.storylets.storylets, 'storylet');
  const detectors = ids(ch.detectors.detectors, 'detector');
  const tags = new Set(ch.world.tags);
  const roleTags = new Set(ch.cast.cats.flatMap((c) => c.roles ?? []));
  const counters = new Set(Object.keys(ch.world.counters));
  const allActivities = new Set([...activities, ...BUILT_IN_ACTIVITIES]);

  const textKeys = new Set<string>();
  const key = (k: string | undefined, where: string) =>
    k ? textKeys.add(k) : err(`${where}: missing text key`);
  const factsMade = new Set([...ch.world.engineFacts]);
  const factsUsed: [string, string][] = [];
  const flagsMade = new Set(Object.keys(ch.world.initialFlags ?? {}));
  const flagsUsed: [string, string][] = [];
  const eventsMade = new Set(ENGINE_EVENTS);
  const eventsUsed: [string, string][] = [];

  // --- references inside conditions, effects, primitives and selectors --------------------------
  const catRef = (r: string, at: string, roles: Set<string> | null) => {
    if (r === 'self' || r === '$target' || cats.has(r) || nodes.has(r)) return;
    if (r.startsWith('@')) {
      if (!roles) err(`${at}: role ${r} used outside a storylet`);
      else if (!roles.has(r.slice(1))) err(`${at}: undeclared role ${r}`);
      return;
    }
    err(`${at}: unknown cat or place ${r}`);
  };
  const gaugeRef = (g: string, at: string, roles: Set<string> | null) => {
    const [whoPart, name] = g.includes('.') ? g.split('.') : [null, g];
    if (whoPart) catRef(whoPart, at, roles);
    if (!name || (!hooks.has(name) && !TRAITS.includes(name))) err(`${at}: unknown gauge ${g}`);
  };
  const str = (o: Obj, k: string): string | undefined =>
    typeof o[k] === 'string' ? o[k] : undefined;
  const strs = (o: Obj, k: string): string[] =>
    Array.isArray(o[k]) ? o[k].filter((x): x is string => typeof x === 'string') : [];

  function refs(v: Json, where: string, roles: Set<string> | null = null): void {
    walk(v, (o, p) => {
      const at = `${where}${p}`;
      const node = str(o, 'node');
      if (node && !node.startsWith('$') && !nodes.has(node)) err(`${at}: unknown place ${node}`);
      for (const k of ['tag', 'notTag']) {
        const t = str(o, k);
        if (t && !tags.has(t)) err(`${at}: unknown tag ${t}`);
      }
      for (const t of strs(o, 'nearest')) if (!tags.has(t)) err(`${at}: unknown tag ${t}`);
      const region = str(o, 'region');
      if (region && !region.startsWith('$') && !regions.has(region))
        err(`${at}: unknown region ${region}`);
      const counter = str(o, 'counter');
      if (counter && !counters.has(counter)) err(`${at}: unknown counter ${counter}`);
      for (const k of ['storylet', 'trigger']) {
        const s = str(o, k);
        if (s && !storylets.has(s)) err(`${at}: unknown storylet ${s}`);
      }
      const state = strs(o, 'state');
      if (state.length === 2) {
        const def = ch.storylets.storylets.find((s) => s.id === state[0]);
        if (!def) err(`${at}: unknown storylet ${state[0]}`);
        else if (!def.states[state[1] ?? '']) err(`${at}: unknown state ${state.join('.')}`);
      }
      for (const k of ['pin', 'card']) {
        const c = str(o, k);
        if (c && !cards.has(c)) err(`${at}: unknown card ${c}`);
      }
      const power = str(o, 'power');
      if (power && !powers.has(power)) err(`${at}: unknown power ${power}`);
      const prime = str(o, 'primeCount');
      if (prime && !cats.has(prime)) err(`${at}: unknown cat ${prime}`);
      const gauge = str(o, 'gauge');
      if (gauge) gaugeRef(gauge, at, roles);
      for (const k of [
        'at',
        'by',
        'from',
        'actor',
        'bound',
        'stop',
        'activity',
        'target',
        'ifTarget',
      ]) {
        const r = str(o, k);
        if (r && !(k === 'at' && r === '$target')) catRef(r, at, roles);
      }
      const to = str(o, 'to');
      if (to && !('kind' in o)) catRef(to, at, roles); // an exit's `to` is a state
      const near = o['near'];
      if (typeof near === 'string') catRef(near, at, roles);
      for (const r of strs(o, 'near')) catRef(r, at, roles);
      for (const k of ['goTo', 'startActivity', 'interrupt', 'activityFinished']) {
        const [who, what] = strs(o, k);
        if (!who) continue;
        catRef(who, at, roles);
        if (k === 'goTo' && !nodes.has(what ?? '')) err(`${at}: goTo unknown place ${what}`);
        if ((k === 'startActivity' || k === 'activityFinished') && !allActivities.has(what ?? ''))
          err(`${at}: unknown activity ${what}`);
      }
      const is = str(o, 'is');
      if (is && !allActivities.has(is)) err(`${at}: unknown activity ${is}`);
      if (o['prim'] === 'delay' && !activities.has(str(o, 'action') ?? ''))
        err(`${at}: delay names unknown activity`);
      for (const n of strs(o, 'via')) if (!nodes.has(n)) err(`${at}: via unknown place ${n}`);
      for (const c of strs(o, 'except')) if (!cats.has(c)) err(`${at}: unknown cat ${c}`);
      for (const ob of strs(o, 'onlyObjects'))
        if (!objects.has(ob)) err(`${at}: unknown object ${ob}`);
    });
  }

  /** Records facts, flags and events read by conditions. */
  function reads(v: Json, where: string): void {
    walk(v, (o, p) => {
      const at = `${where}${p}`;
      const fact = str(o, 'fact');
      if (fact) factsUsed.push([fact, at]);
      const flag = str(o, 'flag');
      if (flag) flagsUsed.push([flag, at]);
      for (const k of ['heard', 'event']) {
        const e = str(o, k);
        if (e) eventsUsed.push([e, at]);
      }
    });
  }

  /** Records facts, flags and events written by effects and primitives. */
  function writes(v: Json): void {
    walk(v, (o) => {
      const fact = str(o, 'fact');
      if (fact) factsMade.add(fact);
      const flag = str(o, 'flag');
      if (flag) flagsMade.add(flag);
      const emit = str(o, 'emit');
      if (emit) eventsMade.add(emit);
      if (o['prim'] === 'socialSpread') eventsMade.add(str(o, 'event') ?? '');
      const fip = o['factIfPerceivedBy'];
      if (isObj(fip))
        for (const [c, f] of Object.entries(fip)) {
          if (!cats.has(c)) err(`factIfPerceivedBy: unknown cat ${c}`);
          if (typeof f === 'string') factsMade.add(f);
        }
    });
  }

  // --- map ------------------------------------------------------------------------------------
  for (const r of ch.map.regions) key(r.nameKey, `region ${r.id}`);
  for (const n of ch.map.nodes) {
    key(n.nameKey, `place ${n.id}`);
    if (!regions.has(n.region)) err(`place ${n.id}: unknown region ${n.region}`);
    for (const t of n.tags) if (!tags.has(t)) err(`place ${n.id}: unknown tag ${t}`);
  }
  const edgeIds = new Set<string>();
  for (const e of ch.map.edges) {
    const eid = e.id ?? `${e.a}__${e.b}`;
    if (edgeIds.has(eid)) err(`duplicate edge id ${eid}`);
    edgeIds.add(eid);
    for (const end of [e.a, e.b]) if (!nodes.has(end)) err(`edge ${eid}: unknown place ${end}`);
    for (const t of e.tags ?? []) if (!tags.has(t)) err(`edge ${eid}: unknown tag ${t}`);
    if (e.when) {
      refs(e.when, `edge ${eid}.when`);
      reads(e.when, `edge ${eid}.when`);
    }
  }
  const first = ch.map.nodes[0];
  if (first) {
    const seen = new Set([first.id]);
    const queue = [first.id];
    for (let n = queue.shift(); n !== undefined; n = queue.shift())
      for (const e of ch.map.edges) {
        const other = e.a === n ? e.b : e.b === n ? e.a : null;
        if (other && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    for (const n of nodes) if (!seen.has(n)) err(`place ${n} is not connected to ${first.id}`);
  }

  // --- world ----------------------------------------------------------------------------------
  if (!cats.has(ch.world.primes.cat)) err(`world.primes: unknown cat ${ch.world.primes.cat}`);
  refs(ch.world.primes, 'world.primes');
  reads(ch.world.primes, 'world.primes');
  if (ch.world.anchor !== ch.anchor.id)
    err(`world.anchor ${ch.world.anchor} is not anchor.json's id`);

  // --- hooks ----------------------------------------------------------------------------------
  for (const h of ch.hooks.hooks) {
    const where = `hook ${h.id}`;
    key(h.nameKey, where);
    key(h.driveKey, where);
    for (const k of [...(h.voice.lines ?? []), ...(h.voice.linesOver ?? [])]) key(k, where);
    if (h.scope !== 'shared' && !cats.has(h.scope)) err(`${where}: unknown scope ${h.scope}`);
    refs([h.rise, h.decay ?? {}], where);
    reads([h.rise, h.decay ?? {}], where);
    for (const r of h.rise) if ('onEvent' in r) eventsUsed.push([r.onEvent, where]);
  }

  // --- cast -----------------------------------------------------------------------------------
  for (const c of ch.cast.cats) {
    const where = `cat ${c.id}`;
    key(c.nameKey, where);
    if (!nodes.has(c.home)) err(`${where}: unknown home ${c.home}`);
    if (!nodes.has(c.start)) err(`${where}: unknown start ${c.start}`);
    for (const a of c.activities) if (!activities.has(a)) err(`${where}: unknown activity ${a}`);
    if (!c.activities.includes(c.startActivity)) err(`${where}: startActivity is not in its list`);
    for (const [g, [lo, hi]] of [...Object.entries(c.traits), ...Object.entries(c.hooks)])
      if (lo > hi) err(`${where}: range of ${g} is reversed`);
    for (const h of Object.keys(c.hooks)) {
      const def = ch.hooks.hooks.find((x) => x.id === h);
      if (!def) err(`${where}: unknown hook ${h}`);
      else if (def.scope !== 'shared' && def.scope !== c.id)
        err(`${where}: hook ${h} belongs to ${def.scope}`);
    }
    for (const h of ch.hooks.hooks)
      if (h.scope === 'shared' && !(h.id in c.hooks)) err(`${where}: missing shared hook ${h.id}`);
  }

  // --- activities -----------------------------------------------------------------------------
  for (const a of ch.activities.activities) {
    const where = `activity ${a.id}`;
    refs(a, where);
    reads([a.gate ?? {}, a.score], where);
    writes([a.while ?? [], a.onFinish ?? []]);
    walk(a.at, (o) => {
      const flag = str(o, 'flag');
      if (flag) flagsUsed.push([flag, `${where}.at`]);
    });
    if (!ch.cast.cats.some((c) => c.activities.includes(a.id)))
      warnings.push(`${where} is used by no cat`);
  }

  // --- objects --------------------------------------------------------------------------------
  for (const o of ch.objects.objects) {
    const where = `object ${o.id}`;
    key(o.nameKey, where);
    key(o.storyKey, where);
    if (!nodes.has(o.node)) err(`${where}: unknown place ${o.node}`);
    if (o.grantsCard && !cards.has(o.grantsCard)) err(`${where}: unknown card ${o.grantsCard}`);
    for (const t of o.tags ?? []) if (!tags.has(t)) err(`${where}: unknown tag ${t}`);
    if (o.visibleWhen) {
      refs(o.visibleWhen, where);
      reads(o.visibleWhen, where);
    }
    if (o.onPerceived) {
      if (!cats.has(o.onPerceived.by)) err(`${where}: onPerceived by unknown cat`);
      eventsMade.add(o.onPerceived.emit);
      if (o.onPerceived.fact) factsMade.add(o.onPerceived.fact);
    }
  }

  // --- cards and powers -----------------------------------------------------------------------
  for (const c of ch.cards.cards) {
    const where = `card ${c.id}`;
    key(c.nameKey, where);
    key(c.textKey, where);
    if (c.source?.startsWith('hook:')) {
      if (!hooks.has(c.source.slice(5))) err(`${where}: unknown hook source ${c.source}`);
    } else if (c.source) {
      const o = ch.objects.objects.find((x) => x.id === c.source);
      if (!o) err(`${where}: unknown source object ${c.source}`);
      else if (o.grantsCard !== c.id)
        err(`${where}: source ${o.id} grants ${o.grantsCard ?? 'nothing'}`);
    }
    if (c.bound && !cats.has(c.bound)) err(`${where}: unknown bound cat ${c.bound}`);
    refs(c.on, where);
    writes(c.on);
    if (c.special) {
      key(c.special.textKey, where);
      if (!objects.has(c.special.on)) err(`${where}: special on unknown object ${c.special.on}`);
      refs(c.special.effects, `${where}.special`);
      writes(c.special.effects);
    }
  }
  for (const p of ch.powers.powers) {
    key(p.nameKey, `power ${p.id}`);
    key(p.textKey, `power ${p.id}`);
    refs(p.effects, `power ${p.id}`);
    writes(p.effects);
  }

  // --- storylets ------------------------------------------------------------------------------
  for (const s of ch.storylets.storylets) {
    const where = `storylet ${s.id}`;
    const roles = new Set(Object.keys(s.roles));
    for (const [r, spec] of Object.entries(s.roles)) {
      if ('cat' in spec && !cats.has(spec.cat)) err(`${where}: role ${r}: unknown cat ${spec.cat}`);
      if ('roleTag' in spec && !roleTags.has(spec.roleTag))
        err(`${where}: role ${r}: unknown roleTag ${spec.roleTag}`);
      if ('nearCat' in spec) catRef(spec.nearCat, `${where}.roles.${r}`, roles);
    }
    if (!s.states[s.start]) err(`${where}: unknown start state ${s.start}`);
    refs(s.trigger, `${where}.trigger`, roles);
    reads(s.trigger, `${where}.trigger`);
    const reached = new Set([s.start]);
    for (const [name, st] of Object.entries(s.states)) {
      const w = `${where}.${name}`;
      if (st.textKey) key(st.textKey, w);
      refs(st.onEnter ?? [], w, roles);
      writes(st.onEnter ?? []);
      const actors = new Set<string>();
      for (const e of st.exits) {
        if (!s.states[e.to]) err(`${w}: exit to unknown state ${e.to}`);
        reached.add(e.to);
        if (e.kind === 'choice') {
          if (!e.actor) err(`${w}: choice exit without an actor`);
          else actors.add(e.actor);
        }
        refs(e, w, roles);
        reads([e.gate ?? {}, e.score ?? {}, e.terms ?? []], w);
      }
      if (actors.size > 1)
        err(`${w}: choice exits name different actors (${[...actors].join(', ')})`);
    }
    for (const name of Object.keys(s.states))
      if (!reached.has(name)) warnings.push(`${where}: state ${name} is unreachable`);
  }

  // --- detectors ------------------------------------------------------------------------------
  for (const d of ch.detectors.detectors) {
    factsMade.add(d.emits);
    refs(d.kernel, `detector ${d.id}`);
    reads([d.kernel, d.unless ?? []], `detector ${d.id}`);
  }

  // --- anchor ---------------------------------------------------------------------------------
  key(ch.anchor.nameKey, 'anchor');
  key(ch.anchor.teaserKey, 'anchor');
  key(ch.anchor.afterAnchor.endKey, 'anchor');
  if (!cats.has(ch.anchor.afterAnchor.lockedThread)) err(`anchor: unknown lockedThread cat`);
  refs(ch.anchor.fraysIf, 'anchor.fraysIf');
  reads([ch.anchor.requirements, ch.anchor.fraysIf], 'anchor');
  let weights = 0;
  walk(
    ch.anchor.requirements,
    (o) => (weights += typeof o['weight'] === 'number' ? o['weight'] : 0),
  );
  if (weights !== 100) warnings.push(`anchor weights sum to ${weights}, not 100`);

  // --- economy --------------------------------------------------------------------------------
  for (const k of Object.keys(ch.economy.payouts.storyletState)) {
    const [s, st] = k.split('.');
    if (!ch.storylets.storylets.find((x) => x.id === s)?.states[st ?? ''])
      err(`economy: unknown storylet state ${k}`);
  }
  for (const k of Object.keys(ch.economy.payouts.detector))
    if (!detectors.has(k)) err(`economy: unknown detector ${k}`);
  for (const [h, c] of Object.entries(ch.economy.cardsFromExploring.discoverHook)) {
    if (!hooks.has(h)) err(`economy: unknown hook ${h}`);
    if (!cards.has(c)) err(`economy: unknown card ${c}`);
  }
  for (const r of Object.keys(ch.economy.cardsFromExploring.revealRegion))
    if (!regions.has(r)) err(`economy: unknown region ${r}`);

  // --- facts, flags, events -------------------------------------------------------------------
  for (const [f, at] of factsUsed) if (!factsMade.has(f)) err(`${at}: fact ${f} is never set`);
  for (const [f, at] of flagsUsed) if (!flagsMade.has(f)) err(`${at}: flag ${f} is never set`);
  for (const [e, at] of eventsUsed)
    if (!eventsMade.has(e)) err(`${at}: event ${e} is never emitted`);
  const heardEvents = new Set(eventsUsed.map(([e]) => e));
  for (const e of eventsMade)
    if (!heardEvents.has(e) && !ENGINE_EVENTS.includes(e))
      warnings.push(`event ${e} is emitted but nothing reacts to it`);

  // --- text -----------------------------------------------------------------------------------
  for (const loc of ['en', 'ru'] as const) {
    for (const k of textKeys) if (!(k in text[loc])) err(`ch1/text/${loc}.json: missing key ${k}`);
    for (const k of Object.keys(text[loc]))
      if (!textKeys.has(k) && !k.startsWith('ui.'))
        warnings.push(`ch1/text/${loc}.json: unused key ${k}`);
  }

  return { errors, warnings };
}
