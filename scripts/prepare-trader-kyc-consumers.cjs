#!/usr/bin/env node
'use strict';

// Run only AFTER the reviewed database/middleware versions are published.
// Registry metadata, including integrity hashes, is resolved by pnpm itself.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const DATABASE = '@stoxifyorg/database';
const MIDDLEWARE = '@stoxifyorg/middleware';
const CONSUMERS = [
  { directory: 'user-service', name: 'user-service' },
  { directory: 'auth-service', name: '@stoxifyorg/auth-service' },
];

function fail(message) { throw new Error(message); }
function releasedVersion(value, minimum, label) {
  if (typeof value !== 'string' || value.length > 32 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    fail(`${label} requires an exact stable version without a range or prerelease suffix`);
  }
  const parts = value.split('.').map(Number);
  if (parts.some(n => !Number.isSafeInteger(n)) || parts[0] !== 1 ||
      parts[1] < minimum[1] || (parts[1] === minimum[1] && parts[2] < minimum[2])) {
    fail(`${label} version is unsupported; use a compatible released 1.x feature version`);
  }
  return value;
}

function snapshot(file, required = false) {
  if (!fs.existsSync(file)) {
    // existsSync follows symlinks; also reject dangling links.
    try { fs.lstatSync(file); fail('Unsafe symbolic link in a consumer output path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (required) fail('A required consumer package.json is missing');
    return { file, bytes: null, mode: 0o644 };
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('Consumer outputs must be regular files, not symbolic links');
  return { file, bytes: fs.readFileSync(file), mode: stat.mode & 0o777 };
}

function unchanged(original) {
  const current = snapshot(original.file);
  return original.bytes === null ? current.bytes === null : current.bytes !== null && current.bytes.equals(original.bytes);
}

// Deliberately accepts only the canonical mapping layout emitted by pnpm9.
// Unsupported layouts fail closed instead of guessing at a dependency graph.
function mapping(lines, key, indent) {
  const prefixes = [key, `'${key}'`, `"${key}"`].map(value => `${' '.repeat(indent)}${value}:`);
  const matches = lines.map((line, index) => ({ line, index, prefix: prefixes.find(prefix => line.startsWith(prefix)) }))
    .filter(entry => entry.prefix);
  if (matches.length !== 1) fail('Generated lockfile has an unsupported or ambiguous mapping');
  const { line, index, prefix } = matches[0];
  let end = index + 1;
  while (end < lines.length) {
    const candidate = lines[end];
    if (candidate.trim() && !candidate.trimStart().startsWith('#') && candidate.search(/\S/) <= indent) break;
    end++;
  }
  return { value: line.slice(prefix.length).trim(), lines: lines.slice(index + 1, end) };
}

function scalar(value) {
  if (/^'[^']*'$/.test(value) || /^"[^"\\]*"$/.test(value)) return value.slice(1, -1);
  return value;
}

function packageEntries(lines, name) {
  return lines.flatMap(line => {
    const match = /^  (?:'([^']+)'|"([^"\\]+)"):\s*(?:\{\})?\s*$/.exec(line);
    const key = match && (match[1] || match[2]);
    return key && key.startsWith(`${name}@`) ? [{ key, version: key.slice(name.length + 1).split('(')[0] }] : [];
  });
}

function verifyLockfile(text, versions) {
  const lines = text.split(/\r?\n/);
  if (scalar(mapping(lines, 'lockfileVersion', 0).value) !== '9.0') fail('Expected a pnpm9 lockfile');
  if (/(?:^|[\s'"{,])(?:file|link|workspace):/m.test(text)) fail('Local dependency sources are not allowed in the release lockfile');
  const importer = mapping(mapping(lines, 'importers', 0).lines, '.', 2);
  const dependencies = mapping(importer.lines, 'dependencies', 4);
  const packages = mapping(lines, 'packages', 0).lines;
  const snapshots = mapping(lines, 'snapshots', 0).lines;
  for (const [name, version] of Object.entries(versions)) {
    const dependency = mapping(dependencies.lines, name, 6);
    if (scalar(mapping(dependency.lines, 'specifier', 8).value) !== version ||
        scalar(mapping(dependency.lines, 'version', 8).value).split('(')[0] !== version) {
      fail('Generated lockfile does not use the requested exact direct package versions');
    }
    const definitions = packageEntries(packages, name);
    const resolutions = packageEntries(snapshots, name);
    if (!definitions.length || !resolutions.length ||
        [...definitions, ...resolutions].some(entry => entry.version !== version)) {
      fail('Dependency graph contains missing or mixed shared package versions');
    }
    for (const definition of definitions) {
      const block = mapping(packages, definition.key, 2).lines.join('\n');
      if (!/\bintegrity:\s*['"]?sha(?:1|256|384|512)-[A-Za-z0-9+/=]+/.test(block)) {
        fail('Registry integrity metadata is missing from a shared package');
      }
    }
    if (name === MIDDLEWARE) {
      for (const resolution of resolutions) {
        const block = mapping(snapshots, resolution.key, 2);
        const nested = mapping(block.lines, 'dependencies', 4);
        if (scalar(mapping(nested.lines, DATABASE, 6).value).split('(')[0] !== versions[DATABASE]) {
          fail('Released middleware must depend on the selected database version');
        }
      }
    }
  }
}

function execute(command, args, cwd, env, run) {
  const result = run(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, shell: false });
  if (result.error || result.status !== 0) {
    // Child output may contain authentication/configuration details. Never echo it.
    fail('pnpm failed; confirm pnpm9, registry access, and that both exact versions are published');
  }
  return result.stdout || '';
}

function commitOutputs(outputs) {
  const suffix = `.trader-kyc-${crypto.randomBytes(12).toString('hex')}.tmp`;
  const committed = [];
  const staged = [];
  try {
    for (const output of outputs) {
      if (!unchanged(output.original)) fail('Consumer files changed during preparation; refusing to overwrite them');
      output.staged = `${output.original.file}${suffix}`;
      fs.writeFileSync(output.staged, output.bytes, { flag: 'wx', mode: output.original.mode });
      staged.push(output.staged);
    }
    for (const output of outputs) {
      if (!unchanged(output.original)) fail('Consumer files changed during preparation; refusing to overwrite them');
      fs.renameSync(output.staged, output.original.file);
      committed.push(output);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const output of committed.reverse()) {
      try {
        // Preserve an intervening human edit instead of overwriting it on rollback.
        if (!fs.readFileSync(output.original.file).equals(output.bytes)) throw new Error('Concurrent edit');
        if (output.original.bytes === null) fs.unlinkSync(output.original.file);
        else {
          const restore = `${output.original.file}${suffix}.restore`;
          staged.push(restore);
          fs.writeFileSync(restore, output.original.bytes, { flag: 'wx', mode: output.original.mode });
          fs.renameSync(restore, output.original.file);
        }
      } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) fail('Writing consumer files failed and rollback was incomplete; inspect both manifests and lockfiles');
    throw error;
  } finally {
    for (const file of staged) {
      try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}

function prepareConsumers(options, dependencies = {}) {
  const versions = {
    [DATABASE]: releasedVersion(options.databaseVersion, [1, 1, 0], 'Database'),
    [MIDDLEWARE]: releasedVersion(options.middlewareVersion, [1, 0, 1], 'Middleware'),
  };
  const requestedRoot = options.backendRoot || path.resolve(__dirname, '../..');
  if (!path.isAbsolute(requestedRoot) || !fs.existsSync(requestedRoot)) fail('Backend root must be an existing absolute directory');
  const root = fs.realpathSync(requestedRoot);
  if (root === path.parse(root).root || !fs.statSync(root).isDirectory()) fail('Unsafe backend root');
  const env = { ...(dependencies.env || process.env), CI: 'true', COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0' };
  if (!env.NODE_AUTH_TOKEN || /[\r\n]/.test(env.NODE_AUTH_TOKEN)) fail('NODE_AUTH_TOKEN with GitHub Packages read access is required');
  const run = dependencies.run || spawnSync;
  const plans = CONSUMERS.map(consumer => {
    const directory = path.join(root, consumer.directory);
    if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory() ||
        fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) {
      fail('Both consumer directories must exist directly under the backend root without symbolic links');
    }
    const manifest = snapshot(path.join(directory, 'package.json'), true);
    const lock = snapshot(path.join(directory, 'pnpm-lock.yaml'));
    let json;
    try { json = JSON.parse(manifest.bytes.toString('utf8')); } catch { fail('Consumer package.json is invalid JSON'); }
    if (json.name !== consumer.name || !json.dependencies?.[DATABASE] || !json.dependencies?.[MIDDLEWARE]) {
      fail('Backend root does not contain the expected service manifests and shared dependencies');
    }
    return { consumer, manifest, lock, json };
  });
  const version = execute('pnpm', ['--version'], root, env, run).trim();
  if (!/^9\.\d+\.\d+$/.test(version)) fail('This release helper requires an already installed pnpm9 on PATH');

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stoxify-trader-kyc-consumers-'));
  try {
    const outputs = [];
    for (const plan of plans) {
      const directory = path.join(temporaryRoot, plan.consumer.directory);
      fs.mkdirSync(directory);
      // pnpm add preserves an existing dependency's range operator, so on a
      // consumer already pinning ^1.0.0 it writes ^1.1.0 where an exact pin is
      // required. Write the intended exact manifest and let install do nothing
      // but resolve it. The comparison below still fails closed if pnpm alters
      // any field, so this loosens no guarantee.
      const intended = { ...plan.json, dependencies: { ...plan.json.dependencies, ...versions } };
      fs.writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify(intended, null, 2)}\n`);
      if (plan.lock.bytes !== null) fs.writeFileSync(path.join(directory, 'pnpm-lock.yaml'), plan.lock.bytes);
      // These are single-service workspaces. Do not inherit pnpm11 build-policy
      // settings, parent workspace discovery, or any repository pnpmfile hooks.
      fs.writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), "packages:\n  - '.'\n");
      fs.writeFileSync(path.join(directory, '.npmrc'),
        '@stoxifyorg:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n', { mode: 0o600 });
      execute('pnpm', [
        'install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile', '--reporter=silent',
      ], directory, env, run);
      const manifest = fs.readFileSync(path.join(directory, 'package.json'));
      const expected = { ...plan.json, dependencies: { ...plan.json.dependencies, ...versions } };
      let generated;
      try { generated = JSON.parse(manifest.toString('utf8')); } catch { fail('pnpm generated an invalid consumer manifest'); }
      if (!isDeepStrictEqual(generated, expected)) fail('pnpm changed manifest fields beyond the two intended shared package versions');
      const lock = fs.readFileSync(path.join(directory, 'pnpm-lock.yaml'));
      verifyLockfile(lock.toString('utf8'), versions);
      outputs.push({ original: plan.manifest, bytes: manifest }, { original: plan.lock, bytes: lock });
    }
    // Registry resolution for both consumers must succeed before either changes.
    commitOutputs(outputs);
    return { databaseVersion: versions[DATABASE], middlewareVersion: versions[MIDDLEWARE], consumers: CONSUMERS.map(item => item.directory) };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write('Usage: node scripts/prepare-trader-kyc-consumers.cjs DATABASE_VERSION MIDDLEWARE_VERSION [--backend-root /absolute/path/to/Backend]\nRequires published compatible stable1.x packages, pnpm9 on PATH, and NODE_AUTH_TOKEN. Updates both package.json and registry pnpm-lock.yaml files only after both dependency graphs validate.\n');
    return;
  }
  if (args.length !== 2 && !(args.length === 4 && args[2] === '--backend-root')) fail('Expected exact database and middleware versions and optional --backend-root');
  const result = prepareConsumers({ databaseVersion: args[0], middlewareVersion: args[1], backendRoot: args[3] });
  process.stdout.write(`Prepared both consumer manifests and registry lockfiles for database ${result.databaseVersion} and middleware ${result.middlewareVersion}. Review and commit all four files together.\n`);
}

module.exports = { prepareConsumers, verifyLockfile, releasedVersion };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    // Filesystem errors can contain paths; registry subprocess output is never retained.
    process.stderr.write(`Consumer preparation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
