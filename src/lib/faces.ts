import catalogue from '../../shared/target-faces.json';

import type { components } from '@/lib/api-types';

export type Face = components['schemas']['Face'];

// Bundled with the app so faces work offline; the server reads the same file.
export const FACES = catalogue.faces as Face[];

export function getFace(slug: string): Face | undefined {
  return FACES.find((f) => f.slug === slug);
}
