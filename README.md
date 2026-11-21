# innov8

Agricultural escrow platform connecting smallholder farmers, buyers, and financiers through transparent, milestone-based settlement.

## Repository layout

- `backend/` — API service (Node.js/TypeScript)
- `.github/workflows/` — CI and deployment pipelines

## Setup

See `backend/README.md` for backend setup instructions.

## Container image promotion

Deployment pipelines promote **immutable image digests** (`sha256:...`) between
environments instead of mutable tags. Tags such as `latest` or `staging` are
convenience labels only and are never used to select what runs in an
environment.

### How it works

1. The build job publishes the image and records its digest
   (`docker buildx imagetools inspect` / `docker inspect --format '{{index .RepoDigests 0}}'`).
2. The digest is passed to downstream environments as a workflow input
   (`image_digest`), not a tag.
3. Each environment pulls by digest, e.g.
   `ghcr.io/<org>/innov8-backend@sha256:<digest>`.

### Configuration

- `IMAGE_DIGEST` — the `sha256:...` digest to deploy. Required for staging and
  production deploys; the workflow fails fast if it is missing or malformed.
- `IMAGE_REPOSITORY` — registry/repository path the digest belongs to.

Example (`.env.staging.example`):

```dotenv
IMAGE_REPOSITORY=ghcr.io/innov8/innov8-backend
IMAGE_DIGEST=sha256:0000000000000000000000000000000000000000000000000000000000000000
```

### Operational notes

- Digests are immutable: re-running a deploy with the same digest is safe and
  idempotent.
- To roll back, redeploy the previously recorded digest — do not retag.
- Promotion between environments must reuse the exact digest that passed the
  prior environment's checks; rebuilding produces a different digest and is not
  a valid promotion.
- Never commit real digests or registry credentials to the repository; supply
  them via CI secrets or environment configuration.
