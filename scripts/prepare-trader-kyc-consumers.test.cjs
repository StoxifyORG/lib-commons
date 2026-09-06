const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareConsumers, verifyLockfile, releasedVersion } = require('./prepare-trader-kyc-consumers.cjs');

const DATABASE = '@stoxifyorg/database';
const MIDDLEWARE = '@stoxifyorg/middleware';
const versions = { [DATABASE]: '1.1.0', [MIDDLEWARE]: '1.0.1' };
// Synthetic registry fixture only. Production helper obtains metadata from pnpm.
function lockfile(database = '1.1.0', middleware = '1.0.1', nested = database) {
  return `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:
  .:
    dependencies:
      '@stoxifyorg/database':
        specifier: ${database}
        version: ${database}
      '@stoxifyorg/middleware':
        specifier: ${middleware}
        version: ${middleware}(debug@4.4.3)

packages:
  '@stoxifyorg/database@${database}':
    resolution: {integrity: sha512-Zml4dHVyZQ==, tarball: https://npm.pkg.github.com/fixture-database}
  '@stoxifyorg/middleware@${middleware}':
    resolution: {integrity: sha512-Zml4dHVyZQ==, tarball: https://npm.pkg.github.com/fixture-middleware}

snapshots:
  '@stoxifyorg/database@${database}': {}
  '@stoxifyorg/middleware@${middleware}(debug@4.4.3)':
    dependencies:
      '@stoxifyorg/database': ${nested}
`;
}

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trader-consumer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = new Map();
  for (const [directory, name] of [['user-service', 'user-service'], ['auth-service', '@stoxifyorg/auth-service']]) {
    fs.mkdirSync(path.join(root, directory));
    const manifest = JSON.stringify({ name, version: '1.0.0', scripts: { build: 'tsc' },
      dependencies: { [DATABASE]: directory === 'user-service' ? 'latest' : '^1.0.0', [MIDDLEWARE]: '^1.0.0', zod: '^4.4.3' } }, null, 2) + '\n';
    const file = path.join(root, directory, 'package.json');
    fs.writeFileSync(file, manifest); original.set(file, manifest);
  }
  const authLock = path.join(root, 'auth-service', 'pnpm-lock.yaml');
  fs.writeFileSync(authLock, 'original-auth-lock\n'); original.set(authLock, 'original-auth-lock\n');
  original.set(path.join(root, 'user-service', 'pnpm-lock.yaml'), null);
  const calls = [];
  const temporaryDirectories = [];
  const run = (command, args, execution) => {
    calls.push({ command, args, execution });
    if (args[0] === '--version') return { status: 0, stdout: options.pnpmVersion || '9.15.9\n' };
    temporaryDirectories.push(execution.cwd);
    for (const [file, value] of original) {
      if (options.concurrentEdit && file === options.concurrentEdit) continue;
      assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, value, 'repositories changed before both resolutions finished');
    }
    assert.equal(command, 'pnpm');
    for (const argument of ['--save-exact', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile', '--no-frozen-lockfile']) {
      assert.ok(args.includes(argument));
    }
    const npmrc = fs.readFileSync(path.join(execution.cwd, '.npmrc'), 'utf8');
    assert.ok(npmrc.includes('${NODE_AUTH_TOKEN}'));
    assert.equal(npmrc.includes('private-test-token'), false);
    assert.equal(execution.shell, false);
    assert.equal(execution.env.COREPACK_ENABLE_NETWORK, '0');
    if (options.failSecond && temporaryDirectories.length === 2) {
      return { status: 1, stdout: 'private-test-token', stderr: 'private-test-token' };
    }
    const file = path.join(execution.cwd, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(manifest.dependencies, versions);
    if (options.extraManifestChange) manifest.dependencies.zod = '^999.0.0';
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(execution.cwd, 'pnpm-lock.yaml'), options.lock || lockfile());
    if (options.concurrentEdit && temporaryDirectories.length === 2) fs.writeFileSync(options.concurrentEdit, 'human edit\n');
    return { status: 0, stdout: '' };
  };
  return { root, original, calls, temporaryDirectories, run, options,
    prepare: () => prepareConsumers({ databaseVersion: '1.1.0', middlewareVersion: '1.0.1', backendRoot: root },
      { run, env: { NODE_AUTH_TOKEN: 'private-test-token' } }) };
}

function assertUnchanged(fixture) {
  for (const [file, value] of fixture.original) assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, value);
  for (const directory of fixture.temporaryDirectories) assert.equal(fs.existsSync(directory), false);
}

