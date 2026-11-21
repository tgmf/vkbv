// Cross-reference check for the Chapter 1 content pack.
// Usage: node tools/validate.mjs [contentDir]
// Exits 1 on errors; warnings are printed but don't fail.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? new URL('../content', import.meta.url).pathname;
const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const world = load('world.json');
const map = load('map.json');
const hooks = load('hooks.json').hooks;
const cast = load('cast.json').cats;
const acts = load('activities.json').activities;
const objects = load('objects.json').objects;
const cards = load('cards.json').cards;
const powers = load('powers.json').powers;
const economy = load('economy.json');
const storylets = load('storylets.json').storylets;
const detectors = load('detectors.json').detectors;
const anchor = load('anchor.json');
const locales = { en: load('text/en.json'), ru: load('text/ru.json') };

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const ids = (arr, what) => {
  const s = new Set();
  for (const x of arr) {
    if (s.has(x.id)) err(`duplicate ${what} id ${x.id}`);
    s.add(x.id);
  }
  return s;
};

const nodeIds = ids(map.nodes, 'node');
const regionIds = ids(map.regions, 'region');
const hookIds = ids(hooks, 'hook');
const catIds = ids(cast, 'cat');
const actIds = ids(acts, 'activity');
const objIds = ids(objects, 'object');
const cardIds = ids(cards, 'card');
const powerIds = ids(powers, 'power');
const storyIds = ids(storylets, 'storylet');
const detIds = ids(detectors, 'detector');
const tagSet = new Set(world.tags);
const traits = new Set(['O', 'C', 'E', 'A', 'N']);
const roleTags = new Set(cast.flatMap((c) => c.roles ?? []));
const counters = new Set(Object.keys(world.counters ?? {}));

// ---------- collectors ----------
const textKeys = new Set();
const factsProduced = new Set(world.engineFacts);
const factsUsed = []; // [fact, where]
const flagsProduced = new Set();
const flagsUsed = [];
const eventsProduced = new Set(['rainStarted', 'rainStopped']);
const eventsUsed = [];

const addKey = (k, where) => { if (k) textKeys.add(k); else err(`missing text key at ${where}`); };

// Walk any JSON value and apply visitor to every object.
function walk(v, fn, path = '') {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, fn, `${path}[${i}]`));
  else if (v && typeof v === 'object') {
    fn(v, path);
    for (const [k, x] of Object.entries(v)) walk(x, fn, `${path}.${k}`);
  }
}

