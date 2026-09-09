# @stoxifyorg/database

## 1.2.0

### Minor Changes

- 15bd742: Add generic `withMongoTransaction` helper for atomic multi-document operations on the shared connection.

  Features:

  - Executes callbacks inside MongoDB driver's `session.withTransaction` with auto-retry on transient errors and auto-abort on exception.
  - Guarantees session termination in a `finally` block to prevent connection leaks.
  - Supports nested transaction composition via `{ session }` option.
  - Default production-ready options: snapshot read concern, majority write concern, primary read preference.
  - Re-exports `ClientSession`, `MongoTransactionFn`, `WithMongoTransactionOptions`, and `TransactionOptions`.

### Patch Changes

- Updated dependencies [f80c995]
- Updated dependencies [44d14ad]
  - @stoxifyorg/shared-types@1.1.0
  - @stoxifyorg/logger@1.1.0

## 1.1.0

### Minor Changes

- f88114c: Add trader DigiLocker verification sessions, accepted-evidence activation guards,
  private identity projections, and recoverable activation event metadata. Hide
  legacy raw DigiLocker responses from trader/profile reads. Suppress sensitive
  request content in signature-failure logs on designated KYC routes.

  Deploy consumers with both updated packages so the direct and middleware database
  dependencies resolve to the same model package.
