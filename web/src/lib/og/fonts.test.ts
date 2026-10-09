import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OG_FONTS, fontFile } from './fonts';

describe('fontFile', () => {
  it('encuentra los woff por el sistema de módulos, sin depender del directorio de trabajo', () => {
    expect(OG_FONTS.length).toBe(2);
    for (const font of OG_FONTS) expect(fs.existsSync(fontFile(font.file))).toBe(true);
  });
});