test('both authentic-resolution outputs are prepared before four consumer files are replaced', t => {
  const f = fixture(t);
  assert.deepEqual(f.prepare(), { databaseVersion: '1.1.0', middlewareVersion: '1.0.1', consumers: ['user-service', 'auth-service'] });
  for (const directory of ['user-service', 'auth-service']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(f.root, directory, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies[DATABASE], '1.1.0');
    assert.equal(manifest.dependencies[MIDDLEWARE], '1.0.1');
    assert.equal(manifest.dependencies.zod, '^4.4.3');
    verifyLockfile(fs.readFileSync(path.join(f.root, directory, 'pnpm-lock.yaml'), 'utf8'), versions);
    assert.deepEqual(fs.readdirSync(path.join(f.root, directory)).sort(), ['package.json', 'pnpm-lock.yaml']);
  }
  assert.equal(f.calls.length, 3);
  for (const directory of f.temporaryDirectories) assert.equal(fs.existsSync(directory), false);
});

test('failure resolving the second consumer changes neither repository and leaks no token', t => {
  const f = fixture(t, { failSecond: true });
  assert.throws(f.prepare, error => {
    assert.match(error.message, /pnpm failed/);
    assert.equal(String(error).includes('private-test-token'), false);
    return true;
  });
  assertUnchanged(f);
});

test('mixed database versions, old middleware dependencies, local sources and missing integrity fail closed', t => {
  const invalid = [
    lockfile('1.1.0', '1.0.1', '1.0.0'),
    lockfile().replace('snapshots:', "snapshots:\n  '@stoxifyorg/database@1.0.0': {}"),
    lockfile().replace('packages:', "packages:\n  '@stoxifyorg/database@1.0.0': {}"),
    lockfile().replace('version: 1.1.0', 'version: link:../database'),
    lockfile().replaceAll('integrity: sha512-Zml4dHVyZQ==, ', ''),
    lockfile().replace("lockfileVersion: '9.0'", "lockfileVersion: '11.0'"),
    lockfile('1.0.0'),
  ];
  for (const lock of invalid) {
    const f = fixture(t, { lock });
    assert.throws(f.prepare);
    assertUnchanged(f);
  }
});

test('unrelated manifest updates and concurrent human edits cannot be overwritten', t => {
  const changed = fixture(t, { extraManifestChange: true });
  assert.throws(changed.prepare, /beyond the two intended/);
  assertUnchanged(changed);
  const concurrent = fixture(t);
  concurrent.options.concurrentEdit = path.join(concurrent.root, 'auth-service', 'package.json');
  assert.throws(concurrent.prepare, /changed during preparation/);
  for (const [file, value] of concurrent.original) {
    assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null,
      file === concurrent.options.concurrentEdit ? 'human edit\n' : value);
  }
});

test('only stable compatible exact releases and an already installed pnpm9 are accepted', t => {
  for (const version of ['latest', '^1.1.0', 'v1.1.0', '01.1.0', '1.1.0-beta.1', '1.1.0+build', '2.0.0', '1.0.0', '1.1.0;command']) {
    assert.throws(() => releasedVersion(version, [1, 1, 0], 'Database'));
  }
  assert.equal(releasedVersion('1.1.0', [1, 1, 0], 'Database'), '1.1.0');
  const f = fixture(t, { pnpmVersion: '11.0.0\n' });
  assert.throws(f.prepare, /installed pnpm9/);
  assertUnchanged(f);
});

test('missing credentials, unsafe roots, absent consumers and symbolic links fail before pnpm resolution', t => {
  const f = fixture(t);
  const options = { databaseVersion: '1.1.0', middlewareVersion: '1.0.1', backendRoot: f.root };
  const dependencies = { run: () => { throw new Error('must not invoke pnpm'); }, env: { NODE_AUTH_TOKEN: 'test' } };
  assert.throws(() => prepareConsumers(options, { ...dependencies, env: {} }), /NODE_AUTH_TOKEN/);
  assert.throws(() => prepareConsumers({ ...options, backendRoot: '.' }, dependencies), /absolute directory/);
  assert.throws(() => prepareConsumers({ ...options, backendRoot: '/' }, dependencies), /Unsafe backend root/);
  fs.renameSync(path.join(f.root, 'auth-service'), path.join(f.root, 'other-directory'));
  assert.throws(() => prepareConsumers(options, dependencies), /consumer directories/);
  fs.symlinkSync(path.join(f.root, 'other-directory'), path.join(f.root, 'auth-service'));
  assert.throws(() => prepareConsumers(options, dependencies), /consumer directories/);
});
