---
"@stoxifyorg/database": minor
"@stoxifyorg/middleware": patch
---

Add trader DigiLocker verification sessions, accepted-evidence activation guards,
private identity projections, and recoverable activation event metadata. Hide
legacy raw DigiLocker responses from trader/profile reads. Suppress sensitive
request content in signature-failure logs on designated KYC routes.

Deploy consumers with both updated packages so the direct and middleware database
dependencies resolve to the same model package.
