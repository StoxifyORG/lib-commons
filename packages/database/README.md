# @stoxifyorg/database

Mongoose models, the shared MongoDB connection helper, seeds and analytics
helpers used by every StoXify microservice.

## Connecting

```ts
import { connectDatabase } from '@stoxifyorg/database';

await connectDatabase({
  // uri is optional — defaults to getMongoUri() (MONGODB_URI env, else local dev)
  options: {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
});
```

### `connectDatabase(config: ConnectDatabaseConfig): Promise<void>`

| Field     | Type                  | Required | Description |
|-----------|-----------------------|----------|-------------|
| `uri`     | `string`              | no       | Connection string. Defaults to `getMongoUri()`. |
| `options` | `MongoConnectOptions` | **yes**  | Mongoose/driver `ConnectOptions` passed through **verbatim**. The package applies **no defaults** — pool size and timeouts are owned by the calling service. |

Behaviour:

- Attaches the `error` (logs + `process.exit(1)`) and `disconnected` (warn)
  handlers once per process, before connecting, so repeated calls never
  stack duplicate listeners.
- Logs `MongoDB connected` with `{ db, maxPoolSize }` so operators can see
  what each service actually connected with.
- Throws `connectDatabase(): options is required — pool size and timeouts are
  owned by the calling service` if `options` is omitted (guard for JS callers).

### `getMongoUri(): string`

Returns `process.env.MONGODB_URI`, falling back to `DEFAULT_LOCAL_MONGO_URI`
(`mongodb://localhost:27017/stoxify`).

### Exports

`connectDatabase`, `getMongoUri`, `DEFAULT_LOCAL_MONGO_URI`, and the types
`ConnectDatabaseConfig`, `MongoConnectOptions` (alias of mongoose
`ConnectOptions`).

## Environment-variable contract (per service)

The shared package only reads `MONGODB_URI`. The pool/timeout variables below
are a **convention for services** — each service reads them itself and passes
the values through `options`.

| Variable                           | Read by | Default (service-side) | Notes |
|------------------------------------|---------|------------------------|-------|
| `MONGODB_URI`                      | `getMongoUri()` | `mongodb://localhost:27017/stoxify` | Must include the database name in the path. |
| `MONGO_MAX_POOL_SIZE`              | service | see guidance below     | **Always set explicitly** — the MongoDB driver default is `100` per process, which multiplied across replicas will exhaust Atlas connection limits. |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS`| service | `5000`                 | How long to wait for a suitable server before failing an operation. |
| `MONGO_SOCKET_TIMEOUT_MS`          | service | `45000`                | Idle socket timeout. |

## Reference `src/database.ts` for a service

```ts
// src/database.ts
import { connectDatabase } from '@stoxifyorg/database';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

export const mongoOptions = {
  maxPoolSize: intEnv('MONGO_MAX_POOL_SIZE', 10),
  serverSelectionTimeoutMS: intEnv('MONGO_SERVER_SELECTION_TIMEOUT_MS', 5000),
  socketTimeoutMS: intEnv('MONGO_SOCKET_TIMEOUT_MS', 45000),
};

export async function connectDb(): Promise<void> {
  // uri intentionally omitted: resolved from MONGODB_URI by getMongoUri()
  await connectDatabase({ options: mongoOptions });
}
```

Then in the service entrypoint:

```ts
import { connectDb } from './database';

await connectDb();
```

## Pool-size guidance

| Service class                     | `MONGO_MAX_POOL_SIZE` | Rationale |
|-----------------------------------|-----------------------|-----------|
| Auth / low-traffic (user, auth)   | 5–10                  | Short, infrequent queries; keeps Atlas connection budget free for hot paths. |
| Core / trades (trade, market-data)| 20–50                 | High concurrent read/write fan-out on the feed and SL-checker paths. |
| Workers / batch (notification, seeds, cron) | 5–15        | Mostly sequential; bursty but low concurrency. |

Rules of thumb:

- **The driver default is `maxPoolSize: 100`.** Never leave it unset in a
  service — every replica multiplies it.
- Sum `maxPoolSize × replicas` across all services and keep it well under the
  cluster's connection limit.
- **Validate under load.** These are starting points; watch `MongoDB connected
  { maxPoolSize }` in the logs plus Atlas "Connections" and pool-wait metrics
  and tune per service.

## Dev scripts

`pnpm seed`, `src/counts.ts` and `src/verify.ts` connect with
`maxPoolSize: 2` and read the URI from `MONGODB_URI`.
