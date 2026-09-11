import mongoose from 'mongoose';
import type { ConnectOptions } from 'mongoose';
import { logger } from '@stoxifyorg/logger';

export type MongoConnectOptions = ConnectOptions;

export interface ConnectDatabaseConfig {
  /** Connection string. Defaults to getMongoUri() (MONGODB_URI env). */
  uri?: string;
  /** Driver options (maxPoolSize, serverSelectionTimeoutMS, socketTimeoutMS, ...). Owned by the calling service — no defaults are applied here. */
  options: MongoConnectOptions;
}

export const DEFAULT_LOCAL_MONGO_URI = 'mongodb://localhost:27017/stoxify';

/** Reads MONGODB_URI from the environment, falling back to the local-dev URI. */
export function getMongoUri(): string {
  return process.env.MONGODB_URI || DEFAULT_LOCAL_MONGO_URI;
}

// Connection event handlers must be attached exactly once per process. A second
// connectDatabase() call (e.g. reconnect after disconnect, or seeds + service in
// the same process) would otherwise stack duplicate listeners.
let handlersRegistered = false;

function registerConnectionHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
    process.exit(1);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

export async function connectDatabase(config: ConnectDatabaseConfig): Promise<void> {
  if (!config || !config.options) {
    throw new Error(
      'connectDatabase(): options is required — pool size and timeouts are owned by the calling service',
    );
  }

  const uri = config.uri ?? getMongoUri();

  registerConnectionHandlers();

  await mongoose.connect(uri, config.options);

  logger.info(
    { db: mongoose.connection.name, maxPoolSize: config.options.maxPoolSize },
    'MongoDB connected',
  );
}
