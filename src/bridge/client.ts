import type { MainToWorker, SimCommand, SimSnapshot, WorkerToMain } from './protocol';

export interface SimClient {
  send(command: SimCommand): void;
  dispose(): void;
}

export function createSimClient(onSnapshot: (snapshot: SimSnapshot) => void): SimClient {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  const post = (message: MainToWorker): void => worker.postMessage(message);

  worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
    const msg = event.data;
    switch (msg.kind) {
      case 'snapshot':
        onSnapshot(msg.snapshot);
        break;
    }
  });

  return {
    send: (command) => post({ kind: 'command', command }),
    dispose: () => worker.terminate(),
  };
}
