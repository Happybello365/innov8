# NEUROWEALTH_API Contract Documentation

## Overview

The Amana backend exposes a RESTful API for managing escrow trades, disputes, evidence, and wallet interactions on the Stellar/Soroban network. This document specifies the API contract including endpoints, authentication, request/response formats, and error handling.

## Base URL

```
https://api.amana.com  # Production
http://localhost:4000  # Development
```

## API Versioning

### Versioning Scheme

The public API is versioned in the URL path using a major version prefix:

```
/api/v1/trades
/api/v2/trades
```

- Only the **major** version appears in the path. Minor and patch changes are backward compatible and are released without a new path segment.
- The current stable version is **v1**. Unversioned legacy paths (e.g. `/trades`) are treated as aliases of `v1` and will be removed no earlier than the v1 sunset date.
- The version is also echoed in the `x-api-version` response header so clients can confirm which contract served the request.

### Backward Compatibility Guarantees

Within a major version, the following changes are **non-breaking** and may ship at any time:

- Adding new optional request fields or query parameters.
- Adding new response fields (clients MUST ignore unknown fields).
- Adding new enum values to status fields (clients MUST tolerate unknown enum values).
- Adding new endpoints.
- Relaxing validation constraints.

The following changes are **breaking** and require a new major version:

- Removing or renaming a field, endpoint, or enum value.
- Changing a field's type, format, or units.
- Making an optional field required, or tightening validation.
- Changing authentication/authorization requirements or error status codes for existing flows.
- Changing default values in a way that alters observable behavior.

### Deprecation Lifecycle

When a breaking change is required, the old behavior follows this lifecycle:

1. **Announce** — the deprecation is documented in this file and in the changelog, with a target sunset date.
2. **Signal** — deprecated endpoints/fields return the following response headers:
   ```
   Deprecation: true
   Sunset: Sat, 01 Jan 2027 00:00:00 GMT
   Link: <https://docs.amana.com/api/v2>; rel="successor-version"
   ```
3. **Coexist** — the old and new major versions run in parallel for a minimum of **180 days** (or longer for contract-affecting changes).
4. **Sunset** — after the sunset date the deprecated version returns `410 Gone` with a JSON body pointing to the successor version.

### Migration Rules

- Clients SHOULD pin to a major version path and MUST NOT depend on unversioned aliases in production.
- Clients MUST ignore unknown response fields and unknown enum values to remain forward compatible.
- When migrating, update the base path, review the changelog for breaking changes, and re-run integration tests against the new version before switching traffic.
- Contract (Soroban) changes that affect storage layout, events, or ABI are called out explicitly in the changelog and follow the same deprecation window.

### Failure States

- Requests to an unknown major version return `404 Not Found` with `{"error": "unknown_api_version"}`.
- Requests to a sunset version return `410 Gone` with `{"error": "api_version_sunset", "successor": "/api/v2"}`.
- Error responses never include secrets, tokens, or PII; only stable machine-readable error codes and human-readable messages are returned.

## Authentication

### JWT Bearer Token

All protected endpoints require authentication via JWT Bearer tokens.

**Request Header:**

```
Authorization: Bearer <jwt_token>
```

**JWT Structure:**

- **Issuer**: `amana` (configurable via `JWT_ISSUER`)
- **Audience**: `amana-api` (configurable via `JWT_AUDIENCE`)
- **Expiration**: 24 hours by default (configurable via `JWT_EXPIRES_IN`)
- **Secret**: Minimum 32 characters (via `JWT_SECRET`)

**Required Claims:**

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "iat": 1234567890,
  "exp": 1234567890,
  "iss": "amana",
  "aud": "amana-api"
}
```

### Public Endpoints

- `POST /auth/login` - Obtain JWT token
- `GET /health` - Health check (no auth required)

## Tracing Headers

Every request/response includes distributed tracing headers for cross-service correlation:

```
Request:
  x-correlation-id: <uuid>  (optional; generated if not provided)

Response:
  x-correlation-id: <uuid>  (echoed back)
  x-request-id: <uuid>      (always server-generated)
