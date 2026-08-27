import {getStaticFiles, staticFile} from 'remotion';

const isRemoteUrl = (value: string): boolean =>
  /^(https?:|data:|blob:)/i.test(value);

const publicAssetName = (url: string): string => {
  const normalized = url.trim().replace(/^file:\/\//i, '').replace(/\\/g, '/');
  const withoutPublic = normalized.replace(/^public\//, '');
  if (!withoutPublic) {
    return '';
  }
  return withoutPublic.includes('/')
    ? withoutPublic.slice(withoutPublic.lastIndexOf('/') + 1)
    : withoutPublic;
};

const existsInPublic = (fileName: string): boolean => {
  try {
    return getStaticFiles().some((file) => file.name === fileName);
  } catch {
    return false;
  }
};

/**
 * Remotion's OffthreadVideo compositor only fetches http(s) from public/.
 * Skip missing local files so the illustrated mascot fallback can render.
 */
export const resolveMascotSrc = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  if (isRemoteUrl(trimmed)) {
    return trimmed;
  }

  const fileName = publicAssetName(trimmed);
  if (!fileName || !existsInPublic(fileName)) {
    return null;
  }
  return staticFile(fileName);
};
