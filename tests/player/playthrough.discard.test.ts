// The scripted first playthrough (01 §3) under the played-card rule `discard` (04 §3.1).
import { it } from 'vitest';
import { playthrough } from './playthrough';

it('reaches the anchor under rule discard', () => playthrough('discard', false), 600_000);
