/**
 * Per-query telemetry store for AgentSkillFinder.
 *
 * Production:  DuckDBStore (lazy-imports duckdb native binary)
 * Tests/CI:    MemoryStore (zero-dep, injectable)
 *
 * Schema mirrors:
 *   CREATE TABLE query_log (
 *     query_id TEXT, task TEXT, skill_ids TEXT[], success BOOLEAN,
 *     latency_ms INTEGER, token_count INTEGER, ts TIMESTAMP
 *   );
 */

import { randomUUID } from 'node:crypto';

// ── MemoryStore — in-process, no native deps ──────────────────────────────────

export class MemoryStore {
  constructor() { this._rows = []; }

  async init() {}

  async insert(row) { this._rows.push({ ...row }); }

  async queryAll({ skillId = null, since = null } = {}) {
    let rows = this._rows;
    if (skillId) rows = rows.filter((r) => r.skill_ids.includes(skillId));
    if (since)   rows = rows.filter((r) => r.ts >= since);
    return rows;
  }

  async close() {}
}

// ── DuckDBStore — production persistence ──────────────────────────────────────

export class DuckDBStore {
  constructor(dbPath = ':memory:') {
    this._dbPath = dbPath;
    this._db     = null;
    this._con    = null;
  }

  async init() {
    const { default: duckdb } = await import('duckdb');
    this._db  = new duckdb.Database(this._dbPath);
    this._con = this._db.connect();
    await this._exec(`
      CREATE TABLE IF NOT EXISTS query_log (
        query_id    TEXT,
        task        TEXT,
        skill_ids   TEXT[],
        success     BOOLEAN,
        latency_ms  INTEGER,
        token_count INTEGER,
        ts          TIMESTAMP
      )
    `);
  }

  _exec(sql) {
    return new Promise((resolve, reject) => {
      this._con.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  _run(sql, params) {
    return new Promise((resolve, reject) => {
      this._con.run(sql, ...params, (err) => (err ? reject(err) : resolve()));
    });
  }

  _all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this._con.all(sql, ...params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  async insert(row) {
    await this._run(
      'INSERT INTO query_log VALUES (?, ?, ?, ?, ?, ?, ?)',
      [row.query_id, row.task, JSON.stringify(row.skill_ids),
       row.success, row.latency_ms, row.token_count, row.ts],
    );
  }

  async queryAll({ skillId = null, since = null } = {}) {
    let sql = 'SELECT * FROM query_log';
    const clauses = [];
    const params  = [];
    if (skillId) { clauses.push('list_contains(skill_ids, ?)'); params.push(skillId); }
    if (since)   { clauses.push('ts >= ?');                     params.push(since);   }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    const rows = await this._all(sql, params);
    return rows.map((r) => ({
      ...r,
      skill_ids: typeof r.skill_ids === 'string' ? JSON.parse(r.skill_ids) : r.skill_ids,
    }));
  }

  async close() {
    if (this._db) await new Promise((resolve) => this._db.close(resolve));
  }
}

// ── TelemetryStore — public API ───────────────────────────────────────────────

export class TelemetryStore {
  /**
   * @param {MemoryStore|DuckDBStore} [store]  injectable backend (default: MemoryStore)
   */
  constructor(store = null) {
    this._store = store ?? new MemoryStore();
  }

  async init() { return this._store.init(); }

  /**
   * Record the outcome of a single router query.
   *
   * @param {{ task: string, skillIds: string[], success: boolean, latencyMs?: number, tokenCount?: number }} opts
   * @returns {Promise<string>}  query_id (UUID)
   */
  async logQuery({ task, skillIds = [], success, latencyMs = 0, tokenCount = 0 }) {
    const row = {
      query_id:    randomUUID(),
      task,
      skill_ids:   skillIds,
      success:     Boolean(success),
      latency_ms:  latencyMs,
      token_count: tokenCount,
      ts:          new Date().toISOString(),
    };
    await this._store.insert(row);
    return row.query_id;
  }

  /**
   * Compute success rate for a single skill across all logged queries.
   *
   * @param {string} skillId
   * @returns {Promise<{ skillId, queryCount, successCount, successRate }|null>}
   */
  async getSuccessRate(skillId) {
    const rows = await this._store.queryAll({ skillId });
    if (rows.length === 0) return null;
    const successCount = rows.filter((r) => r.success).length;
    return {
      skillId,
      queryCount:   rows.length,
      successCount,
      successRate:  Math.round((successCount / rows.length) * 10000) / 10000,
    };
  }

  /**
   * Aggregate success rates for every skill that appears in the log.
   *
   * @returns {Promise<Map<string, { queryCount, successCount, successRate }>>}
   */
  async allSuccessRates() {
    const rows = await this._store.queryAll();
    const map  = new Map();

    for (const row of rows) {
      for (const id of row.skill_ids) {
        if (!map.has(id)) map.set(id, { queryCount: 0, successCount: 0 });
        const s = map.get(id);
        s.queryCount++;
        if (row.success) s.successCount++;
      }
    }

    for (const [id, s] of map) {
      s.successRate = Math.round((s.successCount / s.queryCount) * 10000) / 10000;
    }
    return map;
  }

  /**
   * @param {number} [limit=100]
   * @returns {Promise<object[]>}
   */
  async recentEntries(limit = 100) {
    const rows = await this._store.queryAll();
    return rows.slice(-limit);
  }

  async close() { return this._store.close(); }
}
