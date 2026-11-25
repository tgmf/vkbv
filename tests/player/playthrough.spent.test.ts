// The scripted first playthrough (01 §3) under the played-card rule `spent` (04 §3.1).
import { it } from 'vitest';
import { playthrough } from './playthrough';

it('reaches the anchor under rule spent', () => playthrough('spent', false), 600_000);
