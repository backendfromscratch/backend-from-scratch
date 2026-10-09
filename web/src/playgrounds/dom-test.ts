/**
 * For the click tests of the labs (the ones that start with `// @vitest-environment
 * happy-dom`): renders a React component in the document, clicks buttons, types into fields and
 * waits for the interface to change. No libraries: React ships `act`, and happy-dom the document.
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

/** The first element of `selector` whose text contains `text`. */
export function byText<T extends HTMLElement = HTMLElement>(
  container: HTMLElement,
  selector: string,
  text: string,
): T {
  const found = [...container.querySelectorAll<T>(selector)].find((element) =>
    element.textContent?.includes(text),
  );
  if (!found) throw new Error(`Cannot find «${text}» in ${selector}`);
  return found;
}

export async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

/** Types into a field the way the reader would: React only notices through the input event. */
export async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
  await act(async () => {
    setValue?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Waits until `check` holds (real operations, like generating keys, take a while). */
export async function waitFor(check: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}
