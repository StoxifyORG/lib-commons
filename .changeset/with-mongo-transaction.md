---
"@stoxifyorg/database": minor
---

Add generic `withMongoTransaction` helper for atomic multi-document operations on the shared connection.

Features:
- Executes callbacks inside MongoDB driver's `session.withTransaction` with auto-retry on transient errors and auto-abort on exception.
- Guarantees session termination in a `finally` block to prevent connection leaks.
- Supports nested transaction composition via `{ session }` option.
- Default production-ready options: snapshot read concern, majority write concern, primary read preference.
- Re-exports `ClientSession`, `MongoTransactionFn`, `WithMongoTransactionOptions`, and `TransactionOptions`.
