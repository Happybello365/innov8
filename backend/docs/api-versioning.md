# Public API Versioning & Migration Guide

This guide documents how the Amana backend versions its public HTTP API, the
backward-compatibility guarantees we make, how deprecations are announced and
sunset, and how clients migrate between versions. It applies to all routes
mounted under the public API surface (trade orchestration, escrow, uploads, and
wallet/payment endpoints).

## Versioning scheme

The public API is versioned by URL path prefix: `/api/v1`, `/api/v2`, etc.

- The version segment is the **major** version. It is bumped only for breaking
  changes (see below).
- Additive, non-breaking changes ship within the current major version without
  a new prefix.
- Internal/admin routes are not part of the public contract and may change
  without a version bump, but still follow the deprecation process below.

## Backward-compatibility guarantees

Within a published major version (`vN`) we guarantee:

- **No removal** of existing endpoints, request fields, or response fields.
- **No type changes** to existing request/response fields (e.g. a field that is
  a string stays a string).
- **No new required request fields.** New request fields are optional and have
  a documented default.
- **No change to existing status codes** for the same input, except where the
  previous behavior was a bug (documented in the changelog).
- **No change to authentication/authorization rules** that would reject
  previously valid, authorized requests.

### What counts as a breaking change

- Removing or renaming an endpoint, field, or enum value.
- Changing a field's type, format, or units.
- Making an optional request field required.
- Changing default values in a way that alters observable behavior.
- Tightening authorization or validation such that previously accepted
  requests now fail.

Breaking changes require a new major version prefix.

## Deprecation lifecycle

When an endpoint or field is scheduled for removal:

1. **Announce** — mark it deprecated in the OpenAPI spec and this guide, and
   note the replacement. Deprecation is announced at least one minor release
   before removal.
2. **Signal** — deprecated endpoints return the standard `Deprecation` and
   `Sunset` response headers (RFC 8594 / RFC 9745) where applicable.
3. **Sunset** — after the announced sunset date, the endpoint is removed in the
   next major version. The previous major version continues to serve traffic
   for the published support window.

### Support window

- A major version is supported for **at least 6 months** after its successor
  is generally available.
- Sunset dates are published in the changelog and in the `Sunset` header.
- Clients should treat the `Sunset` header as authoritative and migrate before
  that date.

## Migration rules for clients

- Pin to a specific major version prefix; do not rely on unversioned paths.
- Tolerate unknown response fields (forward compatibility) and ignore fields
  you do not consume.
- Send only documented request fields; unknown fields may be rejected.
- Monitor `Deprecation`/`Sunset` headers and the changelog for upcoming
  removals.
- Migrate incrementally: run the new version alongside the old one, compare
  responses, then cut over before the sunset date.

## Failure states and edge cases

- Requests to a **retired** version return `410 Gone` with a JSON body pointing
  to the current version.
- Requests to an **unknown** version return `404 Not Found`.
- Deprecated-but-supported endpoints continue to behave per their original
  contract until sunset; they do not silently change shape.
- Error responses keep a stable shape across versions; new error codes are
  additive.
- No secrets, tokens, or PII are included in deprecation headers, error bodies,
  or changelog entries.

## Documenting changes

Every public interface change must update:

- the OpenAPI spec for the affected version, and
- the changelog entry describing the change and, for deprecations, the
  replacement and sunset date.
