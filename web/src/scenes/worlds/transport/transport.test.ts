import { describe, expect, it } from 'vitest';
import { strings } from './strings';
import { copies, delivered } from './transport';

describe('what the server’s application has read', () => {
  it('is the first segments in order, in each language’s own words', () => {
    expect(delivered('es', 0)).toBe('');
    expect(delivered('es', 3)).toBe('Hola, todo bien');
    expect(delivered('en', 2)).toBe('Hi, how are ');
  });

  it('over UDP, the first and the third datagram: the second was lost', () => {
    expect(delivered('es', 'udp')).toBe('Hola, bien');
    expect(delivered('en', 'udp')).toBe('Hi, you?');
  });

  it('the client’s copy is what still waits for its ACK, in order', () => {
    expect(copies('es', [])).toBe('');
    expect(copies('es', [1, 2])).toBe('todo bien');
    expect(copies('en', [1])).toBe('how are ');
  });

  it('numbers each segment by the bytes before it, as the lesson’s table does', () => {
    for (const lang of ['es', 'en'] as const) {
      const [a, b, c] = strings[lang].segments;
      expect(b.seq).toBe(a.seq + a.bytes);
      expect(c.seq).toBe(b.seq + b.bytes);
      expect([...a.text].length).toBe(a.bytes);
    }
  });
});
