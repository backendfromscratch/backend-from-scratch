/**
 * Para los tests de clics de los laboratorios (los que empiezan por `// @vitest-environment
 * happy-dom`): pinta un componente de React en el documento, pulsa botones, escribe en campos y
 * espera a que la interfaz cambie. Sin librerías: React trae `act`, y happy-dom, el documento.
 */
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export async function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, unmount: () => act(() => root.unmount()) };
}

/** El primer elemento de `selector` cuyo texto contiene `text`. */
export function byText<T extends HTMLElement = HTMLElement>(
  container: HTMLElement,
  selector: string,
  text: string,
): T {
  const found = [...container.querySelectorAll<T>(selector)].find((element) =>
    element.textContent?.includes(text),
  );
  if (!found) throw new Error(`No encuentro «${text}» en ${selector}`);
  return found;
}

export async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

/** Escribe en un campo como lo haría el lector: React solo se entera con el evento input. */
export async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
  await act(async () => {
    setValue?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Espera a que `check` se cumpla (las operaciones de verdad, como generar claves, tardan). */
export async function waitFor(check: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: no ha pasado a tiempo');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}
