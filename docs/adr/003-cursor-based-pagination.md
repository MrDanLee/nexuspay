# 3. Cursor-based pagination for list endpoints

- Status: Accepted
- Date: 2026-02-21

## Context

Order lists grow without bound and are queried frequently. Offset/limit
pagination (`OFFSET n`) degrades on deep pages (the database still scans and
discards the skipped rows) and can skip or duplicate rows when data is inserted
between page requests.

## Decision

Use **cursor-based (keyset) pagination** for the order list endpoint. The
cursor is an opaque base64 token encoding the sort key of the last row seen
(`created_at`). The next page queries `WHERE created_at < :cursor ORDER BY
created_at DESC LIMIT :n+1`, using the extra row to compute `hasMore`.

The audit query API, which is an operator/debugging tool rather than a hot
path, keeps simple offset/limit pagination.

## Consequences

- Stable, index-friendly pagination that performs the same on page 1 and page
  1000.
- No row skipping/duplication under concurrent inserts.
- Cannot jump to an arbitrary page number (acceptable for feeds and history).
- The cursor is opaque, so the sort key can change later without breaking
  clients.
