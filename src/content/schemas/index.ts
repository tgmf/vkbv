import type { z } from 'zod';
import { PaletteSchema } from './palette';

/**
 * Maps each content folder under src/content/data/<kind>/ to the schema its JSON files must satisfy.
 * A folder with no entry here fails validation.
 */
export const contentSchemas: Readonly<Record<string, z.ZodType>> = {
  palettes: PaletteSchema,
};

export { PaletteSchema, type Palette } from './palette';
