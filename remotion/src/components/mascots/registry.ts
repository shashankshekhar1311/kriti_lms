import type {MascotId} from '../../schema';
import type {MascotRenderer} from './types';
import {GyanuMascot} from './gyanu/GyanuMascot';
import {VoltMascot} from './volt/VoltMascot';

const MASCOT_RENDERERS: Partial<Record<MascotId, MascotRenderer>> = {
  gyanu: GyanuMascot,
  volt: VoltMascot,
};

export const resolveMascotRenderer = (mascotId: MascotId | undefined): MascotRenderer | null => {
  if (!mascotId) {
    return null;
  }
  return MASCOT_RENDERERS[mascotId] ?? null;
};

export const isCartoonMascotSupported = (mascotId: MascotId | undefined): boolean =>
  Boolean(mascotId && MASCOT_RENDERERS[mascotId]);
