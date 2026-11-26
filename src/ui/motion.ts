// Reduced motion as the setting says (06 §8): on, off, or as the system asks.
const query = window.matchMedia('(prefers-reduced-motion: reduce)');

export const reducedMotion = (setting: 'system' | 'on' | 'off'): boolean =>
  setting === 'on' || (setting === 'system' && query.matches);
