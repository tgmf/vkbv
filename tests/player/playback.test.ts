// The shuttle's rules (04 §6, 06 §3, §8).
import { describe, expect, it } from 'vitest';
import {
  clickable,
  forward,
  forwardLimit,
  PAUSED,
  press,
  shuttleTps,
  type Shuttle,
} from '../../src/player/playback';
import { ch1 } from '../sim/helpers';

const speeds = ch1.tuning.player.shuttleTps; // [4, 16, 64, 256]
const max = ch1.tuning.player.observeMaxTps; // 16

describe('the shuttle (06 §3)', () => {
  it('steps up one speed per press, restarting at the first from the other way or from pause', () => {
    let s: Shuttle = PAUSED;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = press(ch1, s, 'fwd');
      seen.push(shuttleTps(ch1, s));
    }
    expect(seen).toEqual([...speeds, speeds[speeds.length - 1]]); // capped at the fastest
    s = press(ch1, s, 'back');
    expect(s).toEqual({ dir: 'back', speed: 0 });
    s = press(ch1, s, 'back');
    expect(shuttleTps(ch1, s)).toBe(speeds[1]);
    expect(press(ch1, s, 'pause')).toEqual(PAUSED);
    expect(shuttleTps(ch1, PAUSED)).toBe(0);
  });

  it('Space plays forward at the first speed, and pauses when running', () => {
    expect(press(ch1, PAUSED, 'play')).toEqual({ dir: 'fwd', speed: 0 });
    expect(press(ch1, { dir: 'fwd', speed: 2 }, 'play')).toEqual(PAUSED);
    expect(press(ch1, { dir: 'back', speed: 1 }, 'play')).toEqual(PAUSED);
  });

  it('forward up to observeMaxTps watches; faster behind the edge scrubs; at the edge it is capped', () => {
    const at = (speed: number, t: number) => forward(ch1, { dir: 'fwd', speed }, t, 100);
    expect(at(0, 50)).toEqual({ watch: true, tps: speeds[0] });
    expect(at(1, 50)).toEqual({ watch: true, tps: max });
    expect(at(2, 50)).toEqual({ watch: false, tps: speeds[2] });
    expect(at(3, 50)).toEqual({ watch: false, tps: speeds[3] });
    expect(at(3, 100)).toEqual({ watch: true, tps: max });
    expect(at(0, 100)).toEqual({ watch: true, tps: speeds[0] });
    // backward and pause never watch
    expect(forward(ch1, { dir: 'back', speed: 0 }, 50, 100).watch).toBe(false);
    expect(forward(ch1, PAUSED, 50, 100)).toEqual({ watch: false, tps: 0 });
  });

  it('forward stops at the last streamed tick during a re-run, else one past a live edge', () => {
    const limit = { kind: 'limit', tick: 100 } as const;
    expect(forwardLimit(100, limit, 40)).toBe(40);
    expect(forwardLimit(100, limit, 140)).toBe(100);
    expect(forwardLimit(100, limit, null)).toBe(101);
    expect(forwardLimit(100, { kind: 'fray', tick: 100 }, null)).toBe(100);
    expect(forwardLimit(100, { kind: 'anchor', tick: 85 }, null)).toBe(100);
  });

  it('the timeline is clickable only at or before the playhead', () => {
    expect(clickable(50, 0)).toBe(true);
    expect(clickable(50, 50)).toBe(true);
    expect(clickable(50, 51)).toBe(false);
    expect(clickable(50, -1)).toBe(false);
  });
});
