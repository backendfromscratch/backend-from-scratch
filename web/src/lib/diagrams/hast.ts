/**
 * Lo mínimo de hast (el árbol HTML de unified) para construir los diagramas y recorrerlos en los
 * tests, sin depender de los tipos de unified.
 */
export interface HastText {
  type: 'text';
  value: string;
}
export interface HastElement {
  type: 'element';
  tagName: string;
  properties: Record<string, string | string[]>;
  children: HastNode[];
}
export type HastNode = HastElement | HastText;

export const text = (value: string): HastText => ({ type: 'text', value });

export function el(
  tagName: string,
  properties: HastElement['properties'],
  children: HastNode[] = [],
): HastElement {
  return { type: 'element', tagName, properties, children };
}

/** Varias líneas de texto separadas por <br>. */
export function lines(parts: readonly string[]): HastNode[] {
  return parts.flatMap((part, i) => (i === 0 ? [text(part)] : [el('br', {}), text(part)]));
}

export function classList(node: HastElement): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value : [];
}

/** Los elementos (el nodo incluido) que tienen exactamente esa clase, en orden de documento. */
export function findByClass(node: HastNode, className: string): HastElement[] {
  if (node.type === 'text') return [];
  const own = classList(node).includes(className) ? [node] : [];
  return [...own, ...node.children.flatMap((child) => findByClass(child, className))];
}

/** El texto de un nodo; cada <br> es un salto de línea. */
export function textContent(node: HastNode): string {
  if (node.type === 'text') return node.value;
  if (node.tagName === 'br') return '\n';
  return node.children.map(textContent).join('');
}

const VOID_ELEMENTS = new Set(['br']);
/** Nombres de propiedad de hast que no son el nombre del atributo HTML. */
const ATTRIBUTE_NAMES: Record<string, string> = { className: 'class', ariaHidden: 'aria-hidden' };

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');

/** El HTML de un nodo: lo que el procesador de Markdown inserta en la página. */
export function toHtml(node: HastNode): string {
  if (node.type === 'text') return escapeText(node.value);
  const attributes = Object.entries(node.properties)
    .map(([name, value]) => {
      const attribute = ATTRIBUTE_NAMES[name] ?? name;
      return ` ${attribute}="${escapeAttribute(Array.isArray(value) ? value.join(' ') : value)}"`;
    })
    .join('');
  if (VOID_ELEMENTS.has(node.tagName)) return `<${node.tagName}${attributes}>`;
  return `<${node.tagName}${attributes}>${node.children.map(toHtml).join('')}</${node.tagName}>`;
}
