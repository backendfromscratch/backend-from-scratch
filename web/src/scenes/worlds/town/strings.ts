/** The town world's labels in both languages. */
import type { Locale } from '../../../lib/locales';

export interface TownStrings {
  home: string;
  guide: string;
  shop: string;
  /** The shop in «Modelo cliente-servidor», where the customers come to it. */
  shopNear: string;
  sign: string;
  customers: string;
}

export const strings: Record<Locale, TownStrings> = {
  es: {
    home: 'tu casa',
    guide: 'la guía',
    shop: 'la tienda, en otra ciudad',
    shopNear: 'la tienda',
    sign: 'Muebles',
    customers: 'clientes',
  },
  en: {
    home: 'your home',
    guide: 'the phone book',
    shop: 'the store, in another city',
    shopNear: 'the store',
    sign: 'Furniture',
    customers: 'customers',
  },
};