// Check refs inside conditions / effects / score terms.
function checkRefs(v, where, roles = null) {
  walk(v, (o, p) => {
    const at = `${where}${p}`;
    if ('fact' in o && typeof o.fact === 'string' && !('weight' in o && false)) {
      // effect {fact: x} produces; condition {fact: x} uses. Effects are handled separately.
    }
    if (o.node && typeof o.node === 'string' && !o.node.startsWith('$') && !nodeIds.has(o.node)) err(`${at}: unknown node ${o.node}`);
    if (o.tag && typeof o.tag === 'string' && !tagSet.has(o.tag)) err(`${at}: unknown tag ${o.tag}`);
    if (o.notTag && !tagSet.has(o.notTag)) err(`${at}: unknown tag ${o.notTag}`);
    if (o.region && typeof o.region === 'string' && !o.region.startsWith('$') && !regionIds.has(o.region)) err(`${at}: unknown region ${o.region}`);
    if (o.counter && !counters.has(o.counter)) err(`${at}: unknown counter ${o.counter}`);
    if (o.storylet && !storyIds.has(o.storylet)) err(`${at}: unknown storylet ${o.storylet}`);
    if (o.state && Array.isArray(o.state)) {
      const s = storylets.find((x) => x.id === o.state[0]);
      if (!s) err(`${at}: unknown storylet ${o.state[0]}`);
      else if (!s.states[o.state[1]]) err(`${at}: unknown state ${o.state.join('.')}`);
    }
    if (o.pin && !cardIds.has(o.pin)) err(`${at}: unknown card ${o.pin}`);
    if (o.card && !cardIds.has(o.card)) err(`${at}: unknown card ${o.card}`);
    if (o.power && typeof o.power === 'string' && !powerIds.has(o.power)) err(`${at}: unknown power ${o.power}`);
    if (o.primeCount && !catIds.has(o.primeCount)) err(`${at}: unknown cat ${o.primeCount}`);
    if (typeof o.gauge === 'string') checkGauge(o.gauge, at, roles);
    for (const key of ['at', 'by', 'from', 'to', 'actor', 'nearCat', 'bound']) {
      if (key === 'to' && 'kind' in o) continue; // storylet exit target is a state
      if (typeof o[key] === 'string') checkCatRef(o[key], at, roles);
    }
    if (Array.isArray(o.near)) o.near.forEach((r) => { if (!nodeIds.has(r)) checkCatRef(r, at, roles); });
    for (const key of ['goTo', 'startActivity', 'interrupt']) {
      if (Array.isArray(o[key])) {
        checkCatRef(o[key][0], at, roles);
        if (key === 'goTo' && !nodeIds.has(o[key][1])) err(`${at}: goTo unknown node ${o[key][1]}`);
        if (key === 'startActivity' && !actIds.has(o[key][1])) err(`${at}: unknown activity ${o[key][1]}`);
      }
    }
    if (Array.isArray(o.via)) o.via.forEach((n) => { if (!nodeIds.has(n)) err(`${at}: via unknown node ${n}`); });
    if (o.activityFinished) { checkCatRef(o.activityFinished[0], at, roles); if (!actIds.has(o.activityFinished[1])) err(`${at}: unknown activity`); }
    if (typeof o.stop === 'string') checkCatRef(o.stop, at, roles);
    if (o.except) o.except.forEach((c) => { if (!catIds.has(c)) err(`${at}: unknown cat ${c}`); });
    if (o.trigger && typeof o.trigger === 'string' && !storyIds.has(o.trigger)) err(`${at}: unknown storylet ${o.trigger}`);
  });
}

function checkCatRef(r, at, roles) {
  if (r === 'self' || r === '$target') return;
  if (r.startsWith('@')) {
    if (!roles) err(`${at}: role ref ${r} outside a storylet`);
    else if (!roles.has(r.slice(1))) err(`${at}: undeclared role ${r}`);
    return;
  }
  if (catIds.has(r) || nodeIds.has(r)) return;
  err(`${at}: unknown cat/role ${r}`);
}

function checkGauge(g, at, roles) {
  const [who, name] = g.includes('.') ? g.split('.') : [null, g];
  if (who) checkCatRef(who, at, roles);
  if (!hookIds.has(name) && !traits.has(name)) err(`${at}: unknown gauge ${name}`);
}

function collectConds(v, where) {
  walk(v, (o, p) => {
    const at = `${where}${p}`;
    if (typeof o.fact === 'string' && !('ttl' in o)) factsUsed.push([o.fact, at]);
    if (typeof o.flag === 'string' && !('value' in o) && !('ttl' in o)) flagsUsed.push([o.flag, at]);
    if (typeof o.heard === 'string') eventsUsed.push([o.heard, at]);
    if (typeof o.event === 'string') eventsUsed.push([o.event, at]);
  });
}

function collectEffects(list, where) {
  walk(list, (o) => {
    if (typeof o.fact === 'string') factsProduced.add(o.fact);
    if (typeof o.flag === 'string' && ('value' in o || 'ttl' in o || o.prim === 'setFlag')) flagsProduced.add(o.flag);
    if (typeof o.emit === 'string') eventsProduced.add(o.emit);
    if (o.prim === 'socialSpread' && o.event) eventsProduced.add(o.event);
    if (o.factIfPerceivedBy) Object.values(o.factIfPerceivedBy).forEach((f) => factsProduced.add(f));
  });
}

