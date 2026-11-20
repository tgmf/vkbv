import { z } from 'zod';

const unit = z.number().min(0).max(1);

export const PaletteSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  clearColor: z.tuple([unit, unit, unit]),
});

export type Palette = z.infer<typeof PaletteSchema>;
