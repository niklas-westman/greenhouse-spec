import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { readMemoryIndex, readSkillIndex } from "./knowledge-index.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

export type SqliteKnowledgeMatch = {
  id: string;
  kind: "memory" | "skill";
  path: string;
  status: string;
  rank: number;
};

export type SqliteIndexWriteResult = {
  path: string;
  status: "created" | "updated";
};

export function sqliteKnowledgeIndexPath(cwd: string): string {
  return join(cwd, ".greenhouse", "grown", "memory-index.sqlite");
}

export function writeSqliteKnowledgeIndex(cwd: string): SqliteIndexWriteResult {
  const indexPath = sqliteKnowledgeIndexPath(cwd);
  const existed = existsSync(indexPath);
  mkdirSync(dirname(indexPath), { recursive: true });
  if (existed) {
    rmSync(indexPath);
  }

  const db = new DatabaseSync(indexPath);
  try {
    db.exec(`
      CREATE TABLE knowledge_sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE knowledge_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        content,
        tokenize = 'porter unicode61'
      );
    `);

    const insertSource = db.prepare(`
      INSERT INTO knowledge_sources
        (id, kind, path, status, title, summary, content, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = db.prepare(`
      INSERT INTO knowledge_fts (id, title, summary, content)
      VALUES (?, ?, ?, ?)
    `);
    const indexedAt = new Date().toISOString();
    const memoryIndex = readMemoryIndex(cwd);
    const skillIndex = readSkillIndex(cwd);

    for (const entry of memoryIndex.memories) {
      const content = readContent(cwd, entry.path);
      insertSource.run(
        entry.id,
        "memory",
        entry.path,
        entry.status,
        entry.title,
        entry.summary,
        content,
        indexedAt,
      );
      insertFts.run(entry.id, entry.title, entry.summary, content);
    }

    for (const entry of skillIndex.skills) {
      const content = readContent(cwd, entry.path);
      insertSource.run(
        entry.id,
        "skill",
        entry.path,
        entry.status,
        entry.title,
        entry.summary,
        content,
        indexedAt,
      );
      insertFts.run(entry.id, entry.title, entry.summary, content);
    }
  } finally {
    db.close();
  }

  return {
    path: indexPath,
    status: existed ? "updated" : "created",
  };
}

export function querySqliteKnowledgeIndex(
  cwd: string,
  query: string,
  limit = 12,
): SqliteKnowledgeMatch[] {
  const indexPath = sqliteKnowledgeIndexPath(cwd);
  if (!existsSync(indexPath) || statSync(indexPath).size === 0) {
    return [];
  }

  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) {
    return [];
  }

  const db = new DatabaseSync(indexPath, { readOnly: true });
  try {
    const rows = db
      .prepare(`
        SELECT
          knowledge_sources.id AS id,
          knowledge_sources.kind AS kind,
          knowledge_sources.path AS path,
          knowledge_sources.status AS status,
          bm25(knowledge_fts) AS rank
        FROM knowledge_fts
        JOIN knowledge_sources ON knowledge_sources.id = knowledge_fts.id
        WHERE knowledge_fts MATCH ?
        ORDER BY rank ASC
        LIMIT ?
      `)
      .all(ftsQuery, limit);

    return rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id),
        kind: item.kind === "skill" ? "skill" : "memory",
        path: String(item.path),
        status: String(item.status),
        rank: typeof item.rank === "number" ? item.rank : 0,
      };
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function readContent(cwd: string, path: string): string {
  const absolutePath = join(cwd, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function toFtsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2)
    .slice(0, 12)
    .map((term) => `${term}*`);

  return [...new Set(terms)].join(" OR ");
}
