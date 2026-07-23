// Postgres(Supabase) 연결 — mysql2/promise 호환 어댑터
// 기존 코드가 `const [rows] = await pool.query<T>(sql, params)` 형태(mysql2)와
// `?` 플레이스홀더를 그대로 쓰도록, pg 위에 얇은 어댑터를 얹는다.
import { Pool, types } from 'pg';

// DATE / TIMESTAMP 를 문자열로 반환 (mysql2 dateStrings:true 와 동일 동작 유지)
types.setTypeParser(1082, (v) => v);          // date  → 'YYYY-MM-DD'
types.setTypeParser(1114, (v) => v);          // timestamp (without tz)
types.setTypeParser(1184, (v) => v);          // timestamptz
types.setTypeParser(1083, (v) => v);          // time
// bigint(int8, oid 20) 를 number 로 (created_at = Date.now() 범위 안전)
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// numeric(oid 1700) 를 number 로 (mysql2 는 decimal 을 문자열로 줬지만 코드가 Number(...) 처리)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

// 최신 pg 는 connstring 의 sslmode=require 를 verify-full 로 처리해 Supabase self-signed
// 체인에서 실패한다. sslmode 파라미터를 제거하고 ssl 객체로만 SSL 을 지정한다.
const connectionString = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/, '');

const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

/** `?` 플레이스홀더 → `$1,$2,...` 로 변환하고 백틱 제거 */
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/`/g, '').replace(/\?/g, () => `$${++i}`);
}

type QueryResultRows<T> = [T, { rowCount: number; fields: unknown[] }];

const adapter = {
  /** mysql2 호환: [rows, meta] 반환 */
  async query<T = Record<string, unknown>[]>(sql: string, params?: unknown[]): Promise<QueryResultRows<T>> {
    const res = await pool.query(toPg(sql), params as unknown[] | undefined);
    return [res.rows as unknown as T, { rowCount: res.rowCount ?? 0, fields: res.fields }];
  },
  pool,
};

export default adapter;
