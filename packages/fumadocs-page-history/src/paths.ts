import path from 'node:path';
import { realpathSync } from 'node:fs';

export interface ContentLocation {
  /** Local directory containing the documents being compiled. */
  directory: string;
  /** Where that directory belongs in the repository, relative to its Git root. */
  pathInRepository: string;
}

export function normalizeRepositoryPath(value: string, allowRoot = false): string {
  const normalized = path.posix.normalize(value);
  if (
    path.posix.isAbsolute(value) ||
    /^[a-z]:[/\\]/i.test(value) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    (!allowRoot && (normalized === '.' || !value))
  ) {
    throw new Error(
      'History requires a non-empty repository-relative file path inside the checkout.',
    );
  }
  return normalized;
}

/** Native disk paths and Git's slash-separated paths are resolved at one seam. */
export function mapContentPath(
  file: string,
  directory: string,
  pathInRepository = '.',
  diskPath: typeof path = path,
): string {
  const relative = diskPath.relative(directory, file);
  if (
    !relative ||
    diskPath.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${diskPath.sep}`)
  ) {
    throw new Error('The document must be inside content.directory.');
  }
  const prefix = normalizeRepositoryPath(pathInRepository, true);
  return normalizeRepositoryPath(path.posix.join(prefix, relative.split(diskPath.sep).join('/')));
}

export function resolveContentPath(file: string, root: string, content?: ContentLocation): string {
  const canonicalFile = path.join(realpathSync(path.dirname(file)), path.basename(file));
  return mapContentPath(
    canonicalFile,
    content ? realpathSync(path.resolve(content.directory)) : root,
    content?.pathInRepository,
  );
}
