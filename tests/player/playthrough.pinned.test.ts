// The scripted first playthrough (01 §3) under the played-card rule `pinned` (04 §3.1).
import { it } from 'vitest';
import { playthrough } from './playthrough';

it(
  'vets requested seed 1 live and reaches the anchor under rule pinned',
  () => playthrough('pinned', true),
  600_000,
);
