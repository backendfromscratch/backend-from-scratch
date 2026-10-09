import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OG_FONTS, fontFile } from './fonts';

describe('fontFile', () => {
  it('finds the woff files through the module system, without depending on the working directory', () => {
    expect(OG_FONTS.length).toBe(2);
    for (const font of OG_FONTS) expect(fs.existsSync(fontFile(font.file))).toBe(true);
  });
});
