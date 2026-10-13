/**
 * After the build, writes each step of each guided project (projects/) as a download:
 * /practicas/tienda-api/04-servidor-http.tar.gz. Built from the same files CI tests, never committed.
 */
import type { AstroIntegration } from 'astro';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stepEntries, tarGz } from '../lib/practice/project-archive';

/** Every step of every project: `{ project: 'tienda-api', step: '04-servidor-http' }`. */
export function projectSteps(projectsDir: string): { project: string; step: string }[] {
  const folders = (dir: string) =>
    readdirSync(dir)
      .filter((name) => statSync(join(dir, name)).isDirectory())
      .sort();
  return folders(projectsDir).flatMap((project) =>
    folders(join(projectsDir, project))
      .filter((step) => /^\d{2}-/.test(step))
      .map((step) => ({ project, step })),
  );
}

export function projectDownloads(): AstroIntegration {
  return {
    name: 'project-downloads',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const projects = resolve(process.cwd(), '..', 'projects');
        const steps = projectSteps(projects);
        for (const { project, step } of steps) {
          const target = join(fileURLToPath(dir), 'practicas', project);
          mkdirSync(target, { recursive: true });
          writeFileSync(
            join(target, `${step}.tar.gz`),
            tarGz(stepEntries(join(projects, project, step), step)),
          );
        }
        logger.info(`${steps.length} project steps written to /practicas/ as .tar.gz`);
      },
    },
  };
}
