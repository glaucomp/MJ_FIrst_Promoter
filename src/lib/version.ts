import { readFileSync } from 'fs';
import { join } from 'path';

let cachedVersion: string | null = null;

/** Reads the semver from the root package.json (single source of truth). */
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    const pkgPath = join(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    cachedVersion = pkg.version ?? '0.0.0';
    return cachedVersion;
  } catch {
    return process.env.APP_VERSION ?? '0.0.0';
  }
}