```

---

## Endpoints

### Trades

#### POST /trades - Create Trade

Create a new pending trade with loss sharing configuration.

**Authentication:** Required

**Request Body:**

```json
{
  "sellerAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "buyerAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "amountUsdc": "1000.50",
  "buyerLossBps": 5000,
  "sellerLossBps": 5000,
  "description": "Rice trade 50kg bags"
}
```

**Parameters:**

- `sellerAddress` (string, required): Stellar public key of seller
- `buyerAddress` (string, optional): Stellar public key of buyer (defaults to authenticated user)
- `amountUsdc` (string|number, required): Trade amount in USDC; regex: `^\d+(\.\d{1,7})?$`
- `buyerLossBps` (number, optional): Buyer loss share in basis points (0-10000), default 5000
- `sellerLossBps` (number, optional): Seller loss share in basis points (0-10000), default 5000
- `description` (string, optional): Trade description

**Validation:**

- `buyerLossBps + sellerLossBps` must equal 10000
- Both addresses must be valid Stellar Ed25519 public keys

**Response (201 Created):**

```json
{
  "id": "trade-uuid-123",
  "buyerAddress": "GXXXXXXX...",
  "sellerAddress": "GXXXXXXX...",
  "amountUsdc": "1000.50",
  "buyerLossBps": 5000,
  "sellerLossBps": 5000,
  "status": "PENDING_SIGNATURE",
  "createdAt": "2026-06-24T10:30:00Z",
  "updatedAt": "2026-06-24T10:30:00Z"
}
```

---

#### GET /trades - List User Trades

Retrieve paginated list of trades for the authenticated user (as buyer or seller).

**Authentication:** Required

**Query Parameters:**

```
GET /trades?status=FUNDED&page=1&limit=20&sort=-createdAt
```

- `status` (string, optional): Filter by trade status enum value
  - Valid values: `PENDING_SIGNATURE`, `PENDING_DEPOSIT`, `FUNDED`, `DELIVERED`, `COMPLETED`, `CANCELLED`, `DISPUTED`
- `page` (number, optional, default: 1): Page number (1-indexed)
- `limit` (number, optional, default: 20): Items per page (1-100)
- `sort` (string, optional): Sort field with direction (e.g., `-createdAt`, `amountUsdc`)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "trade-uuid-123",
      "buyerAddress": "GXXXXXXX...",
      "sellerAddress": "GXXXXXXX...",
      "amountUsdc": "1000.50",
      "status": "FUNDED",
      "createdAt": "2026-06-24T10:30:00Z",
      "updatedAt": "2026-06-24T10:35:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

#### POST /trades/:id/deposit - Build Deposit Transaction

Generate a Stellar transaction for depositing funds into escrow.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{}
```

**Response (200 OK):**

```json
{
  "transactionXdr": "AAAAAgAAAAC7VVeJ...",
  "hash": "abcd1234...",
  "memo": "trade-uuid-123"
}
```

---

#### POST /trades/:id/confirm - Confirm Delivery

Mark trade as delivered by buyer (proof-of-delivery).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{
  "proofOfDeliveryUrl": "ipfs://QmXXX...",
  "notes": "Goods received in good condition"
}
```

**Response (200 OK):**

```json
{
  "id": "trade-uuid-123",
  "status": "DELIVERED",
  "updatedAt": "2026-06-24T11:00:00Z"
}
```

---

#### POST /trades/:id/release - Release Funds

Seller releases escrowed funds (completes successful trade).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{}
```

**Response (200 OK):**

```json
{
  "transactionXdr": "AAAAAgAAAAC7VVeJ...",
  "hash": "abcd1234...",
  "status": "COMPLETED"
}
```

---

#### POST /trades/:id/dispute - Initiate Dispute

Open a dispute for a trade (within 48 hours of completion).

**Authentication:** Required

**Rate Limiting:** 5 disputes per hour per wallet

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{
  "reason": "Goods did not match specification; rice quality was poor",
  "category": "product_quality",
  "categoryId": 1
}
```

**Parameters:**

- `reason` (string, required): Dispute reason (min 10 characters)
- `category` (string, optional): Category name for free-form disputes
- `categoryId` (number, optional): Category ID from predefined categories

**Validation:**

- Trade must be in `FUNDED` or `DELIVERED` status
- Either `category` or `categoryId` must be provided
- One dispute per trade maximum

**Response (201 Created):**

```json
{
  "id": "dispute-uuid-456",
  "tradeId": "trade-uuid-123",
  "initiatedBy": "GXXXXXXX...",
  "reason": "Goods did not match specification; rice quality was poor",
  "category": "product_quality",
  "status": "OPEN",
  "createdAt": "2026-06-24T11:15:00Z"
}
```

---

### Manifest

#### POST /trades/:id/manifest - Upload Trade Manifest

Upload proof-of-delivery manifest (video + metadata).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body (multipart/form-data):**

```
manifest (file): Video file (max 500MB)
metadata (JSON): {"timestamp": "2026-06-24T10:30:00Z", "coordinates": {"lat": 6.5244, "lng": 3.3792}}
```

**Response (201 Created):**

```json
{
  "tradeId": "trade-uuid-123",
  "cid": "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "status": "uploaded",
  "metadata": {
    "timestamp": "2026-06-24T10:30:00Z",
    "coordinates": { "lat": 6.5244, "lng": 3.3792 }
  },
  "createdAt": "2026-06-24T10:30:00Z"
}
```

---

### Evidence

#### GET /trades/:id/evidence - Retrieve Evidence

Get all evidence associated with a trade.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Response (200 OK):**

```json
{
  "tradeId": "trade-uuid-123",
  "evidence": [
    {
      "cid": "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "type": "video",
      "uploadedAt": "2026-06-24T10:30:00Z",
      "uploadedBy": "GXXXXXXX..."
    }
  ]
}
```

---

#### GET /evidence/:cid/stream - Stream Evidence

Stream evidence file by IPFS content identifier.

**Authentication:** Required (optional for public evidence)

**Path Parameters:**

- `cid` (string, required): IPFS content identifier

**Response (200 OK):**

```
Content-Type: video/mp4 (or appropriate media type)
Content-Length: <bytes>
Content-Disposition: attachment; filename="evidence-trade-123.mp4"

[Binary video stream]
```

---

### Audit Trail

#### GET /trades/:id/history - Trade Audit Trail

Retrieve immut