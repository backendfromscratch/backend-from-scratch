/**
 * The minimum of hast (unified's HTML tree) needed to build the diagrams and walk them in tests,
 * without depending on unified's types.
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

/** Several lines of text separated by <br>. */
export function lines(parts: readonly string[]): HastNode[] {
  return parts.flatMap((part, i) => (i === 0 ? [text(part)] : [el('br', {}), text(part)]));
}

export function classList(node: HastElement): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value : [];
}

/** The elements (the node itself included) that have exactly that class, in document order. */
export function findByClass(node: HastNode, className: string): HastElement[] {
  if (node.type === 'text') return [];
  const own = classList(node).includes(className) ? [node] : [];
  return [...own, ...node.children.flatMap((child) => findByClass(child, className))];
}

/** The text of a node; each <br> is a line break. */
export function textContent(node: HastNode): string {
  if (node.type === 'text') return node.value;
  if (node.tagName === 'br') return '\n';
  return node.children.map(textContent).join('');
}

const VOID_ELEMENTS = new Set(['br']);
/** hast property names that are not the HTML attribute name. */
const ATTRIBUTE_NAMES: Record<string, string> = { className: 'class', ariaHidden: 'aria-hidden' };

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');

/** The HTML of a node: what the Markdown processor inserts into the page. */
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
