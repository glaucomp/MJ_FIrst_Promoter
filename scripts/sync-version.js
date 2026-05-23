#!/usr/bin/env node
/**
 * Copies the root package.json version into frontend/package.json so both
 * stay aligned when bumping via `npm run version:*`.
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const rootDir = join(__dirname, '..');
const rootPkgPath = join(rootDir, 'package.json');
const frontendPkgPath = join(rootDir, 'frontend', 'package.json');

const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const frontendPkg = JSON.parse(readFileSync(frontendPkgPath, 'utf8'));

frontendPkg.version = rootPkg.version;

writeFileSync(frontendPkgPath, `${JSON.stringify(frontendPkg, null, 2)}\n`, 'utf8');
console.log(`Synced frontend version to ${rootPkg.version}`);
