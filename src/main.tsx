import { createSignal } from 'solid-js';
import { render } from '@solidjs/web';
import { createSimClient } from './bridge/client';
import type { SimSnapshot } from './bridge/protocol';
import { PaletteSchema } from './content/schemas';
import defaultPalette from './content/data/palettes/default.json';
import { createRenderer } from './render/canvas';
import { Overlay } from './ui/Overlay';
import './style.css';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!(canvas instanceof HTMLCanvasElement) || !uiRoot)
  throw new Error('index.html is missing #game or #ui');

const palette = PaletteSchema.parse(defaultPalette);
createRenderer(canvas, palette.clearColor);

const [snapshot, setSnapshot] = createSignal<SimSnapshot | undefined>(undefined);
const sim = createSimClient((s) => setSnapshot(s));

render(() => <Overlay snapshot={snapshot()} send={(command) => sim.send(command)} />, uiRoot);
