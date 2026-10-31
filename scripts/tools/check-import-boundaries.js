#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const sourceRoot = path.join(projectRoot, 'src');

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function resolveImport(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => `${base}${extension}`), ...['index.ts', 'index.tsx', 'index.js'].map((name) => path.join(base, name))];
  return candidates.find((candidate) => fs.existsSync(candidate)) || base;
}

function layerOf(relativePath) {
  const normalized = toPosix(relativePath);
  for (const layer of ['core', 'database', 'infrastructure', 'services', 'app', 'hooks', 'presentation']) {
    if (normalized.startsWith(`${layer}/`)) return layer;
  }
  return null;
}

function violationsFor(sourceRelativePath, specifier) {
  const source = toPosix(sourceRelativePath).replace(/^src\//, '');
  const sourceLayer = layerOf(source);
  const resolved = resolveImport(path.join(sourceRoot, source), specifier);
  const target = resolved && resolved.startsWith(sourceRoot)
    ? toPosix(path.relative(sourceRoot, resolved))
    : null;
  const targetLayer = target && layerOf(target);
  const errors = [];

  if (sourceLayer === 'core') {
    if (['database', 'services', 'infrastructure', 'app', 'hooks', 'presentation'].includes(targetLayer)) {
      errors.push(`core must not import src/${target}`);
    }
    if (specifier.startsWith('react-native')) {
      errors.push('core must not import React Native');
    }
  }
  if (sourceLayer === 'database' && ['services', 'hooks', 'presentation', 'app'].includes(targetLayer)) {
    errors.push(`database must not import src/${target}`);
  }
  if (sourceLayer === 'infrastructure' && ['services', 'hooks', 'presentation', 'app'].includes(targetLayer)) {
    errors.push(`infrastructure must not import src/${target}`);
  }
  if (sourceLayer === 'services' && ['database', 'infrastructure', 'hooks', 'presentation'].includes(targetLayer)) {
    errors.push(`services must use ports/composition instead of importing src/${target}`);
  }
  if (sourceLayer === 'services' && targetLayer === 'app' && target !== 'app/composition' && !target.startsWith('app/composition/')) {
    errors.push(`services may only import the composition root from src/${target}`);
  }
  if (sourceLayer === 'app' && ['hooks', 'presentation'].includes(targetLayer)) {
    errors.push(`composition/app code must not import src/${target}`);
  }
  if (['hooks', 'presentation'].includes(sourceLayer) && targetLayer === 'database') {
    errors.push(`presentation must use application APIs instead of importing src/${target}`);
  }
  return errors;
}

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
    if (toPosix(fullPath).includes('/__tests__/')) return [];
    return [fullPath];
  });
}

function importsIn(contents) {
  const specifiers = [];
  const expression = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\bimport\s*\(|\brequire\s*\()(['"])([^'"\n]+)\1/g;
  for (const match of contents.matchAll(expression)) specifiers.push(match[2]);
  return specifiers;
}

function checkSource(sourceRelativePath, contents) {
  return importsIn(contents).flatMap((specifier) =>
    violationsFor(sourceRelativePath, specifier).map((message) => `${sourceRelativePath}: ${message}`),
  );
}

function run() {
  const violations = collectFiles(sourceRoot).flatMap((file) => {
    const relative = toPosix(path.relative(sourceRoot, file));
    return checkSource(`src/${relative}`, fs.readFileSync(file, 'utf8'));
  });
  if (violations.length) {
    console.error('Import boundary violations:');
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exitCode = 1;
    return;
  }
  console.log('Import boundaries passed.');
}

module.exports = { checkSource, violationsFor };

if (require.main === module) run();
