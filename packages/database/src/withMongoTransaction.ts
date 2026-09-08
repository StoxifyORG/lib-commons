import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '@stoxifyorg/logger';

export type TransactionOptions = NonNullable<Parameters<ClientSession['withTransaction']>[1]>;

export type MongoTransactionFn<T> = (session: ClientSession) => Promise<T>;

export type WithMongoTransactionOptions = {
  /**
   * If set, reuse this session and do not start/commit/end a new transaction.
   * Useful for composing nested service methods inside an outer transaction.
   */
  session?: ClientSession;
  /**
   * Overrides for driver transaction options (readConcern, writeConcern, readPreference).
   * Defaults to snapshot readConcern, majority writeConcern, and primary readPreference.
   */
  transactionOptions?: TransactionOptions;
};

const DEFAULT_TXN_OPTIONS: TransactionOptions = {
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
};

function assertConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      'withMongoTransaction: mongoose is not connected. Call connectDatabase() first.',
    );
  }
}

/**
 * Run `fn` in a MongoDB multi-document transaction on the shared connection.
 *
 * Requirements & Usage:
 * - Pass `session` into every mongoose call that must participate in the transaction:
 *     Model.updateOne(filter, update, { session })
 *     Model.find(filter).session(session)
 *     Model.create([doc], { session })  // Note: Mongoose Model.create requires an array when passing { session }
 *
 * Failure Contract:
 * - If `fn` throws an error: The transaction is aborted; the error is re-thrown; all writes with `{ session }` roll back.
 * - Transient MongoDB errors (network failover, write conflicts): The MongoDB driver automatically retries `fn`.
 *   Therefore, `fn` must be idempotent (e.g. conditional `$set`, `$inc`, rather than blind side-effects).
 * - Queries run without `{ session }`: Will execute outside the transaction and will NOT roll back on abort.
 * - Non-MongoDB operations (HTTP, Redis, Razorpay): Are NOT managed by MongoDB transactions.
 *   DO NOT perform external I/O or network requests inside `fn`.
 * - If `options.session` is provided, this joins that outer transaction without starting or ending a session.
 */
export async function withMongoTransaction<T>(
  fn: MongoTransactionFn<T>,
  options: WithMongoTransactionOptions = {},
): Promise<T> {
  if (options.session) {
    return fn(options.session);
  }

  assertConnected();

  const session = await mongoose.startSession();

  try {
    let result!: T;

    await session.withTransaction(async () => {
      result = await fn(session);
    }, options.transactionOptions ?? DEFAULT_TXN_OPTIONS);

    return result;
  } catch (err) {
    logger.error(
      { err },
      'withMongoTransaction aborted or failed to commit',
    );
    throw err;
  } finally {
    await session.endSession();
  }
}
