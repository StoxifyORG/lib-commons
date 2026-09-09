# @stoxifyorg/logger

## 1.2.0

### Minor Changes

- Redact contact PII as well.

  `identifier`, `phone`/`phoneNumber`/`phone_number`, `mobile`/`mobileNumber`/
  `mobile_number` and `email`/`emailAddress`/`email_address` now censor to
  `[REDACTED]` alongside the credentials and KYC identifiers already covered.

  `identifier` is the login field auth-service logs on every OTP event, and it
  carries either a phone number or an email address — staging logs were writing
  subscriber phone numbers in plain text on each `Login OTP sent` /
  `Analyst OTP sent` line.

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