// ---------- map ----------
for (const n of map.nodes) {
  if (!regionIds.has(n.region)) err(`node ${n.id}: unknown region`);
  n.tags.forEach((t) => { if (!tagSet.has(t)) err(`node ${n.id}: unknown tag ${t}`); });
  addKey(n.nameKey, n.id);
}
map.regions.forEach((r) => addKey(r.nameKey, r.id));
for (const e of map.edges) {
  for (const k of ['a', 'b']) if (!nodeIds.has(e[k])) err(`edge ${e.a}-${e.b}: unknown node ${e[k]}`);
  if (e.when) { checkRefs(e.when, `edge ${e.a}-${e.b}`); collectConds(e.when, `edge ${e.a}-${e.b}`); }
}
// connectivity
{
  const adj = new Map([...nodeIds].map((n) => [n, []]));
  map.edges.forEach((e) => { adj.get(e.a)?.push(e.b); adj.get(e.b)?.push(e.a); });
  const seen = new Set(['flat.study']);
  const q = ['flat.study'];
  while (q.length) for (const m of adj.get(q.shift())) if (!seen.has(m)) { seen.add(m); q.push(m); }
  for (const n of nodeIds) if (!seen.has(n)) err(`node ${n} unreachable from flat.study`);
}

// ---------- world ----------
checkRefs(world.primes, 'world.primes');

// ---------- hooks ----------
for (const h of hooks) {
  addKey(h.nameKey, h.id); addKey(h.driveKey, h.id);
  if (h.scope !== 'shared' && !catIds.has(h.scope)) err(`hook ${h.id}: unknown scope ${h.scope}`);
  checkRefs(h.rise, `hook ${h.id}`); checkRefs(h.decay ?? {}, `hook ${h.id}`);
  collectConds(h.rise, `hook ${h.id}`); collectConds(h.decay ?? {}, `hook ${h.id}`);
  (h.rise ?? []).forEach((r) => r.onEvent && eventsUsed.push([r.onEvent, `hook ${h.id}`]));
  [...(h.voice?.lines ?? []), ...(h.voice?.linesOver ?? [])].forEach((k) => addKey(k, h.id));
}

// ---------- cast ----------
for (const c of cast) {
  addKey(c.nameKey, c.id);
  if (!nodeIds.has(c.home)) err(`cat ${c.id}: unknown home`);
  if (!nodeIds.has(c.start)) err(`cat ${c.id}: unknown start`);
  c.activities.forEach((a) => { if (!actIds.has(a)) err(`cat ${c.id}: unknown activity ${a}`); });
  if (!c.activities.includes(c.startActivity)) err(`cat ${c.id}: startActivity not in its list`);
  for (const [h, r] of Object.entries(c.hooks)) {
    const def = hooks.find((x) => x.id === h);
    if (!def) err(`cat ${c.id}: unknown hook ${h}`);
    else if (def.scope !== 'shared' && def.scope !== c.id) err(`cat ${c.id}: hook ${h} belongs to ${def.scope}`);
    if (!(r[0] <= r[1] && r[0] >= 0 && r[1] <= 1000)) err(`cat ${c.id}: bad range for ${h}`);
  }
  for (const t of traits) if (!c.traits[t]) err(`cat ${c.id}: missing trait ${t}`);
  for (const h of hooks.filter((x) => x.scope === 'shared')) if (!c.hooks[h.id]) err(`cat ${c.id}: missing shared hook ${h.id}`);
}
const coreCount = cast.filter((c) => c.core).length;

// ---------- activities ----------
for (const a of acts) {
  checkRefs(a, `activity ${a.id}`); collectConds(a.gate ?? {}, `activity ${a.id}`); collectConds(a.score ?? {}, `activity ${a.id}`);
  collectEffects([...(a.onFinish ?? []), ...(a.while ?? [])], `activity ${a.id}`);
  if (!cast.some((c) => c.activities.includes(a.id))) warn(`activity ${a.id} unused by any cat`);
}

