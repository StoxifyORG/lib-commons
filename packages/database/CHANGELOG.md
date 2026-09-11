# @stoxifyorg/database

## 1.2.3

### Patch Changes

- Add `ltp_at_modification` to `modification_history` subdocuments and document the `changed_indices` shape of `fields_changed.targets`. Written by trade-service's `modifyTrade` so the trade history UI can show which target rung was edited and at what LTP. Null/absent on older entries — consumers fall back to diffing `fields_changed.targets.old`/`.new` index-wise.


## 1.2.2

### Patch Changes

- Add `target_hit_log` (`{ target_index, price, hit_at }[]`) to the base Trade schema. Written by trade-service's auto-close engine per booked target rung; drives the per-rung "Target T1 hit" rows in the trade history UI. Absent on older documents — consumers fall back to the single exit row.

## 1.2.1

### Patch Changes

- Add `PWR_ANALYST_ACQUISITION_VIEW` seed to powers and attach to `SALES`, `ADMIN`, and `FOUNDER` roles for standalone analyst acquisition portal.

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
