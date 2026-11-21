// Writes the tiny test world (M1 brief, item 4) as content files: `npx tsx tests/fixtures/tiny/make.ts`.
// Six places (one closable edge, one indoor space with a window), three cats (hero has willpower
// 850), four activities, storylets with every exit and role kind, two detectors, cards covering
// every primitive, a power with attract and one with collapse. Gauge ranges are fixed (lo = hi) so
// tests can predict values.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = import.meta.dirname;
const write = (name: string, data: unknown) => {
  mkdirSync(join(dir, name.includes('/') ? (name.split('/')[0] ?? '') : ''), { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n');
};
const fixed = (v: number) => [v, v];
const traits = (o = 500) => ({
  O: fixed(o),
  C: fixed(500),
  E: fixed(500),
  A: fixed(500),
  N: fixed(500),
});

write('world.json', {
  chapter: 0,
  startClock: '06:00',
  ticks: 120,
  tickMinutes: 1,
  anchor: 'anchor.met',
  engineFacts: ['rainStarted', 'rainStopped'],
  weather: {
    initial: 'dry',
    rainStart: { window: ['07:00', '07:30'], perMille: 100 },
    rainStop: { minDurationTicks: 10, window: ['07:40', '08:00'], perMille: 100 },
  },
  perception: {
    rainSightPerMille: 500,
    rainHearingPerMille: 500,
    wallSightPerMille: 0,
    wallHearingPerMille: 300,
    doorHearingPerMille: 600,
    openWindowHearingPerMille: 900,
    openWindowSightPerMille: 0,
  },
  primes: {
    cat: 'hero',
    list: [
      { id: 'itchy', cond: { gauge: 'hero.itch', gte: 500 } },
      { id: 'brave', cond: { gauge: 'hero.fearOfWater', lte: 300 } },
    ],
  },
  counters: { work: { start: 0, target: 20 } },
  tags: ['indoor', 'outdoor', 'window', 'home', 'box', 'shore', 'sheltered', 'lane'],
});

write('map.json', {
  regions: [
    { id: 'home', nameKey: 'region.home', revealedAtStart: true },
    { id: 'street', nameKey: 'region.street', revealedAtStart: false },
  ],
  nodes: [
    {
      id: 'home.room',
      region: 'home',
      nameKey: 'node.room',
      pos: [0, 0],
      tags: ['indoor', 'window', 'home'],
    },
    { id: 'home.door', region: 'home', nameKey: 'node.door', pos: [0, 5], tags: ['indoor'] },
    { id: 'street.a', region: 'street', nameKey: 'node.a', pos: [0, 15], tags: ['outdoor'] },
    {
      id: 'street.b',
      region: 'street',
      nameKey: 'node.b',
      pos: [20, 15],
      tags: ['outdoor', 'box'],
    },
    {
      id: 'street.c',
      region: 'street',
      nameKey: 'node.c',
      pos: [40, 15],
      tags: ['outdoor', 'shore'],
    },
    {
      id: 'street.d',
      region: 'street',
      nameKey: 'node.d',
      pos: [20, 35],
      tags: ['outdoor', 'sheltered'],
    },
  ],
  edges: [
    { a: 'home.room', b: 'home.door', minutes: 1, walls: 0 },
    { a: 'home.door', b: 'street.a', minutes: 2, door: true },
    { a: 'street.a', b: 'street.b', minutes: 2 },
    { id: 'gate', a: 'street.b', b: 'street.c', minutes: 3, when: { not: { fact: 'gateClosed' } } },
    { a: 'street.a', b: 'street.d', minutes: 3, tags: ['lane'] },
    { a: 'street.d', b: 'street.c', minutes: 4, tags: ['lane'] },
  ],
});

const perception = (sightM: number, hearingM: number, voices: number) => ({
  sightM,
  hearingM,
  voices,
});
write('cast.json', {
  cats: [
    {
      id: 'hero',
      nameKey: 'cat.hero',
      kind: 'protagonist',
      core: true,
      look: { fur: '#888888' },
      home: 'home.room',
      start: 'home.room',
      startActivity: 'nap',
      temperatureTenths: 10,
      willpower: 850,
      perception: perception(20, 30, 1),
      traits: traits(),
      hooks: { itch: fixed(300), fearOfWater: fixed(400), boxPull: fixed(100) },
      activities: ['nap', 'wander', 'fetch'],
    },
    {
      id: 'pal',
      nameKey: 'cat.pal',
      kind: 'townscat',
      core: true,
      roles: ['worker'],
      look: { fur: '#aa6633' },
      home: 'street.b',
      start: 'street.b',
      startActivity: 'work',
      temperatureTenths: 10,
      willpower: 0,
      perception: perception(20, 30, 2),
      traits: traits(800),
      hooks: { fearOfWater: fixed(200), boxPull: fixed(100) },
      activities: ['work', 'nap'],
    },
    {
      id: 'bystander',
      nameKey: 'cat.bystander',
      kind: 'townscat',
      core: false,
      roles: ['helper'],
      look: { fur: '#336699' },
      home: 'street.a',
      start: 'street.a',
      startActivity: 'nap',
      temperatureTenths: 10,
      willpower: 0,
      perception: perception(10, 10, 1),
      traits: traits(),
      hooks: { fearOfWater: fixed(900), boxPull: fixed(100) },
      activities: ['nap', 'fetch'],
    },
  ],
});

write('hooks.json', {
  range: [0, 1000],
  floor: 20,
  hooks: [
    {
      id: 'fearOfWater',
      scope: 'shared',
      nameKey: 'hook.fear',
      driveKey: 'drive.fear',
      rise: [
        {
          when: { all: [{ weather: 'rain' }, { at: 'self', tag: 'outdoor' }] },
          perTicks: 1,
          add: 5,
        },
      ],
      decay: { when: { at: 'self', tag: 'indoor' }, perTicks: 2, add: -1, toward: 'initial' },
      voice: { over: 600, lines: ['line.fear'] },
    },
    {
      id: 'boxPull',
      scope: 'shared',
      nameKey: 'hook.box',
      driveKey: 'drive.box',
      rise: [{ when: { at: 'self', tag: 'box' }, perTicks: 1, add: 10 }],
      decay: { perTicks: 3, add: -1 },
      voice: { over: 700, lines: ['line.box'] },
    },
    {
      id: 'itch',
      scope: 'hero',
      nameKey: 'hook.itch',
      driveKey: 'drive.itch',
      rise: [{ onEvent: 'ping', add: 100 }],
      decay: { perTicks: 4, add: -1 },
      voice: { over: 350, lines: ['line.itch.1', 'line.itch.2'] },
    },
  ],
});

write('activities.json', {
  stickiness: 2,
  decisionEveryTicks: 5,
  activities: [
    { id: 'nap', at: { node: '$home' }, ticks: [5, 5], score: { base: 0 } },
    {
      id: 'wander',
      at: { neighbour: true },
      ticks: [3, 3],
      gate: { weather: 'dry' },
      score: { base: 0, terms: [{ gauge: 'self.O', per: 500, add: 1 }] },
    },
    {
      id: 'fetch',
      at: { tag: 'box' },
      ticks: [2, 2],
      score: { base: -1, terms: [{ gauge: 'self.boxPull', per: 100, add: 1 }] },
      onFinish: [{ emit: 'ping', radiusM: 50 }],
    },
    {
      id: 'work',
      at: { node: 'street.c' },
      ticks: [10, 10],
      gate: { not: { fact: 'workDone' } },
      score: { base: 3 },
      while: [{ counter: 'work', add: 1 }],
      onFinish: [{ fact: 'workDone' }],
    },
  ],
});

write('objects.json', {
  objects: [
    {
      id: 'bell',
      node: 'street.c',
      nameKey: 'obj.bell',
      storyKey: 'story.bell',
      grantsCard: 'poke',
      tags: ['shore'],
      onPerceived: { by: 'hero', emit: 'ping', fact: 'bellSeen' },
    },
    {
      id: 'mat',
      node: 'home.room',
      nameKey: 'obj.mat',
      storyKey: 'story.mat',
      grantsCard: 'shift',
      tags: ['box'],
    },
    {
      id: 'crate',
      node: 'street.b',
      nameKey: 'obj.crate',
      storyKey: 'story.crate',
      grantsCard: 'magnet',
      visibleWhen: { fact: 'crateShown' },
    },
  ],
});

const card = (id: string, extra: Record<string, unknown>) => ({
  id,
  demo: true,
  nameKey: `card.${id}.name`,
  textKey: `card.${id}.text`,
  source: null,
  bound: null,
  kind: 'instant',
  unique: false,
  pressure: 20,
  ...extra,
});
write('cards.json', {
  cards: [
    card('poke', {
      source: 'bell',
      on: {
        cat: [
          { prim: 'interrupt', action: 'jump', ticks: [10, 10] },
          { prim: 'gaugeShift', gauge: 'itch', add: 300, decayPerTick: 10, ifHasGauge: true },
        ],
        place: [{ prim: 'interrupt', action: 'jump', ticks: [4, 4], radiusM: 5 }],
      },
      special: {
        on: 'bell',
        textKey: 'card.poke.special',
        effects: [
          { prim: 'gaugeShift', gauge: 'itch', set: 900, target: 'hero' },
          { prim: 'triggerStorylet', storylet: 'rite' },
        ],
      },
    }),
    card('shift', {
      source: 'mat',
      on: { cat: [{ prim: 'gaugeShift', gauge: 'boxPull', add: 300 }] },
      special: {
        on: 'mat',
        textKey: 'card.shift.special',
        effects: [{ prim: 'gaugeShift', gauge: 'boxPull', add: 300, target: 'hero' }],
      },
    }),
    card('hold', {
      source: 'hook:itch',
      on: {
        cat: [{ prim: 'gaugeShift', gauge: 'itch', add: 200, holdWhileRunning: true, ticks: 20 }],
      },
    }),
    card('magnet', {
      source: 'crate',
      on: {
        place: [
          {
            prim: 'attract',
            radiusM: 30,
            strength: 5,
            ticks: 10,
            scale: { gauge: 'O', per: 500, add: 1 },
          },
        ],
        object: [{ prim: 'setFlag', flag: 'rung', ticks: 5, onlyObjects: ['bell'] }],
      },
    }),
    card('scare', { on: { place: [{ prim: 'repel', radiusM: 10, strength: 5, ticks: 5 }] } }),
    card('rumour', {
      on: { place: [{ prim: 'socialSpread', event: 'rumour', radiusM: 30, hops: 1 }] },
    }),
    card('nap_now', {
      bound: 'pal',
      on: { cat: [{ prim: 'delay', ticks: [6, 6], action: 'nap' }] },
    }),
    card('send', { on: { cat: [{ prim: 'move', to: 'street.d' }] } }),
    card('mark', {
      on: { place: [{ prim: 'setFlag', flag: 'marked', at: '$target', ticks: 10 }] },
    }),
  ],
});

write('powers.json', {
  powers: [
    {
      id: 'glow',
      nameKey: 'power.glow.name',
      textKey: 'power.glow.text',
      cost: 10,
      targets: ['place'],
      radiusM: 10,
      ticks: 10,
      affects: { kinds: ['protagonist'] },
      effects: [
        {
          prim: 'attract',
          radiusM: 10,
          strength: 4,
          ticks: 10,
          scale: { primeCount: 'hero', add: 2 },
        },
        { prim: 'triggerStorylet', storylet: 'lured', ifTarget: 'hero' },
      ],
      pressure: 50,
    },
    {
      id: 'gaze',
      nameKey: 'power.gaze.name',
      textKey: 'power.gaze.text',
      cost: 5,
      targets: ['place'],
      radiusM: 6,
      ticks: 3,
      effects: [{ prim: 'collapse', radiusM: 6, ticks: 3 }],
      pressure: 0,
    },
  ],
});

write('storylets.json', {
  storylets: [
    {
      id: 'lured',
      required: true,
      once: true,
      roles: { hero: { cat: 'hero' } },
      trigger: { power: 'glow', near: '@hero', m: 10 },
      start: 'tempted',
      states: {
        tempted: {
          textKey: 'sl.lured.tempted',
          stayScore: 0,
          exits: [
            {
              to: 'out',
              kind: 'choice',
              actor: '@hero',
              score: { base: 0, terms: [{ primeCount: 'hero', add: 3 }] },
            },
          ],
        },
        out: {
          textKey: 'sl.lured.out',
          onEnter: [{ fact: 'heroOut' }, { goTo: ['@hero', 'street.b'] }],
          exits: [],
        },
      },
    },
    {
      id: 'shift',
      required: false,
      once: true,
      roles: {
        boss: { roleTag: 'worker' },
        helper: { nearCat: '@boss', m: 30, bind: 'nearest', optional: true },
        all: { roleTag: 'helper', bind: 'all' },
      },
      trigger: { clock: ['06:05', '23:59'] },
      start: 'idle',
      states: {
        idle: {
          stayScore: 0,
          exits: [
            { to: 'done', kind: 'auto', gate: { fact: 'workDone' } },
            {
              to: 'hz',
              kind: 'hazard',
              perMille: 0,
              terms: [{ if: { bound: '@helper' }, addPerMille: 200 }],
            },
            { to: 'chosen', kind: 'choice', actor: '@boss', score: { base: 0 } },
          ],
        },
        hz: {
          onEnter: [
            { fact: 'crateShown' },
            {
              emit: 'shout',
              from: '@boss',
              radiusM: 40,
              factIfPerceivedBy: { hero: 'heardShout' },
            },
          ],
          exits: [{ to: 'idle', kind: 'hazard', perMille: 500 }],
        },
        chosen: {
          onEnter: [
            { flag: 'busy', at: '@boss', ttl: 10 },
            { gauge: '@boss.boxPull', add: 50, holdTicks: 5 },
            { interrupt: ['@boss', 'stretch', 2] },
          ],
          exits: [{ to: 'idle', kind: 'auto', gate: { not: { flag: 'busy', at: '@boss' } } }],
        },
        done: {
          textKey: 'sl.shift.done',
          onEnter: [{ stop: '@boss' }, { fact: 'gateClosed' }, { trigger: 'rite' }],
          exits: [],
        },
      },
    },
    {
      id: 'rite',
      required: false,
      once: false,
      roles: { hero: { cat: 'hero' } },
      trigger: { card: 'poke', special: true },
      start: 'a',
      states: {
        a: { onEnter: [{ startActivity: ['@hero', 'nap'] }], exits: [{ to: 'b', kind: 'auto' }] },
        b: { onEnter: [{ chance: 1000, fact: 'riteDone' }], exits: [] },
      },
    },
    {
      id: 'meet',
      required: true,
      once: true,
      anchor: true,
      roles: { hero: { cat: 'hero' }, pal: { cat: 'pal' } },
      trigger: {
        all: [
          { near: ['@hero', '@pal'], m: 5 },
          { fact: 'heroOut' },
          { heard: 'rumour', by: '@pal' },
        ],
      },
      start: 'met',
      states: { met: { textKey: 'sl.meet.met', onEnter: [{ fact: 'anchor.met' }], exits: [] } },
    },
  ],
});

write('detectors.json', {
  detectors: [
    {
      id: 'soak',
      emits: 'soaked',
      kernel: [
        { event: 'rainStarted' },
        { holds: { at: 'pal', tag: 'outdoor' }, forTicks: 3, withinTicks: 10 },
      ],
      unless: [{ fact: 'heroOut', between: [1, 2] }],
    },
    {
      id: 'bell_noted',
      emits: 'bellNoted',
      kernel: [{ holds: { fact: 'bellSeen' }, forTicks: 1 }],
    },
  ],
});

write('anchor.json', {
  id: 'anchor.met',
  nameKey: 'anchor.name',
  teaserKey: 'anchor.teaser',
  imposed: true,
  requirements: {
    all: [
      { fact: 'heroOut', weight: 50 },
      { any: [{ fact: 'soaked' }, { fact: 'bellNoted' }], weight: 0 },
      { fact: 'anchor.met', weight: 50 },
    ],
  },
  fraysIf: { fact: 'riteDone' },
  afterAnchor: { lockedThread: 'pal', endKey: 'end.key' },
});

write('economy.json', {
  charge: { start: 0, cap: 100, floorAtRainStart: 10, variantRainStartPays: false },
  pressureScale: { per: 50, addPercent: 10 },
  payouts: { storyletState: { 'lured.out': 10 }, detector: { soak: 5 }, anchorRequirement: 5 },
  cardsFromExploring: {
    inspectObject: 'grantsCard',
    discoverHook: { itch: 'hold' },
    revealRegion: { street: null },
  },
});

const keys = [
  'region.home',
  'region.street',
  'node.room',
  'node.door',
  'node.a',
  'node.b',
  'node.c',
  'node.d',
  'cat.hero',
  'cat.pal',
  'cat.bystander',
  'hook.fear',
  'drive.fear',
  'hook.box',
  'drive.box',
  'hook.itch',
  'drive.itch',
  'line.fear',
  'line.box',
  'line.itch.1',
  'line.itch.2',
  'obj.bell',
  'story.bell',
  'obj.crate',
  'story.crate',
  'obj.mat',
  'story.mat',
  'card.shift.special',
  ...['poke', 'shift', 'hold', 'magnet', 'scare', 'rumour', 'nap_now', 'send', 'mark'].flatMap(
    (c) => [`card.${c}.name`, `card.${c}.text`],
  ),
  'card.poke.special',
  'power.glow.name',
  'power.glow.text',
  'power.gaze.name',
  'power.gaze.text',
  'sl.lured.tempted',
  'sl.lured.out',
  'sl.shift.done',
  'sl.meet.met',
  'anchor.name',
  'anchor.teaser',
  'end.key',
];
const text = Object.fromEntries(keys.map((k) => [k, `[${k}]`]));
write('text/en.json', text);
write('text/ru.json', text);
console.log('tiny world written');
