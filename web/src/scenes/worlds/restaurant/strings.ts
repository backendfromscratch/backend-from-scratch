/** The restaurant world's labels in both languages (the analogy of «Qué es el backend»). */
import type { Locale } from '../../../lib/locales';

export interface RestaurantStrings {
  dining: string;
  kitchen: string;
  pantry: string;
}

export const strings: Record<Locale, RestaurantStrings> = {
  es: { dining: 'la sala', kitchen: 'la cocina', pantry: 'despensa' },
  en: { dining: 'the dining room', kitchen: 'the kitchen', pantry: 'pantry' },
};
