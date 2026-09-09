const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const pino = require('pino');

const {
  SENSITIVE_KEYS,
  REDACT_CENSOR,
  redactionOptions,
  isSensitiveKey,
} = require('./dist/index.js');

const SECRET = 'SUPERSECRET-DO-NOT-LOG';

/** A logger wired exactly like the shared one, writing into an array. */
function capture() {
  const lines = [];
  const log = pino(redactionOptions, { write: (line) => lines.push(line) });
  return { log, lines, last: () => lines[lines.length - 1] };
}

function logged(build) {
  const { log, last } = capture();
  build(log);
  return last();
}

test('every sensitive key is censored at the top level', () => {
  for (const key of SENSITIVE_KEYS) {
    const line = logged((log) => log.info({ [key]: SECRET }, 'top level'));
    assert.ok(!line.includes(SECRET), `${key} leaked its value: ${line}`);
    assert.ok(line.includes(REDACT_CENSOR), `${key} was not censored: ${line}`);
  }
});

test('every sensitive key is censored when nested, deeply nested and inside arrays', () => {
  for (const key of SENSITIVE_KEYS) {
    const shapes = {
      nested: { user: { [key]: SECRET } },
      deep: { req: { body: { profile: { kyc: { [key]: SECRET } } } } },
      array: { items: [{ [key]: SECRET }] },
      arrayOfArrays: { rows: [[{ [key]: SECRET }]] },
    };
    for (const [shape, payload] of Object.entries(shapes)) {
      const line = logged((log) => log.info(payload, shape));
      assert.ok(!line.includes(SECRET), `${key} leaked in ${shape}: ${line}`);
      assert.ok(line.includes(REDACT_CENSOR), `${key} not censored in ${shape}: ${line}`);
    }
  }
});

test('key matching is case-insensitive', () => {
  for (const key of ['authorization', 'Authorization', 'AUTHORIZATION', 'X-Signature', 'PAN']) {
    assert.ok(isSensitiveKey(key), `${key} should be sensitive`);
    const line = logged((log) => log.info({ headers: { [key]: SECRET } }, 'casing'));
    assert.ok(!line.includes(SECRET), `${key} leaked: ${line}`);
  }
});

test('the headers and identifiers named in the ticket are covered', () => {
  const line = logged((log) =>
    log.info(
      {
        password: SECRET,
        req: {
          headers: {
            authorization: SECRET,
            cookie: SECRET,
            'x-signature': SECRET,
          },
        },
        access_token: SECRET,
        refresh_token: SECRET,
        otp: SECRET,
        pan: SECRET,
        aadhaar: SECRET,
        account_number: SECRET,
      },
      'ticket coverage',
    ),
  );
  assert.ok(!line.includes(SECRET), `ticket fields leaked: ${line}`);
  assert.equal(line.match(/\[REDACTED\]/g).length, 10);
});

test('credentials inside a serialized axios error are censored', () => {
  // The shape requirePower logs via `logger.error({ err }, 'RBAC service call failed')`.
  const err = new Error('Request failed with status code 401');
  err.name = 'AxiosError';
  err.config = {
    method: 'post',
    url: 'http://rbac:3000/check',
    headers: { Authorization: `Bearer ${SECRET}`, 'x-internal-secret': SECRET },
  };
  err.response = { status: 401, config: { headers: { Authorization: `Bearer ${SECRET}` } } };

  const line = logged((log) => log.error({ err }, 'RBAC service call failed'));
  assert.ok(!line.includes(SECRET), `axios error leaked credentials: ${line}`);
  // The rest of the error survives.
  assert.ok(line.includes('Request failed with status code 401'));
  assert.ok(line.includes('http://rbac:3000/check'));
});

test('child logger bindings are censored', () => {
  const { log, last } = capture();
  log.child({ token: SECRET, service: 'user-service' }).info('from child');
  assert.ok(!last().includes(SECRET), `child binding leaked: ${last()}`);
  assert.ok(last().includes('user-service'), 'non-sensitive binding was dropped');
});

test('circular references neither crash nor leak', () => {
  const root = { name: 'root', password: SECRET };
  root.self = root;
  root.nested = { parent: root, token: SECRET };

  let line;
  assert.doesNotThrow(() => {
    line = logged((log) => log.info(root, 'circular'));
  });
  assert.ok(!line.includes(SECRET), `circular structure leaked: ${line}`);
  assert.ok(line.includes('[Circular]'), 'cycle marker missing');
  assert.ok(line.includes('root'));
});

test('a repeated reference cannot smuggle out an uncensored copy', () => {
  const shared = { password: SECRET };
  const line = logged((log) => log.info({ first: shared, second: shared }, 'shared ref'));
  assert.ok(!line.includes(SECRET), `shared reference leaked: ${line}`);
  assert.equal(line.match(/\[REDACTED\]/g).length, 2);
});

test('non-sensitive payloads serialize exactly as they did without redaction', () => {
  const payload = {
    event: 'RATE_LIMIT_EXCEEDED',
    user_id: 'u_123',
    ip: '10.0.0.4',
    count: 42,
    ok: false,
    missing: null,
    when: new Date('2020-01-02T03:04:05.000Z'),
    buf: Buffer.from('hi'),
    nested: { a: [1, 2, { b: 'c' }] },
  };
  const withRedaction = logged((log) => log.info(payload, 'unchanged'));

  const plain = [];
  pino({}, { write: (l) => plain.push(l) }).info(payload, 'unchanged');

  const strip = (line) => line.replace(/"time":\d+/, '"time":0').replace(/"pid":\d+/, '"pid":0');
  assert.equal(strip(withRedaction), strip(plain[0]));
});

test('redaction survives the dev pino-pretty transport', () => {
  const script = `
    process.env.NODE_ENV = 'development';
    const { logger } = require(${JSON.stringify(path.join(__dirname, 'dist', 'index.js'))});
    logger.info({ password: ${JSON.stringify(SECRET)},
      req: { headers: { authorization: ${JSON.stringify(SECRET)} } } }, 'pretty');
  `;
  const out = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    cwd: __dirname,
    env: { ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'info' },
  });
  assert.ok(!out.includes(SECRET), `pretty transport leaked: ${out}`);
  assert.ok(out.includes(REDACT_CENSOR), `pretty transport did not censor: ${out}`);
});

test('redaction adds no meaningful per-call cost', () => {
  const payload = {
    event: 'AUTH_OK', user_id: 'u_123', ip: '10.0.0.4',
    req: { method: 'POST', url: '/v1/orders', headers: { authorization: SECRET, 'user-agent': 'okhttp' } },
  };
  const bench = (log) => {
    for (let i = 0; i < 5000; i += 1) log.info(payload, 'warmup');
    const started = process.hrtime.bigint();
    for (let i = 0; i < 20000; i += 1) log.info(payload, 'msg');
    return Number(process.hrtime.bigint() - started) / 20000;
  };
  const sink = { write() {} };
  const baseline = bench(pino({}, sink));
  const redacting = bench(pino(redactionOptions, sink));
  // Generous bound: the wildcard-path approach this replaced was ~150x baseline.
  assert.ok(
    redacting < baseline * 8,
    `redaction cost ${redacting.toFixed(0)}ns vs ${baseline.toFixed(0)}ns baseline`,
  );
});
