import { z } from 'zod';

export { TuningSchema, tuningRows, type Tuning, type TuningRow } from './tuning';

/** Text tables: src/content/data/ui/*.json and ch1/text/*.json. */
export const TextSchema = z.record(z.string(), z.string().min(1));
export type TextTable = z.infer<typeof TextSchema>;
