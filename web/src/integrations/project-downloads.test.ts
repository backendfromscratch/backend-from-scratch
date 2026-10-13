import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectSteps } from './project-downloads';

describe('projectSteps', () => {
  it('finds the steps of the Spanish project, in order', () => {
    const steps = projectSteps(resolve(process.cwd(), '..', 'projects'))
      .filter(({ project }) => project === 'tienda-api')
      .map(({ step }) => step);
    expect(steps[0]).toBe('01-node');
    expect(steps).toContain('04-servidor-http');
    expect(steps).toEqual([...steps].sort());
  });
});