// ---------- objects ----------
for (const o of objects) {
  addKey(o.nameKey, o.id); addKey(o.storyKey, o.id);
  if (!nodeIds.has(o.node)) err(`object ${o.id}: unknown node`);
  if (o.grantsCard && !cardIds.has(o.grantsCard)) err(`object ${o.id}: unknown card`);
  (o.tags ?? []).forEach((t) => { if (!tagSet.has(t)) err(`object ${o.id}: unknown tag ${t}`); });
  if (o.onPerceived) { collectEffects(o.onPerceived, `object ${o.id}`); if (o.onPerceived.fact) factsProduced.add(o.onPerceived.fact); }
  if (o.visibleWhen) { checkRefs(o.visibleWhen, `object ${o.id}`); collectConds(o.visibleWhen, `object ${o.id}`); }
}

// ---------- cards & powers ----------
for (const c of cards) {
  addKey(c.nameKey, c.id); addKey(c.textKey, c.id);
  if (c.source && !c.source.startsWith('hook:')) {
    const o = objects.find((x) => x.id === c.source);
    if (!o) err(`card ${c.id}: unknown source object`);
    else if (o.grantsCard !== c.id) err(`card ${c.id}: source ${o.id} grants ${o.grantsCard}`);
  }
  if (c.source?.startsWith('hook:') && !hookIds.has(c.source.slice(5))) err(`card ${c.id}: unknown hook source`);
  if (c.bound && !catIds.has(c.bound)) err(`card ${c.id}: unknown bound cat`);
  for (const t of Object.keys(c.on)) if (!['cat', 'object', 'place'].includes(t)) err(`card ${c.id}: bad target ${t}`);
  checkRefs(c.on, `card ${c.id}`);
  collectEffects(c.on, `card ${c.id}`);
  if (c.special) {
    addKey(c.special.textKey, c.id);
    if (!objIds.has(c.special.on)) err(`card ${c.id}: special on unknown object`);
    checkRefs(c.special.effects, `card ${c.id}.special`);
    collectEffects(c.special.effects, `card ${c.id}.special`);
  }
}
const demoDeck = cards.filter((c) => c.demo).map((c) => c.id);
for (const p of powers) {
  addKey(p.nameKey, p.id); addKey(p.textKey, p.id);
  checkRefs(p.effects, `power ${p.id}`);
}

// ---------- storylets ----------
for (const s of storylets) {
  const roles = new Set(Object.keys(s.roles));
  for (const [r, def] of Object.entries(s.roles)) {
    if (def.cat && !catIds.has(def.cat)) err(`storylet ${s.id}: role ${r} unknown cat`);
    if (def.roleTag && !roleTags.has(def.roleTag)) err(`storylet ${s.id}: role ${r} unknown roleTag ${def.roleTag}`);
    if (def.nearCat) checkCatRef(def.nearCat, `storylet ${s.id}.roles.${r}`, roles);
  }
  if (!s.states[s.start]) err(`storylet ${s.id}: unknown start state`);
  checkRefs(s.trigger, `storylet ${s.id}.trigger`, roles); collectConds(s.trigger, `storylet ${s.id}.trigger`);
  const n = Object.keys(s.states).length;
  if (n < 2 || n > 7) warn(`storylet ${s.id}: ${n} states (design says 3–7)`);
  const reached = new Set([s.start]);
  for (const [sid, st] of Object.entries(s.states)) {
    const w = `storylet ${s.id}.${sid}`;
    if (st.textKey) addKey(st.textKey, w);
    checkRefs(st.onEnter ?? [], w, roles); collectEffects(st.onEnter ?? [], w);
    for (const e of st.exits) {
      if (!s.states[e.to]) err(`${w}: exit to unknown state ${e.to}`);
      reached.add(e.to);
      if (!['choice', 'hazard', 'auto'].includes(e.kind)) err(`${w}: bad exit kind ${e.kind}`);
      if (e.kind === 'choice' && !e.actor) err(`${w}: choice without actor`);
      checkRefs(e, w, roles); collectConds(e.gate ?? {}, w); collectConds(e.score ?? {}, w); collectConds(e.terms ?? [], w);
    }
  }
  for (const sid of Object.keys(s.states)) if (!reached.has(sid)) warn(`storylet ${s.id}: state ${sid} unreachable`);
}

