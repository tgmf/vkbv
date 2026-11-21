// Lint fixture: src/ui may not post messages or import the simulation directly.
import { rand } from '../sim/rng';

declare const worker: Worker;
worker.postMessage(rand);
