# @stoxifyorg/logger

## 1.1.0

### Minor Changes

- 44d14ad: Redact sensitive fields before they reach stdout.

  The shared logger now censors passwords, JWT/access/refresh tokens,
  `authorization`, `cookie` and `x-signature`/`x-internal-secret` headers, OTPs and
  PINs, and KYC/bank identifiers (PAN, Aadhaar, account number, IFSC, UPI, card),
  writing `[REDACTED]` in their place. Matching is case-insensitive and applies at
  any nesting depth, inside arrays, on child-logger bindings, and to serialized
  errors — so credentials carried on a failed axios call's `config.headers` are
  covered too. Both the production JSON output and the dev `pino-pretty` transport
  are censored.

  Non-sensitive output is unchanged, and no new runtime dependency is added.
