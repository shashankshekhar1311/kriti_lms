import {getStaticFiles, staticFile} from 'remotion';

const isRemoteUrl = (value: string): boolean =>
  /^(https?:|data:|blob:)/i.test(value);

/** Path relative to Remotion public/, preserving subfolders (e.g. artifacts/foo.svg). */
const publicRelativePath = (url: string): string => {
  const normalized = url.trim().replace(/^file:\/\//i, '').replace(/\\/g, '/');
  return normalized.replace(/^public\//, '');
};

const publicAssetName = (url: string): string => {
  const relative = publicRelativePath(url);
  if (!relative) {
    return '';
  }
  return relative.includes('/')
    ? relative.slice(relative.lastIndexOf('/') + 1)
    : relative;
};

const existsInPublic = (fileName: string): boolean => {
  try {
    return getStaticFiles().some((file) => file.name === fileName);
  } catch {
    return false;
  }
};

/**
 * Resolve a background or still image for Remotion <Img />.
 * Supports remote URLs and files in public/.
 */
export const resolveImageSrc = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  if (isRemoteUrl(trimmed)) {
    return trimmed;
  }

  const relativePath = publicRelativePath(trimmed);
  if (!relativePath) {
    return null;
  }
  return staticFile(relativePath);
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
