# @stoxifyorg/middleware

## 1.0.3

### Patch Changes

- Updated dependencies
  - @stoxifyorg/logger@1.2.0
  - @stoxifyorg/auth-utils@1.0.2
  - @stoxifyorg/redis@1.0.2

## 1.0.2

### Patch Changes

- Updated dependencies [f80c995]
- Updated dependencies [44d14ad]
- Updated dependencies [15bd742]
  - @stoxifyorg/shared-types@1.1.0
  - @stoxifyorg/logger@1.1.0
  - @stoxifyorg/database@1.2.0
  - @stoxifyorg/auth-utils@1.0.1
  - @stoxifyorg/redis@1.0.1

## 1.0.1

### Patch Changes

- f88114c: Add trader DigiLocker verification sessions, accepted-evidence activation guards,
  private identity projections, and recoverable activation event metadata. Hide
  legacy raw DigiLocker responses from trader/profile reads. Suppress sensitive
  request content in signature-failure logs on designated KYC routes.

  Deploy consumers with both updated packages so the direct and middleware database
  dependencies resolve to the same model package.

- Updated dependencies [f88114c]
  - @stoxifyorg/database@1.1.0
