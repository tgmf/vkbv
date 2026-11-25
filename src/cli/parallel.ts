// A fork pool for the long Node runs (calibration, balance): the parent splits its items over child
// processes of the same script, each started with `--part item,item,…`; a child works its items and
// sends the results back. Node only.
import { fork } from 'node:child_process';

/** In the parent: `items` dealt round-robin over `jobs` children of `script`; their results, in share order. */
export async function inChildren<R>(
  script: string,
  items: readonly string[],
  jobs: number,
): Promise<R[]> {
  const shares = Array.from({ length: Math.min(Math.max(1, jobs), items.length) }, (_, j) =>
    items.filter((_, i) => i % jobs === j),
  );
  const results = await Promise.all(
    shares.map(
      (share) =>
        new Promise<R[]>((resolve, reject) => {
          const child = fork(script, ['--part', share.join(',')]);
          let got: R[] | null = null;
          child.on('message', (m) => (got = m as R[]));
          child.on('error', reject);
          child.on('exit', (code) =>
            got ? resolve(got) : reject(new Error(`a child of ${script} exited with ${code}`)),
          );
        }),
    ),
  );
  return results.flat();
}

/** In a child: works each item of its `--part` and sends the results to the parent. */
export function answerPart<R>(part: string, work: (item: string) => R): void {
  const out = part.split(',').map(work);
  process.send?.(out, () => process.disconnect?.());
}
