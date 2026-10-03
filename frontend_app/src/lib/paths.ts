import path from "path";

/** Absolute root of rendered micro-lesson content. */
export const RENDERED_OUTPUT_ROOT = path.resolve(
  process.env.RENDERED_OUTPUT_PATH || path.join(process.cwd(), "..", "Rendered_Output")
);

/**
 * Resolve a relative path under Rendered_Output and reject path traversal.
 */
export function resolveUnderRenderedOutput(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolute = path.resolve(RENDERED_OUTPUT_ROOT, normalized);
  const rootWithSep = RENDERED_OUTPUT_ROOT.endsWith(path.sep)
    ? RENDERED_OUTPUT_ROOT
    : RENDERED_OUTPUT_ROOT + path.sep;

  if (absolute !== RENDERED_OUTPUT_ROOT && !absolute.startsWith(rootWithSep)) {
    throw new Error("Path escapes Rendered_Output root");
  }

  return absolute;
}

export function toPosixRelative(fromRoot: string, absolutePath: string): string {
  return path.relative(fromRoot, absolutePath).split(path.sep).join("/");
}