// ---------- detectors ----------
for (const d of detectors) {
  factsProduced.add(d.emits);
  checkRefs(d.kernel, `detector ${d.id}`); collectConds(d.kernel, `detector ${d.id}`); collectConds(d.unless ?? [], `detector ${d.id}`);
}

// ---------- anchor ----------
addKey(anchor.nameKey, 'anchor'); addKey(anchor.teaserKey, 'anchor'); addKey(anchor.afterAnchor?.endKey, 'anchor');
collectConds(anchor.requirements, 'anchor'); collectConds(anchor.fraysIf, 'anchor');
const weights = [];
walk(anchor.requirements, (o) => { if ('weight' in o) weights.push(o.weight); });
const wsum = weights.reduce((a, b) => a + b, 0);
if (wsum !== 100) warn(`anchor weights sum to ${wsum}, not 100`);

// ---------- economy ----------
for (const k of Object.keys(economy.payouts.storyletState)) {
  const [s, st] = k.split('.');
  const def = storylets.find((x) => x.id === s);
  if (!def?.states[st]) err(`economy: unknown storylet state ${k}`);
}
for (const k of Object.keys(economy.payouts.detector)) if (!detIds.has(k)) err(`economy: unknown detector ${k}`);
for (const c of Object.values(economy.cardsFromExploring.discoverHook)) if (!cardIds.has(c)) err(`economy: unknown card ${c}`);

// ---------- facts / flags / events ----------
for (const [f, at] of factsUsed) if (!factsProduced.has(f)) err(`${at}: fact ${f} is never produced`);
for (const [f, at] of flagsUsed) if (!flagsProduced.has(f)) err(`${at}: flag ${f} is never set`);
for (const [e, at] of eventsUsed) if (!eventsProduced.has(e)) err(`${at}: event ${e} is never emitted`);
const usedEvents = new Set(eventsUsed.map(([e]) => e));
for (const e of eventsProduced) if (!usedEvents.has(e)) warn(`event ${e} emitted but nothing listens (fine for telemetry)`);

// ---------- text ----------
for (const [loc, table] of Object.entries(locales)) {
  for (const k of textKeys) {
    if (!(k in table)) err(`text/${loc}.json: missing ${k}`);
    else if (typeof table[k] !== 'string' || !table[k].trim()) err(`text/${loc}.json: empty ${k}`);
    else if (table[k].includes('[WRITER]')) warn(`text/${loc}.json: writer marker in ${k}`);
  }
  for (const k of Object.keys(table)) if (!textKeys.has(k) && !k.startsWith('ui.')) warn(`text/${loc}.json: unused key ${k}`);
}

// ---------- report ----------
console.log(`nodes ${nodeIds.size}, edges ${map.edges.length}, cats ${catIds.size} (core ${coreCount}), activities ${actIds.size}, objects ${objIds.size}`);
console.log(`cards ${cardIds.size} (demo deck: ${demoDeck.join(', ')}), powers ${powerIds.size}, storylets ${storyIds.size}, detectors ${detIds.size}`);
console.log(`facts ${factsProduced.size}, text keys ${textKeys.size} x ${Object.keys(locales).length} locales`);
warnings.forEach((w) => console.log(`warn  ${w}`));
errors.forEach((e) => console.log(`ERROR ${e}`));
console.log(errors.length ? `\n${errors.length} error(s)` : '\nOK');
process.exit(errors.length ? 1 : 0);
