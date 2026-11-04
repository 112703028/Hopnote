import {
  MAX_IMAGE_ITEMS,
  MAX_TEXT_ITEMS,
  RETENTION_MS,
  type Envelope,
  type ItemKind,
  type StoredItem,
} from "@hopnote/protocol";

type Row = { seq: number; id: string; kind: ItemKind; payload: string; received_at: number };

const COLUMNS = "seq, id, kind, payload, received_at";

function toItem(row: Row): StoredItem {
  return {
    seq: row.seq,
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    receivedAt: row.received_at,
  };
}

export function initSchema(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS items (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at INTEGER NOT NULL
  )`);
  sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

const AUTH_HASH_KEY = "auth_hash";

export function getAuthHash(sql: SqlStorage): string | null {
  const rows = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", AUTH_HASH_KEY).toArray();
  return rows.length > 0 ? rows[0].value : null;
}

export function setAuthHash(sql: SqlStorage, hash: string): void {
  sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", AUTH_HASH_KEY, hash);
}

export function findItemById(sql: SqlStorage, id: string): StoredItem | null {
  const rows = sql.exec<Row>(`SELECT ${COLUMNS} FROM items WHERE id = ?`, id).toArray();
  return rows.length > 0 ? toItem(rows[0]) : null;
}

export function insertItem(
  sql: SqlStorage,
  envelope: Envelope,
  now: number,
): { item: StoredItem; duplicate: boolean } {
  const existing = findItemById(sql, envelope.id);
  if (existing) return { item: existing, duplicate: true };

  sql.exec(
    "INSERT INTO items (id, kind, payload, received_at) VALUES (?, ?, ?, ?)",
    envelope.id,
    envelope.kind,
    envelope.payload,
    now,
  );
  const item = findItemById(sql, envelope.id) as StoredItem;
  pruneItems(sql, now);
  return { item, duplicate: false };
}

// Newest `limit` items with seq > since, returned oldest first.
export function listItems(sql: SqlStorage, opts: { since: number; limit: number }): StoredItem[] {
  const rows = sql
    .exec<Row>(
      `SELECT ${COLUMNS} FROM (
         SELECT ${COLUMNS} FROM items WHERE seq > ? ORDER BY seq DESC LIMIT ?
       ) ORDER BY seq ASC`,
      opts.since,
      opts.limit,
    )
    .toArray();
  return rows.map(toItem);
}

export function latestSeq(sql: SqlStorage): number {
  const rows = sql.exec<{ latest: number }>("SELECT COALESCE(MAX(seq), 0) AS latest FROM items").toArray();
  return rows[0].latest;
}

export function oldestReceivedAt(sql: SqlStorage): number | null {
  const rows = sql
    .exec<{ oldest: number | null }>("SELECT MIN(received_at) AS oldest FROM items")
    .toArray();
  return rows[0].oldest;
}

export function pruneItems(sql: SqlStorage, now: number): void {
  sql.exec("DELETE FROM items WHERE received_at < ?", now - RETENTION_MS);
  const limits: [ItemKind, number][] = [
    ["text", MAX_TEXT_ITEMS],
    ["image", MAX_IMAGE_ITEMS],
  ];
  for (const [kind, max] of limits) {
    sql.exec(
      `DELETE FROM items WHERE kind = ? AND seq NOT IN (
         SELECT seq FROM items WHERE kind = ? ORDER BY seq DESC LIMIT ?
       )`,
      kind,
      kind,
      max,
    );
  }
}
