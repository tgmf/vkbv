// Lint fixture: every line breaks a rule for src/sim on purpose.
import { createSignal } from 'solid-js';
import { Scene } from 'three';
import { t } from '../i18n/t';
import type { Tuning } from '../content/schemas';

export const bad = [createSignal, Scene, t];
export type Ok = Tuning; // allowed: types from content
