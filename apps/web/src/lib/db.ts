import { validTimeZone } from "./tz";
import { revisitAsk } from "./revisit-ask";
import { LEGACY_EVENT, readingLean, type ReadingLean, type RevisitAsk, type RevisitEvent } from "./revisit-judge";
import { gunzipSync } from "node:zlib";
import { randomBytes as randomBytesSafe } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homeDay } from "./clock";
import { saleBucket, type SaleKey } from "./sale-bucket";

/**
 * node:sqlite is a built-in module, but some bundlers still try to resolve it
 * statically. Loading it through createRequire keeps it a pure runtime import.
 */
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}
const require_ = createRequire(import.meta.url);
const { DatabaseSync } = require_("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

/**
 * Customer + reading store. SQLite via Node's built-in driver: no dependency,
 * one file to back up, and comfortably fast at our scale.
 *
 * Everything a customer generates is kept here so they can return to it and so
 * we can serve them properly later (see Privacy Policy §4 for retention terms).
 */

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), ".data");
const DB_PATH = join(DATA_DIR, "yaoflow.db");

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL");
  // 10-13 防崩溃 (Neil: 「以后我们怎么避免这种情况」): /admin and the cron jobs now run in their own process (yaoflow-admin,
  // deploy/README-ops.md) — two writers on one file. Without this a write that meets the other's lock fails at once
  // (SQLITE_BUSY); with it, it waits up to 3 s (writes here take milliseconds).
  d.exec("PRAGMA busy_timeout = 3000");
  d.exec("PRAGMA foreign_keys = ON");
  migrate(d);
  _db = d;
  return d;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      first_seen    INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL,
      locale        TEXT,
      orders_count  INTEGER NOT NULL DEFAULT 0,
      spend_cents   INTEGER NOT NULL DEFAULT 0,
      marketing_ok  INTEGER NOT NULL DEFAULT 0,
      note          TEXT
    );

    CREATE TABLE IF NOT EXISTS casts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      cast_at       INTEGER NOT NULL,
      tz_offset     INTEGER NOT NULL,
      locale        TEXT NOT NULL,
      question      TEXT NOT NULL,
      topic         TEXT,
      values_str    TEXT NOT NULL,
      primary_num   INTEGER NOT NULL,
      primary_name  TEXT NOT NULL,
      changed_num   INTEGER,
      changed_name  TEXT,
      changing      TEXT,
      palace        TEXT,
      palace_phase  TEXT,
      world_pos     INTEGER,
      response_pos  INTEGER,
      year_pillar   TEXT,
      month_pillar  TEXT,
      day_pillar    TEXT,
      void_branches TEXT,
      chart_json    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS readings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      cast_id       INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
      customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      tier          TEXT NOT NULL,
      locale        TEXT NOT NULL,
      body_json     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS followups (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      cast_id       INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
      customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      role          TEXT NOT NULL,
      content       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT UNIQUE NOT NULL,
      customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      cast_id       INTEGER REFERENCES casts(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL,
      tier          TEXT NOT NULL,
      amount_cents  INTEGER,
      currency      TEXT,
      email         TEXT,
      status        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emails (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT NOT NULL,
      kind          TEXT NOT NULL,
      email         TEXT NOT NULL,
      sent_at       INTEGER NOT NULL,
      status        TEXT NOT NULL,
      detail        TEXT,
      UNIQUE(session_id, kind)
    );

    CREATE TABLE IF NOT EXISTS revisits (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT UNIQUE NOT NULL,
      cast_id       INTEGER REFERENCES casts(id) ON DELETE CASCADE,
      customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      email         TEXT NOT NULL,
      locale        TEXT NOT NULL,
      tier          TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      due_at        INTEGER NOT NULL,
      window_days   INTEGER NOT NULL,
      timing_quote  TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      sent_at       INTEGER
    );

    -- ---- 成本与余额 (09-21): the two halves of a profit line that Stripe
    -- cannot tell us. costs is what Neil types in (server, Resend, domain,
    -- anything one-off); provider_balances is a daily reading of each model
    -- provider's remaining credit, so spend can be derived from the drop.
    -- ---- Stripe 账本 (09-22): the balance transactions themselves, which are
    -- the only complete record of money. Orders miss subscription invoices
    -- entirely (a membership has no order row), and a refund's kept fee lives
    -- nowhere else. Everything here is already in the settlement currency.
    CREATE TABLE IF NOT EXISTS stripe_txns (
      id          TEXT PRIMARY KEY,
      created     INTEGER NOT NULL,
      type        TEXT NOT NULL,          -- charge | payment | refund | adjustment | payout …
      currency    TEXT NOT NULL,
      amount      INTEGER NOT NULL,       -- minor units, negative for money going out
      fee         INTEGER NOT NULL,
      net         INTEGER NOT NULL,
      source      TEXT,                   -- ch_… / re_… / po_…
      payment_intent TEXT,                -- what ties it back to an order, when there is one
      synced_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stripe_txns_created ON stripe_txns(created);
    CREATE INDEX IF NOT EXISTS idx_stripe_txns_pi ON stripe_txns(payment_intent);

    CREATE TABLE IF NOT EXISTS costs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      kind         TEXT NOT NULL,          -- monthly | once
      label        TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,       -- in the currency column
      currency     TEXT NOT NULL DEFAULT 'USD',
      started_on   TEXT,                   -- YYYY-MM-DD, monthly only
      ended_on     TEXT,                   -- YYYY-MM-DD, monthly only (null = still running)
      spent_on     TEXT,                   -- YYYY-MM-DD, once only
      note         TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_balances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      provider    TEXT NOT NULL,
      at          INTEGER NOT NULL,
      currency    TEXT NOT NULL,
      balance     REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_provider_balances ON provider_balances(provider, at);
    -- 09-27 (Neil: 「能统计每个卦象页面被打开的次数吗？除了我从 admin 里面打开的」): per reading, not per visitor
    CREATE TABLE IF NOT EXISTS reading_views (
      session_id TEXT PRIMARY KEY,
      n          INTEGER NOT NULL DEFAULT 0,
      first_at   INTEGER NOT NULL,
      last_at    INTEGER NOT NULL
    );
    -- 09-27 (Neil: 「按 AWS 的实时账单来算」): Cost Explorer, one row per UTC day and AWS service, overwritten on each read
    CREATE TABLE IF NOT EXISTS aws_cost_daily (
      day        TEXT NOT NULL,
      service    TEXT NOT NULL,
      usd        REAL NOT NULL,
      estimated  INTEGER NOT NULL DEFAULT 0,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (day, service)
    );

    -- ---- 大众一卦 (09-21, A2): the day's three public charts, one row per
    -- language per pile. The figures are derived from the day (lib/daily.ts);
    -- only the words are stored, written the first time someone asks for them.
    CREATE TABLE IF NOT EXISTS daily_casts (
      day          TEXT NOT NULL,
      locale       TEXT NOT NULL,
      pile         INTEGER NOT NULL,
      values_str   TEXT NOT NULL,
      primary_num  INTEGER NOT NULL,
      note         TEXT NOT NULL,
      watch        TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      PRIMARY KEY (day, locale, pile)
    );

    -- ---- 封卦 (09-21, A1): strangers who asked to be told when a sealed
    -- prediction resolves. One row per address per seal; notified once.
    CREATE TABLE IF NOT EXISTS seal_watchers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      revisit_id   INTEGER NOT NULL REFERENCES revisits(id) ON DELETE CASCADE,
      email        TEXT NOT NULL,
      locale       TEXT,
      created_at   INTEGER NOT NULL,
      notified_at  INTEGER,
      UNIQUE(revisit_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_seal_watchers_pending ON seal_watchers(revisit_id, notified_at);

    CREATE TABLE IF NOT EXISTS referrals (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at            INTEGER NOT NULL,
      via                   TEXT NOT NULL,
      referrer_customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      referred_customer_id  INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      referred_session_id   TEXT NOT NULL,
      token                 TEXT UNIQUE NOT NULL,
      tier                  TEXT NOT NULL DEFAULT 'deep',
      expires_at            INTEGER NOT NULL,
      used_at               INTEGER,
      redeem_session_id     TEXT,
      input_json            TEXT,
      locale                TEXT
    );

    -- ---- grants (09-10, 裂变 V1): a free reading someone else's action earned ----
    -- gift_cast    a paying reader's "ask one for a friend" link (one per paid deep reading, 14 days)
    -- invite_light the first light reading for a newcomer who arrived through a shared cast
    CREATE TABLE IF NOT EXISTS grants (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      token                TEXT UNIQUE NOT NULL,
      kind                 TEXT NOT NULL,
      tier                 TEXT NOT NULL,
      created_at           INTEGER NOT NULL,
      expires_at           INTEGER NOT NULL,
      from_customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      from_session_id      TEXT,
      via                  TEXT,
      locale               TEXT,
      used_at              INTEGER,
      redeem_session_id    TEXT,
      input_json           TEXT,
      claimed_email        TEXT,
      claimed_customer_id  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_grants_from ON grants(kind, from_session_id);
    CREATE INDEX IF NOT EXISTS idx_grants_redeem ON grants(redeem_session_id);

    -- ---- pairs (09-10, 裂变 V2 ⑥ 同题合参): two people cast on the same matter ----
    -- The inviter's reading (a_session_id) mints one invite; the invitee's reading
    -- is a grant of kind 'joint' (b_session_id = gr_<token>). framing is the wording
    -- both sides see; the inviter's own question never leaves their reading.
    CREATE TABLE IF NOT EXISTS pairs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      token          TEXT UNIQUE NOT NULL,
      created_at     INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL,
      topic          TEXT NOT NULL,
      framing        TEXT NOT NULL,
      a_session_id   TEXT UNIQUE NOT NULL,
      a_customer_id  INTEGER,
      a_locale       TEXT NOT NULL,
      b_session_id   TEXT,
      b_customer_id  INTEGER,
      b_locale       TEXT,
      claimed_at     INTEGER,
      joint_json     TEXT,
      dissolved_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_pairs_b ON pairs(b_session_id);

    -- ---- cases (09-10, 裂变 V2 ⑦ 公开卦例): a reading its owner chose to publish, anonymously ----
    -- framing is the public wording of the question (NULL = none, the default);
    -- fields_json holds the two or three plain-language passages shown, in the reading's language.
    CREATE TABLE IF NOT EXISTS cases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id       TEXT UNIQUE NOT NULL,
      session_id      TEXT UNIQUE NOT NULL,
      cast_id         INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
      customer_id     INTEGER,
      locale          TEXT NOT NULL,
      tier            TEXT NOT NULL,
      topic           TEXT,
      framing         TEXT,
      fields_json     TEXT NOT NULL,
      published_at    INTEGER NOT NULL,
      unpublished_at  INTEGER,
      hidden_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cases_pub ON cases(locale, published_at DESC);

    -- ---- 公开卦例回礼 (09-26, Neil: 公开一卦就回一卦，自己用或送人，可以一直传下去) ----
    -- ---- 今天的三卦 互动 (09-26): who picked which pile, and whether it landed; anonymous browser session tags only ----
    CREATE TABLE IF NOT EXISTS daily_votes (
      day       TEXT NOT NULL,
      bs        TEXT NOT NULL,
      pile      INTEGER NOT NULL,
      reaction  TEXT,
      at        INTEGER NOT NULL,
      PRIMARY KEY (day, bs, pile)
    );
    -- ---- 每日三卦邮件 (09-26): double opt-in; confirmed_at set by the link in the confirmation mail ----
    CREATE TABLE IF NOT EXISTS daily_subs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      locale        TEXT NOT NULL,
      tz            TEXT,
      token         TEXT UNIQUE NOT NULL,
      created_at    INTEGER NOT NULL,
      confirmed_at  INTEGER,
      unsub_at      INTEGER,
      last_day      TEXT,
      sent_count    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS case_rewards (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      case_sid      TEXT UNIQUE NOT NULL,
      customer_id   INTEGER,
      email         TEXT,
      created_at    INTEGER NOT NULL,
      choice        TEXT,
      chosen_at     INTEGER,
      grant_token   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_case_rewards_who ON case_rewards(customer_id, created_at);

    -- ---- accounts: magic-link login (no passwords anywhere) ----
    CREATE TABLE IF NOT EXISTS login_tokens (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL,
      token_hash    TEXT UNIQUE NOT NULL,
      locale        TEXT,
      next_path     TEXT,
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      used_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens(email, created_at DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);

    -- ---- subscriptions: Stripe Billing is the source of truth, this is the mirror ----
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id             INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      stripe_customer_id      TEXT,
      stripe_subscription_id  TEXT UNIQUE NOT NULL,
      status                  TEXT NOT NULL,
      plan                    TEXT NOT NULL,
      period_start            INTEGER,
      period_end              INTEGER,
      cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
      created_at              INTEGER NOT NULL,
      updated_at              INTEGER NOT NULL,
      synced_at               INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id, updated_at DESC);

    -- one row per reading a subscription paid for; sub_<id> is its "session" everywhere downstream
    CREATE TABLE IF NOT EXISTS sub_uses (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id   INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at        INTEGER NOT NULL,
      tier              TEXT NOT NULL,
      locale            TEXT,
      token             TEXT UNIQUE NOT NULL,
      input_json        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sub_uses_sub ON sub_uses(subscription_id, tier, created_at);

    -- the painted door (PAYWALL=gift): a priced button tapped during the
    -- promotion test; gf_<token> is its "session" everywhere downstream.
    -- amount_shown is the price on the button at the tap — the intent signal —
    -- never money taken.
    CREATE TABLE IF NOT EXISTS gifts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      token             TEXT UNIQUE NOT NULL,
      created_at        INTEGER NOT NULL,
      tier              TEXT NOT NULL,
      locale            TEXT,
      currency          TEXT,
      amount_shown      INTEGER,
      first_deep        INTEGER NOT NULL DEFAULT 0,
      email             TEXT,
      customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      via               TEXT,
      input_json        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      at            INTEGER NOT NULL,
      kind          TEXT NOT NULL,
      detail        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ops_kind_at ON ops_events(kind, at DESC);

    -- Every email handed to Resend, keyed by Resend's id, and what Resend
    -- later reports about it through the webhook (09-11). Timestamps and
    -- counts only: no IP address, no mail client — the same rule as the
    -- site's own analytics. Replies sent from Gmail as support@ go through
    -- the same Resend account, so they land here too (kind "other").
    CREATE TABLE IF NOT EXISTS mail_log (
      id            TEXT PRIMARY KEY,
      created_at    INTEGER NOT NULL,
      kind          TEXT NOT NULL,
      email         TEXT NOT NULL,
      subject       TEXT,
      session_id    TEXT,
      customer_id   INTEGER,
      delivered_at  INTEGER,
      delayed_at    INTEGER,
      opened_at     INTEGER,
      opens         INTEGER NOT NULL DEFAULT 0,
      last_open_at  INTEGER,
      bounced_at    INTEGER,
      bounce_note   TEXT,
      complained_at INTEGER,
      failed_at     INTEGER,
      fail_note     TEXT,
      last_event    TEXT,
      last_event_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_mail_log_email ON mail_log(email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mail_log_at ON mail_log(created_at DESC);

    -- webhook deliveries already applied (Svix retries the same message id)
    CREATE TABLE IF NOT EXISTS mail_events (
      svix_id       TEXT PRIMARY KEY,
      email_id      TEXT NOT NULL,
      type          TEXT NOT NULL,
      at            INTEGER NOT NULL
    );

    -- 10-12 多段应期 (进度表 §四 29): one row per earlier window of a reading that names several — the day after it
    -- closes, a short letter asks whether that stretch brought a stir. The answer (seen | none | unsure) is kept here and
    -- never scores the reading: the verdict waits for the revisit after the last window.
    CREATE TABLE IF NOT EXISTS revisit_checkpoints (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      revisit_id  INTEGER NOT NULL REFERENCES revisits(id) ON DELETE CASCADE,
      seq         INTEGER NOT NULL,
      start_at    INTEGER NOT NULL,
      end_at      INTEGER NOT NULL,
      due_at      INTEGER NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      sent_at     INTEGER,
      answer      TEXT,
      answer_at   INTEGER,
      UNIQUE(revisit_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_due ON revisit_checkpoints(status, due_at);

    -- 10-12 「2027，這件事的年卦」预约名单 (进度表 §四 38): an address and the kind of matter, nothing else; one row
    -- per address (a second sign-up updates the kind). Validation only — ≥ 100 before the product is built.
    CREATE TABLE IF NOT EXISTS year_waitlist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL,
      locale      TEXT NOT NULL,
      via         TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    -- 10-12 解籤 (进度表 §四 36): one row per lot a reader brings — which lot, where it was drawn, their situation and
    -- question; the cast that followed (and so its matter) once there is one; the personal reading of the lot when bought.
    CREATE TABLE IF NOT EXISTS qian_draws (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      token         TEXT UNIQUE NOT NULL,
      set_name      TEXT NOT NULL,
      num           INTEGER NOT NULL,
      temple        TEXT,
      situation     TEXT NOT NULL,
      question      TEXT NOT NULL,
      locale        TEXT NOT NULL,
      device        TEXT,
      customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL,
      cast_id       INTEGER REFERENCES casts(id) ON DELETE SET NULL,
      matter_id     INTEGER,
      paid_session  TEXT,
      paid_at       INTEGER,
      email         TEXT,
      currency      TEXT,
      amount_minor  INTEGER,
      personal_json TEXT,
      personal_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_qian_cast ON qian_draws(cast_id);

    CREATE INDEX IF NOT EXISTS idx_revisits_due ON revisits(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_casts_customer ON casts(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_readings_cast ON readings(cast_id);
    CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
    CREATE INDEX IF NOT EXISTS idx_followups_cast ON followups(cast_id, created_at);
  `);
  // additive columns (SQLite has no ADD COLUMN IF NOT EXISTS)
  addColumn(d, "revisits", "outcome", "TEXT");          // hit | miss | open — the customer's own verdict
  addColumn(d, "revisits", "outcome_at", "INTEGER");
  addColumn(d, "orders", "via", "TEXT");                // share code that referred this buyer (first touch)
  addColumn(d, "orders", "first_deep", "INTEGER");      // 1 = deep reading sold at the first-time (light) price
  addColumn(d, "subscriptions", "currency", "TEXT");    // ISO code the member pays in (per-market pricing, 09-04)
  addColumn(d, "subscriptions", "amount_minor", "INTEGER"); // what each renewal charges, in that currency's minor unit
  addColumn(d, "orders", "payment_intent", "TEXT");     // Stripe pi_… behind a paid order: what a refund or a dispute names (09-10)
  addColumn(d, "orders", "refunded_at", "INTEGER");     // when the money went back
  // 09-29 对账: an allowance unit that delivered nothing (a double tap, a cast that never generated) is voided, not deleted — it stays on the ledger, it stops counting
  addColumn(d, "sub_uses", "voided_at", "INTEGER");
  addColumn(d, "sub_uses", "void_reason", "TEXT");
  addColumn(d, "orders", "ledger_tries", "INTEGER");    // 09-22: give up on rows Stripe will never return
  // 09-22 (Neil: 「这个客户明明是香港的，为什么收人民币呢」). The dashboard has
  // been reading cur_src and tz_name for days, but they only ever existed
  // inside gifts.input_json — for a real paid order there was no record of why
  // a currency was picked at all, and answering that question meant digging
  // through Stripe metadata by hand. Four columns, written at the point of sale.
  addColumn(d, "orders", "cur_src", "TEXT");            // chosen | tz | edge | lang | default
  addColumn(d, "orders", "tz_name", "TEXT");            // the device clock we saw
  addColumn(d, "orders", "edge_country", "TEXT");       // what the edge said the IP was
  addColumn(d, "orders", "card_country", "TEXT");       // the card's own country — the truth, known only afterwards
  // 09-22: a membership invoice has no order row, so a paying member showed
  // 「—」 in the customer list and 「HK$18 · 1 单」 on her profile while she was
  // also paying HK$68 a month. The charge carries Stripe's customer id, which
  // the subscriptions mirror maps back to one of ours.
  addColumn(d, "stripe_txns", "stripe_customer", "TEXT");
  addColumn(d, "stripe_txns", "fee_tax", "INTEGER");   // 09-26: the part of `fee` that is sales tax Managed Payments withheld — the government's, not Stripe's
  // 09-30 (Neil: 「这 500USD 是 stripe 费用抵扣券啊，又不是真的 500USD」): Stripe's balance_type — 'payments' is money,
  // 'fee_credits' is a coupon against Stripe's own fees (docs.stripe.com/stripe-fee-credits). Rows synced before this
  // column existed are 'payments' except the funding line itself.
  addColumn(d, "stripe_txns", "balance_type", "TEXT");
  d.exec("UPDATE stripe_txns SET balance_type = CASE WHEN type = 'fee_credit_funding' THEN 'fee_credits' ELSE 'payments' END WHERE balance_type IS NULL");
  addColumn(d, "customers", "alt_emails", "TEXT");   // 09-22: other addresses the same person paid with
  addColumn(d, "subscriptions", "cancel_at", "INTEGER"); // 09-23: Stripe's other way of scheduling a cancellation
  // 09-23 挽回（Neil: 「如果有人取消的话，就自动发送挽回方案的邮件」）
  // 09-23: followups written before saveFollowup looked up the cast's owner
  d.exec("UPDATE followups SET customer_id = (SELECT customer_id FROM casts WHERE casts.id = followups.cast_id) WHERE customer_id IS NULL");
  addColumn(d, "customers", "marketing_at", "INTEGER");  // 09-23: when they said yes; before 09-23 = the "three at most" promise
  addColumn(d, "customers", "headsup_off", "INTEGER");
  addColumn(d, "revisits", "foretold_at", "INTEGER");   // 09-23: the 应期 heads-up for this window went out (before the window)   // 09-23: opted out of the 应期 heads-up letters
  addColumn(d, "revisits", "dayof_at", "INTEGER");      // 09-23 粘性: the short letter on the first named day went out (or was passed over)
  // 09-23 粘性 (用户粘性数据分析-0923.md): 「记一笔进展」— what happened since, answered inside the same cast
  d.exec(`
    CREATE TABLE IF NOT EXISTS progress_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cast_id     INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      note        TEXT NOT NULL,
      reply       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS progress_notes_cast ON progress_notes(cast_id);
  `);
  // 09-29 产品重心从「一卦」挪到「一件事」(用户数据与需求全面分析-0929.md): the matter is stored, not recomputed
  d.exec(`
    CREATE TABLE IF NOT EXISTS matters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      last_at     INTEGER NOT NULL,
      title       TEXT,
      title_by    TEXT,
      topic       TEXT
    );
    CREATE INDEX IF NOT EXISTS matters_customer ON matters(customer_id, last_at);
    CREATE TABLE IF NOT EXISTS matter_sessions (
      session_id  TEXT PRIMARY KEY,
      matter_id   INTEGER NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      how         TEXT
    );
  `);
  // 09-29 补发回礼 (Neil: 「除去自己互赠的，其他有效分享都全部补上」): some past newcomers left no address, so a
  // make-up thank-you can have no friend on record. The friend column loses NOT NULL UNIQUE; "one thank-you per
  // friend" moves to a partial unique index that the make-up rows (via backfill:…) stand outside of.
  {
    const t = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='referrals'").get() as { sql: string } | undefined;
    if (t && /referred_customer_id\s+INTEGER NOT NULL UNIQUE/.test(t.sql)) {
      d.exec("PRAGMA foreign_keys = OFF");
      d.exec(`BEGIN;
        CREATE TABLE referrals_v2 (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at            INTEGER NOT NULL,
          via                   TEXT NOT NULL,
          referrer_customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          referred_customer_id  INTEGER REFERENCES customers(id) ON DELETE CASCADE,
          referred_session_id   TEXT NOT NULL,
          token                 TEXT UNIQUE NOT NULL,
          tier                  TEXT NOT NULL DEFAULT 'deep',
          expires_at            INTEGER NOT NULL,
          used_at               INTEGER,
          redeem_session_id     TEXT,
          input_json            TEXT,
          locale                TEXT
        );
        INSERT INTO referrals_v2 SELECT id, created_at, via, referrer_customer_id, referred_customer_id, referred_session_id, token, tier, expires_at, used_at, redeem_session_id, input_json, locale FROM referrals;
        DROP TABLE referrals;
        ALTER TABLE referrals_v2 RENAME TO referrals;
        COMMIT;`);
      d.exec("PRAGMA foreign_keys = ON");
    }
    d.exec("CREATE UNIQUE INDEX IF NOT EXISTS referrals_friend_once ON referrals(referred_customer_id) WHERE referred_customer_id IS NOT NULL AND via NOT LIKE 'backfill:%'");
  }
  // 09-29 分享者回礼 (Neil: 「没有回礼人家怎么愿意分享呢」): a share link now carries the sharer's own ref
  d.exec(`
    CREATE TABLE IF NOT EXISTS share_refs (
      ref          TEXT PRIMARY KEY,
      session_id   TEXT UNIQUE NOT NULL,
      customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      device       TEXT,
      created_at   INTEGER NOT NULL
    );
  `);
  addColumn(d, "grants", "ref", "TEXT");           // 09-29: the share ref a newcomer's free reading came through
  // 09-29 Neil: 客户档案加最后登录时间. Sessions are deleted on logout/expiry, so the time lives on the customer;
  // the past is recovered from what is left (live sessions, used sign-in links)
  addColumn(d, "customers", "last_login_at", "INTEGER");
  // 09-29 会员裂变: a member's thank-you reading goes straight into the current allowance (1), not a link
  addColumn(d, "referrals", "to_allowance", "INTEGER");
  addColumn(d, "grants", "note", "TEXT");            // 09-29: one line the giver wrote for the friend (送一卦)
  // 09-29 会员增购包 (Neil: 15 份 NT$699): a member's bought packs, and which allowance uses came out of them
  // 09-30 补额度 (进度表 24, 客服: #838): units the owner adds to a member's CURRENT period by hand, with a reason.
  // They reset with the period and never carry. Not a void of a used unit — a delivered reading stays used.
  d.exec(`CREATE TABLE IF NOT EXISTS allowance_grants (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      tier         TEXT NOT NULL,
      units        INTEGER NOT NULL,
      reason       TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_allowance_grants_cust ON allowance_grants(customer_id, created_at);`);
  // 10-02 付款后自动登录 (Neil: 「都做吧」, lib/pay-login.ts): the one-time proof that a browser started this checkout —
  // only a hash of the nonce cookie, keyed by the Stripe checkout / payment intent id. sessions.via = 'pay' marks a
  // session made that way (shorter, and dropped when the owner later signs in with an email link).
  d.exec(`CREATE TABLE IF NOT EXISTS pay_logins (
      sid         TEXT PRIMARY KEY,
      nonce_hash  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      used_at     INTEGER
    );`);
  addColumn(d, "sessions", "via", "TEXT");
  d.exec(`CREATE TABLE IF NOT EXISTS member_packs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      session_id      TEXT UNIQUE NOT NULL,
      payment_intent  TEXT,
      units           INTEGER NOT NULL,
      currency        TEXT,
      amount_minor    INTEGER,
      created_at      INTEGER NOT NULL,
      refunded_at     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_member_packs_cust ON member_packs(customer_id, created_at);`);
  addColumn(d, "sub_uses", "from_pack", "INTEGER");
  // 10-02 小包与单买抵扣 (Neil: 「1，出一个小包」「2，3 都做吧」): which pack (small 5 / large 15), and what this
  // period's single extras and small packs took off a large one (its units are then what it added, not 15)
  addColumn(d, "member_packs", "size", "TEXT");
  addColumn(d, "member_packs", "credit_minor", "INTEGER");
  addColumn(d, "member_packs", "credit_units", "INTEGER");
  // 10-23 进度表 102 (Neil: 「折成会员费，1009 不续费的话，就给他延 3 天的会员」): under the 通卡 model a member reads without a
  // count, so a pack's unused units can never be spent — they were converted: a credit on the member's Stripe balance
  // (`balance`, converted_minor in the pack's currency) or days on a pass that does not renew (`extend`)
  addColumn(d, "member_packs", "converted_at", "INTEGER");
  addColumn(d, "member_packs", "converted_units", "INTEGER");
  addColumn(d, "member_packs", "converted_minor", "INTEGER");
  addColumn(d, "member_packs", "converted_how", "TEXT");
  // a member's extra full reading at the light price (Stripe metadata member_addon), said on the order itself
  addColumn(d, "orders", "member_addon", "INTEGER");
  // 10-02 存到信箱 (Neil: 「做 3 和 4 吧」): a cast the reader chose to keep — the only unpaid, signed-out cast the server
  // ever holds, and only because they asked. One letter now, one reminder about a day later, gone after 30 days.
  d.exec(`CREATE TABLE IF NOT EXISTS saved_casts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      token         TEXT UNIQUE NOT NULL,
      email         TEXT NOT NULL,
      locale        TEXT NOT NULL,
      question      TEXT NOT NULL,
      values_json   TEXT NOT NULL,
      cast_at       INTEGER NOT NULL,
      tz_offset     INTEGER NOT NULL,
      hex           TEXT,
      teaser        TEXT,
      currency      TEXT,
      created_at    INTEGER NOT NULL,
      sent_at       INTEGER,
      opened_at     INTEGER,
      followup_at   INTEGER,
      followup_note TEXT,
      stopped       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_saved_casts_email ON saved_casts(email, created_at);
    CREATE INDEX IF NOT EXISTS idx_saved_casts_due ON saved_casts(followup_at, created_at);`);
  // 10-04 挽回信 (Neil: 「91人你现在全部补发一封」): the same row brings an unpaid cast back from a reminder letter's link;
  // origin 'recover' — never counted as the reader's own save, never followed by the saved-cast reminder
  addColumn(d, "saved_casts", "origin", "TEXT");
  // 10-12 B② 第 3–4 卦存这件事: the one letter when the first time the chart names comes near (origin 'matter')
  addColumn(d, "saved_casts", "remind_at", "INTEGER");
  addColumn(d, "saved_casts", "remind_when", "TEXT");
  addColumn(d, "saved_casts", "remind_note", "TEXT");
  // 10-03 按人看 (lib/browsers.ts): one row per browser id (yf_bid), its tabs, and whose it turned out to be
  d.exec(`CREATE TABLE IF NOT EXISTS browsers (
      bid          TEXT PRIMARY KEY,
      first_at     INTEGER NOT NULL,
      first_day    TEXT,
      first_c      TEXT,
      first_ref    TEXT,
      first_path   TEXT,
      first_locale TEXT,
      last_at      INTEGER NOT NULL,
      last_day     TEXT,
      days         INTEGER NOT NULL DEFAULT 0,
      casts        INTEGER NOT NULL DEFAULT 0,
      teased       INTEGER NOT NULL DEFAULT 0,
      clicks       INTEGER NOT NULL DEFAULT 0,
      checkouts    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_browsers_last ON browsers(last_at);
    CREATE TABLE IF NOT EXISTS tab_browsers (s TEXT PRIMARY KEY, bid TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tab_browsers_bid ON tab_browsers(bid);
    CREATE TABLE IF NOT EXISTS browser_links (
      bid          TEXT NOT NULL,
      customer_id  INTEGER NOT NULL,
      first_at     INTEGER NOT NULL,
      last_at      INTEGER NOT NULL,
      how          TEXT,
      PRIMARY KEY (bid, customer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_browser_links_customer ON browser_links(customer_id);`);
  // 10-03 起卦记录 (lib/cast-log.ts, Neil: 「从一个人第一次摇卦开始，记录他的所有问题和卦象……」→「只改隐私政策，不告诉读者」):
  // every cast that reaches the free line (or the cap's note), per browser, filed into threads — one thread is one matter
  // of one person. Kept 365 days; health / sex-life / criminal-record questions keep their category, not their words
  // (CAST_LOG_SENSITIVE). nudge_variants are the words shown before the price on the 2nd+ cast of a matter, learned by
  // who pays within 72 hours (lib/nudge.ts); nudge_runs is the learner's own diary (drafts, retirements, purges).
  d.exec(`CREATE TABLE IF NOT EXISTS cast_threads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      bid          TEXT NOT NULL,
      title        TEXT,
      topic        TEXT,
      sensitive    TEXT,
      how          TEXT,
      first_at     INTEGER NOT NULL,
      last_at      INTEGER NOT NULL,
      n            INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cast_threads_bid ON cast_threads(bid, last_at);
    CREATE TABLE IF NOT EXISTS cast_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      bid          TEXT NOT NULL,
      s            TEXT,
      at           INTEGER NOT NULL,
      tz           INTEGER NOT NULL DEFAULT 0,
      locale       TEXT,
      question     TEXT,
      sensitive    TEXT,
      values_str   TEXT NOT NULL,
      primary_num  INTEGER NOT NULL,
      changed_num  INTEGER,
      topic        TEXT,
      teaser       TEXT,
      capped       INTEGER NOT NULL DEFAULT 0,
      thread_id    INTEGER,
      thread_n     INTEGER,
      thread_how   TEXT,
      style        TEXT,
      nudge        TEXT,
      nudge_seen   INTEGER,
      paid_sid     TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      UNIQUE(bid, at)
    );
    CREATE INDEX IF NOT EXISTS idx_cast_log_thread ON cast_log(thread_id, at);
    CREATE INDEX IF NOT EXISTS idx_cast_log_created ON cast_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_cast_log_s ON cast_log(s);
    CREATE TABLE IF NOT EXISTS nudge_variants (
      id           TEXT PRIMARY KEY,
      slot         TEXT NOT NULL,
      status       TEXT NOT NULL,
      source       TEXT NOT NULL,
      texts_json   TEXT NOT NULL,
      parent       TEXT,
      notes        TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      status_why   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nudge_variants_slot ON nudge_variants(slot, status);
    CREATE TABLE IF NOT EXISTS nudge_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      at           INTEGER NOT NULL,
      kind         TEXT NOT NULL,
      detail       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nudge_runs_kind ON nudge_runs(kind, at);`);
  // 10-03 分组与每周分析 (Neil: 「AI能调取所有的记录然后自学习自己优化吗」→「两个都做吧」): the device class and in-app
  // browser a cast came from, whether its free line leaned good or bad (a light model's reading), a block version meant
  // for one kind of question only, and the weekly AI reports over the cast log (lib/segments.ts, lib/ai-review.ts)
  addColumn(d, "cast_log", "device", "TEXT");
  addColumn(d, "cast_log", "app", "TEXT");
  addColumn(d, "cast_log", "lean", "TEXT");
  addColumn(d, "nudge_variants", "segment", "TEXT");
  // 10-03 说法核对: when a light model last read an AI version as every reader at its stage would (lib/nudge.ts claimCheck)
  addColumn(d, "nudge_variants", "checked_at", "INTEGER");
  // 10-04 按人写的引导: the block written for this reader on this cast ({locale,title,body,cta}), so a refresh shows the same words
  addColumn(d, "cast_log", "nudge_text", "TEXT");
  // 10-04 排除会员 (Neil: 「这页应该要标明和排除会员的吧？」): the page said a membership covered this cast (no price, no block)
  addColumn(d, "cast_log", "member", "INTEGER");
  // 10-04 进度表 30 「一件事」记忆的时效与边界: the reader's switch — this matter's earlier casts and notes stay out of its readings
  addColumn(d, "matters", "no_context", "INTEGER");
  // 10-05 不顺卦话术: the lean of the free line the reader had last seen when this cast's block was picked (lib/nudge.ts leanSeen)
  addColumn(d, "cast_log", "nudge_lean", "TEXT");
  d.exec(`CREATE TABLE IF NOT EXISTS ai_reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      at           INTEGER NOT NULL,
      by           TEXT,
      status       TEXT NOT NULL,
      window_from  INTEGER NOT NULL,
      window_to    INTEGER NOT NULL,
      people       INTEGER,
      payers       INTEGER,
      body_json    TEXT,
      error        TEXT,
      finished_at  INTEGER
    );`);
  // 09-30: last_seen catches up with what signed-in sessions and casts already know (idempotent — MAX)
  d.exec(`UPDATE customers SET last_seen = MAX(last_seen,
      COALESCE((SELECT MAX(last_seen) FROM sessions WHERE customer_id = customers.id), 0),
      COALESCE((SELECT MAX(created_at) FROM casts WHERE customer_id = customers.id), 0))`);
  d.exec(`UPDATE customers SET last_login_at = (
      SELECT MAX(t) FROM (
        SELECT MAX(created_at) AS t FROM sessions WHERE customer_id = customers.id
        UNION ALL SELECT MAX(used_at) FROM login_tokens WHERE lower(email) = lower(customers.email) AND used_at IS NOT NULL
      ))
    WHERE last_login_at IS NULL AND (
      EXISTS (SELECT 1 FROM sessions WHERE customer_id = customers.id)
      OR EXISTS (SELECT 1 FROM login_tokens WHERE lower(email) = lower(customers.email) AND used_at IS NOT NULL))`);
  addColumn(d, "casts", "matter_id", "INTEGER");   // 09-29: which matter this cast belongs to
  addColumn(d, "casts", "matter_how", "TEXT");     // model | rule | reader | backfill — how it was filed
  addColumn(d, "casts", "split_from_matter", "INTEGER"); // 10-23 进度表 98: the matter a 「分開」 took it out of — the way back for 24 h (lib/reread.ts unsplitCast)
  addColumn(d, "casts", "split_at", "INTEGER");          // 10-23: when that split happened
  addColumn(d, "orders", "campaign", "TEXT");      // 09-23: the ?c= tag the buyer arrived with (first touch)
  addColumn(d, "orders", "browser_sid", "TEXT");   // 09-23: their browser session — joins an order to its events
  addColumn(d, "subscriptions", "cancel_feedback", "TEXT");    // the reason picked in Stripe's portal (too_expensive / unused …)
  addColumn(d, "subscriptions", "cancel_comment", "TEXT");     // their own words, if they wrote any
  addColumn(d, "subscriptions", "retain_segment", "TEXT");     // heavy / low / normal, fixed at the moment they cancelled
  addColumn(d, "subscriptions", "retain_confirm_at", "INTEGER"); // service confirmation sent
  addColumn(d, "subscriptions", "retain_winback_at", "INTEGER"); // the one letter three days before the end (or when we decided not to send it)
  addColumn(d, "subscriptions", "retain_winback_kind", "TEXT");  // winback / reminder / skipped:<why>
  addColumn(d, "subscriptions", "renew_notice_at", "INTEGER");
  addColumn(d, "subscriptions", "pass_notice_at", "INTEGER");
  addColumn(d, "cast_log", "outcome_hint", "TEXT");   // 10-14 进度表 46: 「怎樣算有結果？」, private like the question
  addColumn(d, "cast_log", "separate", "INTEGER");    // 10-22 分開: 1 = the reader said this cast is a new matter (lib/solo.ts)
  addColumn(d, "orders", "reread_ok", "INTEGER");     // 10-22 分開: the reader split this reading's cast off a wrong matter — one free re-read is owed
  addColumn(d, "orders", "reread_at", "INTEGER");     // …and when it was taken
  d.exec("CREATE INDEX IF NOT EXISTS idx_cast_log_at ON cast_log(at)");   // 10-14 进度表 42: the one letter 3 days before a one-off month ends
  addColumn(d, "subscriptions", "recap_at", "INTEGER");
  addColumn(d, "subscriptions", "pass_days", "INTEGER");   // 10-22 通卡: 1 / 7 / 30 for a pass_ row (null = an old one-off month, 30)
  addColumn(d, "cases", "posted_at", "INTEGER");          // 09-26: Neil posted this case to Threads (admin drafts)   // 09-26: the month-in-review letter for the current period went out
  addColumn(d, "cases", "featured_at", "INTEGER");      // 10-23 进度表 108 ② 精选: first in the case lists (never in the outcome records, which stay newest-answer-first)
  addColumn(d, "grants", "from_device", "TEXT");    // 09-27 赠送审核 B: the giver's browser (yf_dv)
  addColumn(d, "grants", "claim_device", "TEXT");   // …and the browser that spent it
  addColumn(d, "orders", "credit_coupon", "TEXT");        // 09-26: the Stripe coupon that credits this purchase toward a first membership month
  addColumn(d, "customers", "tz", "TEXT");        // 09-26: the device's IANA zone, last seen (Asia/Taipei) — for the personal page
  addColumn(d, "customers", "tz_at", "INTEGER");
  addColumn(d, "casts", "tz_name", "TEXT");       // 09-26: the IANA zone of the device that cast it  // 09-25 合规: the yearly renewal notice for the current period went out
  addColumn(d, "subscriptions", "welcomed_at", "INTEGER");    // 09-25: the welcome letter went out (once per subscription, whichever path saw it first)
  addColumn(d, "subscriptions", "paused_from", "INTEGER");     // 暂停一个月: no allowance in [paused_from, paused_until)
  addColumn(d, "subscriptions", "paused_until", "INTEGER");
  // 09-30 续订专属: when renewal was turned off (null while it renews). Rows already off before the rule existed are
  // marked 1 — they keep the renew-only perks they signed up with (lib/subscription.ts renewPerks)
  addColumn(d, "subscriptions", "renew_off_at", "INTEGER");
  // 10-10 首月同价: the money of this membership came back (a refund or a chargeback) — it does not count as "been a member"
  addColumn(d, "subscriptions", "refunded_at", "INTEGER");
  d.exec("UPDATE subscriptions SET renew_off_at = 1 WHERE renew_off_at IS NULL AND (cancel_at_period_end = 1 OR cancel_at IS NOT NULL) AND stripe_subscription_id LIKE 'sub_%'");
  // 09-22 (Neil: 「从底层把这个统计弄好」). `orders.status` was one column
  // answering two questions at once — where the money got to (paid / refunded)
  // and why this reading was handed over (gift / subscription / joint / …).
  // A column holds one value, so the 487 "why" rows kept being counted as
  // sales, and a member who also bought something could not be expressed at
  // all. Split in two; `status` stays written for a fortnight as a safety net.
  addColumn(d, "orders", "entitlement_kind", "TEXT");   // 凭什么给他这份解读
  addColumn(d, "orders", "payment_state", "TEXT");      // 钱到哪一步了
  addColumn(d, "orders", "receipt_url", "TEXT");        // 09-25: Stripe's receipt page for this charge — the customer's proof of payment
  addColumn(d, "orders", "tos_ver", "TEXT");            // 09-25 合规: the Terms date the buyer agreed to at checkout (consent proof)
  addColumn(d, "orders", "refund_reason", "TEXT");      // duplicate | technical_failure | requested | dashboard | stripe_support
  addColumn(d, "orders", "dispute", "TEXT");            // open | won | lost — a chargeback on this order
  addColumn(d, "login_tokens", "notify", "INTEGER");    // the sign-in form's "tell me about the launch" box, applied when the link is redeemed
  addColumn(d, "login_tokens", "code_hash", "TEXT");    // 10-02: the six-digit code in the same letter (hashed with the address), for in-app browsers
  addColumn(d, "login_tokens", "code_tries", "INTEGER"); // wrong codes typed against this letter — five and the code is dead (the link still works)
  addColumn(d, "orders", "test_flag", "INTEGER");       // 1 = our own test run, marked from the dashboard; kept out of the per-market numbers (09-12)
  // 10-07 首次付费保证补洞: the identifier Stripe gives the card / wallet / Alipay account that paid ("card:…", "alipay:…";
  // never a card number) — '' = looked, none given; NULL = not looked yet (lib/card-fp.ts). Only for "once per person".
  addColumn(d, "orders", "card_fp", "TEXT");
  d.exec("CREATE INDEX IF NOT EXISTS idx_orders_card_fp ON orders(card_fp)");
  d.exec("CREATE INDEX IF NOT EXISTS idx_orders_cast ON orders(cast_id)"); // 10-13: the 解籤 list asks per lot whether its cast was paid
  addColumn(d, "gifts", "upgraded_from", "TEXT");       // the light gift this deep gift upgraded in place (09-18): the light page links here instead of offering again
  addColumn(d, "customers", "test_flag", "INTEGER");    // 1 = one of our own addresses (09-21): the customer, their orders, memberships, revisits and referrals all leave the dashboard numbers
  addColumn(d, "revisits", "reasked_at", "INTEGER");    // 09-21: "还没定" → asked once more two weeks later; set when that second ask was scheduled
  addColumn(d, "revisits", "reminded_at", "INTEGER");   // 09-21: one reminder five days after a revisit mail that got no answer
  // 10-07 回访改问法 (lib/revisit-judge.ts): the fact the reader gave (happened | stirred | nothing | open), the lean the reading
  // had when it was scored (likely | unlikely | even), and how this revisit asks (NULL/event = about the event; signals = a
  // question with nothing to verify asks about the signals and is never scored). `outcome` keeps the score, now derived.
  addColumn(d, "revisits", "event", "TEXT");
  addColumn(d, "revisits", "lean", "TEXT");
  addColumn(d, "revisits", "ask", "TEXT");
  // 10-31 进度表 129 ④: 「發生了，但不在那幾天」— roughly which day it did happen (YYYY-MM-DD, the reader's own word; may stay NULL)
  addColumn(d, "revisits", "off_date", "TEXT");
  // 10-22 进度表 80 看自己的回訪: a revisit of a report (bazi / ziwei / astro / nianshu) or a picked day (zeri) — no cast;
  // `kind` says which, `ref` the report token (or ymd:slug), `label` what the letter calls it, `hint` what would count
  addColumn(d, "revisits", "kind", "TEXT");
  addColumn(d, "revisits", "ref", "TEXT");
  addColumn(d, "revisits", "label", "TEXT");
  addColumn(d, "revisits", "hint", "TEXT");
  // 10-22 进度表 89／90: 「你打算怎麼做？」 — one line the reader keeps for themselves, shown back on 「我的」 and in the letter
  addColumn(d, "revisits", "plan", "TEXT");
  // 11-05 进度表 135: two more taps after the answer, both optional — the state they were in (smooth / tight / pressure /
  // breaking) and, when they wrote a plan, whether they did it (done / some / not)
  addColumn(d, "revisits", "state", "TEXT");
  addColumn(d, "revisits", "acted", "TEXT");
  addColumn(d, "revisits", "state_at", "INTEGER");
  rescoreLegacyRevisits(d);
  // 09-21 账本: what Stripe actually settled, from the charge's balance transaction.
  // Managed Payments converts everything into our settlement currency (USD), so
  // NT$72.45 arrives as $2.28 gross − $0.53 fee = $1.75 net. Those are the only
  // numbers a profit line may use; amount_cents is what the buyer saw.
  addColumn(d, "orders", "settle_currency", "TEXT");
  addColumn(d, "orders", "settled_cents", "INTEGER");   // gross, in the settlement currency
  addColumn(d, "orders", "fee_cents", "INTEGER");       // Stripe's cut + withheld tax + FX
  addColumn(d, "orders", "net_cents", "INTEGER");       // what reached the balance
  addColumn(d, "orders", "refund_net_cents", "INTEGER");// negative: what went back out, fees kept included
  addColumn(d, "orders", "ledger_at", "INTEGER");       // when we last read it from Stripe
  addColumn(d, "qian_draws", "followup_q", "TEXT");     // 10-13: the one follow-up a personal reading includes — the reader's words (like `question`, never shown elsewhere)
  addColumn(d, "qian_draws", "followup_json", "TEXT");  // {answer, cast}
  addColumn(d, "qian_draws", "followup_at", "INTEGER");
  addColumn(d, "qian_draws", "register", "TEXT");       // 10-12 读者识别: "hk" / "yue" — the wording the lot is read in (never the country)

  // 10-15 进度表 60 ⑥: lookups that scanned the whole table (EXPLAIN QUERY PLAN on the live data, docs/数据表说明.md)
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_lemail ON customers(lower(email));
    CREATE INDEX IF NOT EXISTS idx_emails_lemail ON emails(lower(email));
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_casts_matter ON casts(matter_id) WHERE matter_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ops_at ON ops_events(at);
  `);

  // 09-22: fill the split for every row that predates it. Idempotent and
  // lossless — STATUS_SPLIT is 1:1 with the old column — so it is safe to run
  // on every boot and safe on a restored backup.
  try {
    const stmt = d.prepare("UPDATE orders SET entitlement_kind = ?, payment_state = ? WHERE status = ? AND (entitlement_kind IS NULL OR payment_state IS NULL)");
    for (const [status, v] of Object.entries(STATUS_SPLIT)) stmt.run(v.kind, v.pay, status);
  } catch {
    /* the columns arrive with this same function; a fresh database has nothing to fill */
  }
}

/** A subscription with an ending already scheduled, by either of Stripe's two mechanisms (09-23). */
export const ENDING_SQL = "(cancel_at_period_end = 1 OR cancel_at IS NOT NULL)";

/** SQL fragment: rows whose customer is not one of ours (anonymous rows stay in — nothing to tell them apart by). */
const NOT_OURS = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
/** same, for referrals — neither side of the reward is one of us */
const REF_NOT_OURS = "referrer_customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1) AND (referred_customer_id IS NULL OR referred_customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";

function addColumn(d: DatabaseSync, table: string, col: string, decl: string): void {
  try {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  } catch {
    /* already there */
  }
}

/* ---------------- customers ---------------- */

export function upsertCustomer(email: string, locale?: string): number {
  const d = db();
  const now = Date.now();
  const e = email.trim().toLowerCase();
  // 10-22 同一个人 (lib/identity.ts): an address that is another account's alternate — merged into it, or recorded
  // when she paid with it while signed in — is that account, not a new one
  const alt = d.prepare("SELECT id FROM customers WHERE lower(email) <> ? AND (',' || lower(COALESCE(alt_emails,'')) || ',') LIKE ? LIMIT 1").get(e, `%,${e},%`) as { id: number } | undefined;
  if (alt && !d.prepare("SELECT 1 FROM customers WHERE email = ?").get(e)) {
    d.prepare("UPDATE customers SET last_seen = ? WHERE id = ?").run(now, alt.id);
    return alt.id;
  }
  d.prepare(
    `INSERT INTO customers (email, first_seen, last_seen, locale)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET last_seen = excluded.last_seen`,
  ).run(e, now, now, locale ?? null);
  const row = d.prepare("SELECT id FROM customers WHERE email = ?").get(e) as { id: number };
  return row.id;
}

export function addOrderToCustomer(customerId: number, amountCents: number): void {
  db().prepare(
    // 09-22: these two counters are no longer read anywhere — every page now
    // asks moneyByCustomer(), which counts the rows. They are kept updated only
    // so an old backup restored into a new build still looks sane; nothing
    // should start trusting them again, because a membership never touches them.
    `UPDATE customers SET orders_count = orders_count + 1, spend_cents = spend_cents + ? WHERE id = ?`,
  ).run(amountCents, customerId);
}

export function setMarketingConsent(email: string, ok: boolean): void {
  db().prepare("UPDATE customers SET marketing_ok = ? WHERE email = ?").run(ok ? 1 : 0, email.trim().toLowerCase());
  // 09-23: the box's promise changed from "three at most" to "one a week at most". The
  // day someone said yes decides which promise binds us — keep it (first yes wins; a
  // re-tick after an unsubscribe starts the new promise).
  if (ok) db().prepare("UPDATE customers SET marketing_at = COALESCE(CASE WHEN marketing_ok = 1 THEN marketing_at END, ?) WHERE email = ?").run(Date.now(), email.trim().toLowerCase());
  else db().prepare("UPDATE customers SET marketing_at = NULL WHERE email = ?").run(email.trim().toLowerCase());
}

/* ---------------- casts & readings ---------------- */

export interface SaveCastInput {
  customerId: number | null;
  castAtMs: number;
  tzOffsetMinutes: number;
  locale: string;
  question: string;
  topic?: string | null;
  values: readonly number[];
  chart: Record<string, unknown>;
  /** 09-26: the device's IANA zone ("Asia/Taipei"), when the page sent it */
  tzName?: string | null;
}

export function saveCast(i: SaveCastInput): number {
  const c = i.chart as {
    cast: { primary: { number: number; fullZh: string }; changed: { number: number; fullZh: string } | null; changingPositions: number[] };
    palace: { palace: string; palacePhase: string; world: number; response: number };
    calendar: { year: { stem: string; branch: string }; month: { stem: string; branch: string }; day: { stem: string; branch: string }; voidBranches: string[] };
  };
  // 10-26 (#3112「我的卦找不到了」): a signed-in reader's free cast is now kept from the free line on — the reading that may
  // follow on the same figure reuses that row instead of filing a second one
  if (i.customerId) {
    const had = db().prepare("SELECT id FROM casts WHERE customer_id = ? AND cast_at = ? AND values_str = ? AND question = ? ORDER BY id LIMIT 1")
      .get(i.customerId, i.castAtMs, i.values.join(","), i.question) as { id: number } | undefined;
    if (had) return had.id;
  }
  const info = db().prepare(
    `INSERT INTO casts (customer_id, created_at, cast_at, tz_offset, locale, question, topic,
       values_str, primary_num, primary_name, changed_num, changed_name, changing,
       palace, palace_phase, world_pos, response_pos,
       year_pillar, month_pillar, day_pillar, void_branches, chart_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    i.customerId, Date.now(), i.castAtMs, i.tzOffsetMinutes, i.locale, i.question, i.topic ?? null,
    i.values.join(","), c.cast.primary.number, c.cast.primary.fullZh,
    c.cast.changed?.number ?? null, c.cast.changed?.fullZh ?? null, c.cast.changingPositions.join(","),
    c.palace.palace, c.palace.palacePhase, c.palace.world, c.palace.response,
    c.calendar.year.stem + c.calendar.year.branch,
    c.calendar.month.stem + c.calendar.month.branch,
    c.calendar.day.stem + c.calendar.day.branch,
    c.calendar.voidBranches.join(","), JSON.stringify(i.chart),
  );
  const id = Number(info.lastInsertRowid);
  if (i.tzName && validTimeZone(i.tzName)) {
    db().prepare("UPDATE casts SET tz_name = ? WHERE id = ?").run(i.tzName, id);
    if (i.customerId) noteCustomerTimeZone(i.customerId, i.tzName);
  }
  return id;
}

/** 09-26: remember the zone a customer's device last reported (only writes when it changed). */
export function noteCustomerTimeZone(customerId: number, tz: string): void {
  if (!validTimeZone(tz)) return;
  db().prepare("UPDATE customers SET tz = ?, tz_at = ? WHERE id = ? AND (tz IS NOT ? OR tz_at IS NULL)").run(tz, Date.now(), customerId, tz);
}

export function saveReading(
  castId: number, customerId: number | null, tier: string, locale: string, body: unknown,
): number {
  const info = db().prepare(
    `INSERT INTO readings (cast_id, customer_id, created_at, tier, locale, body_json)
     VALUES (?,?,?,?,?,?)`,
  ).run(castId, customerId, Date.now(), tier, locale, JSON.stringify(body));
  return Number(info.lastInsertRowid);
}

export function saveFollowup(castId: number, customerId: number | null, role: string, content: string): void {
  // 09-23: the only caller passed null, so all 2,376 rows had no owner. The
  // panels were unaffected (they join through casts), but a per-customer
  // count on this column read 0 — take the cast's owner when none is given.
  db().prepare(
    `INSERT INTO followups (cast_id, customer_id, created_at, role, content)
     VALUES (?, COALESCE(?, (SELECT customer_id FROM casts WHERE id = ?)), ?, ?, ?)`,
  ).run(castId, customerId, castId, Date.now(), role, content);
}

/* ---------------- orders ---------------- */

export function recordOrder(i: {
  sessionId: string; customerId: number | null; castId: number | null;
  tier: string; amountCents: number | null; currency: string | null;
  email: string | null; status: string; via?: string | null; firstDeep?: boolean; paymentIntent?: string | null;
  curSrc?: string | null; tzName?: string | null; edgeCountry?: string | null;
  campaign?: string | null; browserSid?: string | null;
  /** 10-02: a member's extra full reading at the light price */
  memberAddon?: boolean;
}): void {
  // 09-22: write both shapes until the old column retires. The split is derived
  // from `status` rather than passed in, so the two cannot drift apart at the
  // source — only STATUS_SPLIT decides, and splitDrift() proves it every night.
  const split = STATUS_SPLIT[i.status] ?? null;
  db().prepare(
    `INSERT INTO orders (session_id, customer_id, cast_id, created_at, tier, amount_cents, currency, email, status, via, first_deep, payment_intent,
                         cur_src, tz_name, edge_country, entitlement_kind, payment_state, campaign, browser_sid, member_addon)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id) DO UPDATE SET
       status = CASE WHEN orders.status IN ('refunded','disputed') THEN orders.status ELSE excluded.status END,
       cast_id = COALESCE(excluded.cast_id, orders.cast_id),
       payment_intent = COALESCE(excluded.payment_intent, orders.payment_intent),
       cur_src = COALESCE(orders.cur_src, excluded.cur_src),
       tz_name = COALESCE(orders.tz_name, excluded.tz_name),
       edge_country = COALESCE(orders.edge_country, excluded.edge_country),
       campaign = COALESCE(orders.campaign, excluded.campaign),
       browser_sid = COALESCE(orders.browser_sid, excluded.browser_sid),
       member_addon = COALESCE(orders.member_addon, excluded.member_addon),
       entitlement_kind = COALESCE(orders.entitlement_kind, excluded.entitlement_kind),
       payment_state = CASE WHEN orders.payment_state IN ('refunded','disputed') THEN orders.payment_state ELSE excluded.payment_state END`,
  ).run(i.sessionId, i.customerId, i.castId, Date.now(), i.tier, i.amountCents, i.currency, i.email, i.status, i.via ?? null, i.firstDeep ? 1 : 0, i.paymentIntent ?? null,
        i.curSrc ?? null, i.tzName ?? null, i.edgeCountry ?? null, split?.kind ?? null, split?.pay ?? null,
        i.campaign ?? null, i.browserSid ?? null, i.memberAddon === undefined ? null : i.memberAddon ? 1 : 0);
}

/* ---------------- refunds & disputes (09-10) ---------------- */

export interface OrderRow {
  session_id: string; customer_id: number | null; cast_id: number | null; created_at: number;
  tier: string; amount_cents: number | null; currency: string | null; email: string | null; status: string;
  via: string | null; first_deep: number | null; payment_intent: string | null;
  refunded_at: number | null; refund_reason: string | null; dispute: string | null;
  /** 1 = our own test run (sandbox session or our own address), kept out of the numbers */
  test_flag?: number | null;
  /** 09-22: why this reading was handed over, and where the money got to —
   *  the two questions `status` used to answer with one value. */
  entitlement_kind?: EntitlementKind | null;
  payment_state?: PaymentState | null;
  campaign?: string | null;
  browser_sid?: string | null;
  /** 10-07: Stripe's identifier for the card / wallet / Alipay account that paid ('' = none given, null = not looked yet) */
  card_fp?: string | null;
}

/** 10-07 首次付费保证补洞: keep the payment method's identifier (an empty string records "looked, Stripe gave none"). */
export function saveCardFp(sessionId: string, fp: string): void {
  db().prepare("UPDATE orders SET card_fp = ? WHERE session_id = ? AND (card_fp IS NULL OR card_fp = '')").run(fp, sessionId);
}

/** Paid orders whose payment method identifier was never looked up (newest first) — the sweep's work list. */
export function ordersNeedingCardFp(limit = 30): { session_id: string; payment_intent: string | null }[] {
  return db().prepare(
    `SELECT session_id, payment_intent FROM orders
     WHERE card_fp IS NULL AND COALESCE(amount_cents, 0) > 0 AND payment_state IN ('paid','refunded','disputed')
       AND COALESCE(test_flag, 0) = 0 AND session_id NOT LIKE 'cs_test_%'
       AND (payment_intent IS NOT NULL OR session_id LIKE 'pi_%' OR session_id LIKE 'cs_%')
     ORDER BY created_at DESC LIMIT ?`,
  ).all(limit) as { session_id: string; payment_intent: string | null }[];
}

/** 10-19 (Neil: 退款後所有的用戶都是不可讀，跟算卦一樣): the order behind a paid item (塔羅、解籤、八字報告) was refunded */
export function sessionRefunded(sessionId: string | null | undefined): boolean {
  if (!sessionId || sessionId.startsWith("member:") || sessionId.startsWith("tester:")) return false;
  const o = orderBySession(sessionId);
  return o?.payment_state === "refunded" || o?.status === "refunded";
}
export function orderBySession(sessionId: string): OrderRow | null {
  return (db().prepare("SELECT * FROM orders WHERE session_id = ?").get(sessionId) as OrderRow | undefined) ?? null;
}

export function orderByPaymentIntent(pi: string): OrderRow | null {
  return (db().prepare("SELECT * FROM orders WHERE payment_intent = ? ORDER BY id DESC LIMIT 1").get(pi) as OrderRow | undefined) ?? null;
}

/**
 * The order's money went back. Status flips to `refunded`, which takes it
 * out of revenue (salesByCurrency counts 'paid'), out of the first-deep
 * entitlement (customerHasPaidDeep counts 'paid'/'gift') and out of the
 * fulfilment sweep; the customer's spend total is corrected too.
 */
export function markOrderRefunded(sessionId: string, reason: string, at = Date.now()): OrderRow | null {
  const d = db();
  const o = orderBySession(sessionId);
  if (!o) return null;
  if (o.status === "refunded") return o;
  d.prepare("UPDATE orders SET status = 'refunded', payment_state = 'refunded', refunded_at = ?, refund_reason = ? WHERE session_id = ?").run(at, reason, sessionId);
  if (o.customer_id && o.amount_cents && o.status === "paid") {
    d.prepare("UPDATE customers SET spend_cents = MAX(spend_cents - ?, 0) WHERE id = ?").run(o.amount_cents, o.customer_id);
  }
  // 10-22 进度表 78: a refunded 通卡 ends with its money — the pass row (pass_<session tail>) closes now, whatever is left of it
  if (/^pass_/.test(o.tier ?? "")) endPassForSession(sessionId, at);
  return orderBySession(sessionId);
}

/** the 通卡 bought on this checkout session, closed now (a refund, or the owner); nothing when there is none */
export function endPassForSession(sessionId: string, at = Date.now()): boolean {
  const id = `pass_${sessionId.slice(-40)}`;
  const r = db().prepare("UPDATE subscriptions SET status = 'canceled', period_end = MIN(COALESCE(period_end, ?), ?), cancel_at = ?, updated_at = ? WHERE stripe_subscription_id = ? AND status IN ('active', 'scheduled')").run(at, at, at, at, id);
  const n = Number((r as { changes?: number | bigint }).changes ?? 0);
  if (n) recordOps("pass_ended", `${id.slice(-8)} refunded`);
  return n > 0;
}

export function setOrderPaymentIntent(sessionId: string, pi: string): void {
  db().prepare("UPDATE orders SET payment_intent = COALESCE(payment_intent, ?) WHERE session_id = ?").run(pi, sessionId);
}

export function markOrderDispute(sessionId: string, state: "open" | "won" | "lost"): void {
  // a lost dispute is money gone, same as a refund; a won one leaves the order paid
  db().prepare(
    `UPDATE orders SET dispute = ?, status = CASE WHEN ? = 'lost' THEN 'refunded' WHEN ? = 'open' THEN 'disputed' ELSE 'paid' END,
       payment_state = CASE WHEN ? = 'lost' THEN 'refunded' WHEN ? = 'open' THEN 'disputed' ELSE 'paid' END,
       refund_reason = CASE WHEN ? = 'lost' THEN 'dispute_lost' ELSE refund_reason END
     WHERE session_id = ?`,
  ).run(state, state, state, state, state, state, sessionId);
}

export interface RefundStats { refunds: number; refundedCents: { currency: string; cents: number }[]; disputesOpen: number; disputesLost: number }

/** 09-21: refunds of our own test orders are not refunds (test_flag, see markOwnOrdersAsTest) */
export function refundStats(sinceMs: number): RefundStats {
  const d = db();
  const real = "COALESCE(test_flag, 0) = 0";
  const refunds = (d.prepare(`SELECT COUNT(*) AS n FROM orders WHERE refunded_at >= ? AND ${real}`).get(sinceMs) as { n: number }).n;
  const refundedCents = d.prepare(
    `SELECT UPPER(currency) AS currency, SUM(amount_cents) AS cents FROM orders WHERE refunded_at >= ? AND amount_cents IS NOT NULL AND ${real} GROUP BY UPPER(currency)`,
  ).all(sinceMs) as { currency: string; cents: number }[];
  const disputesOpen = (d.prepare(`SELECT COUNT(*) AS n FROM orders WHERE dispute = 'open' AND ${real}`).get() as { n: number }).n;
  const disputesLost = (d.prepare(`SELECT COUNT(*) AS n FROM orders WHERE dispute = 'lost' AND refunded_at >= ? AND ${real}`).get(sinceMs) as { n: number }).n;
  return { refunds, refundedCents, disputesOpen, disputesLost };
}

/**
 * Refund and dispute rate, day by day (09-22). A single refund on a slow day
 * reads as 100%, so the panel draws the running rate — refunds so far over
 * paid orders so far — and prints the raw counts next to it. Both are counted
 * on the day the order was PAID, not the day the money went back, because the
 * question the line answers is "are the readings I am selling now going bad".
 */
export interface RefundDay { day: string; paid: number; refunded: number; disputed: number; rate: number }
export function refundSeries(sinceMs: number): { days: RefundDay[]; rate: number; disputeRate: number; paid: number; refunded: number; disputed: number } {
  const rows = db().prepare(
    `SELECT created_at, refunded_at, dispute FROM orders
     WHERE created_at >= ? AND payment_state IN ('paid','refunded') AND amount_cents > 0 AND COALESCE(test_flag,0) = 0
     ORDER BY created_at`,
  ).all(sinceMs) as { created_at: number; refunded_at: number | null; dispute: string | null }[];
  const byDay = new Map<string, { paid: number; refunded: number; disputed: number }>();
  for (const r of rows) {
    const day = homeDay(r.created_at);
    const cell = byDay.get(day) ?? { paid: 0, refunded: 0, disputed: 0 };
    cell.paid += 1;
    if (r.refunded_at) cell.refunded += 1;
    if (r.dispute) cell.disputed += 1;
    byDay.set(day, cell);
  }
  let paid = 0, refunded = 0, disputed = 0;
  const days: RefundDay[] = [];
  for (const [day, c] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    paid += c.paid; refunded += c.refunded; disputed += c.disputed;
    days.push({ day, paid: c.paid, refunded: c.refunded, disputed: c.disputed, rate: paid > 0 ? (refunded / paid) * 100 : 0 });
  }
  return {
    days,
    paid, refunded, disputed,
    rate: paid > 0 ? (refunded / paid) * 100 : 0,
    disputeRate: paid > 0 ? (disputed / paid) * 100 : 0,
  };
}

/**
 * 09-21: the funnel's "purchase" / "gift" events carry the last 12 characters
 * of the delivery session id (reading page + fulfil cron). Every real delivery
 * has an order row, so the dashboard keeps only the events whose tail matches
 * a row that is not a test run — sessions we later deleted (the e2e walkthroughs)
 * fall out with the flagged ones.
 */
export function realOrderSessionTails(): Set<string> {
  const rows = db().prepare("SELECT session_id FROM orders WHERE COALESCE(test_flag, 0) = 0").all() as { session_id: string }[];
  return new Set(rows.map((r) => r.session_id.slice(-12)));
}
export function testOrderSessionTails(): Set<string> {
  const rows = db().prepare("SELECT session_id FROM orders WHERE test_flag = 1").all() as { session_id: string }[];
  return new Set(rows.map((r) => r.session_id.slice(-12)));
}
/**
 * The event filter both the dashboard and the weekly digest apply.
 * 09-22: widened past purchase/gift. Every one of these events can only come
 * from a session that already has an order row — a seal is offered on the
 * reading page, a revisit answer belongs to a delivered reading — so our own
 * walk-throughs were being counted as customers answering 应验. Events that a
 * stranger can fire without ever buying (daily_pick, seal_watch, share_click) stay out of
 * this list: matching them against order tails would erase all of them.
 *
 * 09-22, second pass: seal_sent and followup_ask were in this list for half a
 * day and both went to zero — 114 follow-ups and 2 sealed predictions vanished
 * from the panel. They carry the BROWSER's session id, not the order's, so no
 * tail ever matched. Only put an event here after checking what its `s` holds.
 */
const SESSION_BOUND = new Set(["purchase", "gift", "revisit_answer"]);
export function isRealDeliveryEvent(e: { e: string; s: string }, real: Set<string>): boolean {
  return !SESSION_BOUND.has(e.e) || real.has(e.s);
}

/** How many times the fulfilment sweep has failed on this session (ops_events, detail starts with the session id). */
export function fulfilFailures(sessionId: string): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'fulfil_fail' AND detail LIKE ?").get(`${sessionId} %`) as { n: number }).n;
}

/**
 * Painted-door claims that never got their reading (09-15: a Taiwanese
 * reader lost ten in a row to a DeepSeek outage). Old enough that the page's
 * own attempt has given up, young enough to still matter, oldest first.
 */
export function unfulfilledGifts(minAgeMs: number, maxAgeMs: number, limit = 5): string[] {
  const now = Date.now();
  return (db().prepare(
    `SELECT g.token FROM gifts g
     WHERE g.created_at BETWEEN ? AND ?
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.session_id = 'gf_' || g.token AND o.cast_id IS NOT NULL)
     ORDER BY g.created_at ASC LIMIT ?`,
  ).all(now - maxAgeMs, now - minAgeMs, limit) as { token: string }[]).map((r) => r.token);
}

export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
  created_at: number;
}

/** Full follow-up transcript for a cast, oldest first — restores the conversation on revisit. */
export function followupsForCast(castId: number): StoredTurn[] {
  return db().prepare(
    "SELECT role, content, created_at FROM followups WHERE cast_id = ? ORDER BY created_at, id",
  ).all(castId) as unknown as StoredTurn[];
}

/** The persisted reading for a paid session, if fulfilment already ran —
    lets an email-link revisit skip regeneration even after a restart. */
export function readingBodyForSession(sessionId: string): unknown | null {
  const row = db().prepare(
    `SELECT r.body_json FROM orders o JOIN readings r ON r.cast_id = o.cast_id
     WHERE o.session_id = ? ORDER BY r.id DESC LIMIT 1`,
  ).get(sessionId) as { body_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.body_json);
  } catch {
    return null;
  }
}

export function castExists(id: number): boolean {
  if (!Number.isInteger(id) || id <= 0) return false;
  return Boolean(db().prepare("SELECT 1 AS v FROM casts WHERE id = ?").get(id));
}

/**
 * Everything the reading page needs to show a reading that already exists,
 * in one query — so a return visit (the account page, the email link) never
 * waits on Stripe and never shows the "verifying payment" stage again.
 */
export interface StoredReading {
  tier: string; locale: string; status: string;
  question: string; topic: string | null; values: number[]; castAtMs: number; tzOffsetMinutes: number;
  email: string | null; amountCents: number | null; currency: string | null;
  customerId: number | null; firstDeep: boolean; via: string | null;
  reading: unknown;
}
export function storedReadingForSession(sessionId: string): StoredReading | null {
  const row = db().prepare(
    `SELECT o.tier, r.tier AS reading_tier, o.status, o.email, o.amount_cents, o.currency, o.customer_id, o.first_deep, o.via,
            c.question, c.topic, c.values_str, c.cast_at, c.tz_offset, c.locale AS cast_locale,
            r.locale AS reading_locale, r.body_json
     FROM orders o
     JOIN casts c ON c.id = o.cast_id
     JOIN readings r ON r.cast_id = o.cast_id
     WHERE o.session_id = ? ORDER BY r.id DESC LIMIT 1`,
  ).get(sessionId) as {
    tier: string; reading_tier: string | null; status: string; email: string | null; amount_cents: number | null; currency: string | null;
    customer_id: number | null; first_deep: number | null; via: string | null;
    question: string; topic: string | null; values_str: string; cast_at: number; tz_offset: number; cast_locale: string;
    reading_locale: string; body_json: string;
  } | undefined;
  if (!row) return null;
  try {
    // 10-22 通卡 (客服 #510, 21:06): an order that bought a 通卡 with the cast sits under the pass's own tier (pass_1d /
    // pass_7d / pass_30d — refunds, the guarantee and the ledger read it there), while the reading on it is the cast's
    // deep one. Handing pass_* out here made the reading page draw that deep reading as a LIGHT one (two sections
    // showing, the upgrade panel under it) and /api/checkout refuse the panel's tap with 400 → 「生成失敗了」 — twelve
    // taps in twelve minutes. The page wants the reading's tier; the order's stays where it is.
    const tier = /^pass_/.test(row.tier) ? (row.reading_tier === "deep" ? "deep" : "one") : row.tier;
    return {
      tier, locale: row.reading_locale || row.cast_locale, status: row.status,
      question: row.question, topic: row.topic, values: row.values_str.split(",").map(Number), castAtMs: row.cast_at, tzOffsetMinutes: row.tz_offset,
      email: row.email, amountCents: row.amount_cents, currency: row.currency,
      customerId: row.customer_id, firstDeep: row.first_deep === 1, via: row.via,
      reading: JSON.parse(row.body_json),
    };
  } catch {
    return null;
  }
}

export function castIdForSession(sessionId: string): number | null {
  const row = db().prepare("SELECT cast_id FROM orders WHERE session_id = ?").get(sessionId) as
    | { cast_id: number | null } | undefined;
  return row?.cast_id ?? null;
}

/* ---------------- revisits (应期回访) ---------------- */

export interface RevisitRow {
  id: number; session_id: string; cast_id: number | null; customer_id: number | null;
  email: string; locale: string; tier: string;
  created_at: number; due_at: number; window_days: number;
  timing_quote: string | null; status: string; sent_at: number | null;
  /** the score (10-07: derived from `event` and `lean` — "unclear" when the fact alone cannot score the reading) */
  outcome: RevisitOutcome | null; outcome_at: number | null;
  reasked_at?: number | null; reminded_at?: number | null;
  /** 10-07: the fact the reader gave, the lean the reading had, and how this revisit asks (NULL = about the event) */
  event?: RevisitEvent | null; lean?: ReadingLean | null; ask?: RevisitAsk | null;
  /** 10-31 进度表 129 ④: roughly when it happened, for an "offwindow" answer */
  off_date?: string | null;
  /** 10-22 进度表 80: a 看自己 revisit — which product, its token (or ymd:slug), the letter's name for it, what would count */
  kind?: SelfRevisitKind | null; ref?: string | null; label?: string | null; hint?: string | null;
  /** 10-22 进度表 89: what the reader said they would do (only for them) */
  plan?: string | null;
  /** 11-05 进度表 135 */
  state?: string | null; acted?: string | null;
}

/* ---------------- 10-22 进度表 80 看自己的回訪 ---------------- */
/** 10-22 进度表 90: "cast" = a free 六爻 reading's revisit (设计稿 R7「付不付費都給回訪」) */
export type SelfRevisitKind = "bazi" | "ziwei" | "astro" | "nianshu" | "zeri" | "cast";
export const SELF_REVISIT_KINDS: readonly SelfRevisitKind[] = ["bazi", "ziwei", "astro", "nianshu", "zeri", "cast"];
export const isSelfRevisitKind = (x: unknown): x is SelfRevisitKind => typeof x === "string" && (SELF_REVISIT_KINDS as readonly string[]).includes(x);
export const selfRevisitSid = (kind: SelfRevisitKind, ref: string): string => `self:${kind}:${ref}`;

/**
 * One revisit per report (or picked day): set again while still pending, it moves to the new day and takes the new
 * words; once sent it stays as it was. Rides in the `revisits` table so 77's one-letter-per-address run, the one-tap
 * answer links and the account page's revisit list all carry it.
 */
export function scheduleSelfRevisit(i: { kind: SelfRevisitKind; ref: string; customerId: number | null; email: string; locale: string; dueAt: number; label: string; hint: string | null; plan?: string | null }, now = Date.now()): "set" | "moved" | "kept" {
  const sid = selfRevisitSid(i.kind, i.ref);
  const d = db();
  const have = d.prepare("SELECT status FROM revisits WHERE session_id = ?").get(sid) as { status: string } | undefined;
  if (have && have.status !== "pending") return "kept";
  if (have) {
    // a plan left out keeps the one already written (a reschedule from a letter or a reminder does not wipe it)
    d.prepare("UPDATE revisits SET due_at = ?, hint = ?, label = ?, email = ?, locale = ?, plan = COALESCE(?, plan) WHERE session_id = ? AND status = 'pending'").run(i.dueAt, i.hint, i.label, i.email, i.locale, i.plan ?? null, sid);
    return "moved";
  }
  d.prepare(`INSERT INTO revisits (session_id, cast_id, customer_id, email, locale, tier, created_at, due_at, window_days, timing_quote, ask, kind, ref, label, hint, plan)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 'event', ?, ?, ?, ?, ?)`)
    .run(sid, i.customerId, i.email, i.locale, i.kind, now, i.dueAt, Math.max(1, Math.round((i.dueAt - now) / 86_400_000)), i.kind, i.ref, i.label, i.hint, i.plan ?? null);
  return "set";
}
/** 10-22 进度表 89: the plans written for these revisits (the account page shows them back) */
export function revisitPlans(ids: number[]): Map<number, string> {
  const out = new Map<number, string>();
  const clean = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))].slice(0, 200);
  if (!clean.length) return out;
  for (const r of db().prepare(`SELECT id, plan FROM revisits WHERE id IN (${clean.map(() => "?").join(",")}) AND plan IS NOT NULL`).all(...clean) as { id: number; plan: string }[]) out.set(r.id, r.plan);
  return out;
}
/** 10-22 进度表 89: the reader's own line on what they will do — any pending or sent revisit, by id; empty clears it */
export function setRevisitPlan(id: number, plan: string): boolean {
  const v = plan.replace(/\s+/g, " ").trim().slice(0, 80);
  return Number((db().prepare("UPDATE revisits SET plan = ? WHERE id = ? AND outcome IS NULL").run(v || null, id) as { changes?: number | bigint }).changes ?? 0) > 0;
}
export function cancelSelfRevisit(kind: SelfRevisitKind, ref: string): boolean {
  const r = db().prepare("UPDATE revisits SET status = 'skipped', sent_at = ? WHERE session_id = ? AND status = 'pending'").run(Date.now(), selfRevisitSid(kind, ref));
  return Number((r as { changes?: number | bigint }).changes ?? 0) > 0;
}
export function selfRevisitOf(kind: SelfRevisitKind, ref: string): RevisitRow | null {
  return (db().prepare("SELECT * FROM revisits WHERE session_id = ?").get(selfRevisitSid(kind, ref)) ?? null) as RevisitRow | null;
}
/** the account page's 回訪 tab: every 看自己 revisit of this account, the nearest first */
export function selfRevisitsForCustomer(customerId: number): RevisitRow[] {
  return db().prepare("SELECT * FROM revisits WHERE customer_id = ? AND kind IS NOT NULL ORDER BY due_at DESC LIMIT 50").all(customerId) as unknown as RevisitRow[];
}
/** the weekly report's line: per kind, letters sent and answers since `since` */
export function selfRevisitStats(since: number): Record<SelfRevisitKind, { set: number; sent: number; answered: number; happened: number; stirred: number; nothing: number; open: number }> {
  const out = {} as ReturnType<typeof selfRevisitStats>;
  for (const k of SELF_REVISIT_KINDS) {
    const r = db().prepare(`SELECT COUNT(*) AS set_n, SUM(status = 'sent') AS sent, SUM(outcome IS NOT NULL) AS answered,
        SUM(event = 'happened') AS happened, SUM(event = 'stirred') AS stirred, SUM(event = 'nothing') AS nothing_n, SUM(event = 'open') AS open_n
      FROM revisits WHERE kind = ? AND created_at >= ? AND ${NOT_OURS}`).get(k, since) as { set_n: number; sent: number | null; answered: number | null; happened: number | null; stirred: number | null; nothing_n: number | null; open_n: number | null };
    out[k] = { set: r.set_n, sent: r.sent ?? 0, answered: r.answered ?? 0, happened: r.happened ?? 0, stirred: r.stirred ?? 0, nothing: r.nothing_n ?? 0, open: r.open_n ?? 0 };
  }
  return out;
}

/** Schedule the timing-window follow-up for a paid reading. Idempotent per session. */
/** 10-14 进度表 46: the 「怎樣算有結果？」 written with the cast a reading was bought for (casts ↔ cast_log by instant and lines). */
export function outcomeHintFor(castId: number | null | undefined): string | null {
  if (!castId) return null;
  const r = db().prepare(
    `SELECT l.outcome_hint AS h FROM casts c JOIN cast_log l ON l.at = c.cast_at AND l.values_str = replace(c.values_str, ',', '')
     WHERE c.id = ? AND l.outcome_hint IS NOT NULL ORDER BY l.id DESC LIMIT 1`,
  ).get(castId) as { h: string } | undefined;
  return r?.h ?? null;
}

export function scheduleRevisit(i: {
  sessionId: string; castId: number | null; customerId: number | null;
  email: string; locale: string; tier: string;
  castAtMs: number; windowDays: number; timingQuote: string | null;
  /** 10-07: the question, so a revisit about how someone feels asks about the signals instead (lib/revisit-ask.ts) */
  question?: string | null;
  /** 10-12 多段应期: the earlier windows' check-ins, in days from the cast like windowDays */
  checkpoints?: { days: number; start: Date; end: Date }[];
}): void {
  // 10-14 进度表 46: the reader said what would count — that is something they can see, so the check-in asks about it
  const ask = outcomeHintFor(i.castId) ? "event" : revisitAsk(i.question);
  const d = db();
  const res = d.prepare(
    `INSERT INTO revisits (session_id, cast_id, customer_id, email, locale, tier,
       created_at, due_at, window_days, timing_quote, ask)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id) DO NOTHING`,
  ).run(
    i.sessionId, i.castId, i.customerId, i.email.trim().toLowerCase(), i.locale, i.tier,
    Date.now(), i.castAtMs + i.windowDays * 86_400_000, i.windowDays, i.timingQuote, ask === "signals" ? "signals" : null,
  );
  if (Number((res as { changes?: number | bigint }).changes ?? 0) > 0 && i.checkpoints?.length) addCheckpoints(Number(res.lastInsertRowid), i.castAtMs, i.checkpoints);
}

/* ---------------- 多段应期 check-ins (10-12) ---------------- */

export interface CheckpointRow {
  id: number; revisit_id: number; seq: number; start_at: number; end_at: number; due_at: number;
  status: string; sent_at: number | null; answer: CheckpointAnswer | null; answer_at: number | null;
}
export type CheckpointAnswer = "seen" | "none" | "unsure";

export function addCheckpoints(revisitId: number, castAtMs: number, cps: { days: number; start: Date; end: Date }[]): void {
  const ins = db().prepare(
    "INSERT INTO revisit_checkpoints (revisit_id, seq, start_at, end_at, due_at) VALUES (?,?,?,?,?) ON CONFLICT(revisit_id, seq) DO NOTHING",
  );
  cps.forEach((c, k) => ins.run(revisitId, k + 1, c.start.getTime(), c.end.getTime(), castAtMs + c.days * 86_400_000));
}

/** Check-ins whose window has closed, not yet sent, whose reading has not been answered or asked about already. */
export function dueCheckpoints(limit = 50): (CheckpointRow & { revisit: RevisitRow })[] {
  const rows = db().prepare(
    `SELECT k.* FROM revisit_checkpoints k JOIN revisits r ON r.id = k.revisit_id
     WHERE k.status = 'pending' AND k.due_at <= ? ORDER BY k.due_at LIMIT ?`,
  ).all(Date.now(), limit) as unknown as CheckpointRow[];
  return rows.map((k) => ({ ...k, revisit: revisitById(k.revisit_id)! })).filter((k) => k.revisit);
}

export function markCheckpoint(id: number, status: "sent" | "failed" | "skipped"): void {
  db().prepare("UPDATE revisit_checkpoints SET status = ?, sent_at = ? WHERE id = ?").run(status, Date.now(), id);
}

export function checkpointById(id: number): CheckpointRow | null {
  return (db().prepare("SELECT * FROM revisit_checkpoints WHERE id = ?").get(id) ?? null) as CheckpointRow | null;
}

/** The latest tap wins, as with the revisit. */
export function setCheckpointAnswer(id: number, answer: CheckpointAnswer): void {
  db().prepare("UPDATE revisit_checkpoints SET answer = ?, answer_at = ? WHERE id = ?").run(answer, Date.now(), id);
}

export function checkpointsOf(revisitId: number): CheckpointRow[] {
  return db().prepare("SELECT * FROM revisit_checkpoints WHERE revisit_id = ? ORDER BY seq").all(revisitId) as unknown as CheckpointRow[];
}

/** For /admin/outcomes: what the in-between letters brought — never part of the hit rate. */
export function checkpointStats(): { scheduled: number; sent: number; seen: number; none: number; unsure: number } {
  const d = db();
  const mine = `revisit_id IN (SELECT id FROM revisits WHERE ${NOT_OURS})`;
  const one = (s: string) => (d.prepare(s).get() as { v: number } | undefined)?.v ?? 0;
  return {
    scheduled: one(`SELECT COUNT(*) AS v FROM revisit_checkpoints WHERE ${mine}`),
    sent: one(`SELECT COUNT(*) AS v FROM revisit_checkpoints WHERE status = 'sent' AND ${mine}`),
    seen: one(`SELECT COUNT(*) AS v FROM revisit_checkpoints WHERE answer = 'seen' AND ${mine}`),
    none: one(`SELECT COUNT(*) AS v FROM revisit_checkpoints WHERE answer = 'none' AND ${mine}`),
    unsure: one(`SELECT COUNT(*) AS v FROM revisit_checkpoints WHERE answer = 'unsure' AND ${mine}`),
  };
}

/**
 * 10-07, once per database: the answers given through the old "did it happen" buttons get their fact written down
 * (event) and the lean of their reading (lean), and are re-scored by the same rule as new answers — upwards or sideways
 * only: a 「完全沒發生」 on a reading that called the matter unlikely becomes a hit, on an even or unreadable lean becomes
 * unclear; a 「像說的那樣發生了」 stays a hit (the reader confirmed the reading, and a proof card may already carry it);
 * 「發生了但不同」 stays partial. Recorded in ops_events so it runs once.
 */
export function rescoreLegacyRevisits(d: DatabaseSync): void {
  const done = d.prepare("SELECT 1 AS v FROM ops_events WHERE kind = 'revisit_rescore_1007' LIMIT 1").get();
  if (done) return;
  const rows = d.prepare(
    `SELECT r.id, r.outcome, r.cast_id, r.locale FROM revisits r WHERE r.outcome IS NOT NULL AND r.event IS NULL`,
  ).all() as { id: number; outcome: string; cast_id: number | null; locale: string }[];
  const body = d.prepare("SELECT body_json, locale FROM readings WHERE cast_id = ? AND tier = 'deep' ORDER BY id DESC LIMIT 1");
  const upd = d.prepare("UPDATE revisits SET event = ?, lean = ?, outcome = ? WHERE id = ?");
  let up = 0, side = 0;
  for (const r of rows) {
    const event = LEGACY_EVENT[r.outcome] ?? null;
    if (!event) continue;
    let lean: ReadingLean | null = null;
    if (r.cast_id) {
      const b = body.get(r.cast_id) as { body_json: string; locale: string } | undefined;
      if (b) { try { lean = readingLean(JSON.parse(b.body_json), r.locale || b.locale); } catch { lean = null; } }
    }
    let outcome = r.outcome;
    if (r.outcome === "miss") {
      if (lean === "unlikely") { outcome = "hit"; up += 1; }
      else if (lean !== "likely") { outcome = "unclear"; side += 1; }
    }
    upd.run(event, lean, outcome, r.id);
  }
  d.prepare("INSERT INTO ops_events (at, kind, detail) VALUES (?,?,?)").run(Date.now(), "revisit_rescore_1007", `rows=${rows.length} miss→hit=${up} miss→unclear=${side}`);
}

/** 10-07: the stored deep reading of a cast (its body and language), for scoring a revisit against the reading's own lean. */
export function deepReadingOf(castId: number): { body: unknown; locale: string } | null {
  const r = db().prepare("SELECT body_json, locale FROM readings WHERE cast_id = ? AND tier = 'deep' ORDER BY id DESC LIMIT 1").get(castId) as { body_json: string; locale: string } | undefined;
  if (!r) return null;
  try { return { body: JSON.parse(r.body_json) as unknown, locale: r.locale }; } catch { return null; }
}

/** Revisits whose window has arrived and which haven't been sent. */
// 10-23 进度表 104 ②: a revisit the reader already answered on the site (anything but 「還沒定」) is not asked again by letter —
// 10-22 five readers got a letter about a matter they had answered, and 22 answered rows were still queued
export function dueRevisits(limit = 50): RevisitRow[] {
  return db().prepare(
    `SELECT * FROM revisits WHERE status = 'pending' AND due_at <= ? AND (outcome IS NULL OR outcome = 'open') ORDER BY due_at LIMIT ?`,
  ).all(Date.now(), limit) as unknown as RevisitRow[];
}

/**
 * 10-22 进度表 77 回访积压: the letters go out by address, not by row. The addresses with a due revisit that is not yet
 * stale, the one whose oldest window closed first at the head — so the 7–14-day backlog is asked before it is too late,
 * and a heavy user's several casts no longer hold the queue for everyone else.
 */
export function dueRevisitEmails(now = Date.now(), max = 80, staleMs = 14 * 86_400_000): string[] {
  return (db().prepare(
    `SELECT lower(email) AS e, MIN(due_at) AS first FROM revisits
     WHERE status = 'pending' AND due_at <= ? AND due_at > ? AND (outcome IS NULL OR outcome = 'open') GROUP BY lower(email) ORDER BY first LIMIT ?`,
  ).all(now, now - staleMs, max) as { e: string }[]).map((r) => r.e);
}
/** every due, not-yet-stale revisit of one address, oldest first — one letter carries them all */
export function dueRevisitsForEmail(email: string, now = Date.now(), staleMs = 14 * 86_400_000): RevisitRow[] {
  return db().prepare(
    `SELECT * FROM revisits WHERE status = 'pending' AND lower(email) = lower(?) AND due_at <= ? AND due_at > ? AND (outcome IS NULL OR outcome = 'open') ORDER BY due_at`,
  ).all(email, now, now - staleMs) as unknown as RevisitRow[];
}
/** the pending revisits whose window closed too long ago to ask */
export function stalePendingRevisits(now = Date.now(), staleMs = 14 * 86_400_000, limit = 500): { id: number; email: string }[] {
  return db().prepare("SELECT id, email FROM revisits WHERE status = 'pending' AND due_at <= ? ORDER BY due_at LIMIT ?").all(now - staleMs, limit) as { id: number; email: string }[];
}
/** …marked skipped in one sweep; returns how many */
export function skipStaleRevisits(now = Date.now(), staleMs = 14 * 86_400_000, limit = 500): number {
  const rows = stalePendingRevisits(now, staleMs, limit);
  const up = db().prepare("UPDATE revisits SET status = 'skipped', sent_at = ? WHERE id = ? AND status = 'pending'");
  for (const r of rows) up.run(now, r.id);
  return rows.length;
}
/** the weekly report's line: windows that closed this week, letters sent this week, and what is still waiting (due, unsent) */
export function revisitBacklog(now = Date.now()): { dueWeek: number; sentWeek: number; waiting: number; waitingOver7: number; emails: number } {
  const d = db();
  const one = (sql: string, ...a: number[]) => (d.prepare(sql).get(...a) as { v: number } | undefined)?.v ?? 0;
  const week = now - 7 * 86_400_000;
  return {
    dueWeek: one(`SELECT COUNT(*) AS v FROM revisits WHERE due_at > ? AND due_at <= ? AND ${NOT_OURS}`, week, now),
    sentWeek: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'sent' AND sent_at > ? AND ${NOT_OURS}`, week),
    waiting: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'pending' AND due_at <= ? AND (outcome IS NULL OR outcome = 'open') AND ${NOT_OURS}`, now),
    waitingOver7: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'pending' AND due_at <= ? AND (outcome IS NULL OR outcome = 'open') AND ${NOT_OURS}`, week),
    emails: one(`SELECT COUNT(DISTINCT lower(email)) AS v FROM revisits WHERE status = 'pending' AND due_at <= ? AND (outcome IS NULL OR outcome = 'open') AND ${NOT_OURS}`, now),
  };
}

export function markRevisit(id: number, status: "sent" | "failed" | "skipped"): void {
  db().prepare("UPDATE revisits SET status = ?, sent_at = ? WHERE id = ?")
    .run(status, Date.now(), id);
}

/** The cast context a revisit email needs: question, figure, link locale. */
export function revisitCastContext(castId: number): {
  question: string; values_str: string; primary_name: string; changed_name: string | null; cast_at: number;
} | null {
  return (db().prepare(
    "SELECT question, values_str, primary_name, changed_name, cast_at FROM casts WHERE id = ?",
  ).get(castId) ?? null) as {
    question: string; values_str: string; primary_name: string; changed_name: string | null; cast_at: number;
  } | null;
}

export function revisitCounts(): { pending: number; sent: number } {
  const d = db();
  const one = (s: string) => (d.prepare(s).get() as { v: number } | undefined)?.v ?? 0;
  return {
    pending: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'pending' AND ${NOT_OURS}`),
    sent: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'sent' AND ${NOT_OURS}`),
  };
}

/** 09-26 (Neil: 回访改四选一): hit = 像说的那样发生了 · partial = 发生了但时间或方式不同 · open = 还没有 · miss = 完全没发生 */
/** the score of a revisit — 10-07: "unclear" = answered, but the fact alone cannot score the reading (even / unknown lean, or a signals question) */
export type RevisitOutcome = "hit" | "partial" | "miss" | "open" | "unclear";

export function revisitById(id: number): RevisitRow | null {
  return (db().prepare("SELECT * FROM revisits WHERE id = ?").get(id) ?? null) as RevisitRow | null;
}

/** Everything a proof card shows for a revisit that came true — no question, ever. */
export interface ProofData {
  id: number; locale: string; values_str: string; cast_at: number; window_days: number;
  timing_quote: string | null; outcome_at: number; primary_num: number; changed_num: number | null;
}
export function proofData(revisitId: number): ProofData | null {
  return (db().prepare(
    `SELECT r.id, r.locale, c.values_str, c.cast_at, r.window_days, r.timing_quote, r.outcome_at, c.primary_num, c.changed_num
     FROM revisits r JOIN casts c ON c.id = r.cast_id
     WHERE r.id = ? AND r.outcome = 'hit' AND r.outcome_at IS NOT NULL`,
  ).get(revisitId) ?? null) as ProofData | null;
}

/**
 * 封卦 (09-21, A1 — Long Bets 的「可问责预测」+ 我们的应期): everything the
 * public seal page shows. Unlike a proof card it exists from the moment the
 * reading names a window, whatever the outcome — that is the point: the
 * claim is public BEFORE it is settled. Never the question.
 */
export interface SealData {
  id: number; locale: string; values_str: string; cast_at: number; due_at: number; window_days: number;
  timing_quote: string | null; outcome: "hit" | "partial" | "miss" | "open" | null; outcome_at: number | null;
  primary_num: number; changed_num: number | null;
}
export function sealData(revisitId: number): SealData | null {
  return (db().prepare(
    `SELECT r.id, r.locale, c.values_str, c.cast_at, r.due_at, r.window_days, r.timing_quote,
            r.outcome, r.outcome_at, c.primary_num, c.changed_num
     FROM revisits r JOIN casts c ON c.id = r.cast_id WHERE r.id = ?`,
  ).get(revisitId) ?? null) as SealData | null;
}

/** The revisit scheduled for this reading, if any — the seal is minted from it. */
export function revisitBySession(sessionId: string): RevisitRow | null {
  return (db().prepare("SELECT * FROM revisits WHERE session_id = ?").get(sessionId) ?? null) as RevisitRow | null;
}

/** A stranger asking to be told when this seal resolves. Idempotent per address. */
export function watchSeal(revisitId: number, email: string, locale: string): boolean {
  const r = db().prepare(
    "INSERT INTO seal_watchers (revisit_id, email, locale, created_at) VALUES (?,?,?,?) ON CONFLICT(revisit_id, email) DO NOTHING",
  ).run(revisitId, email.trim().toLowerCase(), locale, Date.now());
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

export function sealWatcherCount(revisitId: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM seal_watchers WHERE revisit_id = ?").get(revisitId) as { v: number }).v;
}

/** Watchers of seals that have since resolved and have not been told yet. */
export function sealWatchersToNotify(limit = 50): { id: number; revisit_id: number; email: string; locale: string | null }[] {
  return db().prepare(
    `SELECT w.id, w.revisit_id, w.email, w.locale FROM seal_watchers w
     JOIN revisits r ON r.id = w.revisit_id
     WHERE w.notified_at IS NULL AND r.outcome IN ('hit','miss') ORDER BY w.id ASC LIMIT ?`,
  ).all(limit) as { id: number; revisit_id: number; email: string; locale: string | null }[];
}

export function markSealWatcherNotified(id: number): void {
  db().prepare("UPDATE seal_watchers SET notified_at = ? WHERE id = ?").run(Date.now(), id);
}

/**
 * 我的卦谱 · 个人应验记录 (09-21, A3 — 裂变玩法调研 §2.3): this account's own
 * track record, the way Metaculus gives every forecaster a public calibration
 * curve. It is also why answering a revisit is worth anything: no answer, no
 * record.
 */
export function myOutcomes(customerId: number): { hit: number; miss: number; open: number; waiting: number } {
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get(customerId) as { v: number } | undefined)?.v ?? 0;
  return {
    hit: one("SELECT COUNT(*) AS v FROM revisits WHERE customer_id = ? AND outcome = 'hit'"),
    miss: one("SELECT COUNT(*) AS v FROM revisits WHERE customer_id = ? AND outcome = 'miss'"),
    open: one("SELECT COUNT(*) AS v FROM revisits WHERE customer_id = ? AND outcome = 'open'"),
    // asked and not yet answered, plus windows still running
    waiting: one("SELECT COUNT(*) AS v FROM revisits WHERE customer_id = ? AND outcome IS NULL"),
  };
}

/**
 * 会员一览 (09-21): the membership mirror, per customer, WITHOUT touching
 * Stripe — the list page shows a hundred rows and must not make a hundred
 * API calls. The detail page still asks entitlementFor() for the live count.
 */
export function membershipsByCustomer(): Map<number, { status: string; plan: string; period_end: number | null; cancel_at_period_end: number | null; currency: string | null; amount_minor: number | null; sid: string; pass_days: number | null }> {
  const rows = db().prepare(
    `SELECT customer_id, status, plan, period_end, cancel_at_period_end, currency, amount_minor, stripe_subscription_id AS sid, pass_days FROM subscriptions
     WHERE id IN (SELECT MAX(id) FROM subscriptions GROUP BY customer_id)`,
  ).all() as { customer_id: number; status: string; plan: string; period_end: number | null; cancel_at_period_end: number | null; currency: string | null; amount_minor: number | null; sid: string; pass_days: number | null }[];
  return new Map(rows.map((r) => [r.customer_id, r]));
}

/** Paid orders per customer, newest first — the repeat-purchase view (test runs out). */
export function paidOrdersByCustomer(): Map<number, { at: number; tier: string; currency: string | null; cents: number | null; first_deep: number | null }[]> {
  const rows = db().prepare(
    `SELECT customer_id, created_at AS at, tier, currency, amount_cents AS cents, first_deep
     FROM orders WHERE payment_state = 'paid' AND amount_cents > 0 AND COALESCE(test_flag, 0) = 0 AND customer_id IS NOT NULL
     ORDER BY created_at DESC`,
  ).all() as { customer_id: number; at: number; tier: string; currency: string | null; cents: number | null; first_deep: number | null }[];
  const out = new Map<number, { at: number; tier: string; currency: string | null; cents: number | null; first_deep: number | null }[]>();
  for (const r of rows) {
    const list = out.get(r.customer_id) ?? [];
    list.push({ at: r.at, tier: r.tier, currency: r.currency, cents: r.cents, first_deep: r.first_deep });
    out.set(r.customer_id, list);
  }
  return out;
}

/* ---------------- 新玩法的面板 (09-22) ---------------- */

/** 封卦: how many predictions are public, how many people are waiting on one, how many have been told. */
export function sealStats(): { withWatchers: number; watchers: number; pending: number; told: number; settled: number } {
  const d = db();
  // a stranger watching one of OUR test predictions is still our own noise
  const realSeal = "revisit_id IN (SELECT id FROM revisits WHERE " + NOT_OURS + ")";
  const one = (sql: string) => (d.prepare(sql).get() as { v: number } | undefined)?.v ?? 0;
  return {
    withWatchers: one(`SELECT COUNT(DISTINCT revisit_id) AS v FROM seal_watchers WHERE ${realSeal}`),
    watchers: one(`SELECT COUNT(*) AS v FROM seal_watchers WHERE ${realSeal}`),
    pending: one(`SELECT COUNT(*) AS v FROM seal_watchers WHERE notified_at IS NULL AND ${realSeal}`),
    told: one(`SELECT COUNT(*) AS v FROM seal_watchers WHERE notified_at IS NOT NULL AND ${realSeal}`),
    // 09-22: this used to count every answered revisit and was printed as
    // 「已结的封卦 N 张」 — but a revisit only becomes a seal if the reader
    // actually minted one, which we do not record. Only watched seals can be
    // said to have settled.
    settled: one(`SELECT COUNT(DISTINCT w.revisit_id) AS v FROM seal_watchers w
                  JOIN revisits r ON r.id = w.revisit_id WHERE r.outcome IN ('hit','miss')`),
  };
}

/** 回访奖励: what answering a revisit earned, and whether it was taken up. */
export function revisitRewardStats(sinceMs: number): { light: number; lightUsed: number; followup: number } {
  const d = db();
  // 09-22: our own walk-throughs earned rewards too — grants hang off a customer, so the same rule applies here
  const mine = "(from_customer_id IS NULL OR from_customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
  const one = (sql: string) => (d.prepare(sql).get(sinceMs) as { v: number } | undefined)?.v ?? 0;
  return {
    light: one(`SELECT COUNT(*) AS v FROM grants WHERE kind = 'revisit_light' AND created_at >= ? AND ${mine}`),
    lightUsed: one(`SELECT COUNT(*) AS v FROM grants WHERE kind = 'revisit_light' AND created_at >= ? AND used_at IS NOT NULL AND ${mine}`),
    followup: one(`SELECT COUNT(*) AS v FROM grants WHERE kind = 'revisit_followup' AND created_at >= ? AND ${mine}`),
  };
}

/** 大众一卦: how many days × languages have been written, and what they cost us to keep. */
export function dailyCastStats(): { days: number; written: number; today: number } {
  const d = db();
  const one = (sql: string, ...p: unknown[]) => (d.prepare(sql).get(...p) as { v: number } | undefined)?.v ?? 0;
  return {
    days: one("SELECT COUNT(DISTINCT day) AS v FROM daily_casts"),
    written: one("SELECT COUNT(*) AS v FROM daily_casts"),
    today: one("SELECT COUNT(*) AS v FROM daily_casts WHERE day = (SELECT MAX(day) FROM daily_casts)"),
  };
}

/**
 * 首次价 → 全价 (09-22, the number Gate 1 turns on): every deep reading's
 * first one is sold at the light price, so the question is whether anyone
 * comes back at the real one.
 */
export function firstToFull(): { firstPriced: number; fullPriced: number; converted: number; anyRepeat: number } {
  const d = db();
  // every column needs the alias: the conversion queries join orders to itself
  const real = (t: string) => `${t}payment_state = 'paid' AND ${t}amount_cents > 0 AND COALESCE(${t}test_flag, 0) = 0`;
  const one = (sql: string) => (d.prepare(sql).get() as { v: number } | undefined)?.v ?? 0;
  return {
    firstPriced: one(`SELECT COUNT(*) AS v FROM orders WHERE ${real("")} AND first_deep = 1`),
    // 09-22: this counted every order with first_deep = 0, so four ¥9.90 light
    // readings were being shown as "全价". The whole point of the figure is
    // whether the first-price deep reading pulls a full-price DEEP one after it.
    fullPriced: one(`SELECT COUNT(*) AS v FROM orders WHERE ${real("")} AND COALESCE(first_deep, 0) = 0 AND tier = 'deep'`),
    // people who took the first-price deal and later paid again at any full price
    converted: one(
      `SELECT COUNT(DISTINCT a.customer_id) AS v FROM orders a JOIN orders b ON b.customer_id = a.customer_id
       WHERE ${real("a.")} AND a.first_deep = 1 AND ${real("b.")} AND COALESCE(b.first_deep,0) = 0 AND b.tier = 'deep' AND b.created_at > a.created_at`,
    ),
    // and the looser version: came back and bought anything at all, light included
    anyRepeat: one(
      `SELECT COUNT(DISTINCT a.customer_id) AS v FROM orders a JOIN orders b ON b.customer_id = a.customer_id
       WHERE ${real("a.")} AND a.first_deep = 1 AND ${real("b.")} AND b.session_id <> a.session_id AND b.created_at > a.created_at`,
    ),
  };
}

/**
 * Sales that actually took money, in a window (09-22). The funnel's "付费" was
 * the count of `purchase` events, and a member spending their monthly
 * allowance fires exactly that event while paying nothing — so 22 real sales
 * were being shown as 31, with a conversion rate to match, while the refund
 * section two screens down (which reads orders) said 22. Money comes from the
 * orders table now; the event count stays, but it means "delivered".
 */
export function paidOrdersIn(sinceMs: number, untilMs = Number.MAX_SAFE_INTEGER): { n: number; byTier: Record<string, number>; sessions: Set<string> } {
  const rows = db().prepare(
    `SELECT session_id, tier FROM orders
     WHERE created_at >= ? AND created_at < ? AND ${SALE_SQL} AND COALESCE(test_flag,0) = 0`,
  ).all(sinceMs, untilMs) as { session_id: string; tier: string }[];
  const byTier: Record<string, number> = {};
  for (const r of rows) byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
  return { n: rows.length, byTier, sessions: new Set(rows.map((r) => r.session_id.slice(-12))) };
}

/** Readings a membership allowance paid for — delivered, but not a sale. */
export function subRedemptionsIn(sinceMs: number, untilMs = Number.MAX_SAFE_INTEGER): number {
  return (db().prepare(
    "SELECT COUNT(*) AS v FROM orders WHERE created_at >= ? AND created_at < ? AND entitlement_kind = 'membership' AND COALESCE(test_flag,0) = 0",
  ).get(sinceMs, untilMs) as { v: number }).v;
}

/** What a paying customer is worth so far, in settled money (net of Stripe). */
export function ltvStats(): { payers: number; netCents: number; perPayer: number; perOrder: number; orders: number } {
  const r = db().prepare(
    `SELECT COUNT(DISTINCT customer_id) AS payers, COUNT(*) AS orders,
            COALESCE(SUM(COALESCE(net_cents,0) + COALESCE(refund_net_cents,0)),0) AS net
     FROM orders WHERE payment_state IN ('paid','refunded') AND amount_cents > 0 AND COALESCE(test_flag,0) = 0 AND customer_id IS NOT NULL`,
  ).get() as { payers: number; orders: number; net: number };
  return {
    payers: r.payers,
    orders: r.orders,
    netCents: r.net,
    perPayer: r.payers > 0 ? Math.round(r.net / r.payers) : 0,
    perOrder: r.orders > 0 ? Math.round(r.net / r.orders) : 0,
  };
}

/** How long a reading takes to come back (ops_events kind gen_ms, detail = "<tier> <ms>"). */
export function genTiming(sinceMs: number): { n: number; p50: number; p95: number; slowest: number } {
  const rows = db().prepare("SELECT detail FROM ops_events WHERE kind = 'gen_ms' AND at >= ?").all(sinceMs) as { detail: string | null }[];
  const ms = rows.map((r) => Number((r.detail ?? "").split(" ").pop())).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (ms.length === 0) return { n: 0, p50: 0, p95: 0, slowest: 0 };
  const at = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]!;
  return { n: ms.length, p50: at(0.5), p95: at(0.95), slowest: ms[ms.length - 1]! };
}

/* ---------------- 账本 · 成本 · 净利 (09-21) ---------------- */

export interface StripeTxn {
  id: string; created: number; type: string; currency: string;
  amount: number; fee: number; net: number; source: string | null; payment_intent: string | null;
  /** Stripe's own customer id on the charge — the only way to attribute a membership invoice */
  stripe_customer?: string | null;
  /** 09-30: 'payments' (money) or 'fee_credits' (a coupon against Stripe's fees — never ours to spend) */
  balance_type?: string | null;
  /** 09-26: withheld sales tax inside `fee` (fee_details type withheld_tax); null = not known */
  fee_tax?: number | null;
}

/**
 * What each of OUR customers has paid for a membership (09-22). Everything
 * else on a customer record comes from the orders table, which a membership
 * never touches: hollyshan showed 「HK$18 · 1 单」 while also paying HK$68 a
 * month, and kalinwulc — a member since day one — showed 「—」.
 */
export function membershipPaidByCustomer(): Map<number, { n: number; net: number; gross: number; currency: string }> {
  const rows = db().prepare(
    // 09-27: one owner per Stripe customer, so a second subscription row (a renewal after a lapse, a pass) never counts a charge twice
    `SELECT s.cid AS cid, t.amount AS amount, t.net AS net, t.currency AS currency
     FROM stripe_txns t
     JOIN (SELECT stripe_customer_id AS sc, MAX(customer_id) AS cid FROM subscriptions WHERE stripe_customer_id IS NOT NULL
             AND customer_id IN (SELECT id FROM customers WHERE COALESCE(test_flag,0) = 0) GROUP BY stripe_customer_id) s ON s.sc = t.stripe_customer
     WHERE t.stripe_customer IS NOT NULL AND t.type IN ('charge','payment')
       AND (t.payment_intent IS NULL OR t.payment_intent NOT IN (SELECT payment_intent FROM orders WHERE payment_intent IS NOT NULL))
       -- 09-29: a member's add-on pack is its own line, not a membership invoice
       AND (t.payment_intent IS NULL OR t.payment_intent NOT IN (SELECT payment_intent FROM member_packs WHERE payment_intent IS NOT NULL))`,
  ).all() as { cid: number; amount: number; net: number; currency: string }[];
  const out = new Map<number, { n: number; net: number; gross: number; currency: string }>();
  for (const r of rows) {
    const cur = out.get(r.cid) ?? { n: 0, net: 0, gross: 0, currency: r.currency };
    cur.n += 1; cur.net += r.net; cur.gross += r.amount;
    out.set(r.cid, cur);
  }
  return out;
}

/**
 * 09-27 (Neil: 「客户的这个页面，订单版块加上会员的订单吧」): one customer's membership payments, one row per
 * Stripe charge — monthly/yearly invoices and the one-month pass alike. Stripe's balance lines are in the
 * settlement currency (USD); the plan's own price and currency ride along from the subscription row.
 */
export interface MembershipCharge {
  id: string; created: number; type: string; amount: number; net: number; currency: string; source: string | null;
  plan: string | null; planCurrency: string | null; planAmount: number | null; pass: boolean;
  /** 09-27: a membership that began with no charge — its first month paid by an earlier single purchase (单买抵首月), or granted */
  start?: { credit: { cents: number; currency: string; at: number } | null; comp: boolean; pending?: boolean } | null;
  /** 09-29: the first charge of a membership whose first month was partly paid by an earlier single purchase */
  credit?: { cents: number; currency: string; at: number } | null;
}
export function membershipChargesForCustomer(customerId: number): MembershipCharge[] {
  const allSubs = db().prepare(
    "SELECT stripe_customer_id AS sc, stripe_subscription_id AS sid, plan, currency, amount_minor, created_at FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC",
  ).all(customerId) as { sc: string | null; sid: string; plan: string | null; currency: string | null; amount_minor: number | null; created_at: number }[];
  const subs = allSubs.filter((x) => x.sc) as { sc: string; sid: string; plan: string | null; currency: string | null; amount_minor: number | null; created_at: number }[];
  if (!allSubs.length) return [];
  const rows = !subs.length ? [] : db().prepare(
    `SELECT id, created, type, amount, net, currency, source FROM stripe_txns
     WHERE stripe_customer IN (${subs.map(() => "?").join(",")}) AND type IN ('charge','payment')
       AND (payment_intent IS NULL OR payment_intent NOT IN (SELECT payment_intent FROM orders WHERE payment_intent IS NOT NULL))
       AND (payment_intent IS NULL OR payment_intent NOT IN (SELECT payment_intent FROM member_packs WHERE payment_intent IS NOT NULL))
     ORDER BY created DESC`,
  ).all(...[...new Set(subs.map((s) => s.sc))]) as { id: string; created: number; type: string; amount: number; net: number; currency: string; source: string | null }[];
  const creditBefore = (at: number, cap: number | null) => {
    const cr = db().prepare(
      "SELECT created_at AS at, UPPER(currency) AS currency, amount_cents AS cents FROM orders WHERE customer_id = ? AND credit_coupon IS NOT NULL AND payment_state = 'paid' AND created_at <= ? ORDER BY created_at DESC LIMIT 1",
    ).get(customerId, at) as { at: number; currency: string; cents: number } | undefined;
    // a credit older than its 30-day window, or one an earlier membership already used, is not this one's
    if (!cr || at - cr.at > 30 * 86_400_000) return null;
    return { cents: Math.min(cr.cents, cap ?? cr.cents), currency: cr.currency, at: cr.at };
  };
  const charges: MembershipCharge[] = rows.map((r) => {
    // the subscription in force when this charge was made (the newest one that already existed)
    const s = subs.find((x) => x.created_at <= r.created + 3_600_000) ?? subs[subs.length - 1]!;
    // 09-29 (Neil: #678 的金额有问题吧): the first charge of a credited month says so — NT$194 = NT$269 − NT$75
    const first = Math.abs(r.created - s.created_at) < 2 * 3_600_000;
    // 10-13: a one-off month's checkout (api/pass/checkout) charges the plain pass price and never applies the credit
    // coupon — so its charge is never "first month partly paid by an earlier single purchase"
    const pass = s.sid.startsWith("pass_");
    return { ...r, plan: s.plan, planCurrency: s.currency, planAmount: s.amount_minor, pass, credit: first && !pass ? creditBefore(s.created_at, s.amount_minor) : null };
  });
  const newest = newestTxnCreated() ?? 0;
  // 09-27 (Neil: 「靠上笔订单差额成会员的，也要把这个会员订单给显示出来」): a membership whose start has no charge
  // near it — a US$0 first invoice covered by an earlier single purchase, or one we granted — still gets its line
  // 10-23 进度表 105 ⑩: a pass bought since 10-22 also writes its order row (tier pass_<n>d, session → pass_<session tail>):
  // the orders list shows it there, with its money — its start line here said 「待查」 (its charge is matched to that order)
  const passOrders = new Set((db().prepare("SELECT session_id FROM orders WHERE customer_id = ? AND substr(tier, 1, 5) = 'pass_'").all(customerId) as { session_id: string }[])
    .map((r) => `pass_${r.session_id.slice(-40)}`));
  const starts: MembershipCharge[] = allSubs
    .filter((x) => !passOrders.has(x.sid))
    .filter((x) => !charges.some((c) => Math.abs(c.created - x.created_at) < 2 * 3_600_000))
    .map((x) => {
      const comp = x.sid.startsWith("comp_");
      const pass = x.sid.startsWith("pass_");
      // 10-13: no credit for a pass either way — its checkout never applies one (see the charges above)
      const credit = comp || pass ? null : creditBefore(x.created_at, x.amount_minor);
      // 09-29 (#678): no charge found is not the same as no charge — Stripe's lines are pulled every 30 minutes, and a
      // credit smaller than the month leaves something to pay. Say "charged, not synced yet" rather than NT$0.
      // 10-13 (Neil, #1951: 「怎么可能是收费0呢」): a one-off month is paid in full at checkout (A$19.99; Stripe's
      // amount_total is the row's amount_minor), but this line used to say `!local` — "nothing in Stripe to re-read" read
      // as "nothing charged" — so for the half hour before the ledger sync a pass showed A$0 · 首月未收费. Only a grant
      // owes nothing; every other start owes its month unless an earlier single purchase covers it. (All 26 earlier passes
      // matched their charge once synced; this was only ever the gap before the sync.)
      const owes = !comp && (credit ? (x.amount_minor ?? 0) > credit.cents : true);
      const pending = owes && x.created_at > newest - 60_000;
      return {
        id: `start_${x.sid}`, created: x.created_at, type: "start", amount: 0, net: 0, currency: (x.currency ?? "USD").toUpperCase(), source: null,
        plan: x.plan, planCurrency: x.currency, planAmount: x.amount_minor, pass,
        start: { credit, comp, pending },
      };
    });
  return [...charges, ...starts].sort((a, b) => b.created - a.created);
}

/**
 * 10-23 进度表 105 ④: one customer's readings handed over under a pass and under a membership, apart — the customer page
 * called them all 「会员额度」. An allowance order's session is sub_<the unit's token>; the unit names its subscription.
 */
export function allowanceUsesForCustomer(customerId: number): { pass: number; member: number } {
  const rows = db().prepare(
    `SELECT substr(s.stripe_subscription_id, 1, 5) AS via, COUNT(*) AS n FROM orders o
       LEFT JOIN sub_uses u ON substr(o.session_id, 1, 4) = 'sub_' AND u.token = substr(o.session_id, 5)
       LEFT JOIN subscriptions s ON s.id = u.subscription_id
      WHERE o.customer_id = ? AND o.entitlement_kind = 'membership' GROUP BY 1`,
  ).all(customerId) as { via: string | null; n: number }[];
  return { pass: rows.filter((r) => r.via === "pass_").reduce((a, r) => a + r.n, 0), member: rows.filter((r) => r.via !== "pass_").reduce((a, r) => a + r.n, 0) };
}

/** 09-27: all membership money, for the customer list's headline — Stripe charges not tied to a single-purchase order. */
export function membershipRevenue(): { n: number; people: number; grossCents: number; netCents: number } {
  const byCid = membershipPaidByCustomer();
  let n = 0, gross = 0, net = 0;
  for (const v of byCid.values()) { n += v.n; gross += v.gross; net += v.net; }
  return { n, people: byCid.size, grossCents: gross, netCents: net };
}

export function saveStripeTxn(t: StripeTxn): void {
  db().prepare(
    `INSERT INTO stripe_txns (id, created, type, currency, amount, fee, net, source, payment_intent, stripe_customer, fee_tax, balance_type, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, fee = excluded.fee, net = excluded.net,
       payment_intent = COALESCE(excluded.payment_intent, stripe_txns.payment_intent),
       stripe_customer = COALESCE(excluded.stripe_customer, stripe_txns.stripe_customer),
       fee_tax = COALESCE(excluded.fee_tax, stripe_txns.fee_tax), balance_type = COALESCE(excluded.balance_type, stripe_txns.balance_type), synced_at = excluded.synced_at`,
  ).run(t.id, t.created, t.type, t.currency.toUpperCase(), t.amount, t.fee, t.net, t.source, t.payment_intent, t.stripe_customer ?? null, t.fee_tax ?? null, t.balance_type ?? "payments", Date.now());
}

export function newestTxnCreated(): number | null {
  return (db().prepare("SELECT MAX(created) AS v FROM stripe_txns").get() as { v: number | null }).v;
}

export function txnsBetween(sinceMs: number, untilMs = Number.MAX_SAFE_INTEGER): StripeTxn[] {
  return db().prepare(
    "SELECT id, created, type, currency, amount, fee, net, source, payment_intent, fee_tax, balance_type FROM stripe_txns WHERE created >= ? AND created < ? ORDER BY created DESC",
  ).all(sinceMs, untilMs) as StripeTxn[];
}

/**
 * What actually landed in Stripe since a given moment — memberships included.
 * 09-22: the headline figures were all built on the orders table, and a
 * membership has no order row, so a $79 annual sat invisible on the front page
 * while the money was plainly there in Stripe. This reads the balance-transaction
 * mirror instead and splits it: rows whose payment_intent matches one of our
 * orders are one-off readings, rows with no match are membership invoices.
 */
export interface LiveMoney {
  gross: number; fee: number; net: number;
  orders: { n: number; net: number };
  /** 10-23 进度表 105 ⑤: the one-off orders by what was bought (the finance page's buckets) — 「解读 $」 was passes, 合盘… all together */
  orderBuckets: Partial<Record<SaleKey, { n: number; net: number }>>;
  memberships: { n: number; net: number };
  /** 09-29: member add-on packs — no order row, but not a membership invoice either */
  packs: { n: number; net: number };
  refunds: { n: number; net: number };
  /** Stripe's own charges to us (stripe_fee and the like) — not a refund */
  platformFees: { n: number; net: number };
  /** 09-26: chargebacks (type adjustment/dispute): the money pulled back plus Stripe's dispute fee. They sat in platformFees. */
  disputes: { n: number; net: number };
  /** 09-26: sales alone — what Stripe's Payments page adds up (gross of charges and invoices, and their fees) */
  sales: { n: number; gross: number; fee: number };
  /** 09-25: money moved from Stripe to the bank (type payout). Not a cost — it is ours already; kept apart so 到账 matches Stripe's total and 未提现 matches its balance */
  payouts: { n: number; amount: number };
  /** 09-30: Stripe fee credits (balance_type fee_credits) — a coupon against Stripe's fees, never money. `issued` is what
   *  Stripe granted in the window, `used` what it paid of our fees; neither touches gross / net / 到账. */
  feeCredits: { issued: number; used: number; n: number };
}
export function liveMoney(sinceMs: number, untilMs = Number.MAX_SAFE_INTEGER): LiveMoney {
  const byPi = ordersByPaymentIntent();
  const packPis = packPaymentIntents();
  const out: LiveMoney = { gross: 0, fee: 0, net: 0, orders: { n: 0, net: 0 }, orderBuckets: {}, memberships: { n: 0, net: 0 }, packs: { n: 0, net: 0 }, refunds: { n: 0, net: 0 }, platformFees: { n: 0, net: 0 }, disputes: { n: 0, net: 0 }, sales: { n: 0, gross: 0, fee: 0 }, payouts: { n: 0, amount: 0 }, feeCredits: { issued: 0, used: 0, n: 0 } };
  for (const t of txnsBetween(sinceMs, untilMs)) {
    // 09-30 (Neil: 「这 500USD 是 stripe 费用抵扣券啊」): the fee-credit balance is not money. Its funding line went into
    // 平台费 as +$500 and lifted 到账 by the same; the daily deductions Stripe pays from it would have shown as our
    // costs. Both are kept on their own line and touch nothing else.
    if (t.balance_type === "fee_credits" || t.type === "fee_credit_funding") {
      out.feeCredits.n += 1;
      if (t.amount > 0) out.feeCredits.issued += t.amount; else out.feeCredits.used += -t.amount;
      continue;
    }
    const o = t.payment_intent ? byPi.get(t.payment_intent) : undefined;
    if (o?.test_flag === 1) continue; // our own walk-throughs
    // 09-25 (Neil: 「后台的账跟 Stripe 对不上」): a payout is the balance leaving for the bank, not a
    // charge against us — it was counted as a platform fee and subtracted from 到账
    if (t.type === "payout" || t.type === "payout_failure" || t.type === "payout_cancel") { out.payouts.n += 1; out.payouts.amount += -t.amount; continue; }
    out.gross += t.amount; out.fee += t.fee; out.net += t.net;
    // 09-22: "anything negative is a refund" put two of Stripe's own platform
    // fees (type stripe_fee, no payment_intent) into the refund box and the
    // panel reported 「退款 2 笔」on a day with no refunds at all.
    if (t.type === "refund" || t.type === "payment_refund") { out.refunds.n += 1; out.refunds.net += t.net; }
    else if (t.type === "charge" || t.type === "payment") {
      out.sales.n += 1; out.sales.gross += t.amount; out.sales.fee += t.fee;
      if (o) {
        out.orders.n += 1; out.orders.net += t.net;
        const b = (out.orderBuckets[saleBucket(o.tier)] ??= { n: 0, net: 0 });
        b.n += 1; b.net += t.net;
      }
      else if (t.payment_intent && packPis.has(t.payment_intent)) { out.packs.n += 1; out.packs.net += t.net; }
      else { out.memberships.n += 1; out.memberships.net += t.net; }
    } else if (t.type === "adjustment" || t.type.startsWith("dispute")) { out.disputes.n += 1; out.disputes.net += t.net; }
    else { out.platformFees.n += 1; out.platformFees.net += t.net; }
  }
  return out;
}

/** 09-30: the fee-credit coupon as our ledger has it — issued so far, used so far (Stripe's page is the authority). */
export function feeCreditBalance(): { issued: number; used: number; left: number; lastUsedAt: number | null } {
  const r = db().prepare(
    `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS issued,
            COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS used,
            MAX(CASE WHEN amount < 0 THEN created END) AS last_used
     FROM stripe_txns WHERE balance_type = 'fee_credits' OR type = 'fee_credit_funding'`,
  ).get() as { issued: number; used: number; last_used: number | null };
  return { issued: r.issued, used: r.used, left: Math.max(0, r.issued - r.used), lastUsedAt: r.last_used };
}

/** How an earlier order settled its currency — an upgrade inherits it (09-22). */
export function orderTrace(sessionId: string): { curSrc: string | null; tzName: string | null; edgeCountry: string | null } | null {
  const r = db().prepare("SELECT cur_src, tz_name, edge_country FROM orders WHERE session_id = ?").get(sessionId) as
    { cur_src: string | null; tz_name: string | null; edge_country: string | null } | undefined;
  return r ? { curSrc: r.cur_src, tzName: r.tz_name, edgeCountry: r.edge_country } : null;
}

export function saveCardCountry(sessionId: string, country: string | null): void {
  if (!country) return;
  db().prepare("UPDATE orders SET card_country = ? WHERE session_id = ?").run(country.toUpperCase(), sessionId);
}

/**
 * Orders where the card's own country disagrees with the currency we charged
 * (09-22). No signal available BEFORE payment names the buyer's country
 * reliably — the card does, and only afterwards. So rather than pretend we can
 * guess it, we check our guess against the answer and show the misses.
 */
export interface CurrencyMiss {
  id: number; created_at: number; email: string | null; tier: string;
  currency: string | null; amount_cents: number | null;
  card_country: string; should_be: string;
  cur_src: string | null; tz_name: string | null; edge_country: string | null;
}
const CARD_CURRENCY: Record<string, string> = {
  US: "USD", CN: "CNY", TW: "TWD", HK: "HKD", MO: "HKD", JP: "JPY", KR: "KRW",
  GB: "GBP", CA: "CAD", AU: "AUD", SG: "SGD", BR: "BRL", MX: "MXN", CH: "CHF", MY: "MYR",
};
export function currencyMisses(sinceMs: number): CurrencyMiss[] {
  const rows = db().prepare(
    `SELECT id, created_at, email, tier, currency, amount_cents, card_country, cur_src, tz_name, edge_country
     FROM orders
     WHERE created_at >= ? AND card_country IS NOT NULL AND amount_cents > 0
       AND COALESCE(test_flag,0) = 0 AND payment_state IN ('paid','refunded')
     ORDER BY created_at DESC`,
  ).all(sinceMs) as Omit<CurrencyMiss, "should_be">[];
  return rows
    .map((r) => ({ ...r, should_be: CARD_CURRENCY[r.card_country] ?? "" }))
    .filter((r) => r.should_be && r.should_be !== (r.currency ?? "").toUpperCase());
}

/** payment_intent → the order it paid for, when we have one (a membership invoice has none). */
type OrderByPi = { session_id: string; tier: string; currency: string | null; amount_cents: number | null; test_flag: number | null; email: string | null; campaign: string | null; browser_sid: string | null };
export function ordersByPaymentIntent(): Map<string, OrderByPi> {
  const rows = db().prepare(
    "SELECT payment_intent, session_id, tier, currency, amount_cents, test_flag, email, campaign, browser_sid FROM orders WHERE payment_intent IS NOT NULL",
  ).all() as (OrderByPi & { payment_intent: string })[];
  return new Map(rows.map((r) => [r.payment_intent, r]));
}

/** Live memberships with what each actually charges, in its own currency (the mirror, no Stripe call). */
export function activeSubscriptionAmounts(): { plan: string; currency: string; amount_minor: number }[] {
  return db().prepare(
    `SELECT plan, UPPER(COALESCE(currency,'USD')) AS currency, COALESCE(amount_minor,0) AS amount_minor
     FROM subscriptions WHERE status IN ('active','trialing') AND ${NOT_OURS}
       AND substr(stripe_subscription_id,1,5) <> 'pass_'  -- 09-26: a one-off month is not recurring revenue
       AND (period_end IS NULL OR period_end > ?)`,
  ).all(Date.now()) as { plan: string; currency: string; amount_minor: number }[];
}

/** Orders that still need (or need re-reading of) their Stripe ledger figures. */
export function ordersNeedingLedger(limit = 25): { session_id: string; payment_intent: string }[] {
  return db().prepare(
    `SELECT session_id, payment_intent FROM orders
     WHERE payment_intent IS NOT NULL AND amount_cents > 0
       AND payment_state IN ('paid','refunded','disputed')
       AND (ledger_at IS NULL OR (refunded_at IS NOT NULL AND ledger_at < refunded_at))
       AND COALESCE(ledger_tries, 0) < 5
     ORDER BY created_at DESC LIMIT ?`,
  ).all(limit) as { session_id: string; payment_intent: string }[];
}

/**
 * 09-22: an order Stripe will never hand back (a sandbox charge from before we
 * went live, say) was retried on every heartbeat for ever, printing
 * "ledger_sync failed=1" into ops until it drowned everything else out.
 * Five attempts, then we leave it alone.
 */
export function noteLedgerFailure(sessionId: string): void {
  db().prepare("UPDATE orders SET ledger_tries = COALESCE(ledger_tries, 0) + 1 WHERE session_id = ?").run(sessionId);
}

/** A subscription Stripe says no longer exists: stop treating it as live. */
export function markSubscriptionGone(stripeSubscriptionId: string): void {
  db().prepare("UPDATE subscriptions SET status = 'canceled', updated_at = ?, synced_at = ? WHERE stripe_subscription_id = ?")
    .run(Date.now(), Date.now(), stripeSubscriptionId);
}

export function saveOrderLedger(sessionId: string, i: { currency: string; settled: number; fee: number; net: number; refundNet: number }): void {
  db().prepare(
    `UPDATE orders SET settle_currency = ?, settled_cents = ?, fee_cents = ?, net_cents = ?, refund_net_cents = ?, ledger_at = ?
     WHERE session_id = ?`,
  ).run(i.currency.toUpperCase(), i.settled, i.fee, i.net, i.refundNet, Date.now(), sessionId);
}

export interface LedgerTotals {
  currency: string; orders: number; settled: number; fee: number; net: number; refundNet: number; unpriced: number;
}
/**
 * What Stripe actually settled in a period, in the settlement currency. Test
 * runs out. `untilMs` is exclusive (so month boundaries do not double-count)
 * and unbounded by default — an order written in this very millisecond still
 * shows up.
 */
export function ledgerTotals(sinceMs: number, untilMs = Number.MAX_SAFE_INTEGER): LedgerTotals[] {
  const rows = db().prepare(
    `SELECT UPPER(COALESCE(settle_currency,'USD')) AS currency, COUNT(*) AS orders,
            COALESCE(SUM(settled_cents),0) AS settled, COALESCE(SUM(fee_cents),0) AS fee,
            COALESCE(SUM(net_cents),0) AS net, COALESCE(SUM(refund_net_cents),0) AS refundNet,
            SUM(CASE WHEN net_cents IS NULL THEN 1 ELSE 0 END) AS unpriced
     FROM orders
     WHERE created_at >= ? AND created_at < ? AND amount_cents > 0 AND COALESCE(test_flag,0) = 0
       AND payment_state IN ('paid','refunded','disputed')
     GROUP BY 1 ORDER BY net DESC`,
  ).all(sinceMs, untilMs) as LedgerTotals[];
  return rows;
}

export interface CostRow {
  id: number; kind: string; label: string; amount_cents: number; currency: string;
  started_on: string | null; ended_on: string | null; spent_on: string | null; note: string | null; created_at: number;
}
export function listCosts(): CostRow[] {
  return db().prepare("SELECT * FROM costs ORDER BY kind ASC, id ASC").all() as CostRow[];
}
export function addCost(i: { kind: "monthly" | "once"; label: string; amountCents: number; currency: string; startedOn?: string | null; endedOn?: string | null; spentOn?: string | null; note?: string | null }): void {
  db().prepare(
    `INSERT INTO costs (kind, label, amount_cents, currency, started_on, ended_on, spent_on, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(i.kind, i.label.slice(0, 80), i.amountCents, i.currency.toUpperCase().slice(0, 3), i.startedOn ?? null, i.endedOn ?? null, i.spentOn ?? null, (i.note ?? null) && i.note!.slice(0, 200), Date.now());
}
export function deleteCost(id: number): void {
  db().prepare("DELETE FROM costs WHERE id = ?").run(id);
}
export function costsSeeded(): boolean {
  return (db().prepare("SELECT COUNT(*) AS v FROM costs").get() as { v: number }).v > 0;
}

export function recordProviderBalance(provider: string, currency: string, balance: number): void {
  db().prepare("INSERT INTO provider_balances (provider, at, currency, balance) VALUES (?,?,?,?)").run(provider, Date.now(), currency.toUpperCase(), balance);
}
/* ---- 解读页被打开的次数 (09-27) ---- */
export function countReadingView(sid: string, now = Date.now()): void {
  try {
    db().prepare(
      `INSERT INTO reading_views (session_id, n, first_at, last_at) VALUES (?, 1, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET n = n + 1, last_at = excluded.last_at`,
    ).run(sid, now, now);
  } catch { /* a count is never worth failing a page */ }
}
export function readingViews(sids: string[]): Map<string, { n: number; first_at: number; last_at: number }> {
  const out = new Map<string, { n: number; first_at: number; last_at: number }>();
  if (!sids.length) return out;
  for (let i = 0; i < sids.length; i += 400) {
    const part = sids.slice(i, i + 400);
    const rows = db().prepare(`SELECT session_id, n, first_at, last_at FROM reading_views WHERE session_id IN (${part.map(() => "?").join(",")})`).all(...part) as { session_id: string; n: number; first_at: number; last_at: number }[];
    for (const r of rows) out.set(r.session_id, { n: r.n, first_at: r.first_at, last_at: r.last_at });
  }
  return out;
}

/* ---- AWS 实时账单 (09-27) ---- */
export interface AwsCostRow { day: string; service: string; usd: number; estimated: boolean }
export function saveAwsCostDays(rows: AwsCostRow[], now = Date.now()): void {
  const d = db();
  const st = d.prepare(
    `INSERT INTO aws_cost_daily (day, service, usd, estimated, fetched_at) VALUES (?,?,?,?,?)
     ON CONFLICT(day, service) DO UPDATE SET usd = excluded.usd, estimated = excluded.estimated, fetched_at = excluded.fetched_at`,
  );
  d.exec("BEGIN");
  try {
    for (const r of rows) st.run(r.day, r.service, r.usd, r.estimated ? 1 : 0, now);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function awsCostFetchedAt(): number | null {
  return (db().prepare("SELECT MAX(fetched_at) AS v FROM aws_cost_daily").get() as { v: number | null }).v;
}
/** Per service over [fromDay, toDay) (UTC YYYY-MM-DD), largest first; `lastDay` is the newest day with any figure. */
export function awsCostBetween(fromDay: string, toDay: string): { service: string; usd: number; estimated: boolean }[] {
  return (db().prepare(
    `SELECT service, SUM(usd) AS usd, MAX(estimated) AS est FROM aws_cost_daily WHERE day >= ? AND day < ? GROUP BY service HAVING SUM(usd) >= 0.005 ORDER BY SUM(usd) DESC`,
  ).all(fromDay, toDay) as { service: string; usd: number; est: number }[]).map((r) => ({ service: r.service, usd: r.usd, estimated: r.est > 0 }));
}
export function awsCostDays(): { first: string | null; last: string | null } {
  const r = db().prepare("SELECT MIN(day) AS first, MAX(day) AS last FROM aws_cost_daily WHERE usd > 0").get() as { first: string | null; last: string | null };
  return r;
}

export function lastProviderBalance(provider: string): { at: number; currency: string; balance: number } | null {
  return (db().prepare("SELECT at, currency, balance FROM provider_balances WHERE provider = ? ORDER BY at DESC LIMIT 1").get(provider) ?? null) as { at: number; currency: string; balance: number } | null;
}
/** Readings in a period, oldest first — spend is the sum of the drops between them (a top-up shows as a rise and is skipped). */
export function providerBalanceSeries(provider: string, sinceMs: number): { at: number; currency: string; balance: number }[] {
  return db().prepare("SELECT at, currency, balance FROM provider_balances WHERE provider = ? AND at >= ? ORDER BY at ASC").all(provider, sinceMs) as { at: number; currency: string; balance: number }[];
}
export function providerList(): string[] {
  return (db().prepare("SELECT DISTINCT provider FROM provider_balances").all() as { provider: string }[]).map((r) => r.provider);
}

/* ---------------- 大众一卦 (09-21, A2) ---------------- */

export function dailyCast(day: string, locale: string, pile: number): { note: string; watch: string } | null {
  return (db().prepare("SELECT note, watch FROM daily_casts WHERE day = ? AND locale = ? AND pile = ?").get(day, locale, pile) ?? null) as { note: string; watch: string } | null;
}

export function saveDailyCast(i: { day: string; locale: string; pile: number; values: readonly number[]; primaryNum: number; note: string; watch: string }): void {
  db().prepare(
    `INSERT INTO daily_casts (day, locale, pile, values_str, primary_num, note, watch, created_at)
     VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(day, locale, pile) DO NOTHING`,
  ).run(i.day, i.locale, i.pile, i.values.join(","), i.primaryNum, i.note, i.watch, Date.now());
}

/** The customer's one-tap verdict from the revisit email; the latest tap wins. */
/** Record an answer: the score, and (10-07) the fact behind it and the lean it was scored against. The latest tap wins. */
export function setRevisitOutcome(id: number, outcome: RevisitOutcome, facts: { event?: RevisitEvent | null; lean?: ReadingLean | null } = {}): boolean {
  const r = db().prepare("UPDATE revisits SET outcome = ?, outcome_at = ?, event = COALESCE(?, event), lean = COALESCE(?, lean) WHERE id = ?")
    .run(outcome, Date.now(), facts.event ?? null, facts.lean ?? null, id);
  return Number((r as unknown as { changes?: number }).changes ?? 1) > 0;
}

/** 10-31 进度表 129 ④: the day the reader says it actually happened, when it was not in the named window. */
export function setRevisitOffDate(id: number, ymd: string | null): void {
  db().prepare("UPDATE revisits SET off_date = ? WHERE id = ?").run(ymd, id);
}

/** 11-05 进度表 135: the state and the plan taps; either may be absent (skipped), an answer given later overwrites */
export const REVISIT_STATES = ["smooth", "tight", "pressure", "breaking"] as const;
export const REVISIT_ACTED = ["done", "some", "not"] as const;
export type RevisitState = (typeof REVISIT_STATES)[number];
export type RevisitActed = (typeof REVISIT_ACTED)[number];
export function setRevisitState(id: number, state: RevisitState | null, acted: RevisitActed | null, now = Date.now()): void {
  db().prepare("UPDATE revisits SET state = COALESCE(?, state), acted = COALESCE(?, acted), state_at = ? WHERE id = ?").run(state, acted, now, id);
}

/**
 * 11-05 进度表 135: the admin cross-table — state × acted × outcome, counts only (never the reader's words).
 * Answered revisits since `since`; a skipped tap shows as "—".
 */
export function revisitStateTable(since: number): { state: string; acted: string; outcome: string; n: number }[] {
  return db().prepare(`SELECT COALESCE(state,'—') AS state, COALESCE(acted, CASE WHEN plan IS NULL THEN 'no_plan' ELSE '—' END) AS acted,
      COALESCE(outcome,'—') AS outcome, COUNT(*) AS n
    FROM revisits WHERE outcome IS NOT NULL AND COALESCE(outcome_at, created_at) >= ?
    GROUP BY 1,2,3 ORDER BY n DESC`).all(since) as { state: string; acted: string; outcome: string; n: number }[];
}

/** 11-05 进度表 135: the answer rate before and after the two questions were added (the acceptance line) */
export function revisitAnswerRate(from: number, to: number): { due: number; answered: number; withState: number } {
  const r = db().prepare(`SELECT COUNT(*) AS due, SUM(outcome IS NOT NULL) AS answered, SUM(state IS NOT NULL) AS with_state
    FROM revisits WHERE due_at >= ? AND due_at < ? AND kind IS NULL`).get(from, to) as { due: number; answered: number | null; with_state: number | null };
  return { due: Number(r.due), answered: Number(r.answered ?? 0), withState: Number(r.with_state ?? 0) };
}

/** The reward already minted for this revisit's reading (either kind), if any — one per reading. */
export function revisitRewardForSession(sessionId: string): GrantRow | null {
  return (db().prepare("SELECT * FROM grants WHERE kind IN ('revisit_light','revisit_followup') AND from_session_id = ? LIMIT 1").get(sessionId) ?? null) as GrantRow | null;
}

/** Extra follow-ups this reading has earned (09-21: one per "没应验" answer, never more than one). */
export function followupBonus(sessionId: string): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM grants WHERE kind = 'revisit_followup' AND from_session_id = ?").get(sessionId) as { v: number }).v;
}

/** "还没定" → put the revisit back in the queue two weeks out, once. Returns false when it was already re-asked. */
export function reaskRevisit(id: number, delayMs = 14 * 86_400_000): boolean {
  const r = db().prepare(
    "UPDATE revisits SET status = 'pending', due_at = ?, reasked_at = ? WHERE id = ? AND reasked_at IS NULL",
  ).run(Date.now() + delayMs, Date.now(), id);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** Revisit mails sent ≥ <days> ago with no answer and no reminder yet (oldest first). */
export function revisitsToRemind(days: number, limit = 20): RevisitRow[] {
  return db().prepare(
    `SELECT * FROM revisits WHERE status = 'sent' AND outcome IS NULL AND reminded_at IS NULL AND sent_at <= ?
     ORDER BY sent_at ASC LIMIT ?`,
  ).all(Date.now() - days * 86_400_000, limit) as RevisitRow[];
}

export function markRevisitReminded(id: number): void {
  db().prepare("UPDATE revisits SET reminded_at = ? WHERE id = ?").run(Date.now(), id);
}

export interface OutcomeStats {
  answered: number; hit: number; partial: number; miss: number; open: number; unanswered: number;
  /** 10-07: answered, but not scorable — the reading leaned "even" or its lean is unknown, or the question had nothing to verify */
  unclear: number;
  /** 10-07: answers given before the facts were kept apart from the score (event IS NULL) — scored by the old "did it happen" buttons */
  legacy: number;
  byTier: { tier: string; hit: number; miss: number }[];
}

/**
 * Accuracy as the customers themselves report it — the product's falsifiable claim, kept honestly. 10-07: hit and miss
 * are the reading's score against its own lean (lib/revisit-judge.ts); answers that cannot score it are `unclear`.
 */
export function outcomeStats(): OutcomeStats {
  const d = db();
  const one = (s: string) => (d.prepare(s).get() as { v: number } | undefined)?.v ?? 0;
  // 10-22 进度表 80: the 看自己 revisits (kind set) are counted on their own line — never in the readings' record
  const C = `kind IS NULL AND ${NOT_OURS}`;
  const hit = one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome = 'hit' AND ${C}`);
  const miss = one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome = 'miss' AND ${C}`);
  const open = one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome = 'open' AND ${C}`);
  const partial = one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome = 'partial' AND ${C}`);
  const unclear = one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome = 'unclear' AND ${C}`);
  const legacy = one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome IN ('hit','partial','miss') AND event IS NULL AND ${C}`);
  const unanswered = one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'sent' AND outcome IS NULL AND ${C}`);
  const byTier = d.prepare(
    `SELECT tier, SUM(outcome = 'hit') AS hit, SUM(outcome = 'miss') AS miss
     FROM revisits WHERE outcome IN ('hit','miss') AND ${C} GROUP BY tier`,
  ).all() as { tier: string; hit: number; miss: number }[];
  return { answered: hit + partial + miss + open + unclear, hit, partial, miss, open, unclear, legacy, unanswered, byTier };
}

/* ---------------- referrals (推荐奖励) ---------------- */

export interface ReferralRow {
  id: number; created_at: number; via: string;
  referrer_customer_id: number; referred_customer_id: number | null; referred_session_id: string;
  token: string; tier: string; expires_at: number; used_at: number | null;
  redeem_session_id: string | null; input_json: string | null; locale: string | null;
}

/**
 * Who shared the cast behind this share code? The code is the six line values,
 * so we take the most recent PAID cast with those values that belongs to a
 * customer other than the buyer. Collisions are possible in principle; at our
 * scale the latest matching sharer is the right person.
 */
export function referrerForVia(via: string, excludeEmail: string): { customerId: number; email: string; locale: string | null } | null {
  if (!/^[6789]{6}$/.test(via)) return null;
  const valuesStr = via.split("").join(",");
  const row = db().prepare(
    `SELECT cu.id AS customerId, cu.email, cu.locale
     FROM casts c JOIN customers cu ON cu.id = c.customer_id
     WHERE c.values_str = ? AND c.customer_id IS NOT NULL AND cu.email != ?
     ORDER BY c.created_at DESC LIMIT 1`,
  ).get(valuesStr, excludeEmail.trim().toLowerCase()) as { customerId: number; email: string; locale: string | null } | undefined;
  return row ?? null;
}

export function customerEmailById(customerId: number): string | null {
  return (db().prepare("SELECT email FROM customers WHERE id = ?").get(customerId) as { email: string } | undefined)?.email ?? null;
}

/**
 * True once the account has had a deep reading at a price — paid, or claimed
 * through the painted door (which showed the same price) — so the first-time
 * price is gone. Referral rewards and membership allowances do not count.
 */
/**
 * A second address the same person paid with (09-22). We do not merge customer
 * rows — that would rewrite history — but we do record the link, so asking
 * "has this person already had the first-time price" by either address finds
 * the same answer. Nothing else reads it; it is deliberately one flat column.
 */
export function noteAlternateEmail(customerId: number, email: string): void {
  const row = db().prepare("SELECT email, alt_emails FROM customers WHERE id = ?").get(customerId) as
    { email: string; alt_emails: string | null } | undefined;
  if (!row) return;
  const e = email.trim().toLowerCase();
  if (!e || e === row.email.toLowerCase()) return;
  const have = (row.alt_emails ?? "").split(",").filter(Boolean);
  if (have.includes(e)) return;
  // 10-22: room for merged accounts' addresses too (was 5) — dropping one would let it start a new account again
  db().prepare("UPDATE customers SET alt_emails = ? WHERE id = ?").run([...have, e].slice(-12).join(","), customerId);
}

/** Same question, asked by address — the payer's email need not be the account's. */
export function emailHasPaidDeep(email: string): boolean {
  return !!db().prepare(
    `SELECT 1 FROM orders WHERE tier = 'deep' AND (payment_state = 'paid' OR refund_reason = 'guarantee')
       AND (LOWER(email) = LOWER(?) OR customer_id IN (
             SELECT id FROM customers WHERE LOWER(email) = LOWER(?)
                OR (',' || LOWER(COALESCE(alt_emails,'')) || ',') LIKE ('%,' || LOWER(?) || ',%')))
     LIMIT 1`,
  ).get(email, email, email);
}

export function customerHasPaidDeep(customerId: number): boolean {
  // only money counts: a painted-door gift (09-10, 总方案 §14 ②) and a refunded
  // order both leave the first-time price available
  // 09-26: a first-purchase guarantee refund spends the first price too — one of the two, not both, once each
  return !!db().prepare("SELECT 1 FROM orders WHERE customer_id = ? AND tier = 'deep' AND (payment_state = 'paid' OR refund_reason = 'guarantee') LIMIT 1").get(customerId);
}

export function customerOrdersCount(customerId: number): number {
  return (db().prepare("SELECT orders_count AS v FROM customers WHERE id = ?").get(customerId) as { v: number } | undefined)?.v ?? 0;
}

export function createReferral(i: {
  via: string; referrerCustomerId: number; referredCustomerId: number | null; referredSessionId: string;
  token: string; expiresAt: number; locale: string | null;
  /** 09-29: a member's thank-you — counted into the current allowance, the link itself spent at birth */
  toAllowance?: boolean;
}): boolean {
  try {
    const now = Date.now();
    db().prepare(
      `INSERT INTO referrals (created_at, via, referrer_customer_id, referred_customer_id, referred_session_id, token, tier, expires_at, locale, to_allowance, used_at)
       VALUES (?,?,?,?,?,?,'deep',?,?,?,?)`,
    ).run(now, i.via, i.referrerCustomerId, i.referredCustomerId, i.referredSessionId, i.token, i.expiresAt, i.locale, i.toAllowance ? 1 : null, i.toAllowance ? now : null);
    return true;
  } catch {
    return false; // this referred customer was already credited once
  }
}

/** 09-29: thank-you readings a referrer has been given since `since` (any thread). */
export function referralsSince(referrerCustomerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM referrals WHERE referrer_customer_id = ? AND created_at >= ?").get(referrerCustomerId, since) as { n: number }).n;
}

/** 09-29: givers with many thank-you readings in the window — a dashboard flag for a human look, never a block. */
export function heavyClaimGivers(since: number, atLeast: number): { customer_id: number; email: string | null; n: number }[] {
  return db().prepare(
    `SELECT r.referrer_customer_id AS customer_id, c.email, COUNT(*) AS n FROM referrals r LEFT JOIN customers c ON c.id = r.referrer_customer_id
     WHERE r.created_at >= ? AND (r.via LIKE 'claim:%' OR r.via LIKE 'share:%') GROUP BY 1 HAVING n >= ? ORDER BY n DESC`,
  ).all(since, atLeast) as unknown as { customer_id: number; email: string | null; n: number }[];
}

/** 09-29: the sharer's ref for one of their readings — minted once, stable, 8 characters. */
export function shareRefForSession(sessionId: string, customerId: number, device: string | null): string {
  const d = db();
  const have = d.prepare("SELECT ref FROM share_refs WHERE session_id = ?").get(sessionId) as { ref: string } | undefined;
  if (have) return have.ref;
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let i = 0; i < 5; i++) {
    const bytes = randomBytesSafe(8);
    const ref = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    try {
      d.prepare("INSERT INTO share_refs (ref, session_id, customer_id, device, created_at) VALUES (?,?,?,?,?)").run(ref, sessionId, customerId, device, Date.now());
      return ref;
    } catch { /* collision: try again */ }
  }
  throw new Error("share_ref_mint_failed");
}
export function shareRefOwner(ref: string): { customer_id: number; session_id: string; device: string | null } | null {
  if (!/^[a-z2-9]{8}$/.test(ref)) return null;
  return (db().prepare("SELECT customer_id, session_id, device FROM share_refs WHERE ref = ?").get(ref) ?? null) as { customer_id: number; session_id: string; device: string | null } | null;
}
/** 09-29 会员裂变 ④: the giver's line for the friend — only while the gift is unspent. */
export function setGiftNote(token: string, note: string | null): void {
  db().prepare("UPDATE grants SET note = ? WHERE token = ? AND kind = 'gift_cast' AND used_at IS NULL").run(note, token);
}
export function giftNoteFor(token: string): string | null {
  const r = db().prepare("SELECT note FROM grants WHERE token = ? AND kind = 'gift_cast' AND used_at IS NULL AND expires_at > ?").get(token, Date.now()) as { note: string | null } | undefined;
  return r?.note ?? null;
}
export function setGrantRef(token: string, ref: string): void {
  db().prepare("UPDATE grants SET ref = ? WHERE token = ?").run(ref, token);
}

/** 09-29 推荐入口: how many newcomers this person has brought (thank-you readings earned, any thread) and how many of those were given. */
export function myReferralStats(customerId: number): { brought: number; got: number } {
  const r = db().prepare("SELECT COUNT(*) AS n FROM referrals WHERE referrer_customer_id = ?").get(customerId) as { n: number };
  return { brought: r.n, got: r.n };
}

export function referralByToken(token: string): ReferralRow | null {
  return (db().prepare("SELECT * FROM referrals WHERE token = ?").get(token) ?? null) as ReferralRow | null;
}

/** Burn the token with the cast it was spent on; false if already used. */
export function redeemReferral(token: string, redeemSessionId: string, inputJson: string): boolean {
  const r = db().prepare(
    "UPDATE referrals SET used_at = ?, redeem_session_id = ?, input_json = ? WHERE token = ? AND used_at IS NULL",
  ).run(Date.now(), redeemSessionId, inputJson, token);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/* ---------------- grants: 送一卦 & 双边推荐 (09-10) ---------------- */

/**
 * gift_cast / invite_light / joint: 裂变 V1–V2 (see lib/grants.ts).
 * revisit_light (09-21): the reader said a deep reading CAME TRUE — one light
 * reading on "what comes next" for the same matter, 30 days, from_session_id
 * = the deep reading. revisit_followup: the reader said it DIDN'T — one extra
 * follow-up on that reading (a token that is never redeemed into a session;
 * the follow-up route just counts it). One reward per revisit, whichever came first.
 */
export type GrantKind = "gift_cast" | "invite_light" | "joint" | "revisit_light" | "revisit_followup" | "case_light" | "comp" | "ref_light";
export interface GrantRow {
  id: number; token: string; kind: GrantKind; tier: string; created_at: number; expires_at: number;
  from_customer_id: number | null; from_session_id: string | null; via: string | null; locale: string | null;
  used_at: number | null; redeem_session_id: string | null; input_json: string | null;
  claimed_email: string | null; claimed_customer_id: number | null;
  /** 09-27: the browser (yf_dv cookie) that made the gift / the one that spent it — see lib/device */
  from_device?: string | null; claim_device?: string | null;
  /** 09-29: the sharer's ref this newcomer's free reading came through */
  ref?: string | null;
  /** 09-29: the giver's one line for the friend */
  note?: string | null;
}

export function createGrant(i: {
  token: string; kind: GrantKind; tier: string; expiresAt: number;
  fromCustomerId?: number | null; fromSessionId?: string | null; via?: string | null; locale?: string | null;
  fromDevice?: string | null;
}): void {
  db().prepare(
    `INSERT INTO grants (token, kind, tier, created_at, expires_at, from_customer_id, from_session_id, via, locale, from_device)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(i.token, i.kind, i.tier, Date.now(), i.expiresAt, i.fromCustomerId ?? null, i.fromSessionId ?? null, i.via ?? null, i.locale ?? null, i.fromDevice ?? null);
}

/** 09-27: remember which browser spent a grant — the next gift made from that reading must not come back to it. */
export function setGrantClaimDevice(token: string, device: string | null): void {
  if (!device) return;
  db().prepare("UPDATE grants SET claim_device = ? WHERE token = ? AND claim_device IS NULL").run(device, token);
}

export function grantByToken(token: string): GrantRow | null {
  return (db().prepare("SELECT * FROM grants WHERE token = ?").get(token) ?? null) as GrantRow | null;
}

export function grantByRedeemSession(sid: string): GrantRow | null {
  return (db().prepare("SELECT * FROM grants WHERE redeem_session_id = ?").get(sid) ?? null) as GrantRow | null;
}

/** The gift link already minted from this paid reading, if any — one per reading. */
export function giftCastForSession(fromSessionId: string): GrantRow | null {
  return (db().prepare("SELECT * FROM grants WHERE kind = 'gift_cast' AND from_session_id = ? LIMIT 1").get(fromSessionId) ?? null) as GrantRow | null;
}

/** Burn the token with the cast it is spent on; false when already used. */
export function redeemGrant(token: string, redeemSessionId: string, inputJson: string, claimedEmail: string | null, claimedCustomerId: number | null): boolean {
  const r = db().prepare(
    "UPDATE grants SET used_at = ?, redeem_session_id = ?, input_json = ?, claimed_email = ?, claimed_customer_id = ? WHERE token = ? AND used_at IS NULL",
  ).run(Date.now(), redeemSessionId, inputJson, claimedEmail, claimedCustomerId, token);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** Has this account already had its newcomer light reading? */
/**
 * 10-18 (Neil 看 #2350：「同一个邮箱，为什么可以两次新人免费呢？」): a first-timer's free reading was filed with the
 * address but no customer id (the customer row is made after the grant), so this check — by id only — never saw it,
 * and the same address got a second one from another browser two minutes later. 40 addresses had. The address on the
 * grant counts too now.
 */
export function customerHadInviteLight(customerId: number): boolean {
  return !!db().prepare(
    `SELECT 1 FROM grants WHERE kind = 'invite_light' AND (claimed_customer_id = ?
       OR (claimed_email IS NOT NULL AND lower(claimed_email) = (SELECT lower(email) FROM customers WHERE id = ?))) LIMIT 1`,
  ).get(customerId, customerId);
}

/** The same, by address alone — for an address that has no customer row yet (10-18). */
export function emailHadInviteLight(email: string): boolean {
  return !!db().prepare("SELECT 1 FROM grants WHERE kind = 'invite_light' AND lower(claimed_email) = lower(?) LIMIT 1").get(email.trim());
}

export function grantStats(sinceMs: number): { giftSent: number; giftClaimed: number; inviteLight: number } {
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get(sinceMs) as { v: number }).v;
  return {
    giftSent: one("SELECT COUNT(*) AS v FROM grants WHERE kind = 'gift_cast' AND created_at >= ?"),
    giftClaimed: one("SELECT COUNT(*) AS v FROM grants WHERE kind = 'gift_cast' AND used_at >= ?"),
    inviteLight: one("SELECT COUNT(*) AS v FROM grants WHERE kind = 'invite_light' AND used_at >= ?"),
  };
}

/* ---------------- 我的推荐: what one account has shared, given and earned (§14 ⑩) ---------------- */

export interface MyGiftRow { token: string; created_at: number; expires_at: number; used_at: number | null; from_session_id: string | null; locale: string | null }
/** Gift links this account minted, newest first. Never the claimant's email — that is the friend's business. */
export function giftsFromCustomer(customerId: number): MyGiftRow[] {
  return db().prepare(
    `SELECT token, created_at, expires_at, used_at, from_session_id, locale FROM grants
     WHERE kind = 'gift_cast' AND from_customer_id = ? ORDER BY created_at DESC LIMIT 100`,
  ).all(customerId) as unknown as MyGiftRow[];
}

export interface MyRewardRow { id: number; created_at: number; expires_at: number; used_at: number | null; token: string; locale: string | null }
/** Referral rewards (a friend's first payment → one free deep reading) this account earned, newest first. */
export function rewardsForCustomer(customerId: number): MyRewardRow[] {
  return db().prepare(
    "SELECT id, created_at, expires_at, used_at, token, locale FROM referrals WHERE referrer_customer_id = ? ORDER BY created_at DESC LIMIT 100",
  ).all(customerId) as unknown as MyRewardRow[];
}

export interface GiftableRow { session_id: string; cast_at: number; question: string; values_str: string; primary_num: number; changed_num: number | null }
/** Deep readings this account paid for — money or membership — that have not given their one gift away yet. */
export function giftableReadingsForCustomer(customerId: number): GiftableRow[] {
  return db().prepare(
    `SELECT o.session_id, c.cast_at, c.question, c.values_str, c.primary_num, c.changed_num
     FROM orders o JOIN casts c ON c.id = o.cast_id
     WHERE o.customer_id = ? AND o.tier = 'deep' AND (o.payment_state = 'paid' OR o.entitlement_kind = 'membership')
       AND NOT EXISTS (SELECT 1 FROM grants g WHERE g.kind = 'gift_cast' AND g.from_session_id = o.session_id)
     ORDER BY o.created_at DESC LIMIT 50`,
  ).all(customerId) as unknown as GiftableRow[];
}

/** Newcomers who took the free first light reading through any of these share codes. */
export function inviteLightCountForCodes(codes: string[]): number {
  if (codes.length === 0) return 0;
  const marks = codes.map(() => "?").join(",");
  return (db().prepare(`SELECT COUNT(*) AS v FROM grants WHERE kind = 'invite_light' AND via IN (${marks})`).get(...codes) as { v: number }).v;
}

/* ---------------- pairs: 同题合参 (09-10, 裂变 V2 ⑥) ---------------- */

export interface PairRow {
  id: number; token: string; created_at: number; expires_at: number; topic: string; framing: string;
  a_session_id: string; a_customer_id: number | null; a_locale: string;
  b_session_id: string | null; b_customer_id: number | null; b_locale: string | null;
  claimed_at: number | null; joint_json: string | null; dissolved_at: number | null;
}

export function createPair(i: { token: string; expiresAt: number; topic: string; framing: string; aSessionId: string; aCustomerId: number | null; aLocale: string }): void {
  db().prepare(
    `INSERT INTO pairs (token, created_at, expires_at, topic, framing, a_session_id, a_customer_id, a_locale) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(i.token, Date.now(), i.expiresAt, i.topic, i.framing, i.aSessionId, i.aCustomerId, i.aLocale);
}

export function pairByToken(token: string): PairRow | null {
  return (db().prepare("SELECT * FROM pairs WHERE token = ?").get(token) ?? null) as PairRow | null;
}

/** The pair a reading session belongs to, on either side. */
export function pairBySession(sid: string): PairRow | null {
  return (db().prepare("SELECT * FROM pairs WHERE a_session_id = ? OR b_session_id = ? LIMIT 1").get(sid, sid) ?? null) as PairRow | null;
}

/** The invitee's cast lands: false when already claimed. */
export function claimPair(token: string, bSessionId: string, bCustomerId: number | null, bLocale: string): boolean {
  const r = db().prepare(
    "UPDATE pairs SET b_session_id = ?, b_customer_id = ?, b_locale = ?, claimed_at = ? WHERE token = ? AND b_session_id IS NULL AND dissolved_at IS NULL",
  ).run(bSessionId, bCustomerId, bLocale, Date.now(), token);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** Cache one generated joint reading under "<role>:<locale>". */
export function setPairJoint(token: string, key: string, value: unknown): void {
  const row = pairByToken(token);
  if (!row) return;
  const json = row.joint_json ? (JSON.parse(row.joint_json) as Record<string, unknown>) : {};
  json[key] = value;
  db().prepare("UPDATE pairs SET joint_json = ? WHERE token = ?").run(JSON.stringify(json), token);
}

export function dissolvePair(token: string): void {
  db().prepare("UPDATE pairs SET dissolved_at = ? WHERE token = ? AND dissolved_at IS NULL").run(Date.now(), token);
}

/** For the customer file: which pairs this account took part in (never the other person). */
export function pairsForCustomer(customerId: number): { token: string; created_at: number; role: "a" | "b"; claimed_at: number | null; dissolved_at: number | null }[] {
  return db().prepare(
    `SELECT token, created_at, CASE WHEN a_customer_id = ? THEN 'a' ELSE 'b' END AS role, claimed_at, dissolved_at
     FROM pairs WHERE a_customer_id = ? OR b_customer_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).all(customerId, customerId, customerId) as unknown as { token: string; created_at: number; role: "a" | "b"; claimed_at: number | null; dissolved_at: number | null }[];
}

export function pairStats(sinceMs: number): { sent: number; claimed: number } {
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get(sinceMs) as { v: number }).v;
  return {
    sent: one("SELECT COUNT(*) AS v FROM pairs WHERE created_at >= ?"),
    claimed: one("SELECT COUNT(*) AS v FROM pairs WHERE claimed_at >= ?"),
  };
}

/* ---------------- cases: 公开卦例 (09-10, 裂变 V2 ⑦) ---------------- */

export interface CaseRow {
  id: number; public_id: string; session_id: string; cast_id: number; customer_id: number | null;
  locale: string; tier: string; topic: string | null; framing: string | null; fields_json: string;
  published_at: number; unpublished_at: number | null; hidden_at: number | null; posted_at?: number | null;
}

export function caseBySession(sessionId: string): CaseRow | null {
  return (db().prepare("SELECT * FROM cases WHERE session_id = ?").get(sessionId) ?? null) as CaseRow | null;
}

export function caseByPublicId(publicId: string): CaseRow | null {
  return (db().prepare("SELECT * FROM cases WHERE public_id = ?").get(publicId) ?? null) as CaseRow | null;
}

/** Publish (or re-publish with new wording): one row per reading, the public id kept across republishes. */
export function upsertCase(i: {
  publicId: string; sessionId: string; castId: number; customerId: number | null; locale: string; tier: string;
  topic: string | null; framing: string | null; fieldsJson: string;
}): CaseRow {
  const d = db();
  const existing = caseBySession(i.sessionId);
  if (existing) {
    d.prepare("UPDATE cases SET framing = ?, fields_json = ?, locale = ?, published_at = ?, unpublished_at = NULL WHERE session_id = ?")
      .run(i.framing, i.fieldsJson, i.locale, Date.now(), i.sessionId);
  } else {
    d.prepare(
      `INSERT INTO cases (public_id, session_id, cast_id, customer_id, locale, tier, topic, framing, fields_json, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(i.publicId, i.sessionId, i.castId, i.customerId, i.locale, i.tier, i.topic, i.framing, i.fieldsJson, Date.now());
  }
  return caseBySession(i.sessionId)!;
}

export function unpublishCase(sessionId: string): boolean {
  const r = db().prepare("UPDATE cases SET unpublished_at = ? WHERE session_id = ? AND unpublished_at IS NULL").run(Date.now(), sessionId);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** Moderation: take a case down without touching the owner's reading. */
export function hideCase(publicId: string): void {
  db().prepare("UPDATE cases SET hidden_at = ? WHERE public_id = ? AND hidden_at IS NULL").run(Date.now(), publicId);
}

export interface CaseView extends CaseRow {
  values_str: string; cast_at: number; primary_num: number; changed_num: number | null;
  window_days: number | null; timing_quote: string | null; due_at: number | null;
  outcome: string | null; outcome_at: number | null;
  /** 10-23: the revisit's own status — a closed window whose letter still waits says so on the page */
  revisit_status: string | null;
  /** 11-01 T-014: 1 = the reader's first cast on this matter; 2+ = a follow-up (data-series on the public pages) */
  series: number;
}

// 11-01 T-014 (推广：公开卦例要看得出「同一读者连问」): series = this cast's place among the reader's casts on the same
// matter, or — with no matter — their casts within six hours before it; 1 = the first (or a lone) cast
const CASE_VIEW_SQL = `SELECT k.*, c.values_str, c.cast_at, c.primary_num, c.changed_num,
                              r.window_days, r.timing_quote, r.due_at, r.outcome, r.outcome_at, r.status AS revisit_status,
                              1 + (SELECT COUNT(*) FROM casts c2 WHERE c2.id <> c.id AND c2.cast_at < c.cast_at AND (
                                     (c.matter_id IS NOT NULL AND c2.matter_id = c.matter_id)
                                  OR (c.matter_id IS NULL AND c.customer_id IS NOT NULL AND c2.customer_id = c.customer_id AND c2.cast_at > c.cast_at - 21600000))) AS series
                       FROM cases k JOIN casts c ON c.id = k.cast_id
                       LEFT JOIN revisits r ON r.session_id = k.session_id`;

/** A live case for its page: published, not withdrawn, not hidden. */
export function caseView(publicId: string): CaseView | null {
  return (db().prepare(`${CASE_VIEW_SQL} WHERE k.public_id = ? AND k.unpublished_at IS NULL AND k.hidden_at IS NULL`).get(publicId) ?? null) as CaseView | null;
}

/** Live cases in one language, newest first (topic optional). */
export function listCases(locale: string, limit = 60, topic?: string | null, opts: { hex?: number | null; offset?: number; excludeSession?: string | null } = {}): CaseView[] {
  const params: unknown[] = [locale];
  let where = "k.locale = ? AND k.unpublished_at IS NULL AND k.hidden_at IS NULL";
  if (topic) { where += " AND k.topic = ?"; params.push(topic); }
  // 09-28 (进度表 14): by hexagram — the 64 pages list the real cases that landed on them
  if (opts.hex) { where += " AND (c.primary_num = ? OR c.changed_num = ?)"; params.push(opts.hex, opts.hex); }
  if (opts.excludeSession) { where += " AND k.session_id <> ?"; params.push(opts.excludeSession); }
  params.push(limit, opts.offset ?? 0);
  // 10-23 进度表 108 ②: the ones we picked (精选) come first, the newest pick first; then the rest, newest first
  return db().prepare(`${CASE_VIEW_SQL} WHERE ${where} ORDER BY (k.featured_at IS NOT NULL) DESC, k.featured_at DESC, k.published_at DESC LIMIT ? OFFSET ?`).all(...params) as unknown as CaseView[];
}

export function countCases(locale: string, topic?: string | null, hex?: number | null): number {
  const params: unknown[] = [locale];
  let where = "k.locale = ? AND k.unpublished_at IS NULL AND k.hidden_at IS NULL";
  if (topic) { where += " AND k.topic = ?"; params.push(topic); }
  if (hex) { where += " AND (c.primary_num = ? OR c.changed_num = ?)"; params.push(hex, hex); }
  return (db().prepare(`SELECT COUNT(*) AS n FROM cases k JOIN casts c ON c.id = k.cast_id WHERE ${where}`).get(...params) as { n: number }).n;
}

/** 09-28: the hexagrams that have live cases in a language, with counts — the index's 「按卦」 row */
export function caseHexCounts(locale: string): { hex: number; n: number }[] {
  return db().prepare(
    "SELECT c.primary_num AS hex, COUNT(*) AS n FROM cases k JOIN casts c ON c.id = k.cast_id WHERE k.locale = ? AND k.unpublished_at IS NULL AND k.hidden_at IS NULL GROUP BY c.primary_num ORDER BY n DESC, hex",
  ).all(locale) as { hex: number; n: number }[];
}
/**
 * 10-09 (Neil, Search Console: the 64 pages in four languages were all 「已发现 - 尚未编入索引」, never fetched):
 * when a reader's case lands on a hexagram, that page really changed — its sitemap lastmod should say so. Per
 * hexagram, the newest live case that shows on its page (primary or changed, same rule as listCases), per locale.
 */
export function caseLatestByHex(locale: string): Map<number, number> {
  const rows = db().prepare(
    `SELECT c.primary_num AS p, c.changed_num AS q, MAX(k.published_at) AS at FROM cases k JOIN casts c ON c.id = k.cast_id
     WHERE k.locale = ? AND k.published_at IS NOT NULL AND k.unpublished_at IS NULL AND k.hidden_at IS NULL GROUP BY c.primary_num, c.changed_num`,
  ).all(locale) as { p: number; q: number | null; at: number }[];
  const m = new Map<number, number>();
  for (const r of rows) for (const h of [r.p, r.q]) if (h) m.set(h, Math.max(m.get(h) ?? 0, r.at));
  return m;
}
export function caseTopicCounts(locale: string): { topic: string; n: number }[] {
  return db().prepare(
    "SELECT COALESCE(k.topic,'other') AS topic, COUNT(*) AS n FROM cases k WHERE k.locale = ? AND k.unpublished_at IS NULL AND k.hidden_at IS NULL GROUP BY 1 ORDER BY n DESC",
  ).all(locale) as { topic: string; n: number }[];
}

/** Every live case, for the sitemap. */
export function allLiveCases(): { public_id: string; locale: string; published_at: number; fields_json: string }[] {
  return db().prepare("SELECT public_id, locale, published_at, fields_json FROM cases WHERE unpublished_at IS NULL AND hidden_at IS NULL ORDER BY published_at DESC LIMIT 5000")
    .all() as unknown as { public_id: string; locale: string; published_at: number; fields_json: string }[];
}

/** The dashboard's watch list: what went public lately (moderation happens from here). */
export function recentCases(limit = 12): (CaseView & { question: string })[] {
  return db().prepare(`${CASE_VIEW_SQL.replace("SELECT k.*,", "SELECT k.*, c.question,")} ORDER BY k.published_at DESC LIMIT ?`).all(limit) as unknown as (CaseView & { question: string })[];
}

/** 09-26 (裂变 ②): live cases not yet posted to Threads, newest first — the admin turns each into a draft. */
export function casesToPost(limit = 8): CaseView[] {
  return db().prepare(`${CASE_VIEW_SQL} WHERE k.unpublished_at IS NULL AND k.hidden_at IS NULL AND k.posted_at IS NULL ORDER BY k.published_at DESC LIMIT ?`).all(limit) as unknown as CaseView[];
}

export function markCasePosted(publicId: string): void {
  db().prepare("UPDATE cases SET posted_at = ? WHERE public_id = ? AND posted_at IS NULL").run(Date.now(), publicId);
}

export function caseStats(sinceMs: number): { published: number; live: number } {
  const d = db();
  return {
    published: (d.prepare("SELECT COUNT(*) AS v FROM cases WHERE published_at >= ?").get(sinceMs) as { v: number }).v,
    live: (d.prepare("SELECT COUNT(*) AS v FROM cases WHERE unpublished_at IS NULL AND hidden_at IS NULL").get() as { v: number }).v,
  };
}

export function referralByRedeemSession(sid: string): ReferralRow | null {
  return (db().prepare("SELECT * FROM referrals WHERE redeem_session_id = ?").get(sid) ?? null) as ReferralRow | null;
}

export function referralStats(): { granted: number; redeemed: number; expired: number } {
  const d = db();
  const one = (s: string, ...p: unknown[]) => (d.prepare(s).get(...p) as { v: number } | undefined)?.v ?? 0;
  return {
    granted: one(`SELECT COUNT(*) AS v FROM referrals WHERE ${REF_NOT_OURS}`),
    redeemed: one(`SELECT COUNT(*) AS v FROM referrals WHERE used_at IS NOT NULL AND ${REF_NOT_OURS}`),
    expired: one(`SELECT COUNT(*) AS v FROM referrals WHERE used_at IS NULL AND expires_at < ? AND ${REF_NOT_OURS}`, Date.now()),
  };
}

/* ---------------- ops (health) ---------------- */

/**
 * Operational events: generation failures, cron runs. Nothing customer-facing;
 * the admin health card and /api/health read them so a quiet failure (DeepSeek
 * down, cron dead) is visible without tailing logs.
 */
export function recordOps(kind: string, detail?: string): void {
  try {
    db().prepare("INSERT INTO ops_events (at, kind, detail) VALUES (?,?,?)")
      .run(Date.now(), kind, detail?.slice(0, 500) ?? null);
  } catch {
    /* health bookkeeping must never break the request */
  }
}

/**
 * Whether last night's backup actually left the building (09-22).
 * The nightly archives were real and restored cleanly — and all fourteen of
 * them sat on the same EBS volume as the database, which is not a backup but
 * a second copy of the same failure. Nobody would have noticed, because
 * nothing on the dashboard said a word about it. Now it does.
 */
export interface BackupState { at: number | null; offsite: "ok" | "fail" | "none" | "unknown"; line: string | null }
export function backupState(): BackupState {
  try {
    const path = process.env.BACKUP_LOG ?? "/home/ubuntu/backups/backup.log";
    let raw = "";
    try { raw = readFileSync(path, "utf8"); } catch { /* rotated away or not yet written */ }
    let lines = raw.trimEnd().split("\n").filter((l) => /OFFSITE_(OK|FAIL|NONE)/.test(l));
    // 09-27: the weekly logrotate (Sunday 00:31, copytruncate + compress) empties backup.log until the
    // next 18:00 run — read last week's file instead of reporting "can't read the backup log"
    if (!lines.length) {
      try { lines = gunzipSync(readFileSync(`${path}.1.gz`)).toString("utf8").trimEnd().split("\n").filter((l) => /OFFSITE_(OK|FAIL|NONE)/.test(l)); } catch { /* none */ }
    }
    const last = lines[lines.length - 1];
    if (!last) return { at: null, offsite: "unknown", line: null };
    const stamp = Date.parse(last.slice(0, 25));
    const offsite = last.includes("OFFSITE_OK") ? "ok" : last.includes("OFFSITE_FAIL") ? "fail" : "none";
    return { at: Number.isFinite(stamp) ? stamp : null, offsite, line: last };
  } catch {
    return { at: null, offsite: "unknown", line: null };
  }
}

export interface OpsSummary {
  genFail24h: number;
  genFail7d: number;
  genRetry24h: number;
  /** failures in the last three hours — the window that says "failing now" rather than "failed today" */
  genFail3h: number;
  /** the newest reading actually delivered — proof generation works again after a bad patch */
  lastGenOk: number | null;
  /** true while generation is failing and has not succeeded since (09-15: a night-time DeepSeek outage kept /api/health at 503 for a day after it had recovered) */
  genDown: boolean;
  lastRevisitRun: number | null;
  lastFulfillRun: number | null;
  lastGenFail: { at: number; detail: string | null } | null;
  /** calls served by a backup host in the last 24h, and the last time the primary was marked down (09-15) */
  llmFallback24h: number;
  backup: BackupState;
  lastLlmDown: { at: number; detail: string | null } | null;
}

export function opsSummary(): OpsSummary {
  const d = db();
  const now = Date.now();
  const count = (kind: string, since: number) =>
    (d.prepare("SELECT COUNT(*) AS v FROM ops_events WHERE kind = ? AND at >= ?").get(kind, since) as { v: number }).v;
  const last = (kind: string) =>
    (d.prepare("SELECT at, detail FROM ops_events WHERE kind = ? ORDER BY at DESC LIMIT 1").get(kind) as
      { at: number; detail: string | null } | undefined) ?? null;
  const lastGenFail = last("gen_fail");
  const lastGenOk = (d.prepare("SELECT MAX(created_at) AS v FROM readings").get() as { v: number | null }).v ?? null;
  const genFail3h = count("gen_fail", now - 3 * 3_600_000);
  return {
    genFail24h: count("gen_fail", now - 86_400_000),
    genFail7d: count("gen_fail", now - 7 * 86_400_000),
    genRetry24h: count("gen_retry", now - 86_400_000),
    genFail3h,
    lastGenOk,
    genDown: genFail3h >= 3 && lastGenFail !== null && (lastGenOk === null || lastGenOk < lastGenFail.at),
    lastRevisitRun: last("cron_revisit")?.at ?? null,
    lastFulfillRun: last("cron_fulfill")?.at ?? null,
    lastGenFail,
    llmFallback24h: count("llm_fallback", now - 86_400_000),
    lastLlmDown: last("llm_down"),
    backup: backupState(),
  };
}

/* ---------------- emails ---------------- */

/** True if this (session, kind) email was already sent — prevents duplicates on refresh. */
export function emailAlreadySent(sessionId: string, kind: string): boolean {
  const row = db().prepare(
    "SELECT 1 AS v FROM emails WHERE session_id = ? AND kind = ? AND status = 'sent'",
  ).get(sessionId, kind);
  return Boolean(row);
}

export function recordEmail(
  sessionId: string, kind: string, email: string, status: string, detail?: string,
): void {
  db().prepare(
    `INSERT INTO emails (session_id, kind, email, sent_at, status, detail)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(session_id, kind) DO UPDATE SET
       sent_at = excluded.sent_at, status = excluded.status, detail = excluded.detail`,
  ).run(sessionId, kind, email, Date.now(), status, detail ?? null);
}

/* ---------------- mail log: Resend id → what became of the email (09-11) ---------------- */

/** One row per email handed to Resend; written by sendEmail the moment Resend accepts it. */
export function logMailSent(i: {
  id: string; kind: string; email: string; subject: string;
  sessionId?: string | null; customerId?: number | null;
}): void {
  try {
    db().prepare(
      `INSERT INTO mail_log (id, created_at, kind, email, subject, session_id, customer_id)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind, subject = excluded.subject,
         session_id = COALESCE(excluded.session_id, mail_log.session_id),
         customer_id = COALESCE(excluded.customer_id, mail_log.customer_id)`,
    ).run(i.id, Date.now(), i.kind, i.email.trim().toLowerCase(), i.subject.slice(0, 200), i.sessionId ?? null, i.customerId ?? null);
  } catch {
    /* bookkeeping never breaks a send */
  }
}

/** the address a sent letter went to (the webhook's event can come without one) */
export function mailLogEmail(id: string): string | null {
  return (db().prepare("SELECT email FROM mail_log WHERE id = ?").get(id) as { email: string | null } | undefined)?.email || null;
}

/** Remember a webhook delivery; false = this svix id was already applied (a retry), skip it. */
export function claimMailEvent(svixId: string, emailId: string, type: string, at: number): boolean {
  const r = db().prepare("INSERT OR IGNORE INTO mail_events (svix_id, email_id, type, at) VALUES (?,?,?,?)")
    .run(svixId, emailId, type, at) as unknown as { changes?: number };
  return Number(r.changes ?? 0) > 0;
}

const MAIL_EVENT_COLUMN: Record<string, string> = {
  "email.delivered": "delivered_at",
  "email.delivery_delayed": "delayed_at",
  "email.bounced": "bounced_at",
  "email.complained": "complained_at",
  "email.failed": "failed_at",
};

/**
 * Fold one Resend event into its row. A row missing locally (sent before this
 * table existed, or from Gmail via Resend SMTP) is created from the event —
 * kind from the `kind` tag we attach at send time, else "other".
 */
export function applyMailEvent(i: {
  type: string; emailId: string; at: number;
  to: string | null; subject: string | null; kind: string | null; note?: string | null;
}): "applied" | "ignored" {
  const d = db();
  const isOpen = i.type === "email.opened";
  const col = MAIL_EVENT_COLUMN[i.type];
  if (!isOpen && !col && i.type !== "email.sent") return "ignored";
  d.prepare(
    `INSERT OR IGNORE INTO mail_log (id, created_at, kind, email, subject) VALUES (?,?,?,?,?)`,
  ).run(i.emailId, i.at, i.kind ?? "other", (i.to ?? "").trim().toLowerCase(), i.subject?.slice(0, 200) ?? null);
  if (isOpen) {
    d.prepare(
      `UPDATE mail_log SET opened_at = COALESCE(opened_at, ?), opens = opens + 1,
         last_open_at = MAX(COALESCE(last_open_at, 0), ?), last_event = ?, last_event_at = ?
       WHERE id = ?`,
    ).run(i.at, i.at, i.type, i.at, i.emailId);
  } else if (col) {
    const noteCol = i.type === "email.bounced" ? "bounce_note" : i.type === "email.failed" ? "fail_note" : null;
    d.prepare(
      `UPDATE mail_log SET ${col} = COALESCE(${col}, ?), last_event = ?, last_event_at = ?${noteCol ? `, ${noteCol} = ?` : ""}
       WHERE id = ?`,
    ).run(i.at, i.type, i.at, ...(noteCol ? [i.note?.slice(0, 300) ?? null] : []), i.emailId);
  } else {
    d.prepare("UPDATE mail_log SET last_event = ?, last_event_at = ? WHERE id = ?").run(i.type, i.at, i.emailId);
  }
  return "applied";
}

export interface MailKindStats {
  kind: string; sent: number; delivered: number; opened: number; bounced: number; complained: number; failed: number;
}
export interface MailProblem {
  id: string; at: number; kind: string; email: string; what: "bounced" | "complained" | "failed"; note: string | null;
}

/** The dashboard's email card: per kind in the window, plus the latest trouble and whether the webhook is alive. */
export function mailStats(sinceMs: number): { byKind: MailKindStats[]; total: MailKindStats; problems: MailProblem[]; lastEventAt: number | null } {
  const d = db();
  const byKind = d.prepare(
    `SELECT kind, COUNT(*) AS sent,
       SUM(delivered_at IS NOT NULL) AS delivered, SUM(opened_at IS NOT NULL) AS opened,
       SUM(bounced_at IS NOT NULL) AS bounced, SUM(complained_at IS NOT NULL) AS complained,
       SUM(failed_at IS NOT NULL) AS failed
     FROM mail_log WHERE created_at >= ? GROUP BY kind ORDER BY sent DESC`,
  ).all(sinceMs) as MailKindStats[];
  const total = byKind.reduce<MailKindStats>((a, k) => ({
    kind: "all", sent: a.sent + k.sent, delivered: a.delivered + k.delivered, opened: a.opened + k.opened,
    bounced: a.bounced + k.bounced, complained: a.complained + k.complained, failed: a.failed + k.failed,
  }), { kind: "all", sent: 0, delivered: 0, opened: 0, bounced: 0, complained: 0, failed: 0 });
  const problems = d.prepare(
    `SELECT id, kind, email,
       CASE WHEN complained_at IS NOT NULL THEN 'complained' WHEN bounced_at IS NOT NULL THEN 'bounced' ELSE 'failed' END AS what,
       COALESCE(complained_at, bounced_at, failed_at) AS at,
       COALESCE(bounce_note, fail_note) AS note
     FROM mail_log
     WHERE created_at >= ? AND (bounced_at IS NOT NULL OR complained_at IS NOT NULL OR failed_at IS NOT NULL)
     ORDER BY at DESC LIMIT 12`,
  ).all(sinceMs) as MailProblem[];
  const last = d.prepare("SELECT MAX(last_event_at) AS v FROM mail_log").get() as { v: number | null };
  return { byKind, total, problems, lastEventAt: last.v ?? null };
}

export interface MailRow {
  id: string; created_at: number; kind: string; subject: string | null;
  delivered_at: number | null; delayed_at: number | null; opened_at: number | null; opens: number;
  bounced_at: number | null; complained_at: number | null; failed_at: number | null;
  /** 09-29: who it went to — an owner alert about this customer is listed here too, but was not sent to them */
  email?: string | null;
}

/** Everything sent to one person, newest first — the customer page's mail column. */
export function mailsForCustomer(customerId: number, email: string, limit = 40): MailRow[] {
  return db().prepare(
    `SELECT id, created_at, kind, subject, delivered_at, delayed_at, opened_at, opens, bounced_at, complained_at, failed_at, email
     FROM mail_log WHERE customer_id = ? OR email = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(customerId, email.trim().toLowerCase(), limit) as MailRow[];
}

/* ---------------- admin queries ---------------- */

export interface CustomerRow {
  id: number; email: string; first_seen: number; last_seen: number;
  locale: string | null; orders_count: number; spend_cents: number; marketing_ok: number;
  /** 1 = one of our own addresses (09-21) */
  test_flag: number | null;
  /** paid orders that count: status paid, not a test run (orders_count is the raw counter) */
  paid_orders: number;
  casts: number; topics: string | null; phases: string | null;
  /** 09-29: last sign-in (magic link redeemed); null = never signed in */
  last_login_at: number | null;
  /** 09-30: the last moment a signed-in session of theirs was seen (sessions.last_seen, hourly) — what 「最近在线」 shows */
  last_online: number | null;
}

export function listCustomers(limit = 200): CustomerRow[] {
  return db().prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND payment_state = 'paid' AND amount_cents > 0 AND COALESCE(test_flag, 0) = 0) AS paid_orders,
       (SELECT COUNT(*) FROM casts WHERE customer_id = c.id) AS casts,
       (SELECT GROUP_CONCAT(DISTINCT topic) FROM casts WHERE customer_id = c.id) AS topics,
       (SELECT GROUP_CONCAT(DISTINCT palace_phase) FROM casts WHERE customer_id = c.id) AS phases,
       MAX(COALESCE(c.last_login_at, 0), COALESCE((SELECT MAX(last_seen) FROM sessions WHERE customer_id = c.id), 0)) AS last_online
     FROM customers c
     ORDER BY c.last_seen DESC
     LIMIT ?`,
  ).all(limit) as unknown as CustomerRow[];
}

export function customerDetail(id: number) {
  const d = db();
  const customer = d.prepare(
    "SELECT c.*, MAX(COALESCE(c.last_login_at, 0), COALESCE((SELECT MAX(last_seen) FROM sessions WHERE customer_id = c.id), 0)) AS last_online FROM customers c WHERE c.id = ?",
  ).get(id);
  const casts = d.prepare(
    `SELECT id, created_at, locale, question, topic, primary_name, changed_name,
            palace_phase, day_pillar, values_str
     FROM casts WHERE customer_id = ? ORDER BY created_at DESC`,
  ).all(id);
  const readings = d.prepare(
    `SELECT id, cast_id, created_at, tier, locale, body_json FROM readings
     WHERE customer_id = ? ORDER BY created_at DESC`,
  ).all(id);
  const orders = d.prepare(
    `SELECT session_id, created_at, tier, amount_cents, currency, status, dispute, refund_reason, entitlement_kind, payment_state, payment_intent, receipt_url FROM orders
     WHERE customer_id = ? ORDER BY created_at DESC`,
  ).all(id);
  // the complete follow-up transcripts for every cast this customer owns
  const followups = d.prepare(
    `SELECT f.cast_id, f.created_at, f.role, f.content
     FROM followups f JOIN casts c ON c.id = f.cast_id
     WHERE c.customer_id = ? ORDER BY f.cast_id, f.created_at, f.id`,
  ).all(id);
  // the timing-window follow-ups and what the customer said came of them
  const revisits = d.prepare(
    `SELECT id, cast_id, tier, due_at, window_days, timing_quote, status, sent_at, outcome, outcome_at
     FROM revisits WHERE customer_id = ? ORDER BY created_at DESC`,
  ).all(id);
  return { customer, casts, readings, orders, followups, revisits };
}

/* ---------------- accounts (magic link + sessions) ---------------- */

export function createLoginToken(i: { email: string; tokenHash: string; locale: string | null; nextPath: string | null; ttlMs: number; notify?: boolean; codeHash?: string | null }): void {
  const now = Date.now();
  db().prepare(
    `INSERT INTO login_tokens (email, token_hash, locale, next_path, created_at, expires_at, notify, code_hash, code_tries) VALUES (?,?,?,?,?,?,?,?,0)`,
  ).run(i.email.trim().toLowerCase(), i.tokenHash, i.locale, i.nextPath, now, now + i.ttlMs, i.notify ? 1 : 0, i.codeHash ?? null);
}

/** 10-02 登录码: the letters for this address whose code may still be typed — unused, unexpired, under five wrong tries. */
export interface LoginCodeRow { id: number; email: string; locale: string | null; next_path: string | null; notify: number | null; code_hash: string; code_tries: number }
export function liveLoginCodes(email: string, now = Date.now()): LoginCodeRow[] {
  return db().prepare(
    "SELECT id, email, locale, next_path, notify, code_hash, COALESCE(code_tries, 0) AS code_tries FROM login_tokens WHERE email = ? AND used_at IS NULL AND expires_at > ? AND code_hash IS NOT NULL ORDER BY created_at DESC",
  ).all(email.trim().toLowerCase(), now) as unknown as LoginCodeRow[];
}
/** A wrong code counts against every letter of this address that is still open — guessing across letters gains nothing. */
export function bumpLoginCodeTries(email: string, now = Date.now()): void {
  db().prepare("UPDATE login_tokens SET code_tries = COALESCE(code_tries, 0) + 1 WHERE email = ? AND used_at IS NULL AND expires_at > ?").run(email.trim().toLowerCase(), now);
}
/** The letter is spent — by its code or its link, whichever came first. */
export function consumeLoginRow(id: number, now = Date.now()): boolean {
  const r = db().prepare("UPDATE login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").run(now, id);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** How many links this address asked for recently — the brake on mailbox flooding. */
export function recentLoginTokens(email: string, windowMs: number): number {
  const row = db().prepare(
    "SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?",
  ).get(email.trim().toLowerCase(), Date.now() - windowMs) as { n: number };
  return row.n;
}

/** Burn a login token; returns its email + destination once, null if unknown/used/expired. */
export function consumeLoginToken(tokenHash: string): { email: string; locale: string | null; nextPath: string | null; notify: boolean } | null {
  const d = db();
  const row = d.prepare(
    "SELECT id, email, locale, next_path, expires_at, used_at, notify FROM login_tokens WHERE token_hash = ?",
  ).get(tokenHash) as { id: number; email: string; locale: string | null; next_path: string | null; expires_at: number; used_at: number | null; notify: number | null } | undefined;
  if (!row || row.used_at || row.expires_at < Date.now()) return null;
  const r = d.prepare("UPDATE login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").run(Date.now(), row.id);
  if (Number((r as unknown as { changes?: number }).changes ?? 0) === 0) return null;
  return { email: row.email, locale: row.locale, nextPath: row.next_path, notify: row.notify === 1 };
}

/** Everyone who ticked the launch box and has not been sent this launch mail yet. */
/**
 * Who still gets launch mail <kind>: opted in, not yet sent. 09-21: each row also
 * carries the currency of their latest reading (so the price is quoted in it)
 * and whether they ever had a deep reading (gift or paid) — the mail's middle
 * sentence depends on it. Our own addresses (customers.test_flag) and anyone
 * who has already paid stay out.
 */
export function customersForLaunch(kind: string, limit = 200): { id: number; email: string; locale: string | null; currency: string | null; had_deep: number }[] {
  return db().prepare(
    `SELECT c.id, c.email, c.locale,
            (SELECT o.currency FROM orders o WHERE o.customer_id = c.id AND o.currency IS NOT NULL ORDER BY o.created_at DESC LIMIT 1) AS currency,
            EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tier = 'deep' AND o.entitlement_kind IS NOT NULL AND COALESCE(o.payment_state,'none') <> 'refunded') AS had_deep
     FROM customers c
     WHERE c.marketing_ok = 1 AND c.email IS NOT NULL AND COALESCE(c.test_flag, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.kind = ? AND e.session_id = 'launch:' || c.id AND e.status = 'sent')
       -- someone who has already paid does not need to hear that paying is now possible
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.payment_state = 'paid' AND o.amount_cents > 0 AND COALESCE(o.test_flag, 0) = 0)
     ORDER BY c.id ASC LIMIT ?`,
  ).all(kind, limit) as { id: number; email: string; locale: string | null; currency: string | null; had_deep: number }[];
}

/**
 * 10-13 解籤上线信: 繁體 readers who kept 「告訴我新功能和動態」 ticked (privacy §4), each once. The promise behind the box:
 * at most one such letter a week; those who ticked it before 09-23 were promised three in all — counted here.
 */
export function customersForQianLaunch(kind: string, limit = 200): { id: number; email: string }[] {
  const week = Date.now() - 7 * 86_400_000;
  return db().prepare(
    `SELECT c.id, c.email FROM customers c
     WHERE c.marketing_ok = 1 AND c.email IS NOT NULL AND COALESCE(c.test_flag, 0) = 0 AND c.locale = 'zh-hant'
       AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.kind = ? AND e.session_id = 'launch-qian:' || c.id AND e.status = 'sent')
       AND NOT EXISTS (SELECT 1 FROM mail_log m WHERE m.customer_id = c.id AND m.kind LIKE 'launch%' AND m.created_at > ?)
       AND (c.marketing_at IS NOT NULL OR (SELECT COUNT(*) FROM mail_log m WHERE m.customer_id = c.id AND m.kind LIKE 'launch%') < 3)
     ORDER BY c.id ASC LIMIT ?`,
  ).all(kind, week, limit) as { id: number; email: string }[];
}

export function createSession(id: string, customerId: number, ttlMs: number, via: "email" | "pay" = "email"): void {
  const now = Date.now();
  db().prepare("INSERT INTO sessions (id, customer_id, created_at, last_seen, expires_at, via) VALUES (?,?,?,?,?,?)")
    .run(id, customerId, now, now, now + ttlMs, via);
  db().prepare("UPDATE customers SET last_login_at = ? WHERE id = ?").run(now, customerId);
}

/* ---------------- 10-02 付款后自动登录 (lib/pay-login.ts) ---------------- */

export function rememberPayLogin(sid: string, nonceHash: string): void {
  db().prepare("INSERT INTO pay_logins (sid, nonce_hash, created_at) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET nonce_hash = excluded.nonce_hash")
    .run(sid, nonceHash, Date.now());
}

export function payLoginRow(sid: string): { sid: string; nonce_hash: string; created_at: number; used_at: number | null } | null {
  return (db().prepare("SELECT * FROM pay_logins WHERE sid = ?").get(sid) ?? null) as { sid: string; nonce_hash: string; created_at: number; used_at: number | null } | null;
}

export function markPayLoginUsed(sid: string): void {
  db().prepare("UPDATE pay_logins SET used_at = ? WHERE sid = ?").run(Date.now(), sid);
}

/**
 * Whether this paid order may sign its browser in: the address had nothing at all before it — no other order of any
 * kind, no membership, no session ever — and the customer row was made for this purchase. Anyone can type any
 * address at Stripe, so an address that already holds readings must prove itself by email first.
 */
export function payLoginEligible(customerId: number, sessionId: string, orderAt: number): boolean {
  const d = db();
  const n = (sql: string, ...a: unknown[]) => ((d.prepare(sql).get(...(a as never[])) as { v: number } | undefined)?.v ?? 0);
  if (n("SELECT COUNT(*) AS v FROM orders WHERE customer_id = ? AND session_id <> ?", customerId, sessionId) > 0) return false;
  // 10-22 通卡: the pass this very session made (lib/pass.ts passIdFor) is not "something before"
  if (n("SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id = ? AND stripe_subscription_id <> ?", customerId, `pass_${sessionId.slice(-40)}`) > 0) return false;
  if (n("SELECT COUNT(*) AS v FROM sessions WHERE customer_id = ?", customerId) > 0) return false;
  // sessions are deleted on sign-out; the account's own stamp remembers that a sign-in ever happened
  const c = d.prepare("SELECT first_seen, last_login_at FROM customers WHERE id = ?").get(customerId) as { first_seen: number; last_login_at: number | null } | undefined;
  if (!c || c.last_login_at) return false;
  return c.first_seen >= orderAt - 24 * 3_600_000;
}

/** The few facts about an order the pay-login needs (its latest row for this session). */
export function orderBasics(sessionId: string): { customer_id: number | null; status: string; created_at: number; email: string | null } | null {
  return (db().prepare("SELECT customer_id, status, created_at, email FROM orders WHERE session_id = ? ORDER BY id DESC LIMIT 1").get(sessionId) ?? null) as
    { customer_id: number | null; status: string; created_at: number; email: string | null } | null;
}

/** An email-link sign-in proves the address: sessions that only a payment made, on other browsers, end. */
export function dropPaySessions(customerId: number, keepId?: string): number {
  const r = db().prepare("DELETE FROM sessions WHERE customer_id = ? AND via = 'pay' AND id <> ?").run(customerId, keepId ?? "");
  return Number((r as unknown as { changes?: number }).changes ?? 0);
}

/**
 * Something was filed under this address by a browser not signed in to it (a reading paid or claimed with the address
 * typed in, a reading sent on to it). A session that only a payment made is not proof of the address, so whoever holds
 * one must not see what someone else files here: those sessions end. Email-link sessions are untouched.
 */
export function endPaySessionsOnForeign(customerId: number | null | undefined, why: string): number {
  if (!customerId) return 0;
  const n = dropPaySessions(customerId);
  if (n > 0) recordOps("pay_session_end", `#${customerId} ${why}`);
  return n;
}

export interface SessionCustomer { customerId: number; email: string; locale: string | null; /** 10-02: "pay" = made by a payment, not an email link */ via?: string | null }

/** The customer behind a session cookie, or null. Touches last_seen at most hourly. */
export function customerForSession(id: string): SessionCustomer | null {
  const d = db();
  const row = d.prepare(
    `SELECT s.customer_id, s.last_seen, s.expires_at, s.via, c.email, c.locale
     FROM sessions s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
  ).get(id) as { customer_id: number; last_seen: number; expires_at: number; via: string | null; email: string; locale: string | null } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  if (Date.now() - row.last_seen > 3_600_000) {
    d.prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").run(Date.now(), id);
    // 09-30 (Neil: 「这个统计的时间很有问题啊」): customers.last_seen only moved when an email came in (a payment, a
    // login) — a member who stayed signed in for a week and cast 29 times still read 「最近活动 09-26」. Any signed-in
    // visit moves it now (hourly, like the session's own stamp).
    d.prepare("UPDATE customers SET last_seen = MAX(last_seen, ?) WHERE id = ?").run(Date.now(), row.customer_id);
  }
  return { customerId: row.customer_id, email: row.email, locale: row.locale, via: row.via ?? "email" };
}

export function deleteSession(id: string): void {
  db().prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function purgeExpiredAuth(): void {
  const d = db();
  d.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  d.prepare("DELETE FROM login_tokens WHERE expires_at < ?").run(Date.now() - 86_400_000);
}


/** Everything one customer has cast, newest first, with the session that unlocks each reading page. */
export interface AccountCast {
  id: number; created_at: number; cast_at: number; locale: string; question: string; topic: string | null;
  values_str: string; primary_num: number; changed_num: number | null;
  tier: string | null; session_id: string | null; order_status: string | null;
}
export function castsForCustomer(customerId: number, limit = 200): AccountCast[] {
  return db().prepare(
    `SELECT c.id, c.created_at, c.cast_at, c.locale, c.question, c.topic, c.values_str, c.primary_num, c.changed_num,
            (SELECT tier FROM readings r WHERE r.cast_id = c.id ORDER BY r.id DESC LIMIT 1) AS tier,
            (SELECT session_id FROM orders o WHERE o.cast_id = c.id ORDER BY o.id DESC LIMIT 1) AS session_id,
            (SELECT status FROM orders o WHERE o.cast_id = c.id ORDER BY o.id DESC LIMIT 1) AS order_status
     FROM casts c WHERE c.customer_id = ? ORDER BY c.created_at DESC LIMIT ?`,
  ).all(customerId, limit) as unknown as AccountCast[];
}

/** Attach a still-anonymous cast to the customer who just logged in / paid. */
export function claimCast(castId: number, customerId: number): void {
  db().prepare("UPDATE casts SET customer_id = ? WHERE id = ? AND customer_id IS NULL").run(customerId, castId);
  db().prepare("UPDATE readings SET customer_id = ? WHERE cast_id = ? AND customer_id IS NULL").run(customerId, castId);
}

/* ---------------- subscriptions ---------------- */

export interface SubscriptionRow {
  id: number; customer_id: number; stripe_customer_id: string | null; stripe_subscription_id: string;
  status: string; plan: string; period_start: number | null; period_end: number | null;
  cancel_at_period_end: number;
  /** Stripe's other way of scheduling an ending — a timestamp, not a flag (09-23) */
  cancel_at?: number | null; created_at: number; updated_at: number; synced_at: number;
  currency: string | null; amount_minor: number | null;
  cancel_feedback?: string | null; cancel_comment?: string | null;
  retain_segment?: string | null; retain_confirm_at?: number | null; retain_winback_at?: number | null; retain_winback_kind?: string | null;
  paused_from?: number | null; paused_until?: number | null;
  renew_off_at?: number | null;
  /** 10-14 进度表 42: when the one-off month's reminder went out */
  pass_notice_at?: number | null;
  /** 10-22 通卡: the pass's length in days (1 / 7 / 30); null on rows made before */
  pass_days?: number | null;
  /** 10-10: the money of this membership came back (a refund or a chargeback) — markMembershipRefunded */
  refunded_at?: number | null;
}

export function upsertSubscription(i: {
  customerId: number; stripeCustomerId: string | null; stripeSubscriptionId: string; status: string; plan: string;
  periodStart: number | null; periodEnd: number | null; cancelAtPeriodEnd: boolean; cancelAt?: number | null;
  currency?: string | null; amountMinor?: number | null;
  /** 10-22 通卡: 1 / 7 / 30 */
  passDays?: number | null;
}): SubscriptionRow {
  const now = Date.now();
  const before = subscriptionByStripeId(i.stripeSubscriptionId);
  db().prepare(
    `INSERT INTO subscriptions (customer_id, stripe_customer_id, stripe_subscription_id, status, plan, period_start, period_end, cancel_at_period_end, cancel_at, created_at, updated_at, synced_at, currency, amount_minor, renew_off_at, pass_days)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET
       customer_id = excluded.customer_id, stripe_customer_id = COALESCE(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
       status = excluded.status, plan = excluded.plan, period_start = excluded.period_start, period_end = excluded.period_end,
       cancel_at_period_end = excluded.cancel_at_period_end, cancel_at = excluded.cancel_at,
       renew_off_at = CASE WHEN excluded.cancel_at_period_end = 1 OR excluded.cancel_at IS NOT NULL
                           THEN COALESCE(subscriptions.renew_off_at, excluded.updated_at) ELSE NULL END,
       renew_notice_at = CASE WHEN excluded.period_end IS NOT subscriptions.period_end THEN NULL ELSE subscriptions.renew_notice_at END,
       recap_at = CASE WHEN excluded.period_end IS NOT subscriptions.period_end THEN NULL ELSE subscriptions.recap_at END,
       updated_at = excluded.updated_at, synced_at = excluded.synced_at,
       currency = COALESCE(excluded.currency, subscriptions.currency), amount_minor = COALESCE(excluded.amount_minor, subscriptions.amount_minor),
       pass_days = COALESCE(excluded.pass_days, subscriptions.pass_days)`,
  ).run(i.customerId, i.stripeCustomerId, i.stripeSubscriptionId, i.status, i.plan, i.periodStart, i.periodEnd, i.cancelAtPeriodEnd ? 1 : 0, i.cancelAt ?? null, now, now, now, i.currency ?? null, i.amountMinor ?? null,
    i.cancelAtPeriodEnd || i.cancelAt != null ? now : null, i.passDays ?? null);
  const after = subscriptionByStripeId(i.stripeSubscriptionId)!;
  // 10-23 进度表 102: the letter promised that a credit not yet used up goes back the way it came if the member stops —
  // the moment renewal goes off (or the subscription ends), say so where the owner looks (/admin ops, the customer page)
  const stopped = (!before?.renew_off_at && !!after.renew_off_at) || (!!before && before.status !== "canceled" && after.status === "canceled");
  if (stopped && after.stripe_subscription_id.startsWith("sub_")) {
    const credit = packCreditOnBalance(after.customer_id);
    if (credit) recordOps("pack_credit_refund_due", `客户 ${after.customer_id}：增购包折算的 ${credit.currency ?? ""} ${credit.minor} 还没抵完的部分要原路退回（Stripe 客户余额）`);
  }
  return after;
}

export function subscriptionByStripeId(stripeSubscriptionId: string): SubscriptionRow | null {
  return (db().prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?").get(stripeSubscriptionId) ?? null) as SubscriptionRow | null;
}

/** The customer's most recent subscription of any status (the one the account page talks about). */
/**
 * 10-10 首月同价: does this customer start a monthly membership at the monthly fee (not the first-month price)?
 * Only someone who has already proven to renew, or is carrying on from a one-off month:
 *   (a) their latest subscription renewed at least once (its current period began 20+ days after it was made);
 *   (b) their one-off month is running or ended in the last 7 days, and they have never had a subscription — the
 *       pass → subscription step is cheap once, not every month.
 * 10-10 (Neil: 「你再查一下还有没有漏洞」): "any earlier paid membership" let a returning member subscribe at 269 and turn
 * renewal off the same hour, every month — the very gap the first-month price closes. Gifts and unpaid attempts never count.
 */
export function startsAtMonthlyFee(customerId: number, now = Date.now()): boolean {
  const rows = db().prepare(
    "SELECT stripe_subscription_id AS id, created_at, period_start, period_end FROM subscriptions WHERE customer_id = ? AND substr(stripe_subscription_id,1,5) <> 'comp_' AND status NOT IN ('incomplete','incomplete_expired') AND refunded_at IS NULL",
  ).all(customerId) as { id: string; created_at: number; period_start: number | null; period_end: number | null }[];
  const subs = rows.filter((r) => !r.id.startsWith("pass_")).sort((a, b) => b.created_at - a.created_at);
  // 10-24 (Neil: 「如果会员取消续订了，在会员期失效之后，再购买会员的话，恢复原价，而不是续订价」): a membership that has
  // run out no longer earns the monthly fee — coming back is a new start at the first-month price, renewed before or not.
  // (One still running is resumed, never bought again.) What is left is the 通卡 → membership step below, for someone who
  // has never subscribed.
  if (subs.length > 0) return false;
  return rows.some((r) => r.id.startsWith("pass_") && (r.period_end ?? 0) > now - 7 * 86_400_000);
}

/**
 * 10-10 (Neil: 「那你把这个也自动化处理呗」): a membership whose money came back (refund, chargeback) stops counting for
 * startsAtMonthlyFee — set by the Stripe webhook. A one-off month by its checkout session; a subscription by the Stripe
 * customer, the latest one made before the charge. Returns the row it marked, if any.
 */
export function markMembershipRefunded(o: { passSessionId?: string | null; stripeCustomer?: string | null; chargeAt?: number }, now = Date.now()): string | null {
  const d = db();
  if (o.passSessionId) {
    const id = `pass_${o.passSessionId.slice(-40)}`;
    const r = d.prepare("UPDATE subscriptions SET refunded_at = COALESCE(refunded_at, ?) WHERE stripe_subscription_id = ?").run(now, id) as unknown as { changes?: number };
    return Number(r.changes ?? 0) > 0 ? id : null;
  }
  if (!o.stripeCustomer) return null;
  const row = d.prepare(
    "SELECT id, stripe_subscription_id AS sid FROM subscriptions WHERE stripe_customer_id = ? AND stripe_subscription_id LIKE 'sub_%' AND created_at <= ? ORDER BY created_at DESC LIMIT 1",
  ).get(o.stripeCustomer, (o.chargeAt ?? now) + 86_400_000) as { id: number; sid: string } | undefined;
  if (!row) return null;
  d.prepare("UPDATE subscriptions SET refunded_at = COALESCE(refunded_at, ?) WHERE id = ?").run(now, row.id);
  return row.sid;
}

export function latestSubscription(customerId: number): SubscriptionRow | null {
  // 11-10 (Neil: 會員 #3639 的每日信有一天下午才寄): a member who still holds a live 通卡 (bought before subscribing, the second
  // day already queued) had two live rows, and the one picked was whichever was written last — the pass most of the day,
  // so the morning run took them for a pass holder. A live renewing membership comes before a pass.
  return (db().prepare(
    "SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY (status IN ('active','trialing','past_due')) DESC, (substr(stripe_subscription_id, 1, 5) = 'pass_') ASC, updated_at DESC LIMIT 1",
  ).get(customerId) ?? null) as SubscriptionRow | null;
}

/** Subscriptions worth re-checking against Stripe: live ones not synced for a while, or whose period has rolled over. */
export function staleSubscriptions(maxAgeMs: number, limit = 50): SubscriptionRow[] {
  const now = Date.now();
  return db().prepare(
    `SELECT * FROM subscriptions
     WHERE status IN ('active','trialing','past_due','unpaid','incomplete')
       AND substr(stripe_subscription_id, 1, 5) NOT IN ('comp_', 'pass_')  -- 09-24 complimentary / 09-26 会员单月: nothing in Stripe to re-read
       AND (synced_at < ? OR (period_end IS NOT NULL AND period_end < ?))
     ORDER BY synced_at ASC LIMIT ?`,
  ).all(now - maxAgeMs, now, limit) as unknown as SubscriptionRow[];
}

export function subUsesInPeriod(subscriptionId: number, tier: string, since: number): number {
  const row = db().prepare(
    // 09-29: a unit taken from a bought pack is not the period's own allowance
    "SELECT COUNT(*) AS n FROM sub_uses WHERE subscription_id = ? AND tier = ? AND created_at >= ? AND COALESCE(from_pack, 0) = 0 AND (voided_at IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.session_id = 'sub_' || sub_uses.token))",
  ).get(subscriptionId, tier, since) as { n: number };
  return row.n;
}

export function createSubUse(i: { subscriptionId: number; customerId: number; tier: string; locale: string; token: string; inputJson: string; fromPack?: boolean }): number {
  const info = db().prepare(
    "INSERT INTO sub_uses (subscription_id, customer_id, created_at, tier, locale, token, input_json, from_pack) VALUES (?,?,?,?,?,?,?,?)",
  ).run(i.subscriptionId, i.customerId, Date.now(), i.tier, i.locale, i.token, i.inputJson, i.fromPack ? 1 : null);
  return Number(info.lastInsertRowid);
}

/* ---------------- 09-29 会员增购包 ---------------- */

export interface MemberPackRow {
  id: number; customer_id: number; session_id: string; payment_intent: string | null; units: number; currency: string | null; amount_minor: number | null; created_at: number; refunded_at: number | null;
  /** 10-02: "small" (5) or "large" (15); null on rows from before — all large */
  size?: string | null;
  /** 10-02: on a large pack, what this period's singles and small packs took off, and how many readings they already were */
  credit_minor?: number | null;
  credit_units?: number | null;
  /** 10-23 进度表 102: the unused units were converted — when, how many, to what (a balance credit in minor units, or pass days) */
  converted_at?: number | null;
  converted_units?: number | null;
  converted_minor?: number | null;
  converted_how?: "balance" | "extend" | string | null;
}

/** Record a paid pack once per Checkout session; `created` false when it was already there. */
export function recordPack(i: {
  customerId: number; sessionId: string; paymentIntent: string | null; units: number; currency: string | null; amountMinor: number | null;
  size?: "small" | "large"; creditMinor?: number; creditUnits?: number;
}): { row: MemberPackRow; created: boolean } {
  const d = db();
  const have = d.prepare("SELECT * FROM member_packs WHERE session_id = ?").get(i.sessionId) as MemberPackRow | undefined;
  if (have) return { row: have, created: false };
  d.prepare("INSERT OR IGNORE INTO member_packs (customer_id, session_id, payment_intent, units, currency, amount_minor, created_at, size, credit_minor, credit_units) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(i.customerId, i.sessionId, i.paymentIntent, i.units, i.currency, i.amountMinor, Date.now(), i.size ?? "large", i.creditMinor || null, i.creditUnits || null);
  return { row: d.prepare("SELECT * FROM member_packs WHERE session_id = ?").get(i.sessionId) as unknown as MemberPackRow, created: true };
}

/** Units bought (not refunded) and units spent from packs — for a customer, across all their periods. */
export function packBalance(customerId: number): { bought: number; used: number; left: number } {
  const d = db();
  // 10-23 进度表 102: a converted pack is spent — only packs bought (and units used) since the last conversion count
  const since = (d.prepare("SELECT MAX(converted_at) AS v FROM member_packs WHERE customer_id = ? AND converted_at IS NOT NULL").get(customerId) as { v: number | null }).v ?? 0;
  const bought = (d.prepare("SELECT COALESCE(SUM(units), 0) AS v FROM member_packs WHERE customer_id = ? AND refunded_at IS NULL AND converted_at IS NULL").get(customerId) as { v: number }).v;
  const used = (d.prepare(
    "SELECT COUNT(*) AS v FROM sub_uses WHERE customer_id = ? AND tier = 'deep' AND from_pack = 1 AND created_at > ? AND (voided_at IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.session_id = 'sub_' || sub_uses.token))",
  ).get(customerId, since) as { v: number }).v;
  return { bought, used, left: Math.max(0, bought - used) };
}

/**
 * 10-23 进度表 102: mark a pack's unused units as converted (once — a second call changes nothing). `minor` is the credit
 * put on the member's Stripe balance, in the pack's currency (`balance`), or null when the units became pass days (`extend`).
 */
export function markPackConverted(packId: number, i: { units: number; how: "balance" | "extend"; minor: number | null }, now = Date.now()): boolean {
  const r = db().prepare("UPDATE member_packs SET converted_at = ?, converted_units = ?, converted_minor = ?, converted_how = ? WHERE id = ? AND converted_at IS NULL")
    .run(now, i.units, i.minor, i.how, packId);
  return Number((r as unknown as { changes?: number | bigint }).changes ?? 0) > 0;
}

/** 10-23 进度表 102: this customer's unused pack units went onto their Stripe balance — if they stop renewing, what is left goes back */
export function packCreditOnBalance(customerId: number): { currency: string | null; minor: number; at: number } | null {
  const r = db().prepare("SELECT currency, SUM(converted_minor) AS minor, MAX(converted_at) AS at FROM member_packs WHERE customer_id = ? AND converted_how = 'balance' GROUP BY currency").get(customerId) as { currency: string | null; minor: number; at: number } | undefined;
  return r && r.minor > 0 ? r : null;
}

export function packsBoughtSince(customerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM member_packs WHERE customer_id = ? AND created_at >= ? AND refunded_at IS NULL").get(customerId, since) as { v: number }).v;
}

/** 10-02: this period's packs (not refunded), oldest first, with the size said even on rows from before sizes */
export function packsSince(customerId: number, since: number): (MemberPackRow & { size: "small" | "large" })[] {
  return (db().prepare("SELECT * FROM member_packs WHERE customer_id = ? AND created_at >= ? AND refunded_at IS NULL ORDER BY created_at").all(customerId, since) as unknown as MemberPackRow[])
    .map((r) => ({ ...r, size: r.size === "small" ? "small" as const : "large" as const }));
}

/**
 * 10-02 单买抵扣: a member's single extra full readings this period, in one currency, paid and not refunded. Orders
 * from before the flag existed are read by their shape — a full reading at the light price that was not the
 * first-time price (only a member's extra is sold that way).
 */
export function memberSinglesSince(customerId: number, since: number, currency: string, lightMinor: number): { minor: number; at: number }[] {
  return db().prepare(
    `SELECT amount_cents AS minor, created_at AS at FROM orders
     WHERE customer_id = ? AND created_at >= ? AND tier = 'deep' AND COALESCE(payment_state, status) = 'paid' AND upper(COALESCE(currency,'')) = ?
       AND amount_cents IS NOT NULL AND amount_cents > 0
       AND (member_addon = 1 OR (member_addon IS NULL AND COALESCE(first_deep, 0) = 0 AND amount_cents = ?))
     ORDER BY created_at`,
  ).all(customerId, since, currency.toUpperCase(), lightMinor) as { minor: number; at: number }[];
}

/* ---------------- 10-02 存到信箱 ---------------- */

export interface SavedCastRow {
  id: number; token: string; email: string; locale: string; question: string; values_json: string; cast_at: number; tz_offset: number;
  hex: string | null; teaser: string | null; currency: string | null; created_at: number; sent_at: number | null; opened_at: number | null;
  followup_at: number | null; followup_note: string | null; stopped: number;
  /** 10-04: null = the reader saved it; 'recover' = brought back by a reminder letter; 10-12 'matter' = kept on the 3rd–4th cast of a matter */
  origin?: string | null;
  /** 10-12 'matter': when the one date letter goes, the fuzzy time it names, and what became of it */
  remind_at?: number | null; remind_when?: string | null; remind_note?: string | null;
}

/** 10-12 B②: kept matters whose date letter is due. */
export function savedRemindersDue(now = Date.now(), limit = 50): SavedCastRow[] {
  return db().prepare("SELECT * FROM saved_casts WHERE origin = 'matter' AND remind_at IS NOT NULL AND remind_at <= ? AND remind_note IS NULL AND stopped = 0 AND sent_at IS NOT NULL ORDER BY remind_at LIMIT ?")
    .all(now, limit) as unknown as SavedCastRow[];
}
export function markSavedReminder(id: number, note: string): void {
  db().prepare("UPDATE saved_casts SET remind_note = ? WHERE id = ? AND remind_note IS NULL").run(note.slice(0, 60), id);
}

export function createSavedCast(i: { token: string; email: string; locale: string; question: string; values: number[]; castAt: number; tzOffset: number; hex: string | null; teaser: string | null; currency: string | null; origin?: "recover" | "matter"; remindAt?: number | null; remindWhen?: string | null }, now = Date.now()): SavedCastRow {
  db().prepare(`INSERT INTO saved_casts (token, email, locale, question, values_json, cast_at, tz_offset, hex, teaser, currency, created_at, origin, remind_at, remind_when) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(i.token, i.email.trim().toLowerCase(), i.locale, i.question, JSON.stringify(i.values), i.castAt, i.tzOffset, i.hex, i.teaser, i.currency, now, i.origin ?? null, i.remindAt ?? null, i.remindWhen ?? null);
  return db().prepare("SELECT * FROM saved_casts WHERE token = ?").get(i.token) as unknown as SavedCastRow;
}

/** 10-04: a recovered cast's free line, written when the link is first opened (it had none to carry) */
export function setSavedTeaser(id: number, teaser: string): void {
  db().prepare("UPDATE saved_casts SET teaser = COALESCE(teaser, ?) WHERE id = ?").run(teaser, id);
}

/** 10-04: has this address already had a letter of this kind (emails table)? */
export function emailSentKind(email: string, kind: string): boolean {
  return !!db().prepare("SELECT 1 FROM emails WHERE lower(email) = ? AND kind = ? AND status = 'sent' LIMIT 1").get(email.trim().toLowerCase(), kind);
}

export function savedCastByToken(token: string): SavedCastRow | null {
  return (db().prepare("SELECT * FROM saved_casts WHERE token = ?").get(token) as unknown as SavedCastRow | undefined) ?? null;
}

export function markSavedCast(id: number, field: "sent_at" | "opened_at", now = Date.now()): void {
  db().prepare(`UPDATE saved_casts SET ${field} = COALESCE(${field}, ?) WHERE id = ?`).run(now, id);
}

export function savedCastsByEmailSince(email: string, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM saved_casts WHERE email = ? AND created_at >= ? AND origin IS NULL").get(email.trim().toLowerCase(), since) as { v: number }).v;
}

/** Saved casts whose one reminder is due: saved between `oldest` and `newest`, not yet decided. */
export function savedCastsDue(newest: number, oldest: number): SavedCastRow[] {
  return db().prepare("SELECT * FROM saved_casts WHERE followup_at IS NULL AND stopped = 0 AND sent_at IS NOT NULL AND origin IS NULL AND created_at <= ? AND created_at >= ? ORDER BY created_at")
    .all(newest, oldest) as unknown as SavedCastRow[];
}

/** The reminder was sent, or deliberately not ("skip:…") — either way it is decided, once. */
export function markSavedFollowup(id: number, note: string, now = Date.now()): void {
  db().prepare("UPDATE saved_casts SET followup_at = ?, followup_note = ? WHERE id = ? AND followup_at IS NULL").run(now, note.slice(0, 60), id);
}

/** The unsubscribe link in a saved-cast letter: nothing more for this address, from any cast it saved. */
export function stopSavedCasts(email: string): number {
  return ch(db().prepare("UPDATE saved_casts SET stopped = 1 WHERE email = ?").run(email.trim().toLowerCase()));
}

/** 30 days, as the privacy policy says. */
export function purgeSavedCasts(olderThan: number): number {
  return ch(db().prepare("DELETE FROM saved_casts WHERE created_at < ?").run(olderThan));
}

/** A paid reading with this address since `since` — the reminder would be about something they already bought. */
export function emailPaidSince(email: string, since: number): boolean {
  return !!db().prepare("SELECT 1 FROM orders WHERE lower(email) = ? AND created_at >= ? AND COALESCE(payment_state, status) = 'paid' AND COALESCE(amount_cents,0) > 0 LIMIT 1")
    .get(email.trim().toLowerCase(), since);
}

/**
 * 10-23 进度表 103: unsubscribes are kept by the exact address (mail_unsubs) — /api/unsub writes it. They used to live only
 * as the masked ops line 「n…@gmail.com」, and every reader whose address shared that first letter and domain was treated
 * as unsubscribed: 15 clicks stopped 273 readers. The first time the table is made, those earlier clicks are carried over
 * on the side of not writing: each address that fits a click's mask, had been sent a letter carrying the link before the
 * click, and has not said yes since.
 */
const UNSUB_LINK_KINDS = ["launch", "recover", "pack_offer", "saved_followup", "sub_winback", "daily", "saved_cast", "qian", "headsup", "announce_1023"];
let unsubsReady = false;
function ensureUnsubs(): void {
  if (unsubsReady) return;
  const d = db();
  const had = !!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mail_unsubs'").get();
  d.exec("CREATE TABLE IF NOT EXISTS mail_unsubs (email TEXT PRIMARY KEY, at INTEGER NOT NULL, source TEXT NOT NULL)");
  if (!had) {
    const ins = d.prepare("INSERT OR IGNORE INTO mail_unsubs (email, at, source) VALUES (?,?, 'ops-mask')");
    const near = d.prepare(
      `SELECT DISTINCT lower(l.email) AS e FROM mail_log l LEFT JOIN customers c ON c.email = lower(l.email)
        WHERE substr(lower(l.email), 1, 1) = ? AND substr(lower(l.email), -length(?)) = ? AND l.created_at <= ?
          AND l.kind IN (${UNSUB_LINK_KINDS.map(() => "?").join(",")}) AND COALESCE(c.marketing_ok, 0) = 0`,
    );
    let n = 0;
    for (const ev of d.prepare("SELECT at, detail FROM ops_events WHERE kind = 'unsub'").all() as { at: number; detail: string }[]) {
      const m = ev.detail.match(/^(.)…(@.+)$/);
      if (!m) continue;
      const first = m[1]!.toLowerCase(), domain = m[2]!.toLowerCase();
      for (const r of near.all(first, domain, domain, ev.at, ...UNSUB_LINK_KINDS) as { e: string }[]) n += Number((ins.run(r.e, ev.at) as unknown as { changes?: number }).changes ?? 0);
    }
    if (n) recordOps("unsub_backfill", `${n} addresses from the masked unsubscribe log`);
  }
  unsubsReady = true;
}

/** An unsubscribe click, by the exact address (also from a 「不要再寄」 the reader asked support for). */
export function recordUnsub(email: string, source = "link", at = Date.now()): void {
  ensureUnsubs();
  db().prepare("INSERT OR IGNORE INTO mail_unsubs (email, at, source) VALUES (?,?,?)").run(email.trim().toLowerCase(), at, source);
}

export function unsubscribedAddress(email: string): boolean {
  ensureUnsubs();
  return !!db().prepare("SELECT 1 FROM mail_unsubs WHERE email = ?").get(email.trim().toLowerCase());
}

/** Has this address said no to our mail? An account that took back its yes, or an unsubscribe click (mail_unsubs). */
export function mailOptedOut(email: string): boolean {
  const e = email.trim().toLowerCase();
  const c = db().prepare("SELECT marketing_ok AS ok, marketing_at AS at FROM customers WHERE email = ?").get(e) as { ok: number | null; at: number | null } | undefined;
  if (c && c.ok === 0 && c.at != null) return true;
  return unsubscribedAddress(e);
}

export function packsForCustomer(customerId: number): MemberPackRow[] {
  return db().prepare("SELECT * FROM member_packs WHERE customer_id = ? ORDER BY created_at DESC").all(customerId) as unknown as MemberPackRow[];
}

/** A refund in Stripe takes the pack's units back (whatever of them is still unspent). */
export function refundPackByIntent(paymentIntent: string): MemberPackRow | null {
  const d = db();
  const r = d.prepare("SELECT * FROM member_packs WHERE payment_intent = ? AND refunded_at IS NULL").get(paymentIntent) as MemberPackRow | undefined;
  if (!r) return null;
  d.prepare("UPDATE member_packs SET refunded_at = ? WHERE id = ?").run(Date.now(), r.id);
  return r;
}

export interface SubUseRow { id: number; subscription_id: number; customer_id: number; created_at: number; tier: string; locale: string | null; token: string; input_json: string; voided_at?: number | null; void_reason?: string | null; from_pack?: number | null }

/**
 * 09-29 (客户 838 的 16 次深断没人说得清来源): the same cast redeemed twice
 * inside a few minutes — a double tap, or a retry after the first page never
 * loaded — spent two allowance units for one reading. Before minting a new
 * unit, hand back the one this cast already has.
 */
export function recentSubUseForCast(customerId: number, tier: string, castAtMs: number, values: readonly number[], withinMs = 30 * 60_000): SubUseRow | null {
  const rows = db().prepare(
    "SELECT * FROM sub_uses WHERE customer_id = ? AND tier = ? AND created_at >= ? AND voided_at IS NULL ORDER BY created_at DESC",
  ).all(customerId, tier, Date.now() - withinMs) as unknown as SubUseRow[];
  const key = values.join(",");
  for (const r of rows) {
    try {
      const inp = JSON.parse(r.input_json) as { castAtMs?: number; values?: number[] };
      if (Number(inp.castAtMs) === Number(castAtMs) && (inp.values ?? []).join(",") === key) return r;
    } catch { /* skip a malformed row */ }
  }
  return null;
}

/** 09-29 对账: void / restore one allowance unit (admin). Returns false if the row does not exist. */
export function setSubUseVoid(id: number, reason: string | null): boolean {
  const r = reason
    ? db().prepare("UPDATE sub_uses SET voided_at = ?, void_reason = ? WHERE id = ?").run(Date.now(), reason.slice(0, 200), id)
    : db().prepare("UPDATE sub_uses SET voided_at = NULL, void_reason = NULL WHERE id = ?").run(id);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** 09-29 对账: every allowance unit this customer ever spent, with the reading it produced (or not). */
export function subUsesLedger(customerId: number): (SubUseRow & { order_at: number | null; question: string })[] {
  const rows = db().prepare(
    `SELECT u.*, o.created_at AS order_at FROM sub_uses u
     LEFT JOIN orders o ON o.session_id = 'sub_' || u.token
     WHERE u.customer_id = ? ORDER BY u.created_at DESC`,
  ).all(customerId) as unknown as (SubUseRow & { order_at: number | null })[];
  return rows.map((r) => {
    let question = "";
    try { question = String((JSON.parse(r.input_json) as { question?: string }).question ?? ""); } catch { /* ignore */ }
    return { ...r, question };
  });
}

/** 09-29 对账: every 公开卦例回礼 this customer earned and what they chose. */
export function caseRewardsLedger(customerId: number): { id: number; case_sid: string; created_at: number; choice: string | null; chosen_at: number | null; public_id: string | null; live: number }[] {
  return db().prepare(
    `SELECT r.id, r.case_sid, r.created_at, r.choice, r.chosen_at, c.public_id,
            CASE WHEN c.id IS NOT NULL AND c.unpublished_at IS NULL AND c.hidden_at IS NULL THEN 1 ELSE 0 END AS live
     FROM case_rewards r LEFT JOIN cases c ON c.session_id = r.case_sid
     WHERE r.customer_id = ? ORDER BY r.created_at DESC`,
  ).all(customerId) as unknown as { id: number; case_sid: string; created_at: number; choice: string | null; chosen_at: number | null; public_id: string | null; live: number }[];
}

/** 09-29 对账: every grant (free code / gift / reward) this customer issued or received. */
export function grantsLedger(customerId: number): { id: number; kind: string; tier: string; created_at: number; expires_at: number; used_at: number | null; from_customer_id: number | null; claimed_customer_id: number | null; from_session_id: string | null; redeem_session_id: string | null }[] {
  return db().prepare(
    `SELECT id, kind, tier, created_at, expires_at, used_at, from_customer_id, claimed_customer_id, from_session_id, redeem_session_id
     FROM grants WHERE from_customer_id = ? OR claimed_customer_id = ? ORDER BY created_at DESC`,
  ).all(customerId, customerId) as unknown as { id: number; kind: string; tier: string; created_at: number; expires_at: number; used_at: number | null; from_customer_id: number | null; claimed_customer_id: number | null; from_session_id: string | null; redeem_session_id: string | null }[];
}

/**
 * 09-29 对账: units older than `olderThanMs` that never produced a reading. The fulfil cron voids them
 * (the allowance comes back). Every count treats a voided unit that later DID produce a reading as spent
 * again, so a page opened late can never be free.
 */
/** 10-12 解籤: a member's lot reading takes a light unit with no order behind it (token qian_<draw>) — never an orphan. */
export function orphanSubUses(olderThanMs = 30 * 60_000): { id: number; customer_id: number; created_at: number; tier: string }[] {
  return db().prepare(
    `SELECT u.id, u.customer_id, u.created_at, u.tier FROM sub_uses u
     LEFT JOIN orders o ON o.session_id = 'sub_' || u.token
     WHERE o.session_id IS NULL AND u.voided_at IS NULL AND u.created_at < ? AND u.token NOT LIKE 'qian_%'`,
  ).all(Date.now() - olderThanMs) as unknown as { id: number; customer_id: number; created_at: number; tier: string }[];
}
export function subUseByToken(token: string): SubUseRow | null {
  return (db().prepare("SELECT * FROM sub_uses WHERE token = ?").get(token) ?? null) as SubUseRow | null;
}
/** 10-24 (Neil: 「会员是会员，通卡是通卡」): was this `sub_<token>` reading drawn on a 通卡 (a `pass_…` row), not a membership? */
export function subUseIsPass(token: string): boolean {
  const r = db().prepare("SELECT s.stripe_subscription_id AS sid FROM sub_uses u JOIN subscriptions s ON s.id = u.subscription_id WHERE u.token = ?").get(token) as { sid: string | null } | undefined;
  return !!r?.sid && r.sid.startsWith("pass_");
}

/* ---------------- the painted door (PAYWALL=gift) ---------------- */

export function createGift(i: {
  token: string; tier: string; locale: string; currency: string; amountShown: number; firstDeep: boolean;
  email: string | null; customerId: number | null; via: string | null; inputJson: string;
  /** the light gift's token when this deep one is its in-place upgrade (09-18) */
  upgradedFrom?: string | null;
}): void {
  db().prepare(
    `INSERT INTO gifts (token, created_at, tier, locale, currency, amount_shown, first_deep, email, customer_id, via, input_json, upgraded_from)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(i.token, Date.now(), i.tier, i.locale, i.currency, i.amountShown, i.firstDeep ? 1 : 0, i.email, i.customerId, i.via, i.inputJson, i.upgradedFrom ?? null);
}

export interface GiftRow {
  id: number; token: string; created_at: number; tier: string; locale: string | null; currency: string | null;
  amount_shown: number | null; first_deep: number; email: string | null; customer_id: number | null; via: string | null; input_json: string;
  upgraded_from: string | null;
}
export function giftByToken(token: string): GiftRow | null {
  return (db().prepare("SELECT * FROM gifts WHERE token = ?").get(token) ?? null) as GiftRow | null;
}

/** How a gift's currency was settled and which clock the device reported — for an upgrade to inherit and the dashboard to show (09-18). */
export function giftTrace(token: string): { curSrc: string | null; tzName: string | null; edgeCountry: string | null } | null {
  const r = db().prepare("SELECT json_extract(input_json, '$.curSrc') AS curSrc, json_extract(input_json, '$.tzName') AS tzName FROM gifts WHERE token = ?").get(token) as { curSrc: string | null; tzName: string | null } | undefined;
  return r ? { ...r, edgeCountry: null } : null;
}

/** The deep gift that upgraded this light gift in place, if one exists — the earliest, should a double tap have made two (09-18). */
export function giftUpgradeOf(lightToken: string): string | null {
  const r = db().prepare("SELECT token FROM gifts WHERE upgraded_from = ? ORDER BY created_at LIMIT 1").get(lightToken) as { token: string } | undefined;
  return r?.token ?? null;
}

/** How many painted-door claims this address made in the last `windowMs` — the per-address brake. */
export function giftsByEmailSince(email: string, sinceMs: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM gifts WHERE email = ? AND created_at >= ?").get(email, sinceMs) as { v: number } | undefined)?.v ?? 0;
}

export function subscriptionStats(): { active: number; canceling: number; monthly: number; yearly: number; pastDue: number; passes: number } {
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get() as { v: number } | undefined)?.v ?? 0;
  // 09-27: a row the mirror left "active" after its period ran out is not a member; 单月 (pass_) and 赠送 (comp_)
  // are members but not renewing ones, so they are counted apart from 月付 / 年付
  const LIVE = `status IN ('active','trialing') AND (period_end IS NULL OR period_end > ${Date.now() - 86_400_000})`;
  const RECURRING = "substr(stripe_subscription_id,1,5) NOT IN ('pass_','comp_')";
  return {
    active: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND ${NOT_OURS}`),
    passes: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND NOT (${RECURRING}) AND ${NOT_OURS}`),
    // 09-23: both of Stripe's ways of scheduling an ending. Counting only the
    // flag hid the first real cancellation we ever had.
    canceling: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND ${ENDING_SQL} AND ${RECURRING} AND ${NOT_OURS}`),
    monthly: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND plan = 'month' AND ${RECURRING} AND ${NOT_OURS}`),
    yearly: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND plan = 'year' AND ${RECURRING} AND ${NOT_OURS}`),
    // 09-22: Stripe could not take the money this period. It retries a few
    // times and then ends the subscription on its own, so this is a window to
    // act in, not a final state — the health line says so out loud.
    pastDue: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE status IN ('past_due','unpaid') AND ${NOT_OURS}`),
  };
}

/**
 * Paid one-time orders, painted-door claims and live memberships, split by
 * the currency they were charged (or shown) in — the per-market scoreboard.
 */
export function salesByCurrency(sinceMs: number): {
  orders: { currency: string; tier: string; n: number; amount: number; first: number; castPaid: number }[];
  gifts: { currency: string; tier: string; n: number; first: number; withEmail: number }[];
  members: { currency: string; active: number; monthly: number; yearly: number }[];
  passes: { currency: string; active: number }[];
} {
  const d = db();
  // 10-23 进度表 105 ⑨: castPaid = the cast page's own sales (a reading bought there, or a pass bought with its cast) — the
  // market's 付÷卦; a pass bought elsewhere is a sale of that market but not of its casts
  const orders = d.prepare(
    `SELECT UPPER(COALESCE(currency, 'usd')) AS currency, tier, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS amount,
            SUM(CASE WHEN first_deep = 1 THEN 1 ELSE 0 END) AS first,
            SUM(CASE WHEN tier IN ('deep', 'one', 'light') OR (substr(tier, 1, 5) = 'pass_' AND cast_id IS NOT NULL) THEN 1 ELSE 0 END) AS castPaid
     FROM orders WHERE payment_state = 'paid' AND created_at >= ? AND COALESCE(test_flag, 0) = 0 AND ${NOT_OURS} GROUP BY 1, 2 ORDER BY 1, 2`,
  ).all(sinceMs) as { currency: string; tier: string; n: number; amount: number; first: number; castPaid: number }[];
  // rows flagged as our own test runs from the dashboard stay out of the scoreboard (09-12)
  const gifts = d.prepare(
    `SELECT UPPER(COALESCE(currency, 'usd')) AS currency, tier, COUNT(*) AS n,
            SUM(CASE WHEN first_deep = 1 THEN 1 ELSE 0 END) AS first,
            SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) AS withEmail
     FROM orders WHERE entitlement_kind = 'painted_door' AND created_at >= ? AND COALESCE(test_flag, 0) = 0 GROUP BY 1, 2 ORDER BY 1, 2`,
  ).all(sinceMs) as { currency: string; tier: string; n: number; first: number; withEmail: number }[];
  // 10-23 进度表 105 ⑨: 会员 is memberships — a 通卡 (and a row the mirror left active past its end) was counted here too
  const now = Date.now();
  const members = d.prepare(
    `SELECT UPPER(COALESCE(currency, 'usd')) AS currency, COUNT(*) AS active,
            SUM(CASE WHEN plan = 'month' THEN 1 ELSE 0 END) AS monthly, SUM(CASE WHEN plan = 'year' THEN 1 ELSE 0 END) AS yearly
     FROM subscriptions WHERE status IN ('active','trialing','past_due') AND substr(stripe_subscription_id, 1, 4) = 'sub_'
       AND (period_end IS NULL OR period_end > ?) AND ${NOT_OURS} GROUP BY 1 ORDER BY 2 DESC`,
  ).all(now - 86_400_000) as { currency: string; active: number; monthly: number; yearly: number }[];
  const passes = d.prepare(
    `SELECT UPPER(COALESCE(currency, 'usd')) AS currency, COUNT(*) AS active FROM subscriptions
     WHERE status = 'active' AND substr(stripe_subscription_id, 1, 5) = 'pass_' AND period_end > ? AND ${NOT_OURS} GROUP BY 1`,
  ).all(now) as { currency: string; active: number }[];
  return { orders, gifts, members, passes };
}

export interface RecentReadingRow {
  session_id: string; created_at: number; tier: string; status: string;
  currency: string | null; amount_cents: number | null; email: string | null; customer_id: number | null;
  via: string | null; first_deep: number | null; test_flag: number | null;
  locale: string | null; question: string | null; topic: string | null;
  primary_name: string | null; changed_name: string | null; values_str: string | null;
  /** follow-up questions the reader asked on this cast */
  followups: number;
  /** 11-01: for an allowance reading (status subscription), what covered it — the account's subscription row at that time */
  sub_sid?: string | null;
  /** the page the reader was on when the reading's language differs from it (09-18: language follows the question) */
  page_locale: string | null;
  /** which signal settled the currency (chosen | tz | edge | lang | default) and the device's clock, for gifts (09-18) */
  cur_src: string | null;
  tz_name: string | null;
  /** the card's own country, filled in by the ledger sync after payment (09-22) */
  card_country: string | null;
  /** 送一卦 (09-24): who gave it — the grant's minter — and whether from a member's pool or a paid reading */
  gift_from_id: number | null;
  gift_from_email: string | null;
  gift_from_kind: "member" | "reading" | "case" | null;
}

/** Mark (or unmark) readings as our own test runs. Returns how many rows changed. */
export function setOrdersTest(sessionIds: string[], flag: boolean): number {
  const d = db();
  let n = 0;
  const stmt = d.prepare("UPDATE orders SET test_flag = ? WHERE session_id = ?");
  for (const sid of sessionIds) {
    const r = stmt.run(flag ? 1 : 0, sid) as unknown as { changes?: number };
    n += Number(r.changes ?? 0);
  }
  return n;
}

/**
 * Every reading delivered in the window, newest first — including the ones
 * nobody left an email for (the painted door's "skip the email" path leaves
 * a cast and an order with no customer, so they never appear in 客户档案).
 * This is the admin's only view of those; the cast is joined for the
 * question and the figure.
 */
export function recentReadings(sinceMs: number, limit = 40): RecentReadingRow[] {
  return db().prepare(
    `SELECT o.session_id, o.created_at, o.tier, o.status, o.currency, o.amount_cents, o.email, o.customer_id, o.via, o.first_deep, o.test_flag,
            c.locale, c.question, c.topic, c.primary_name, c.changed_name, c.values_str,
            (SELECT COUNT(*) FROM followups f WHERE f.cast_id = o.cast_id AND f.role = 'user') AS followups,
            (SELECT s.stripe_subscription_id FROM subscriptions s WHERE o.status = 'subscription' AND s.customer_id = o.customer_id AND s.created_at <= o.created_at + 60000 ORDER BY s.created_at DESC LIMIT 1) AS sub_sid,
            (SELECT json_extract(g.input_json, '$.pageLocale') FROM gifts g WHERE o.session_id LIKE 'gf_%' AND g.token = substr(o.session_id, 4)) AS page_locale,
            COALESCE(o.cur_src, (SELECT json_extract(g.input_json, '$.curSrc') FROM gifts g WHERE o.session_id LIKE 'gf_%' AND g.token = substr(o.session_id, 4))) AS cur_src,
            COALESCE(o.tz_name, (SELECT json_extract(g.input_json, '$.tzName') FROM gifts g WHERE o.session_id LIKE 'gf_%' AND g.token = substr(o.session_id, 4))) AS tz_name,
            o.card_country,
            gr.from_customer_id AS gift_from_id, gc.email AS gift_from_email,
            CASE WHEN gr.from_session_id LIKE 'case\\_%' ESCAPE '\\' THEN 'case' WHEN gr.from_session_id LIKE 'pool_%' OR gr.from_session_id LIKE 'sub_%' THEN 'member' ELSE 'reading' END AS gift_from_kind
     FROM orders o LEFT JOIN casts c ON c.id = o.cast_id
     -- 09-24: a 送一卦 claim has no share code; the grant it spent says who gave it
     LEFT JOIN grants gr ON gr.redeem_session_id = o.session_id AND gr.kind = 'gift_cast'
     LEFT JOIN customers gc ON gc.id = gr.from_customer_id
     WHERE o.created_at >= ? ORDER BY o.created_at DESC, o.id DESC LIMIT ?`,
  ).all(sinceMs, limit) as RecentReadingRow[];
}

export function stats() {
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get() as { v: number } | undefined)?.v ?? 0;
  return {
    // 09-21: our own addresses (customers.test_flag) and their casts / readings stay out; anonymous rows have nothing to tell them apart by
    customers: one("SELECT COUNT(*) AS v FROM customers WHERE COALESCE(test_flag, 0) = 0"),
    testCustomers: one("SELECT COUNT(*) AS v FROM customers WHERE test_flag = 1"),
    casts: one(`SELECT COUNT(*) AS v FROM casts WHERE ${NOT_OURS}`),
    readings: one(`SELECT COUNT(*) AS v FROM readings WHERE ${NOT_OURS}`),
    /** kept for the sort order; money is shown per currency (revenueByCurrency) — 09-21, a NT$ and a ¥ used to add up as dollars */
    revenueCents: one("SELECT COALESCE(SUM(spend_cents),0) AS v FROM customers WHERE COALESCE(test_flag, 0) = 0"),
    /** customers with two or more real paid orders — counted from the orders, not the raw orders_count counter */
    repeatBuyers: one(
      `SELECT COUNT(*) AS v FROM (SELECT customer_id FROM orders WHERE payment_state = 'paid' AND amount_cents > 0 AND COALESCE(test_flag, 0) = 0 AND customer_id IS NOT NULL
         GROUP BY customer_id HAVING COUNT(*) > 1)`,
    ),
  };
}

/**
 * ONE answer to "how much has this person paid us" (09-22).
 *
 * There were six. `customers.spend_cents` and `orders_count` are counters
 * bumped at checkout; `spendByCustomer` groups the orders table by currency;
 * `paidOrdersByCustomer` lists the rows; `membershipPaidByCustomer` had to be
 * bolted on afterwards because a membership never writes an order at all;
 * `revenueByCurrency` and `ltvStats` each roll their own. Every page picked a
 * different subset, so a member paying HK$68 a month showed 「—」 in one place,
 * 「HK$18 · 1 单」 in another and $8.67 in a third — all from the same database.
 *
 * This is the only one that should be called from a page. It answers in two
 * registers, because both are true and they are not interchangeable: what the
 * buyer was charged (their own currency, what they would recognise on a card
 * statement) and what actually landed (USD, after Stripe, what a profit line
 * can use).
 */
export interface CustomerMoney {
  /** one-off readings, in the currencies they were charged in */
  orders: { currency: string; cents: number }[];
  orderCount: number;
  /** membership invoices — Stripe settles these in USD, so there is only one currency */
  membership: { n: number; grossCents: number; netCents: number };
  /** 09-29: member add-on packs (not refunded), in the currencies they were charged in */
  packs: { n: number; money: { currency: string; cents: number }[] };
  /** what landed, USD cents, orders + memberships + packs, refunds already out */
  netUsdCents: number;
  refundedOrders: number;
}
export function moneyByCustomer(): Map<number, CustomerMoney> {
  const d = db();
  const out = new Map<number, CustomerMoney>();
  const get = (id: number) => {
    const cur = out.get(id) ?? { orders: [], orderCount: 0, membership: { n: 0, grossCents: 0, netCents: 0 }, packs: { n: 0, money: [] }, netUsdCents: 0, refundedOrders: 0 };
    out.set(id, cur);
    return cur;
  };
  const orders = d.prepare(
    `SELECT customer_id AS cid, UPPER(COALESCE(currency,'usd')) AS currency,
            COALESCE(SUM(amount_cents),0) AS cents, COUNT(*) AS n,
            COALESCE(SUM(COALESCE(net_cents,0) + COALESCE(refund_net_cents,0)),0) AS net,
            SUM(CASE WHEN payment_state = 'refunded' THEN 1 ELSE 0 END) AS refunded
     FROM orders
     WHERE payment_state IN ('paid','refunded') AND amount_cents > 0 AND COALESCE(test_flag,0) = 0 AND customer_id IS NOT NULL
     GROUP BY 1, 2`,
  ).all() as { cid: number; currency: string; cents: number; n: number; net: number; refunded: number }[];
  for (const r of orders) {
    const m = get(r.cid);
    // a refunded order is not spend, but its kept fee still moved the net
    if (r.n > r.refunded) m.orders.push({ currency: r.currency, cents: r.cents });
    m.orderCount += r.n - r.refunded;
    m.refundedOrders += r.refunded;
    m.netUsdCents += r.net;
  }
  for (const [cid, inv] of membershipPaidByCustomer()) {
    const m = get(cid);
    m.membership = { n: inv.n, grossCents: inv.gross, netCents: inv.net };
    m.netUsdCents += inv.net;
  }
  // 09-29 会员增购包: what was charged (member_packs), and what landed (every Stripe line on that payment, refunds included)
  const packs = d.prepare(
    `SELECT p.customer_id AS cid, UPPER(COALESCE(p.currency,'usd')) AS currency, p.amount_minor AS cents, p.refunded_at AS refunded,
            (SELECT COALESCE(SUM(t.net),0) FROM stripe_txns t WHERE p.payment_intent IS NOT NULL AND t.payment_intent = p.payment_intent) AS net
     FROM member_packs p JOIN customers c ON c.id = p.customer_id WHERE COALESCE(c.test_flag,0) = 0`,
  ).all() as { cid: number; currency: string; cents: number | null; refunded: number | null; net: number }[];
  for (const r of packs) {
    const m = get(r.cid);
    m.netUsdCents += r.net;
    if (r.refunded) continue;
    m.packs.n += 1;
    const slot = m.packs.money.find((x) => x.currency === r.currency);
    if (slot) slot.cents += r.cents ?? 0; else m.packs.money.push({ currency: r.currency, cents: r.cents ?? 0 });
  }
  for (const m of out.values()) m.orders.sort((a, b) => b.cents - a.cents);
  return out;
}

/** 09-29: every add-on pack's PaymentIntent — the money pages tell these apart from membership invoices. */
export function packPaymentIntents(): Set<string> {
  return new Set((db().prepare("SELECT payment_intent FROM member_packs WHERE payment_intent IS NOT NULL").all() as { payment_intent: string }[]).map((r) => r.payment_intent));
}

/**
 * `orders` does two jobs, and that is where 「付费 31 / 实际 22」 came from.
 *
 * Of 543 rows, 489 carry no money at all: painted-door gifts, a membership
 * allowance being spent, a referral reward, a joint reading. They are in the
 * table because every delivered reading needs a record. Only `paid` /
 * `refunded` / `disputed` are sales.
 *
 * Splitting the table would touch every call site, so instead the two meanings
 * are named once, here, and the sale test is a single exported string that the
 * money queries share. The important part is the guard below: when someone
 * adds a tenth status next month, `unclassifiedOrderStatuses()` finds it and
 * the dashboard says so — rather than it quietly counting as a sale, which is
 * exactly what `subscription` did.
 */
/* ---------------- 两个问题，两列 (09-22) ---------------- */

/** Why this reading was handed over. Exactly one is true of every delivery. */
export const ENTITLEMENT_KINDS = [
  "purchase",        // they paid for it
  "membership",      // a membership allowance covered it
  "painted_door",    // the free fortnight: priced button, free delivery
  "joint",           // 合参: invited onto someone else's question
  "referral_reward", // a friend they brought in paid
  "revisit_reward",  // answered a revisit with 应验
  "invite_free",     // arrived through a share, first light reading free
  "gift_cast",       // someone spent a 送一卦 on them
  "case_reward",     // 09-26: the light reading a published case earned its owner (公开卦例回礼)
  "goodwill",        // 09-26: given by us by hand — e.g. a payment our processor wrongly blocked (Neil's say-so)
] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

/** Where the money got to. "none" is not a failure — most deliveries never involved money. */
export const PAYMENT_STATES = ["none", "paid", "refunded", "disputed"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/**
 * The old single column, decomposed. This mapping is the whole migration: it
 * is 1:1 and lossless, which is how we know the split does not invent or lose
 * anything. Every read of the new columns can be checked against it until the
 * old column is retired.
 */
export const STATUS_SPLIT: Record<string, { kind: EntitlementKind; pay: PaymentState }> = {
  paid:          { kind: "purchase",        pay: "paid" },
  refunded:      { kind: "purchase",        pay: "refunded" },
  disputed:      { kind: "purchase",        pay: "disputed" },
  gift:          { kind: "painted_door",    pay: "none" },
  subscription:  { kind: "membership",      pay: "none" },
  joint:         { kind: "joint",           pay: "none" },
  reward:        { kind: "referral_reward", pay: "none" },
  revisit_light: { kind: "revisit_reward",  pay: "none" },
  invite_light:  { kind: "invite_free",     pay: "none" },
  gift_cast:     { kind: "gift_cast",       pay: "none" },
  // 09-26: a published case's reward, kept for oneself (light) — neither a sale nor a membership use
  case_light:    { kind: "case_reward",     pay: "none" },
  comp:          { kind: "goodwill",        pay: "none" },
  // 10-14 进度表 47: a light reading a friend's first cast earned (either side)
  ref_light:     { kind: "referral_reward", pay: "none" },
};

/** Money moved (or was meant to). The successor to SALE_SQL. */
export const SALE_SQL_V2 = "payment_state IN ('paid','refunded','disputed') AND amount_cents > 0";

/**
 * The migration's real safety net (09-22). `splitDrift` checks rows; this
 * checks ANSWERS — it runs the numbers the panel actually shows, once the old
 * way and once the new, and reports any that differ. Row-level agreement is
 * necessary but not sufficient: a query could read the right column and still
 * mean something different. Anything listed here means a number moved during
 * the migration, which is the one thing that must not happen.
 */
export function splitParity(): { name: string; old: number; now: number }[] {
  const d = db();
  const n = (sql: string) => (d.prepare(`SELECT COUNT(*) AS v FROM orders WHERE ${sql}`).get() as { v: number }).v;
  const sum = (sql: string) => (d.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM orders WHERE ${sql}`).get() as { v: number }).v;
  const notTest = "COALESCE(test_flag,0) = 0";
  const known = Object.keys(STATUS_SPLIT).map((k) => `'${k}'`).join(",");
  const pairs: { name: string; old: () => number; now: () => number }[] = [
    { name: "真实付费单", old: () => n(`status IN ('paid','refunded','disputed') AND amount_cents > 0 AND ${notTest}`), now: () => n(`${SALE_SQL_V2} AND ${notTest}`) },
    { name: "在账的付款", old: () => n(`status = 'paid' AND amount_cents > 0 AND ${notTest}`), now: () => n(`payment_state = 'paid' AND amount_cents > 0 AND ${notTest}`) },
    { name: "退款单", old: () => n("status = 'refunded'"), now: () => n("payment_state = 'refunded'") },
    { name: "会员额度交付", old: () => n("status = 'subscription'"), now: () => n("entitlement_kind = 'membership'") },
    { name: "假门赠送", old: () => n("status = 'gift'"), now: () => n("entitlement_kind = 'painted_door'") },
    { name: "合参交付", old: () => n("status = 'joint'"), now: () => n("entitlement_kind = 'joint'") },
    { name: "付款金额合计", old: () => sum(`status = 'paid' AND ${notTest}`), now: () => sum(`payment_state = 'paid' AND ${notTest}`) },
    // like for like: a status with no mapping has no split by design, and
    // unclassifiedOrderStatuses() is the alarm for that — not this one.
    { name: "交付总数", old: () => n(`status IN (${known})`), now: () => n(`entitlement_kind IS NOT NULL AND status IN (${known})`) },
  ];
  return pairs.map((p) => ({ name: p.name, old: p.old(), now: p.now() })).filter((r) => r.old !== r.now);
}

/**
 * Rows where the new columns disagree with what `status` says — must always be
 * empty while both are written. The dashboard watches this during the fortnight.
 */
export function splitDrift(): { id: number; status: string; kind: string | null; pay: string | null }[] {
  const rows = db().prepare(
    "SELECT id, status, entitlement_kind AS kind, payment_state AS pay FROM orders",
  ).all() as { id: number; status: string; kind: string | null; pay: string | null }[];
  return rows.filter((r) => {
    const want = STATUS_SPLIT[r.status];
    // a status with no mapping is a different alarm, and a louder one:
    // unclassifiedOrderStatuses() names it on the health line. This check is
    // only about the two columns having drifted apart from a status we do know.
    return want !== undefined && (want.kind !== r.kind || want.pay !== r.pay);
  });
}

/** Fill the two new columns from `status` for every row that has not got them yet. */
export function backfillStatusSplit(): number {
  const d = db();
  let n = 0;
  const stmt = d.prepare("UPDATE orders SET entitlement_kind = ?, payment_state = ? WHERE status = ? AND (entitlement_kind IS NULL OR payment_state IS NULL)");
  for (const [status, v] of Object.entries(STATUS_SPLIT)) {
    n += Number((stmt.run(v.kind, v.pay, status) as unknown as { changes?: number }).changes ?? 0);
  }
  return n;
}

export const SALE_STATUSES = ["paid", "refunded", "disputed"] as const;
export const DELIVERY_ONLY_STATUSES = [
  "gift", "subscription", "joint", "reward", "revisit_light", "invite_light", "gift_cast", "pair", "case_light", "comp", "ref_light",
] as const;
/** the one place a query says "this row is money"; amount > 0 keeps a 0 sale out */
/** @deprecated 09-22: now reads the new column; kept as an alias until every caller moves to SALE_SQL_V2. */
export const SALE_SQL = "payment_state IN ('paid','refunded','disputed') AND amount_cents > 0";

/** Statuses present in the table that nobody has classified — should always be empty. */
export function unclassifiedOrderStatuses(): string[] {
  const known = new Set<string>([...SALE_STATUSES, ...DELIVERY_ONLY_STATUSES]);
  const rows = db().prepare("SELECT DISTINCT status FROM orders").all() as { status: string }[];
  return rows.map((r) => r.status).filter((x) => !known.has(x));
}

/** Money actually kept, per settlement currency: paid orders only, refunds out, our own test runs out. */
export function revenueByCurrency(): { currency: string; cents: number; n: number }[] {
  return db().prepare(
    `SELECT UPPER(COALESCE(currency, 'usd')) AS currency, COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS n
     FROM orders WHERE payment_state = 'paid' AND amount_cents > 0 AND COALESCE(test_flag, 0) = 0
     GROUP BY 1 ORDER BY cents DESC`,
  ).all() as { currency: string; cents: number; n: number }[];
}

/** Each customer's paid spend, per currency (same rules as revenueByCurrency). */
export function spendByCustomer(): Map<number, { currency: string; cents: number }[]> {
  const rows = db().prepare(
    `SELECT customer_id, UPPER(COALESCE(currency, 'usd')) AS currency, COALESCE(SUM(amount_cents), 0) AS cents
     FROM orders WHERE payment_state = 'paid' AND amount_cents > 0 AND COALESCE(test_flag, 0) = 0 AND customer_id IS NOT NULL
     GROUP BY 1, 2 ORDER BY cents DESC`,
  ).all() as { customer_id: number; currency: string; cents: number }[];
  const out = new Map<number, { currency: string; cents: number }[]>();
  for (const r of rows) {
    const list = out.get(r.customer_id) ?? [];
    list.push({ currency: r.currency, cents: r.cents });
    out.set(r.customer_id, list);
  }
  return out;
}

/**
 * 09-21: everything we bought ourselves leaves the numbers — sandbox sessions
 * and any order under our own addresses. Returns how many rows were marked.
 */
export function markOwnOrdersAsTest(internalEmails: string[]): number {
  const d = db();
  const changes = (r: unknown) => Number((r as { changes?: number | bigint }).changes ?? 0);
  let n = 0;
  n += changes(d.prepare("UPDATE orders SET test_flag = 1 WHERE COALESCE(test_flag, 0) = 0 AND session_id LIKE 'cs_test_%'").run());
  for (const p of internalEmails) {
    const wild = p.startsWith("*@");
    const arg = wild ? `%${p.slice(1).toLowerCase()}` : p.toLowerCase();
    const cmp = wild ? "LIKE" : "=";
    n += changes(d.prepare(`UPDATE orders SET test_flag = 1 WHERE COALESCE(test_flag, 0) = 0 AND LOWER(email) ${cmp} ?`).run(arg));
    // the customer row itself (09-21): its memberships, revisits, referrals, casts and readings leave the numbers with it
    d.prepare(`UPDATE customers SET test_flag = 1 WHERE COALESCE(test_flag, 0) = 0 AND LOWER(email) ${cmp} ?`).run(arg);
  }
  // orders that carry no email but belong to one of our customer rows
  n += changes(d.prepare("UPDATE orders SET test_flag = 1 WHERE COALESCE(test_flag, 0) = 0 AND customer_id IN (SELECT id FROM customers WHERE test_flag = 1)").run());
  return n;
}


/* ---------------- membership retention (09-23) ---------------- */

/** How hard they used it in a window: readings started and questions they followed up with. */
export function usageIn(customerId: number, since: number, until: number): { readings: number; followups: number } {
  // 10-26: free casts are kept in casts too now — only the ones that were read count
  const r = db().prepare("SELECT COUNT(*) AS n FROM casts c WHERE c.customer_id = ? AND c.created_at >= ? AND c.created_at < ? AND EXISTS (SELECT 1 FROM readings r WHERE r.cast_id = c.id)").get(customerId, since, until) as { n: number };
  // followups.customer_id has never been filled in (all 2,376 rows NULL) — the owner is the cast's
  const f = db().prepare(
    `SELECT COUNT(*) AS n FROM followups f JOIN casts c ON c.id = f.cast_id
     WHERE c.customer_id = ? AND f.role = 'user' AND f.created_at >= ? AND f.created_at < ?`,
  ).get(customerId, since, until) as { n: number };
  return { readings: r.n, followups: f.n };
}

export function saveCancelDetails(stripeSubscriptionId: string, feedback: string | null, comment: string | null): void {
  db().prepare(
    "UPDATE subscriptions SET cancel_feedback = COALESCE(?, cancel_feedback), cancel_comment = COALESCE(?, cancel_comment) WHERE stripe_subscription_id = ?",
  ).run(feedback, comment, stripeSubscriptionId);
}

export function markRetainConfirm(subId: number, segment: string): void {
  db().prepare("UPDATE subscriptions SET retain_segment = ?, retain_confirm_at = ? WHERE id = ?").run(segment, Date.now(), subId);
}

/** Claim the one letter before the end. False when someone (another cron tick) already did. */
export function claimRetainWinback(subId: number, kind: string): boolean {
  const r = db().prepare("UPDATE subscriptions SET retain_winback_at = ?, retain_winback_kind = ? WHERE id = ? AND retain_winback_at IS NULL").run(Date.now(), kind, subId);
  return Number((r as { changes?: number | bigint }).changes ?? 0) === 1;
}

/** Undo a claim whose send failed, so the next tick tries again. */
export function releaseRetainWinback(subId: number): void {
  db().prepare("UPDATE subscriptions SET retain_winback_at = NULL, retain_winback_kind = NULL WHERE id = ?").run(subId);
}

/** A person gets the pre-end letter once in their life, not once per subscription. */
export function customerHadWinback(customerId: number): boolean {
  const r = db().prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND retain_winback_kind IN ('winback','reminder') LIMIT 1").get(customerId);
  return Boolean(r);
}

/** Live, scheduled to end, ending within `withinMs`, letter not yet decided. Our own test accounts included — that is how we see it work. */
export function subsEndingSoon(withinMs: number, now = Date.now()): SubscriptionRow[] {
  return db().prepare(
    `SELECT * FROM subscriptions
     WHERE status IN ('active','trialing') AND ${ENDING_SQL} AND retain_winback_at IS NULL
       AND substr(stripe_subscription_id,1,5) <> 'pass_'  -- 09-26: a one-off month ends by design; no "why did you cancel" letter
       AND COALESCE(cancel_at, period_end) > ? AND COALESCE(cancel_at, period_end) <= ?`,
  ).all(now, now + withinMs) as unknown as SubscriptionRow[];
}

/**
 * 09-25 合规 年付续费预告: yearly, Stripe-billed, not cancelled, renewing inside
 * the window, and no notice sent for this period yet (renew_notice_at is
 * cleared by upsertSubscription when period_end moves).
 */
export function subsRenewingSoon(fromMs: number, toMs: number, now = Date.now()): SubscriptionRow[] {
  return db().prepare(
    `SELECT * FROM subscriptions
     WHERE status IN ('active','trialing') AND plan = 'year' AND cancel_at_period_end = 0 AND cancel_at IS NULL
       AND substr(stripe_subscription_id,1,5) <> 'comp_' AND renew_notice_at IS NULL
       AND period_end > ? AND period_end <= ?`,
  ).all(now + fromMs, now + toMs) as unknown as SubscriptionRow[];
}

export function claimRenewNotice(subId: number, now = Date.now()): boolean {
  return Number((db().prepare("UPDATE subscriptions SET renew_notice_at = ? WHERE id = ? AND renew_notice_at IS NULL").run(now, subId) as unknown as { changes?: number }).changes ?? 0) === 1;
}

export function unclaimRenewNotice(subId: number): void {
  db().prepare("UPDATE subscriptions SET renew_notice_at = NULL WHERE id = ?").run(subId);
}

export function setPause(subId: number, from: number | null, until: number | null): void {
  db().prepare("UPDATE subscriptions SET paused_from = ?, paused_until = ? WHERE id = ?").run(from, until, subId);
}

export function customerLocaleById(customerId: number): string | null {
  return (db().prepare("SELECT locale FROM customers WHERE id = ?").get(customerId) as { locale: string | null } | undefined)?.locale ?? null;
}


/* ---------------- 应期提醒 (09-23) ---------------- */

export interface HeadsUpRow {
  id: number; session_id: string; email: string; locale: string; created_at: number; due_at: number;
  timing_quote: string; foretold_at: number | null; question: string; values_str: string; cast_at: number;
}

/** Deep readings whose window has not closed yet, with the cast they belong to. Opted-out addresses left out. */
export function headsUpCandidates(now = Date.now()): HeadsUpRow[] {
  return db().prepare(
    `SELECT r.id, r.session_id, r.email, r.locale, r.created_at, r.due_at, r.timing_quote, r.foretold_at,
            c.question, c.values_str, c.cast_at
     FROM revisits r JOIN casts c ON c.id = r.cast_id
     LEFT JOIN customers cu ON lower(cu.email) = lower(r.email)
     WHERE r.status = 'pending' AND r.tier = 'deep' AND r.due_at > ? AND r.timing_quote IS NOT NULL AND r.timing_quote != ''
       AND COALESCE(cu.headsup_off, 0) = 0
     ORDER BY r.email, r.due_at`,
  ).all(now) as unknown as HeadsUpRow[];
}

export function markForetold(ids: number[]): void {
  const st = db().prepare("UPDATE revisits SET foretold_at = ? WHERE id = ? AND foretold_at IS NULL");
  const now = Date.now();
  for (const id of ids) st.run(now, id);
}

/** When this address last got a heads-up letter (mail_log), or null. */
export function lastHeadsUpAt(email: string): number | null {
  const r = db().prepare("SELECT MAX(created_at) AS t FROM mail_log WHERE kind = 'headsup' AND email = ?").get(email.trim().toLowerCase()) as { t: number | null };
  return r.t ?? null;
}

export function setHeadsUpOff(email: string): void {
  upsertCustomer(email);
  db().prepare("UPDATE customers SET headsup_off = 1 WHERE email = ?").run(email.trim().toLowerCase());
}

/* ---------------- 对账 (09-23): our orders against Stripe's own ledger ---------------- */

export interface ReconcileReport {
  ordersNoTxn: { session_id: string; created_at: number; currency: string | null; amount_cents: number | null; email: string | null }[];
  ordersNoPi: number;
  txnsNoOrder: { id: string; created: number; currency: string; amount: number; payment_intent: string | null }[];
  checked: { orders: number; txns: number };
}

/**
 * Three ways the two books can disagree, since `sinceMs`:
 *  - an order we marked paid whose PaymentIntent has no charge in Stripe's
 *    ledger (older than two hours — the ledger sync runs every half hour);
 *  - a paid order with no PaymentIntent at all (nothing to refund against);
 *  - a charge in Stripe that is neither one of our orders nor a membership
 *    invoice (membership invoices are recognised by their Stripe customer).
 * Our own test runs are left out on both sides.
 */
export function reconcile(sinceMs: number, now = Date.now()): ReconcileReport {
  const d = db();
  const orders = d.prepare(
    `SELECT session_id, created_at, currency, amount_cents, email, payment_intent FROM orders
     WHERE created_at >= ? AND payment_state = 'paid' AND entitlement_kind = 'purchase' AND COALESCE(test_flag,0) = 0`,
  ).all(sinceMs) as { session_id: string; created_at: number; currency: string | null; amount_cents: number | null; email: string | null; payment_intent: string | null }[];
  const txnPis = new Set((d.prepare("SELECT payment_intent FROM stripe_txns WHERE payment_intent IS NOT NULL").all() as { payment_intent: string }[]).map((r) => r.payment_intent));
  const ordersNoTxn = orders.filter((o) => o.payment_intent && !txnPis.has(o.payment_intent) && now - o.created_at > 2 * 3_600_000)
    .map(({ payment_intent: _pi, ...rest }) => rest);
  const ordersNoPi = orders.filter((o) => !o.payment_intent).length;
  const orderPis = new Set((d.prepare("SELECT payment_intent FROM orders WHERE payment_intent IS NOT NULL").all() as { payment_intent: string }[]).map((r) => r.payment_intent));
  const members = new Set((d.prepare("SELECT stripe_customer_id FROM subscriptions WHERE stripe_customer_id IS NOT NULL").all() as { stripe_customer_id: string }[]).map((r) => r.stripe_customer_id));
  const txns = d.prepare(
    `SELECT id, created, currency, amount, payment_intent, stripe_customer FROM stripe_txns
     WHERE created >= ? AND type IN ('charge','payment') AND amount > 0`,
  ).all(sinceMs) as { id: string; created: number; currency: string; amount: number; payment_intent: string | null; stripe_customer: string | null }[];
  const packPis = packPaymentIntents();
  const txnsNoOrder = txns.filter((t) => !(t.payment_intent && (orderPis.has(t.payment_intent) || packPis.has(t.payment_intent))) && !(t.stripe_customer && members.has(t.stripe_customer)))
    .map(({ stripe_customer: _c, ...rest }) => rest);
  return { ordersNoTxn, ordersNoPi, txnsNoOrder, checked: { orders: orders.length, txns: txns.length } };
}

/* ---------------- 会员面板 (09-23) ---------------- */

export interface MemberRow extends SubscriptionRow { email: string; locale: string | null; test_flag: number | null }

/** Every subscription we mirror, with who it belongs to. The panel splits them into live / ending / ended. */
export function membersForPanel(): MemberRow[] {
  return db().prepare(
    `SELECT s.*, c.email, c.locale, c.test_flag FROM subscriptions s JOIN customers c ON c.id = s.customer_id
     ORDER BY s.created_at DESC`,
  ).all() as unknown as MemberRow[];
}

/* ---------------- 粘性 (09-23, 用户粘性数据分析-0923.md) ---------------- */

/** Every real customer's cast days, on the caster's own clock — the customer cohorts on /admin/retention. */
export function castDaysByCustomer(): Map<number, string[]> {
  const rows = db().prepare(
    `SELECT customer_id, created_at, tz_offset FROM casts
     WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)`,
  ).all() as { customer_id: number; created_at: number; tz_offset: number }[];
  const out = new Map<number, string[]>();
  for (const r of rows) {
    const list = out.get(r.customer_id) ?? [];
    list.push(new Date(r.created_at + r.tz_offset * 60_000).toISOString().slice(0, 10));
    out.set(r.customer_id, list);
  }
  return out;
}

/**
 * 10-23 进度表 105 (次要) 留存: the days a customer used anything — a cast, and since the other products opened, a tarot spread,
 * a lot, a 擲筊 ask, a chart question, a report (casts by the reader's own clock; the rest by the house clock, UTC+8).
 * The retention page only knew the casts, so a reader who came back every day for tarot looked like a one-day visitor.
 */
export function activeDaysByCustomer(): Map<number, string[]> {
  const out = castDaysByCustomer();
  const add = (cid: number, at: number) => { const l = out.get(cid) ?? []; l.push(homeDay(at)); out.set(cid, l); };
  const NOT_TEST = "customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)";
  for (const [table, at] of [["tarot_draws", "created_at"], ["qian_draws", "created_at"], ["jiaobei_asks", "created_at"], ["mingli_qa", "at"],
    ["bazi_reports", "created_at"], ["ziwei_reports", "created_at"], ["astro_reports", "created_at"], ["hepan_reports", "created_at"], ["nianshu_reports", "created_at"]] as const) {
    try {
      for (const r of db().prepare(`SELECT customer_id AS cid, ${at} AS t FROM ${table} WHERE ${NOT_TEST}`).all() as { cid: number; t: number }[]) add(r.cid, r.t);
    } catch { /* a product's table not made yet */ }
  }
  return out;
}

/** Distinct days this customer has cast on — the second one is when the membership offer is worth showing. */
export function activeDaysForCustomer(customerId: number): number {
  const rows = db().prepare("SELECT created_at, tz_offset FROM casts WHERE customer_id = ?").all(customerId) as { created_at: number; tz_offset: number }[];
  return new Set(rows.map((r) => new Date(r.created_at + r.tz_offset * 60_000).toISOString().slice(0, 10))).size;
}

export interface ProgressNote { id: number; created_at: number; note: string; reply: string }

export function progressNotesForCast(castId: number): ProgressNote[] {
  return db().prepare("SELECT id, created_at, note, reply FROM progress_notes WHERE cast_id = ? ORDER BY created_at, id").all(castId) as unknown as ProgressNote[];
}

export function saveProgressNote(castId: number, note: string, reply: string): number {
  const r = db().prepare(
    `INSERT INTO progress_notes (cast_id, customer_id, created_at, note, reply)
     VALUES (?, (SELECT customer_id FROM casts WHERE id = ?), ?, ?, ?)`,
  ).run(castId, castId, Date.now(), note, reply);
  return Number(r.lastInsertRowid);
}

/** One cast of a customer, with what has happened around it since — the rows of a 「这件事」 timeline. */
export interface ThreadCast {
  id: number; created_at: number; cast_at: number; tz_offset: number; locale: string; question: string; topic: string | null;
  values_str: string; primary_num: number; changed_num: number | null;
  tier: string | null; session_id: string | null;
  /** 10-01: the order's status — a refunded/disputed reading's link no longer opens */
  order_status?: string | null;
  followups: number; notes: number;
  revisit_id: number | null; due_at: number | null; timing_quote: string | null; outcome: string | null;
  /** 10-07: the fact behind the answer (happened | stirred | nothing | open) and how this revisit asks (signals = about the signals) */
  event?: string | null; ask?: string | null;
  matter_id?: number | null;
}
const THREAD_COLS = `c.id, c.created_at, c.cast_at, c.tz_offset, c.locale, c.question, c.topic, c.values_str, c.primary_num, c.changed_num, c.matter_id,
            (SELECT tier FROM readings r WHERE r.cast_id = c.id ORDER BY r.id DESC LIMIT 1) AS tier,
            (SELECT session_id FROM orders o WHERE o.cast_id = c.id ORDER BY o.id DESC LIMIT 1) AS session_id,
            (SELECT status FROM orders o WHERE o.cast_id = c.id ORDER BY o.id DESC LIMIT 1) AS order_status,
            (SELECT COUNT(*) FROM followups f WHERE f.cast_id = c.id AND f.role = 'user') AS followups,
            (SELECT COUNT(*) FROM progress_notes p WHERE p.cast_id = c.id) AS notes,
            v.id AS revisit_id, v.due_at, v.timing_quote, v.outcome, v.event, v.ask`;
/** 09-29: the casts of one stored matter, newest first — the same rows the timeline has always used. */
export function castsInMatter(matterId: number): ThreadCast[] {
  return db().prepare(
    `SELECT ${THREAD_COLS}
     FROM casts c LEFT JOIN revisits v ON v.id = (SELECT MAX(id) FROM revisits WHERE cast_id = c.id)
     WHERE c.matter_id = ? ORDER BY c.created_at DESC`,
  ).all(matterId) as unknown as ThreadCast[];
}
export function threadCastsForCustomer(customerId: number, limit = 300): ThreadCast[] {
  return db().prepare(
    `SELECT c.id, c.created_at, c.cast_at, c.tz_offset, c.locale, c.question, c.topic, c.values_str, c.primary_num, c.changed_num, c.matter_id,
            (SELECT tier FROM readings r WHERE r.cast_id = c.id ORDER BY r.id DESC LIMIT 1) AS tier,
            (SELECT session_id FROM orders o WHERE o.cast_id = c.id ORDER BY o.id DESC LIMIT 1) AS session_id,
            (SELECT COUNT(*) FROM followups f WHERE f.cast_id = c.id AND f.role = 'user') AS followups,
            (SELECT COUNT(*) FROM progress_notes p WHERE p.cast_id = c.id) AS notes,
            v.id AS revisit_id, v.due_at, v.timing_quote, v.outcome
     FROM casts c LEFT JOIN revisits v ON v.id = (SELECT MAX(id) FROM revisits WHERE cast_id = c.id)
     WHERE c.customer_id = ? ORDER BY c.created_at DESC LIMIT ?`,
  ).all(customerId, limit) as unknown as ThreadCast[];
}

/* ---------------- 09-29 「一件事」: stored matters ---------------- */

export interface MatterRow {
  id: number; customer_id: number; created_at: number; last_at: number; title: string | null; title_by: string | null; topic: string | null;
  /** 10-04 进度表 30: 1 = the reader asked that readings on this matter not look at its earlier casts and notes */
  no_context?: number | null;
}
export interface MatterListRow extends MatterRow { casts: number; deep: number; first_q: string | null; last_q: string | null }

export function createMatter(customerId: number, title: string | null, titleBy: string, topic: string | null, at = Date.now()): number {
  const r = db().prepare("INSERT INTO matters (customer_id, created_at, last_at, title, title_by, topic) VALUES (?,?,?,?,?,?)")
    .run(customerId, at, at, title ? title.slice(0, 60) : null, titleBy, topic);
  return Number(r.lastInsertRowid);
}

export function matterById(id: number): MatterRow | null {
  return (db().prepare("SELECT * FROM matters WHERE id = ?").get(id) ?? null) as MatterRow | null;
}

/** A customer's matters, most recently active first, with how much each holds. */
export function mattersForCustomer(customerId: number, limit = 200): MatterListRow[] {
  return db().prepare(
    `SELECT m.*, (SELECT COUNT(*) FROM casts c WHERE c.matter_id = m.id) AS casts,
            (SELECT COUNT(*) FROM casts c JOIN readings r ON r.cast_id = c.id WHERE c.matter_id = m.id AND r.tier = 'deep') AS deep,
            (SELECT question FROM casts c WHERE c.matter_id = m.id ORDER BY c.created_at ASC LIMIT 1) AS first_q,
            (SELECT question FROM casts c WHERE c.matter_id = m.id ORDER BY c.created_at DESC LIMIT 1) AS last_q
     FROM matters m WHERE m.customer_id = ? AND EXISTS (SELECT 1 FROM casts c WHERE c.matter_id = m.id)
     ORDER BY m.last_at DESC LIMIT ?`,
  ).all(customerId, limit) as unknown as MatterListRow[];
}

/** The matters a new question could belong to: active in the window before `now`, each with its latest questions. */
export function matterCandidates(customerId: number, now = Date.now(), days = 30, limit = 6): (MatterRow & { questions: string[] })[] {
  const rows = db().prepare(
    `SELECT * FROM matters WHERE customer_id = ? AND last_at >= ? AND last_at <= ? AND EXISTS (SELECT 1 FROM casts c WHERE c.matter_id = matters.id)
     ORDER BY last_at DESC LIMIT ?`,
  ).all(customerId, now - days * 86_400_000, now + 60_000, limit) as unknown as MatterRow[];
  return rows.map((m) => ({
    ...m,
    questions: (db().prepare("SELECT question FROM casts WHERE matter_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 4").all(m.id, now + 60_000) as { question: string }[]).map((r) => r.question),
  }));
}

export function setCastMatter(castId: number, matterId: number, how: string): void {
  const d = db();
  d.prepare("UPDATE casts SET matter_id = ?, matter_how = ? WHERE id = ?").run(matterId, how, castId);
  d.prepare("UPDATE matters SET last_at = MAX(last_at, (SELECT created_at FROM casts WHERE id = ?)) WHERE id = ?").run(castId, matterId);
}

export function setMatterTitle(id: number, title: string, by: string): void {
  db().prepare("UPDATE matters SET title = ?, title_by = ? WHERE id = ?").run(title.trim().slice(0, 60), by, id);
}

/** 10-04 进度表 30: the reader's switch — readings, follow-ups and the daily line on this matter leave its earlier record out. */
export function setMatterNoContext(id: number, customerId: number, on: boolean): boolean {
  return Number((db().prepare("UPDATE matters SET no_context = ? WHERE id = ? AND customer_id = ?").run(on ? 1 : 0, id, customerId) as { changes?: number | bigint }).changes ?? 0) > 0;
}

/** Recompute a matter's last activity (after a cast moved out); an emptied matter is removed. */
export function refreshMatter(id: number): void {
  const d = db();
  const r = d.prepare("SELECT MAX(created_at) AS t, COUNT(*) AS n FROM casts WHERE matter_id = ?").get(id) as { t: number | null; n: number };
  if (!r.n) { d.prepare("DELETE FROM matters WHERE id = ?").run(id); return; }
  d.prepare("UPDATE matters SET last_at = ? WHERE id = ?").run(r.t, id);
}

export function sessionMatter(sessionId: string): number | null {
  const r = db().prepare("SELECT matter_id FROM matter_sessions WHERE session_id = ?").get(sessionId) as { matter_id: number } | undefined;
  return r?.matter_id ?? null;
}
export function setSessionMatter(sessionId: string, matterId: number, how: string): void {
  db().prepare("INSERT OR REPLACE INTO matter_sessions (session_id, matter_id, created_at, how) VALUES (?,?,?,?)").run(sessionId, matterId, Date.now(), how);
}

export function castCountInMatter(matterId: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM casts WHERE matter_id = ?").get(matterId) as { n: number }).n;
}

/** The reading sessions of a cast (a light reading upgraded in place can have two). */
export function sessionsForCast(castId: number): string[] {
  return (db().prepare("SELECT session_id FROM orders WHERE cast_id = ?").all(castId) as { session_id: string }[]).map((r) => r.session_id);
}

/** The cast's owner and matter. */
export function castOwnerMatter(castId: number): { customer_id: number | null; matter_id: number | null; created_at: number } | null {
  return (db().prepare("SELECT customer_id, matter_id, created_at FROM casts WHERE id = ?").get(castId) ?? null) as { customer_id: number | null; matter_id: number | null; created_at: number } | null;
}

/** The matter of the cast behind a reading session. */
export function matterForSession(sessionId: string): number | null {
  const r = db().prepare("SELECT c.matter_id AS m FROM orders o JOIN casts c ON c.id = o.cast_id WHERE o.session_id = ? LIMIT 1").get(sessionId) as { m: number | null } | undefined;
  return r?.m ?? null;
}

/**
 * 09-29 (用户数据与需求全面分析 §4.5): casts on one matter during the reader's own
 * today — from 5 on, the site says, once and kindly, that today is already clear.
 */
export const PAUSE_AT = 5;
export function castsTodayInMatter(matterId: number, now = Date.now()): number {
  const rows = db().prepare("SELECT created_at, tz_offset, values_str, question FROM casts WHERE matter_id = ? AND created_at >= ? ORDER BY created_at").all(matterId, now - 2 * 86_400_000) as { created_at: number; tz_offset: number; values_str: string; question: string }[];
  if (!rows.length) return 0;
  const tz = rows[rows.length - 1]!.tz_offset;
  const today = new Date(now + tz * 60_000).toISOString().slice(0, 10);
  // a light reading upgraded to a full one is two rows and one cast
  return new Set(rows.filter((r) => new Date(r.created_at + tz * 60_000).toISOString().slice(0, 10) === today).map((r) => `${r.values_str}|${r.question}`)).size;
}

/** Progress notes across every cast of a matter, oldest first. */
export function notesInMatter(matterId: number): { cast_id: number; created_at: number; note: string; reply: string }[] {
  return db().prepare(
    `SELECT p.cast_id, p.created_at, p.note, p.reply FROM progress_notes p JOIN casts c ON c.id = p.cast_id
     WHERE c.matter_id = ? ORDER BY p.created_at ASC`,
  ).all(matterId) as unknown as { cast_id: number; created_at: number; note: string; reply: string }[];
}

/** The latest reading body of a cast. */
export function readingBodyForCast(castId: number): { tier: string; body: Record<string, Record<string, string> | undefined> } | null {
  const r = db().prepare("SELECT tier, body_json FROM readings WHERE cast_id = ? ORDER BY id DESC LIMIT 1").get(castId) as { tier: string; body_json: string } | undefined;
  if (!r) return null;
  try { return { tier: r.tier, body: JSON.parse(r.body_json) }; } catch { return null; }
}

/** Customer casts not yet filed under a matter (the backfill's work list), oldest first. */
export function unfiledCasts(limit = 5000): { id: number; customer_id: number; created_at: number; question: string; topic: string | null; locale: string }[] {
  return db().prepare(
    "SELECT id, customer_id, created_at, question, topic, locale FROM casts WHERE customer_id IS NOT NULL AND matter_id IS NULL ORDER BY customer_id, created_at LIMIT ?",
  ).all(limit) as unknown as { id: number; customer_id: number; created_at: number; question: string; topic: string | null; locale: string }[];
}

/** The customer who owns the cast behind this reading session, or null. */
export function customerForReadingSession(sessionId: string): number | null {
  const r = db().prepare(
    "SELECT c.customer_id AS v FROM orders o JOIN casts c ON c.id = o.cast_id WHERE o.session_id = ? LIMIT 1",
  ).get(sessionId) as { v: number | null } | undefined;
  return r?.v ?? null;
}

/** 应期当天 (09-23): open deep windows whose short same-day letter has not gone out, with the reading's two signals. */
export interface DayOfRow extends HeadsUpRow { body_json: string | null; /** 10-14 进度表 46 */ hint?: string | null }
export function dayOfCandidates(now = Date.now()): DayOfRow[] {
  return db().prepare(
    `SELECT r.id, r.session_id, r.email, r.locale, r.created_at, r.due_at, r.timing_quote, r.foretold_at,
            c.question, c.values_str, c.cast_at,
            (SELECT body_json FROM readings rd WHERE rd.cast_id = c.id AND rd.tier = 'deep' ORDER BY rd.id DESC LIMIT 1) AS body_json,
            (SELECT l.outcome_hint FROM cast_log l WHERE l.at = c.cast_at AND l.values_str = replace(c.values_str, ',', '') AND l.outcome_hint IS NOT NULL ORDER BY l.id DESC LIMIT 1) AS hint
     FROM revisits r JOIN casts c ON c.id = r.cast_id
     LEFT JOIN customers cu ON lower(cu.email) = lower(r.email)
     WHERE r.status = 'pending' AND r.tier = 'deep' AND r.dayof_at IS NULL AND r.due_at > ?
       AND r.timing_quote IS NOT NULL AND r.timing_quote != ''
       AND COALESCE(cu.headsup_off, 0) = 0 AND COALESCE(cu.test_flag, 0) = 0
     ORDER BY r.email, r.due_at`,
  ).all(now) as unknown as DayOfRow[];
}

export function markDayOf(ids: number[]): void {
  const st = db().prepare("UPDATE revisits SET dayof_at = ? WHERE id = ? AND dayof_at IS NULL");
  const now = Date.now();
  for (const id of ids) st.run(now, id);
}

/** When this address last got a letter of any of these kinds (mail_log), or null. */
export function lastMailAt(email: string, kinds: string[]): number | null {
  if (kinds.length === 0) return null;
  const r = db().prepare(
    `SELECT MAX(created_at) AS t FROM mail_log WHERE email = ? AND kind IN (${kinds.map(() => "?").join(",")})`,
  ).get(email.trim().toLowerCase(), ...kinds) as { t: number | null };
  return r.t ?? null;
}

/** 10-07 应期类信收口: how many letters of these kinds this address got since `since` (mail_log). */
export function mailCountSince(email: string, kinds: string[], since: number): number {
  if (kinds.length === 0) return 0;
  const r = db().prepare(
    `SELECT COUNT(*) AS c FROM mail_log WHERE email = ? AND created_at >= ? AND kind IN (${kinds.map(() => "?").join(",")})`,
  ).get(email.trim().toLowerCase(), since, ...kinds) as { c: number };
  return Number(r.c ?? 0);
}

/** 10-07: does this address belong to a member whose membership is live right now (monthly, a bought month or complimentary)? */
export function liveMemberEmail(email: string): boolean {
  const r = db().prepare(
    `SELECT 1 AS v FROM subscriptions s JOIN customers c ON c.id = s.customer_id
     WHERE lower(c.email) = ? AND s.status IN ('active','trialing') LIMIT 1`,
  ).get(email.trim().toLowerCase()) as { v: number } | undefined;
  return !!r;
}

/** 09-23: a Stripe customer id Stripe no longer knows (sandbox era) — dropped from the mirror so it is not sent again. */
export function forgetStripeCustomer(stripeCustomerId: string): void {
  db().prepare("UPDATE subscriptions SET stripe_customer_id = NULL WHERE stripe_customer_id = ? AND status IN ('canceled','incomplete_expired')").run(stripeCustomerId);
  recordOps("stripe_customer_gone", stripeCustomerId);
}

/* ---------------- 会员与送一卦重整 (09-24, 会员与推荐体系重整-0924.md) ---------------- */

/** Gifts minted from a member's monthly pool — counted while they are still live or were claimed (an expired, unclaimed one returns to the pool). */
export function poolGiftsInUse(customerId: number, since: number, now = Date.now()): number {
  return (db().prepare(
    `SELECT COUNT(*) AS v FROM grants
     WHERE kind = 'gift_cast' AND from_customer_id = ? AND created_at >= ?
       AND (from_session_id LIKE 'pool_%' OR from_session_id LIKE 'sub_%')
       AND (used_at IS NOT NULL OR expires_at > ?)`,
  ).get(customerId, since, now) as { v: number }).v;
}

/** The gift a person redeemed, if any, whose giver is someone else — the thread a later payment is credited along. */
export function giftRedeemedBy(customerId: number, email: string | null): GrantRow | null {
  return (db().prepare(
    `SELECT * FROM grants WHERE kind = 'gift_cast' AND used_at IS NOT NULL AND from_customer_id IS NOT NULL
       AND from_customer_id != ? AND (claimed_customer_id = ? OR (? IS NOT NULL AND lower(claimed_email) = lower(?)))
     ORDER BY used_at ASC LIMIT 1`,
  ).get(customerId, customerId, email, email) ?? null) as GrantRow | null;
}

/** Money actually paid by this customer: purchases plus membership starts. */
export function paidTimesForCustomer(customerId: number): number {
  const purchases = (db().prepare("SELECT COUNT(*) AS v FROM orders WHERE customer_id = ? AND payment_state = 'paid' AND entitlement_kind = 'purchase'").get(customerId) as { v: number }).v;
  const subs = (db().prepare("SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id = ?").get(customerId) as { v: number }).v;
  return purchases + subs;
}

/** 09-25 会员欢迎信: claim the send — true exactly once per subscription, so the sync route and the webhook never both mail. */
export function claimWelcome(subscriptionId: number): boolean {
  const r = db().prepare("UPDATE subscriptions SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL").run(Date.now(), subscriptionId);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}
export function unclaimWelcome(subscriptionId: number): void {
  db().prepare("UPDATE subscriptions SET welcomed_at = NULL WHERE id = ?").run(subscriptionId);
}

/* ---------------- 收据 (09-25, Neil: 每次付费有开发票和收据吗) ---------------- */

/** 09-25 合规: the Terms date agreed to at checkout — proof of the immediate-delivery consent */
export function saveTosVersion(sessionId: string, ver: string | null | undefined): void {
  if (!ver) return;
  db().prepare("UPDATE orders SET tos_ver = ? WHERE session_id = ? AND tos_ver IS NULL").run(ver, sessionId);
}

export function saveReceiptUrl(sessionId: string, url: string | null): void {
  if (!url) return;
  db().prepare("UPDATE orders SET receipt_url = ? WHERE session_id = ? AND receipt_url IS NULL").run(url, sessionId);
}

export interface PaymentRow {
  session_id: string; created_at: number; tier: string; amount_cents: number | null; currency: string | null;
  payment_state: string | null; receipt_url: string | null; payment_intent: string | null;
}
/** Every order that took money from this customer (or this address), newest first — for the account page's 付款记录. */
export function paymentsForCustomer(customerId: number, email: string | null): PaymentRow[] {
  return db().prepare(
    `SELECT session_id, created_at, tier, amount_cents, currency, payment_state, receipt_url, payment_intent
     FROM orders WHERE amount_cents > 0 AND payment_state IN ('paid','refunded','disputed')
       AND (customer_id = ? OR (? IS NOT NULL AND LOWER(email) = LOWER(?)))
     ORDER BY created_at DESC LIMIT 100`,
  ).all(customerId, email, email) as PaymentRow[];
}

/** 09-25: null when unknown; false once they unsubscribed (marketing_ok = 0) */
export function customerMarketingOk(customerId: number): boolean | null {
  const r = db().prepare("SELECT marketing_ok AS v FROM customers WHERE id = ?").get(customerId) as { v: number | null } | undefined;
  return r?.v == null ? null : r.v === 1;
}

const ch = (r: unknown): number => Number((r as { changes?: number | bigint }).changes ?? 0);

/* ---------------- 09-25 合规: 客户数据删除 (GDPR/CCPA 「删除权」, 隐私政策 §4) ---------------- */

export type EraseReport = {
  ok: true; customerId: number; casts: number; orders: number; mails: number; grants: number; gifts: number; pairs: number;
} | { ok: false; error: string };

/**
 * 「删除此客户全部数据」 — the admin button on a customer's page.
 *
 * What goes: the customer row and, by cascade, every cast (the question,
 * the reading, follow-ups, revisits, progress notes, cases), sessions, login
 * tokens, subscription mirror rows, sub_uses, referrals; anonymous casts they
 * paid for before signing in (joined through orders/emails by address);
 * the emails/seal_watchers/mail_log rows for the address.
 *
 * What stays, scrubbed: orders (amount, currency, dates, Stripe ids — the
 * accounting record the law requires us to keep, 隐私政策 §4 「交易记录保留」)
 * with email and customer_id cleared; gifts and grants (money moved) with the
 * address and any typed-in text cleared.
 *
 * Refuses while a Stripe-billed subscription is live: cancel it in Stripe
 * first (the webhook would otherwise recreate the mirror row). Stripe keeps
 * its own copy of the customer as merchant of record — noted in the policy.
 */
export function eraseCustomer(customerId: number): EraseReport {
  const d = db();
  const c = d.prepare("SELECT id, email, alt_emails FROM customers WHERE id = ?").get(customerId) as { id: number; email: string; alt_emails: string | null } | undefined;
  if (!c) return { ok: false, error: "no such customer" };
  // only a Stripe-billed membership stops it (it could still bill, and Stripe would keep writing about it); a pass or a
  // gift is ours and goes with the account. 10-23: the refusal says which one and where to end it — it read as a crash
  const live = d.prepare(
    "SELECT plan, period_end FROM subscriptions WHERE customer_id = ? AND status IN ('active','trialing','past_due','unpaid','paused') AND substr(stripe_subscription_id,1,4) = 'sub_'",
  ).all(customerId) as { plan: string; period_end: number | null }[];
  if (live.length > 0) {
    const s = live[0]!;
    const until = s.period_end ? new Date(s.period_end + 8 * 3_600_000).toISOString().slice(0, 10) : "?";
    return { ok: false, error: `没删：还有一个在 Stripe 生效中的会员（${s.plan === "year" ? "年付" : "月付"}，到 ${until}）。先在上面「运营动作 → 立即结束会员／通卡」把它结束（不退不扣），再删除` };
  }

  const emails = new Set<string>([c.email.toLowerCase()]);
  for (const e of (c.alt_emails ?? "").split(/[,\s]+/)) if (e.includes("@")) emails.add(e.toLowerCase());
  const list = [...emails];
  const ph = list.map(() => "?").join(",");

  const run = d.prepare("BEGIN");
  run.run();
  try {
    // anonymous casts paid for or claimed with this address before they signed in
    const sessions = (d.prepare(`SELECT session_id FROM orders WHERE customer_id = ? OR lower(email) IN (${ph})`).all(customerId, ...list) as { session_id: string }[]).map((r) => r.session_id);
    for (const r of d.prepare(`SELECT session_id FROM emails WHERE lower(email) IN (${ph})`).all(...list) as { session_id: string }[]) sessions.push(r.session_id);
    const sph = sessions.map(() => "?").join(",");
    const castIds = new Set<number>();
    if (sessions.length) {
      for (const r of d.prepare(`SELECT cast_id FROM orders WHERE cast_id IS NOT NULL AND session_id IN (${sph})`).all(...sessions) as { cast_id: number }[]) castIds.add(r.cast_id);
      for (const r of d.prepare(`SELECT cast_id FROM revisits WHERE cast_id IS NOT NULL AND (session_id IN (${sph}) OR lower(email) IN (${ph}))`).all(...sessions, ...list) as { cast_id: number }[]) castIds.add(r.cast_id);
    }
    for (const r of d.prepare("SELECT id FROM casts WHERE customer_id = ?").all(customerId) as { id: number }[]) castIds.add(r.id);
    const casts = castIds.size;
    for (const id of castIds) d.prepare("DELETE FROM casts WHERE id = ?").run(id); // cascades readings/followups/revisits/seal_watchers/progress_notes/cases

    // the accounting record stays; the person does not
    const orders = ch(d.prepare(`UPDATE orders SET email = NULL, customer_id = NULL, browser_sid = NULL WHERE customer_id = ? OR lower(email) IN (${ph})`).run(customerId, ...list));
    const gifts = ch(d.prepare(`UPDATE gifts SET email = NULL, customer_id = NULL, input_json = NULL WHERE customer_id = ? OR lower(email) IN (${ph})`).run(customerId, ...list));
    const grants = ch(d.prepare(`UPDATE grants SET claimed_email = NULL, claimed_customer_id = NULL, input_json = NULL, from_customer_id = NULL WHERE from_customer_id = ? OR claimed_customer_id = ? OR lower(claimed_email) IN (${ph})`).run(customerId, customerId, ...list));
    const pairs = sessions.length
      ? ch(d.prepare(`DELETE FROM pairs WHERE a_customer_id = ? OR b_customer_id = ? OR a_session_id IN (${sph}) OR b_session_id IN (${sph})`).run(customerId, customerId, ...sessions, ...sessions))
      : ch(d.prepare("DELETE FROM pairs WHERE a_customer_id = ? OR b_customer_id = ?").run(customerId, customerId));
    const mails = ch(d.prepare(`DELETE FROM mail_log WHERE customer_id = ? OR lower(email) IN (${ph})`).run(customerId, ...list));
    d.prepare(`DELETE FROM emails WHERE lower(email) IN (${ph})`).run(...list);
    d.prepare(`DELETE FROM seal_watchers WHERE lower(email) IN (${ph})`).run(...list);
    d.prepare(`DELETE FROM login_tokens WHERE lower(email) IN (${ph})`).run(...list);
    d.prepare(`DELETE FROM saved_casts WHERE lower(email) IN (${ph})`).run(...list); // 10-02 存到信箱
    // 10-03 起卦记录: the casts of every browser filed under them go with them (lib/cast-log.ts), then the browsers go back to being anonymous
    const theirBids = (d.prepare("SELECT bid FROM browser_links WHERE customer_id = ?").all(customerId) as { bid: string }[]).map((r) => r.bid);
    if (theirBids.length) {
      const bph = theirBids.map(() => "?").join(",");
      d.prepare(`DELETE FROM cast_log WHERE bid IN (${bph})`).run(...theirBids);
      d.prepare(`DELETE FROM cast_threads WHERE bid IN (${bph})`).run(...theirBids);
      try { d.prepare(`DELETE FROM browser_net WHERE bid IN (${bph})`).run(...theirBids); } catch { /* 10-31 进度表 130: the table exists once anyone was seen */ }
      try { d.prepare(`DELETE FROM bmg_results WHERE bid IN (${bph})`).run(...theirBids); } catch { /* 11-05 进度表 136: the table exists once anyone took the quiz */ }
    }
    try { d.prepare("DELETE FROM bmg_results WHERE customer_id = ?").run(customerId); } catch { /* 11-05 进度表 136 */ }
    d.prepare("DELETE FROM browser_links WHERE customer_id = ?").run(customerId); // 10-03: their browsers go back to being anonymous
    try { d.prepare("DELETE FROM birth_profiles WHERE customer_id = ?").run(customerId); } catch { /* 10-22 生辰檔案: the table exists once anyone saved one */ }
    d.prepare("DELETE FROM customers WHERE id = ?").run(customerId); // cascades sessions/subscriptions/sub_uses/referrals
    d.prepare("COMMIT").run();
    recordOps("customer_erased", `#${customerId} casts=${casts} orders=${orders} mails=${mails}`);
    return { ok: true, customerId, casts, orders: orders, mails: mails, grants: grants, gifts: gifts, pairs: pairs };
  } catch (e) {
    d.prepare("ROLLBACK").run();
    return { ok: false, error: (e as Error).message };
  }
}

/** 09-26 客户时区: the device zone recorded when this paid/gift session was started (orders.tz_name / gifts trace). */
export function sessionTzName(sessionId: string): string | null {
  try {
    return (sessionId.startsWith("gf_") ? giftTrace(sessionId.slice(3)) : orderTrace(sessionId))?.tzName ?? null;
  } catch {
    return null;
  }
}

/** 09-26 热区: the browser sessions that ended in a paid order since `since` — joins the funnel to real money. */
export function paidBrowserSessions(since: number): Set<string> {
  const rows = db().prepare("SELECT DISTINCT browser_sid AS s FROM orders WHERE created_at >= ? AND browser_sid IS NOT NULL AND payment_state IN ('paid','refunded','disputed')").all(since) as { s: string }[];
  return new Set(rows.map((r) => r.s));
}

/** 09-30 新客/回访客: the same, without our own test orders — what the new-vs-returning split counts as paid. */
export function realPaidBrowserSessions(since: number): Set<string> {
  const rows = db().prepare("SELECT DISTINCT browser_sid AS s FROM orders WHERE created_at >= ? AND browser_sid IS NOT NULL AND COALESCE(test_flag, 0) = 0 AND payment_state IN ('paid','refunded','disputed')").all(since) as { s: string }[];
  return new Set(rows.map((r) => r.s));
}

/* ---------------- 首次付费保证 (Neil 09-26: 「上吧」) ---------------- */

export const GUARANTEE_MS = 24 * 3_600_000;
/** the promise starts with the orders placed after it was shown — earlier buyers did not buy under it */
export const GUARANTEE_SINCE = 1790359368672;

/** 10-07: which part of the identity matched an earlier order — for the owner's log, never shown to the reader */
export type GuaranteeMatch = "account" | "email" | "browser" | "card";
/**
 * 10-22 进度表 78 ② (Neil: 「按照你的来」): the promise covers the account's first 1-day pass (the first-price one) — and, for
 * orders from before the 通卡 switch, the single readings it used to cover. The other passes, memberships, year books and
 * pair reports go through support. Mirrors lib/catalog.ts `guarantee` (test/catalog.test.ts keeps the two in step; the
 * catalogue cannot be imported here without a cycle).
 */
export const GUARANTEE_TIERS: ReadonlySet<string> = new Set(["deep", "one", "pass_1d"]);
/** a pass that already served more than this many paid pieces (a deep reading, a tarot or lot reading, a chart report) is used, not returned */
export const GUARANTEE_PIECES = 2;
const GUARANTEE_PIECE_KINDS = ["cast", "tarot", "qian", "report"] as const;
export type GuaranteeCheck = { ok: true; amountCents: number; currency: string | null; until: number } | { ok: false; why: "no_order" | "not_paid" | "not_purchase" | "expired" | "not_first" | "used" | "not_covered" | "over_used"; by?: GuaranteeMatch; pieces?: number };

/**
 * Who "the same person" is for the guarantee (10-07 补洞, Neil: 「现在弄好」). Until 10-07 it was the account and every
 * address known to be theirs — so a new email address bought a second one-tap refund. Now also:
 *   - every browser this person paid or signed in on (the order's own tab → tab_browsers; the accounts' browser_links),
 *     and every other account those browsers were filed under;
 *   - the payment method's own identifier from Stripe (orders.card_fp: a card, a wallet card or an Alipay account —
 *     never a card number), which survives a new address and a new browser.
 * Our own test accounts are left out, so a shared test phone does not tie strangers together. Two rounds of widening
 * are enough to join "new email, same phone" and "same email, new phone"; the sets are capped so one shared device
 * cannot pull in half the customer list.
 */
const IDENTITY_CAP = 40;
export function guaranteeIdentity(o: { customer_id: number | null; email: string | null; browser_sid?: string | null; card_fp?: string | null }): { emails: string[]; cids: number[]; bids: string[]; fp: string | null } {
  const d = db();
  const emails = new Set<string>(), cids = new Set<number>(), bids = new Set<string>();
  const testCid = (id: number) => !!(d.prepare("SELECT 1 AS v FROM customers WHERE id = ? AND test_flag = 1").get(id));
  const addCustomer = (id: number) => {
    if (cids.has(id) || cids.size >= IDENTITY_CAP || testCid(id)) return;
    cids.add(id);
    const r = d.prepare("SELECT email, alt_emails FROM customers WHERE id = ?").get(id) as { email: string; alt_emails: string | null } | undefined;
    if (!r) return;
    emails.add(r.email.toLowerCase());
    for (const a of (r.alt_emails ?? "").split(/[,\s]+/)) if (a.includes("@")) emails.add(a.toLowerCase());
  };
  if (o.email) emails.add(o.email.toLowerCase());
  if (o.customer_id) addCustomer(o.customer_id);
  if (o.browser_sid) {
    const b = d.prepare("SELECT bid FROM tab_browsers WHERE s = ?").get(o.browser_sid) as { bid: string } | undefined;
    if (b) bids.add(b.bid);
  }
  for (let round = 0; round < 2; round++) {
    const size = emails.size + cids.size + bids.size;
    for (const e of [...emails]) {
      const rows = d.prepare("SELECT id FROM customers WHERE lower(email) = ? OR instr(lower(COALESCE(alt_emails,'')), ?) > 0").all(e, e) as { id: number }[];
      for (const r of rows) addCustomer(r.id);
    }
    for (const id of [...cids]) {
      for (const r of d.prepare("SELECT bid FROM browser_links WHERE customer_id = ?").all(id) as { bid: string }[]) if (bids.size < IDENTITY_CAP) bids.add(r.bid);
    }
    for (const b of [...bids]) {
      for (const r of d.prepare("SELECT customer_id AS id FROM browser_links WHERE bid = ?").all(b) as { id: number }[]) addCustomer(r.id);
    }
    if (emails.size + cids.size + bids.size === size) break;
  }
  return { emails: [...emails], cids: [...cids], bids: [...bids], fp: o.card_fp ? o.card_fp : null };
}

/**
 * Whether this paid order may be refunded in one tap under the first-purchase
 * guarantee: a one-time purchase (never a membership), paid, within 24 hours,
 * and the first money this person ever paid us. Once per person: a guarantee
 * refund on record anywhere under the same identity closes it. "The same
 * person" = guaranteeIdentity (account, addresses, browsers, payment method).
 * Nothing here stops anyone buying — only the one-tap refund is closed.
 */
export function guaranteeCheck(sessionId: string, now = Date.now()): GuaranteeCheck {
  const d = db();
  const o = d.prepare("SELECT session_id, customer_id, email, created_at, payment_state, entitlement_kind, amount_cents, currency, browser_sid, card_fp, tier FROM orders WHERE session_id = ?").get(sessionId) as
    { session_id: string; customer_id: number | null; email: string | null; created_at: number; payment_state: string | null; entitlement_kind: string | null; amount_cents: number | null; currency: string | null; browser_sid: string | null; card_fp: string | null; tier: string | null } | undefined;
  if (!o) return { ok: false, why: "no_order" };
  if (o.payment_state !== "paid" || !o.amount_cents) return { ok: false, why: "not_paid" };
  if (o.entitlement_kind !== "purchase") return { ok: false, why: "not_purchase" };
  if (o.tier && !GUARANTEE_TIERS.has(o.tier)) return { ok: false, why: "not_covered" };
  if (now - o.created_at > GUARANTEE_MS) return { ok: false, why: "expired" };
  // 10-22 进度表 78 ②: a pass is returned only while it has served at most two paid pieces (cap_events counts every
  // generation under it — the same piece reopened counts once; follow-ups and chart Q&A are not pieces)
  if (o.tier && /^pass_/.test(o.tier) && o.customer_id) {
    let pieces = 0;
    try {
      pieces = (d.prepare(`SELECT COUNT(DISTINCT kind || ':' || COALESCE(ref, id)) AS v FROM cap_events WHERE customer_id = ? AND at >= ? AND kind IN (${GUARANTEE_PIECE_KINDS.map(() => "?").join(",")})`).get(o.customer_id, o.created_at, ...GUARANTEE_PIECE_KINDS) as { v: number }).v;
    } catch { pieces = 0; /* no cap_events table yet: nothing spent */ }
    if (pieces > GUARANTEE_PIECES) return { ok: false, why: "over_used", pieces };
  }
  if (o.created_at < GUARANTEE_SINCE && !process.env.VITEST) return { ok: false, why: "expired" };
  const id = guaranteeIdentity(o);
  const em = id.emails, ci = id.cids, bi = id.bids;
  const parts = [
    em.length ? `lower(email) IN (${em.map(() => "?").join(",")})` : "",
    ci.length ? `customer_id IN (${ci.map(() => "?").join(",")})` : "",
    bi.length ? `browser_sid IN (SELECT s FROM tab_browsers WHERE bid IN (${bi.map(() => "?").join(",")}))` : "",
    id.fp ? "card_fp = ?" : "",
  ].filter(Boolean);
  const who = `(${parts.join(" OR ") || "0"}) AND COALESCE(test_flag, 0) = 0`;
  const args = [...em, ...ci, ...bi, ...(id.fp ? [id.fp] : [])];
  // which part of the identity the earlier order shares, for the owner's log
  const matchOf = (r: { customer_id: number | null; email: string | null; card_fp: string | null }): GuaranteeMatch =>
    r.customer_id && ci.includes(r.customer_id) ? "account" : r.email && em.includes(r.email.toLowerCase()) ? "email" : id.fp && r.card_fp === id.fp ? "card" : "browser";
  const used = d.prepare(`SELECT customer_id, email, card_fp FROM orders WHERE refund_reason = 'guarantee' AND session_id <> ? AND ${who} LIMIT 1`).get(sessionId, ...args) as { customer_id: number | null; email: string | null; card_fp: string | null } | undefined;
  if (used) return { ok: false, why: "used", by: matchOf(used) };
  // 09-26 (review): a published case whose reward was already taken keeps its reading — no refund on top
  const rewarded = d.prepare("SELECT 1 FROM case_rewards WHERE case_sid = ? AND choice IS NOT NULL").get(sessionId);
  if (rewarded) return { ok: false, why: "used" };
  const earlier = d.prepare(`SELECT customer_id, email, card_fp FROM orders WHERE session_id <> ? AND created_at < ? AND payment_state IN ('paid','refunded','disputed') AND COALESCE(amount_cents,0) > 0 AND ${who} LIMIT 1`).get(sessionId, o.created_at, ...args) as { customer_id: number | null; email: string | null; card_fp: string | null } | undefined;
  if (earlier) return { ok: false, why: "not_first", by: matchOf(earlier) };
  const sub = ci.length ? (d.prepare(`SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id IN (${ci.map(() => "?").join(",")}) AND created_at < ? AND substr(stripe_subscription_id,1,5) <> 'comp_'`).get(...ci, o.created_at) as { v: number }) : { v: 0 };
  if (sub.v > 0) return { ok: false, why: "not_first", by: "account" };
  return { ok: true, amountCents: o.amount_cents, currency: o.currency, until: o.created_at + GUARANTEE_MS };
}

/** 10-22 进度表 78 ②: the account's latest paid pass order of this tier (the account page's refund panel) */
export function latestPassOrderSid(customerId: number, tier = "pass_1d"): string | null {
  const r = db().prepare("SELECT session_id FROM orders WHERE customer_id = ? AND tier = ? AND payment_state = 'paid' ORDER BY created_at DESC LIMIT 1").get(customerId, tier) as { session_id: string } | undefined;
  return r?.session_id ?? null;
}

/* ---------------- 公开卦例回礼 (09-26) ---------------- */

export interface CaseRewardRow {
  id: number; case_sid: string; customer_id: number | null; email: string | null; created_at: number;
  choice: "self_light" | "self_deep" | "gift" | null; chosen_at: number | null; grant_token: string | null;
}

export function caseRewardFor(caseSid: string): CaseRewardRow | null {
  return (db().prepare("SELECT * FROM case_rewards WHERE case_sid = ?").get(caseSid) ?? null) as CaseRewardRow | null;
}

export function insertCaseReward(i: { caseSid: string; customerId: number | null; email: string | null }, now = Date.now()): CaseRewardRow | null {
  db().prepare("INSERT OR IGNORE INTO case_rewards (case_sid, customer_id, email, created_at) VALUES (?,?,?,?)").run(i.caseSid, i.customerId, i.email?.toLowerCase() ?? null, now);
  return caseRewardFor(i.caseSid);
}

/** Rewards this person earned since `since` (by account or by address). */
export function caseRewardsSince(customerId: number | null, email: string | null, since: number): number {
  const e = email?.toLowerCase() ?? "";
  return (db().prepare("SELECT COUNT(*) AS v FROM case_rewards WHERE created_at >= ? AND ((? IS NOT NULL AND customer_id = ?) OR (? <> '' AND email = ?))").get(since, customerId, customerId, e, e) as { v: number }).v;
}

export function caseRewardsSiteSince(since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM case_rewards WHERE created_at >= ?").get(since) as { v: number }).v;
}

export function setCaseRewardChoice(id: number, choice: "self_light" | "self_deep" | "gift", grantToken: string | null, now = Date.now()): boolean {
  const r = db().prepare("UPDATE case_rewards SET choice = ?, chosen_at = ?, grant_token = ? WHERE id = ? AND choice IS NULL").run(choice, now, grantToken, id);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** A member's extra deep readings from published cases (chosen for themselves within the last 30 days). */
/**
 * 09-27 (Neil: 「三档的规则需要更多的数据去支撑」): one member's allowance period in full — when each deep reading
 * was spent, what they bought on top, and how often they reached the paid door with nothing left.
 */
export function memberUsage(subscriptionId: number, customerId: number, since: number, until: number): {
  deepAts: number[]; light: number; followups: number; buys: { at: number; currency: string; cents: number }[]; outClicks: number; lastSeen: number | null;
  packUsed: number; packs: { at: number; currency: string; cents: number; units: number }[];
} {
  const d = db();
  // 09-30 (Neil: 「购买了增购包的，这里是不是应该显示出来呢」): the period's own readings only — a pack's are counted apart
  const deepAts = (d.prepare("SELECT created_at AS t FROM sub_uses WHERE subscription_id = ? AND tier = 'deep' AND COALESCE(from_pack, 0) = 0 AND created_at >= ? AND created_at < ? AND (voided_at IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.session_id = 'sub_' || sub_uses.token)) ORDER BY created_at").all(subscriptionId, since, until) as { t: number }[]).map((r) => r.t);
  const packUsed = (d.prepare("SELECT COUNT(*) AS n FROM sub_uses WHERE subscription_id = ? AND tier = 'deep' AND from_pack = 1 AND created_at >= ? AND created_at < ? AND (voided_at IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.session_id = 'sub_' || sub_uses.token))").get(subscriptionId, since, until) as { n: number }).n;
  const packs = d.prepare("SELECT created_at AS at, UPPER(COALESCE(currency,'USD')) AS currency, amount_minor AS cents, units FROM member_packs WHERE customer_id = ? AND refunded_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY created_at").all(customerId, since, until) as { at: number; currency: string; cents: number; units: number }[];
  const light = (d.prepare("SELECT COUNT(*) AS n FROM sub_uses WHERE subscription_id = ? AND tier = 'one' AND created_at >= ? AND created_at < ? AND (voided_at IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.session_id = 'sub_' || sub_uses.token))").get(subscriptionId, since, until) as { n: number }).n;
  const followups = (d.prepare("SELECT COUNT(*) AS n FROM followups f JOIN casts c ON c.id = f.cast_id WHERE c.customer_id = ? AND f.role = 'user' AND f.created_at >= ? AND f.created_at < ?").get(customerId, since, until) as { n: number }).n;
  const buys = d.prepare("SELECT created_at AS at, UPPER(COALESCE(currency,'USD')) AS currency, amount_cents AS cents FROM orders WHERE customer_id = ? AND payment_state = 'paid' AND created_at >= ? AND created_at < ? ORDER BY created_at").all(customerId, since, until) as { at: number; currency: string; cents: number }[];
  const outClicks = (d.prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'allowance_out' AND detail LIKE ? AND at >= ? AND at < ?").get(`${customerId} %`, since, until) as { n: number }).n;
  const lastSeen = (d.prepare("SELECT MAX(created_at) AS t FROM casts WHERE customer_id = ?").get(customerId) as { t: number | null }).t;
  return { deepAts, light, followups, buys, outClicks, lastSeen, packUsed, packs };
}

/* ---------------- 09-30 补额度 (进度表 24) ---------------- */

export interface AllowanceGrantRow { id: number; customer_id: number; tier: string; units: number; reason: string; created_at: number }

/** Add units to a member's current period, with the reason the owner typed. Returns the row. */
export function grantAllowance(i: { customerId: number; tier: "deep" | "one"; units: number; reason: string }): AllowanceGrantRow {
  const r = db().prepare("INSERT INTO allowance_grants (customer_id, tier, units, reason, created_at) VALUES (?,?,?,?,?)")
    .run(i.customerId, i.tier, i.units, i.reason, Date.now());
  return db().prepare("SELECT * FROM allowance_grants WHERE id = ?").get(Number(r.lastInsertRowid)) as AllowanceGrantRow;
}

/** Units granted by hand inside the period that began at `since` — they belong to that period only. */
export function allowanceGrantsSince(customerId: number, tier: "deep" | "one", since: number): number {
  return (db().prepare("SELECT COALESCE(SUM(units), 0) AS v FROM allowance_grants WHERE customer_id = ? AND tier = ? AND created_at >= ?").get(customerId, tier, since) as { v: number }).v;
}

export function allowanceGrantsFor(customerId: number): AllowanceGrantRow[] {
  return db().prepare("SELECT * FROM allowance_grants WHERE customer_id = ? ORDER BY created_at DESC").all(customerId) as AllowanceGrantRow[];
}

export function memberCaseBonus(customerId: number, since: number): number {
  // 09-26 (review): counted inside the current allowance period only — never twice across a renewal
  const cases = (db().prepare("SELECT COUNT(*) AS v FROM case_rewards WHERE customer_id = ? AND choice = 'self_deep' AND chosen_at >= ?").get(customerId, since) as { v: number }).v;
  // 09-29 会员裂变: plus thank-you readings a friend's claim or a share earned a member this period
  return cases + memberReferralBonus(customerId, since);
}

/** 09-29 (Neil: 回礼可以顺延到下一期): what a member earned in an earlier window [from, to) — cases kept for themselves, friends' thank-yous. */
export function memberBonusBetween(customerId: number, from: number, to: number): { cases: number; friends: number } {
  const d = db();
  const cases = (d.prepare("SELECT COUNT(*) AS v FROM case_rewards WHERE customer_id = ? AND choice = 'self_deep' AND chosen_at >= ? AND chosen_at < ?").get(customerId, from, to) as { v: number }).v;
  const friends = (d.prepare("SELECT COUNT(*) AS v FROM referrals WHERE referrer_customer_id = ? AND to_allowance = 1 AND created_at >= ? AND created_at < ?").get(customerId, from, to) as { v: number }).v;
  return { cases, friends };
}

/** 09-29: thank-you readings credited straight into a member's allowance since `since`. */
/** 10-02: published-case rewards a member kept for themselves since `since` (the per-period cap counts these) */
export function memberCaseSelfSince(customerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM case_rewards WHERE customer_id = ? AND choice = 'self_deep' AND chosen_at >= ?").get(customerId, since) as { v: number }).v;
}

export function memberReferralBonus(customerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM referrals WHERE referrer_customer_id = ? AND to_allowance = 1 AND created_at >= ?").get(customerId, since) as { v: number }).v;
}

export function customerIdByEmail(email: string): number | null {
  const r = db().prepare("SELECT id FROM customers WHERE lower(email) = lower(?)").get(email) as { id: number } | undefined;
  if (r) return r.id;
  // 10-22 同一个人: an address held as another account's alternate (see upsertCustomer)
  const e = email.trim().toLowerCase();
  const alt = db().prepare("SELECT id FROM customers WHERE (',' || lower(COALESCE(alt_emails,'')) || ',') LIKE ? LIMIT 1").get(`%,${e},%`) as { id: number } | undefined;
  return alt?.id ?? null;
}

/** 09-26: the live cases among these reading sessions (account page: your cases and what they did). */
export function liveCasesForSessions(sids: string[]): { session_id: string; public_id: string; locale: string; published_at: number }[] {
  if (!sids.length) return [];
  return db().prepare(`SELECT session_id, public_id, locale, published_at FROM cases WHERE unpublished_at IS NULL AND hidden_at IS NULL AND session_id IN (${sids.map(() => "?").join(",")}) ORDER BY published_at DESC`).all(...sids) as { session_id: string; public_id: string; locale: string; published_at: number }[];
}

/* ---------------- 09-26 会员体系：续费前回顾、单买抵首月 ---------------- */

/** Monthly members renewing inside the window, not cancelling, not complimentary, no recap sent this period. */
export function subsForRecap(fromMs: number, toMs: number, now = Date.now()): SubscriptionRow[] {
  return db().prepare(
    `SELECT * FROM subscriptions
     WHERE status IN ('active','trialing') AND plan = 'month' AND cancel_at_period_end = 0 AND cancel_at IS NULL
       AND substr(stripe_subscription_id,1,5) <> 'comp_' AND recap_at IS NULL
       AND period_end > ? AND period_end <= ?
       -- 10-23 进度表 111 ②: a renewal that falls inside the month's pause is voided, not charged — no 「X 日會自動續費」
       AND NOT (paused_from IS NOT NULL AND paused_until IS NOT NULL AND paused_from <= period_end AND paused_until > period_end)`,
  ).all(now + fromMs, now + toMs) as unknown as SubscriptionRow[];
}
export function claimRecap(subId: number, now = Date.now()): boolean {
  return Number((db().prepare("UPDATE subscriptions SET recap_at = ? WHERE id = ? AND recap_at IS NULL").run(now, subId) as unknown as { changes?: number }).changes ?? 0) === 1;
}
export function unclaimRecap(subId: number): void {
  db().prepare("UPDATE subscriptions SET recap_at = NULL WHERE id = ?").run(subId);
}
export function followupsAskedSince(customerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM followups WHERE customer_id = ? AND role = 'user' AND created_at >= ?").get(customerId, since) as { v: number }).v;
}
export function giftsMadeSince(customerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM grants WHERE kind = 'gift_cast' AND from_customer_id = ? AND created_at >= ?").get(customerId, since) as { v: number }).v;
}

/** Paid one-time purchases of this person (account or any address of theirs) since `since`, newest first. */
export function singlePurchasesSince(customerId: number, since: number): { session_id: string; created_at: number; amount_cents: number; currency: string | null; credit_coupon: string | null }[] {
  const c = db().prepare("SELECT email, alt_emails FROM customers WHERE id = ?").get(customerId) as { email: string; alt_emails: string | null } | undefined;
  const emails = new Set<string>();
  if (c) { emails.add(c.email.toLowerCase()); for (const a of (c.alt_emails ?? "").split(/[,\s]+/)) if (a.includes("@")) emails.add(a.toLowerCase()); }
  const em = [...emails];
  return db().prepare(
    `SELECT session_id, created_at, amount_cents, currency, credit_coupon FROM orders
     WHERE created_at >= ? AND payment_state = 'paid' AND entitlement_kind = 'purchase' AND COALESCE(amount_cents,0) > 0
       AND (customer_id = ? ${em.length ? `OR lower(email) IN (${em.map(() => "?").join(",")})` : ""})
     ORDER BY created_at DESC`,
  ).all(since, customerId, ...em) as { session_id: string; created_at: number; amount_cents: number; currency: string | null; credit_coupon: string | null }[];
}
export function subscriptionsCreatedSince(customerId: number, since: number): number {
  return (db().prepare("SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id = ? AND created_at >= ? AND substr(stripe_subscription_id,1,5) <> 'comp_'").get(customerId, since) as { v: number }).v;
}
export function setOrderCreditCoupon(sessionId: string, coupon: string): void {
  db().prepare("UPDATE orders SET credit_coupon = ? WHERE session_id = ?").run(coupon, sessionId);
}

/** 09-26: the device zone we last saw for this address (login mail timestamps). */
export function customerTimeZone(email: string): string | null {
  return (db().prepare("SELECT tz FROM customers WHERE lower(email) = lower(?)").get(email) as { tz: string | null } | undefined)?.tz ?? null;
}

/* ---------------- 带新 (09-26 裂变 ④): what each thread of 裂变 brought, from the database ---------------- */

export interface BringNewRow { key: string; sent: number; used: number; newPeople: number; paidAfter: number }

/**
 * One row per chain: links made, links used, people who were new when they
 * used it (no customer record before), and of those who used it, how many paid
 * afterwards (a purchase or a membership started after the use). Our own test
 * customers are left out on both sides.
 */
export function bringNewStats(since: number): BringNewRow[] {
  const d = db();
  const chains: [string, string][] = [
    ["gift_paid", "kind = 'gift_cast' AND COALESCE(from_session_id,'') NOT LIKE 'case\\_%' ESCAPE '\\' AND COALESCE(from_session_id,'') NOT LIKE 'pool\\_%' ESCAPE '\\' AND COALESCE(from_session_id,'') NOT LIKE 'review\\_%' ESCAPE '\\'"],
    ["gift_pool", "kind = 'gift_cast' AND from_session_id LIKE 'pool\\_%' ESCAPE '\\'"],
    ["gift_case", "kind = 'gift_cast' AND from_session_id LIKE 'case\\_%' ESCAPE '\\'"],
    ["case_light", "kind = 'case_light'"],
    ["invite_light", "kind = 'invite_light' AND COALESCE(via,'') <> 'ab_free'"],
    ["ab_free", "kind = 'invite_light' AND via = 'ab_free'"],
    ["joint", "kind = 'joint'"],
    ["ref_light", "kind = 'ref_light'"],
  ];
  const ours = "(g.from_customer_id IS NULL OR g.from_customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)) AND (g.claimed_customer_id IS NULL OR g.claimed_customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)) AND (g.claimed_email IS NULL OR lower(g.claimed_email) NOT IN (SELECT lower(email) FROM customers WHERE test_flag = 1))";
  return chains.map(([key, where]) => {
    const w = `${where.replace(/\bkind\b/g, "g.kind").replace(/(?<![.\w])from_session_id\b/g, "g.from_session_id")} AND g.created_at >= ? AND ${ours}`;
    // 09-26: the friend is usually known by the address they typed, not a customer id — resolve both
    const x = `WITH x AS (SELECT g.*, COALESCE(g.claimed_customer_id, (SELECT c.id FROM customers c WHERE lower(c.email) = lower(g.claimed_email))) AS who FROM grants g WHERE ${w})`;
    const n = (sql: string) => (d.prepare(`${x} ${sql}`).get(since) as { v: number }).v;
    return {
      key,
      sent: n("SELECT COUNT(*) AS v FROM x"),
      used: n("SELECT COUNT(*) AS v FROM x WHERE used_at IS NOT NULL"),
      newPeople: n("SELECT COUNT(*) AS v FROM x JOIN customers c ON c.id = x.who WHERE x.used_at IS NOT NULL AND c.first_seen >= x.used_at - 600000"),
      paidAfter: n(`SELECT COUNT(DISTINCT who) AS v FROM x WHERE used_at IS NOT NULL AND who IS NOT NULL AND who <> COALESCE(from_customer_id, -1)
        AND (EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = x.who AND o.payment_state = 'paid' AND o.entitlement_kind = 'purchase' AND o.created_at > x.used_at)
          OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = x.who AND s.created_at > x.used_at AND substr(s.stripe_subscription_id,1,5) <> 'comp_'))`),
    };
  });
}

/** 送一卦 thank-yous actually earned (the friend paid for the first time). */
export function giftRewardsEarned(since: number): number {
  return (db().prepare(`SELECT COUNT(*) AS v FROM referrals WHERE via LIKE 'gift:%' AND created_at >= ? AND ${REF_NOT_OURS}`).get(since) as { v: number }).v;
}

/* ---------------- 会员单月 (09-26) ---------------- */

/** Local rows (comp_ / pass_) past their end: Stripe never tells us, so we close them ourselves. */
export function expireLocalSubscriptions(now = Date.now()): number {
  // 10-14 进度表 42: a month bought ahead (「再買一個月」 from the reminder) waits as 'scheduled' and starts when its
  // start comes — the same pass that ends now hands over, so there is no gap
  db().prepare(
    `UPDATE subscriptions SET status = 'active', updated_at = ?
     WHERE status = 'scheduled' AND substr(stripe_subscription_id,1,5) = 'pass_' AND period_start IS NOT NULL AND period_start <= ?`,
  ).run(now, now);
  const r = db().prepare(
    `UPDATE subscriptions SET status = 'canceled', updated_at = ?
     WHERE status IN ('active','trialing') AND substr(stripe_subscription_id,1,5) IN ('comp_','pass_') AND period_end IS NOT NULL AND period_end < ?`,
  ).run(now, now);
  return Number((r as unknown as { changes?: number }).changes ?? 0);
}

/** A paid purchase in the last 24 hours, by account or by this browser session — the "second question today" moment. */
export function paidInLastDay(customerId: number | null, browserSid: string | null, now = Date.now()): boolean {
  const since = now - 86_400_000;
  if (customerId) {
    const r = db().prepare("SELECT 1 FROM orders WHERE customer_id = ? AND created_at >= ? AND payment_state = 'paid' AND entitlement_kind = 'purchase' LIMIT 1").get(customerId, since);
    if (r) return true;
  }
  if (browserSid) {
    const r = db().prepare("SELECT 1 FROM orders WHERE browser_sid = ? AND created_at >= ? AND payment_state = 'paid' AND entitlement_kind = 'purchase' LIMIT 1").get(browserSid, since);
    if (r) return true;
  }
  return false;
}

/* ---------------- 今天的三卦 互动 (09-26) ---------------- */

/** A pick (reaction null) or a reaction on a pile; one row per browser session, day and pile. */
export function dailyVote(day: string, bs: string, pile: number, reaction: "hit" | "miss" | null, now = Date.now()): void {
  const d = db();
  d.prepare("INSERT OR IGNORE INTO daily_votes (day, bs, pile, reaction, at) VALUES (?,?,?,?,?)").run(day, bs, pile, null, now);
  if (reaction) d.prepare("UPDATE daily_votes SET reaction = ?, at = ? WHERE day = ? AND bs = ? AND pile = ?").run(reaction, now, day, bs, pile);
}

/** Today's share of visitors who opened this pile, how many opened it, and how many of the reactions said it landed. */
export function dailyStats(day: string, pile: number): { visitors: number; pickers: number; hits: number; reactions: number } {
  const d = db();
  const one = (sql: string, ...a: unknown[]) => (d.prepare(sql).get(...a) as { v: number }).v;
  return {
    visitors: one("SELECT COUNT(DISTINCT bs) AS v FROM daily_votes WHERE day = ?", day),
    pickers: one("SELECT COUNT(*) AS v FROM daily_votes WHERE day = ? AND pile = ?", day, pile),
    hits: one("SELECT COUNT(*) AS v FROM daily_votes WHERE day = ? AND pile = ? AND reaction = 'hit'", day, pile),
    reactions: one("SELECT COUNT(*) AS v FROM daily_votes WHERE day = ? AND pile = ? AND reaction IS NOT NULL", day, pile),
  };
}

export interface DailySubRow { id: number; email: string; locale: string; tz: string | null; token: string; created_at: number; confirmed_at: number | null; unsub_at: number | null; last_day: string | null; sent_count: number }

/** New or renewed request: a fresh token; a confirmed address stays confirmed, an unsubscribed one must confirm again. */
export function requestDailySub(email: string, locale: string, tz: string | null, token: string, now = Date.now()): DailySubRow {
  const d = db();
  const e = email.trim().toLowerCase();
  d.prepare(
    `INSERT INTO daily_subs (email, locale, tz, token, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET locale = excluded.locale, tz = COALESCE(excluded.tz, daily_subs.tz), token = excluded.token,
       confirmed_at = CASE WHEN daily_subs.unsub_at IS NULL THEN daily_subs.confirmed_at ELSE NULL END, unsub_at = NULL`,
  ).run(e, locale, tz, token, now);
  return d.prepare("SELECT * FROM daily_subs WHERE email = ?").get(e) as unknown as DailySubRow;
}

export function confirmDailySub(token: string, now = Date.now()): DailySubRow | null {
  const d = db();
  const row = d.prepare("SELECT * FROM daily_subs WHERE token = ?").get(token) as unknown as DailySubRow | undefined;
  if (!row) return null;
  if (!row.confirmed_at || row.unsub_at) d.prepare("UPDATE daily_subs SET confirmed_at = ?, unsub_at = NULL WHERE id = ?").run(now, row.id);
  return d.prepare("SELECT * FROM daily_subs WHERE id = ?").get(row.id) as unknown as DailySubRow;
}

export function unsubDaily(email: string, now = Date.now()): boolean {
  const r = db().prepare("UPDATE daily_subs SET unsub_at = ? WHERE email = ? AND unsub_at IS NULL").run(now, email.trim().toLowerCase());
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** Confirmed, still subscribed, and not yet sent this day. */
export function dailySubsDue(day: string, limit = 300): DailySubRow[] {
  return db().prepare("SELECT * FROM daily_subs WHERE confirmed_at IS NOT NULL AND unsub_at IS NULL AND (last_day IS NULL OR last_day <> ?) ORDER BY id LIMIT ?").all(day, limit) as unknown as DailySubRow[];
}

/** Claim the send for this day — true exactly once. */
export function claimDailySend(id: number, day: string): boolean {
  const r = db().prepare("UPDATE daily_subs SET last_day = ?, sent_count = sent_count + 1 WHERE id = ? AND (last_day IS NULL OR last_day <> ?)").run(day, id, day);
  return Number((r as unknown as { changes?: number }).changes ?? 0) === 1;
}
export function unclaimDailySend(id: number, prevDay: string | null): void {
  db().prepare("UPDATE daily_subs SET last_day = ?, sent_count = MAX(0, sent_count - 1) WHERE id = ?").run(prevDay, id);
}

export function dailySubCounts(): { confirmed: number; pending: number; unsub: number } {
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get() as { v: number }).v;
  return {
    confirmed: one("SELECT COUNT(*) AS v FROM daily_subs WHERE confirmed_at IS NOT NULL AND unsub_at IS NULL"),
    pending: one("SELECT COUNT(*) AS v FROM daily_subs WHERE confirmed_at IS NULL AND unsub_at IS NULL"),
    unsub: one("SELECT COUNT(*) AS v FROM daily_subs WHERE unsub_at IS NOT NULL"),
  };
}

/** 09-26: the reader's latest reading (with its page) inside the window — the one a reply-like question is answering. */
export function latestReadingWithin(customerId: number, withinMs: number, now = Date.now()): { sid: string; q: string; at: number } | null {
  const r = db().prepare(
    `SELECT o.session_id AS sid, c.question AS q, c.created_at AS at FROM casts c
     JOIN readings r ON r.cast_id = c.id JOIN orders o ON o.cast_id = c.id
     WHERE c.customer_id = ? AND c.created_at >= ? ORDER BY c.created_at DESC LIMIT 1`,
  ).get(customerId, now - withinMs) as { sid: string; q: string; at: number } | undefined;
  return r ?? null;
}

/** 09-27: case-born gifts this giver already handed to this claimant (by id or address) since `since`. */
export function caseGiftsBetween(giverId: number, claimantId: number | null, claimantEmail: string | null, since: number): number {
  const e = (claimantEmail ?? "").toLowerCase();
  const claimantById = claimantId ?? (e ? customerIdByEmail(e) : null);
  return (db().prepare(
    `SELECT COUNT(*) AS v FROM grants WHERE kind = 'gift_cast' AND from_customer_id = ? AND used_at IS NOT NULL AND used_at >= ?
       AND from_session_id LIKE 'case\\_%' ESCAPE '\\'
       AND ((claimed_customer_id IS NOT NULL AND claimed_customer_id = ?) OR (? <> '' AND lower(claimed_email) = ?))`,
  ).get(giverId, since, claimantById ?? -1, e, e) as { v: number }).v;
}


/* ---------------- 2027 年卦预约 (10-12, 进度表 §四 38) ---------------- */

export const YEAR_KINDS = ["love", "work", "money", "other"] as const;
export type YearKind = (typeof YEAR_KINDS)[number];

/** "new" the first time an address signs up, "again" after (the kind is updated, the date kept). */
export function joinYearWaitlist(email: string, kind: YearKind, locale: string, via: string | null): "new" | "again" {
  const e = email.trim().toLowerCase();
  const now = Date.now();
  const d = db();
  const had = d.prepare("SELECT 1 AS v FROM year_waitlist WHERE email = ?").get(e);
  d.prepare(
    `INSERT INTO year_waitlist (email, kind, locale, via, created_at, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET kind = excluded.kind, updated_at = excluded.updated_at`,
  ).run(e, kind, locale, via, now, now);
  return had ? "again" : "new";
}

/** For /admin/waitlist: how many, of which kind, from where, by day — our own test addresses left out. */
export function yearWaitlistStats(): { total: number; byKind: Record<string, number>; byVia: { via: string; n: number }[]; byDay: { day: string; n: number }[] } {
  const d = db();
  const mine = "email NOT IN (SELECT email FROM customers WHERE test_flag = 1)";
  const total = (d.prepare(`SELECT COUNT(*) AS v FROM year_waitlist WHERE ${mine}`).get() as { v: number }).v;
  const byKind: Record<string, number> = {};
  for (const r of d.prepare(`SELECT kind, COUNT(*) AS n FROM year_waitlist WHERE ${mine} GROUP BY kind`).all() as { kind: string; n: number }[]) byKind[r.kind] = r.n;
  const byVia = d.prepare(`SELECT COALESCE(via, '') AS via, COUNT(*) AS n FROM year_waitlist WHERE ${mine} GROUP BY via ORDER BY n DESC LIMIT 12`).all() as { via: string; n: number }[];
  const byDay = d.prepare(`SELECT date((created_at + 8 * 3600000) / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM year_waitlist WHERE ${mine} GROUP BY day ORDER BY day DESC LIMIT 30`).all() as { day: string; n: number }[];
  return { total, byKind, byVia, byDay };
}


/* ---------------- 解籤 (10-12, 进度表 §四 36) ---------------- */

export interface QianDrawRow {
  id: number; token: string; set_name: string; num: number; temple: string | null; situation: string; question: string; locale: string;
  device: string | null; customer_id: number | null; created_at: number; cast_id: number | null; matter_id: number | null;
  paid_session: string | null; paid_at: number | null; email: string | null; currency: string | null; amount_minor: number | null;
  personal_json: string | null; personal_at: number | null;
  /** 10-13: the included follow-up (the reader's words, and our {answer, cast}) */
  followup_q?: string | null; followup_json?: string | null; followup_at?: number | null;
  /** 10-12 读者识别: "hk" (Hong Kong written wording) / "yue" (Cantonese) / null (Taiwan wording) */
  register?: string | null;
}

export function createQianDraw(i: { token: string; setName: string; num: number; temple: string | null; situation: string; question: string; locale: string; device: string | null; customerId: number | null; register?: string | null; /** 10-13: asked of everyone not signed in */ email?: string | null }): void {
  db().prepare(
    `INSERT INTO qian_draws (token, set_name, num, temple, situation, question, locale, device, customer_id, created_at, register, email)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(i.token, i.setName, i.num, i.temple, i.situation, i.question.slice(0, 450), i.locale, i.device, i.customerId, Date.now(), i.register ?? null, i.email ? i.email.trim().toLowerCase() : null);
}

export function qianDrawByToken(token: string): QianDrawRow | null {
  return (db().prepare("SELECT * FROM qian_draws WHERE token = ?").get(token) ?? null) as QianDrawRow | null;
}

/** The cast that followed the lot, and the matter it was filed under (set once — the first cast is the one that followed). */
export function attachQianCast(token: string, castId: number): void {
  const d = db();
  const m = (d.prepare("SELECT matter_id, customer_id FROM casts WHERE id = ?").get(castId) ?? null) as { matter_id: number | null; customer_id: number | null } | null;
  d.prepare("UPDATE qian_draws SET cast_id = COALESCE(cast_id, ?), matter_id = COALESCE(matter_id, ?), customer_id = COALESCE(customer_id, ?) WHERE token = ?")
    .run(castId, m?.matter_id ?? null, m?.customer_id ?? null, token);
}

/** A cast's lot, if it followed one — for the reading page's 「接在第 N 籤之後」. */
export function qianDrawForCast(castId: number): QianDrawRow | null {
  return (db().prepare("SELECT * FROM qian_draws WHERE cast_id = ? ORDER BY id LIMIT 1").get(castId) ?? null) as QianDrawRow | null;
}

/** The lots under one matter, oldest first — for the matter page. */
export function qianDrawsForMatter(matterId: number): QianDrawRow[] {
  return db().prepare(
    `SELECT q.* FROM qian_draws q WHERE q.matter_id = ? OR q.cast_id IN (SELECT id FROM casts WHERE matter_id = ?) ORDER BY q.created_at`,
  ).all(matterId, matterId) as unknown as QianDrawRow[];
}

export function markQianPaid(token: string, i: { session: string; email: string | null; currency: string; amountMinor: number; customerId: number | null }): void {
  db().prepare(
    `UPDATE qian_draws SET paid_session = ?, paid_at = COALESCE(paid_at, ?), email = COALESCE(?, email), currency = ?, amount_minor = ?,
       customer_id = COALESCE(customer_id, ?) WHERE token = ?`,
  ).run(i.session, Date.now(), i.email ? i.email.trim().toLowerCase() : null, i.currency, i.amountMinor, i.customerId, token);
}

export function setQianPersonal(token: string, body: unknown): void {
  db().prepare("UPDATE qian_draws SET personal_json = ?, personal_at = ? WHERE token = ?").run(JSON.stringify(body), Date.now(), token);
}

/**
 * 10-13 解籤承接 (Neil: 「维持 NT$75，但含 1 次追问」): the one follow-up a personal reading includes. Written once — the
 * WHERE keeps a second answer (a double tap, two tabs) from replacing the first. True when this call wrote it.
 */
export function setQianFollowup(token: string, question: string, answer: unknown): boolean {
  const r = db().prepare("UPDATE qian_draws SET followup_q = ?, followup_json = ?, followup_at = ? WHERE token = ? AND followup_json IS NULL")
    .run(question, JSON.stringify(answer), Date.now(), token);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** Paid personal readings still waiting for their text (the buyer never came back to the page). */
export function qianPaidUnwritten(limit = 20): QianDrawRow[] {
  return db().prepare("SELECT * FROM qian_draws WHERE paid_at IS NOT NULL AND personal_json IS NULL AND paid_at < ? ORDER BY paid_at LIMIT ?")
    .all(Date.now() - 5 * 60_000, limit) as unknown as QianDrawRow[];
}

/** 10-12 承接 ⑨ 卦→籤: a cast's question (the lot added from its reading is asked the same way). */
export function castQuestion(castId: number): string | null {
  return ((db().prepare("SELECT question FROM casts WHERE id = ?").get(castId) as { question: string } | undefined)?.question) ?? null;
}

/** 10-12 承接 ⑨ 卦→籤: a lot added to a matter that already has casts (from its reading or its page). */
export function setQianMatter(token: string, matterId: number): void {
  db().prepare("UPDATE qian_draws SET matter_id = ? WHERE token = ?").run(matterId, token);
}

/** 10-13 解籤明细 (Neil: 「解签的详细内容也显示在解签页的面板里面吧」): one draw as the admin list shows it. */
export interface QianDetailRow extends QianDrawRow {
  cust_email: string | null; test_flag: number | null; cast_paid: number; cast_tier: string | null;
}

/** The draws of a period, newest first, with who drew them and what followed (a cast, and whether it was paid). */
export function qianDetails(since: number, limit = 300): QianDetailRow[] {
  return db().prepare(
    `SELECT q.*, c.email AS cust_email, c.test_flag AS test_flag,
       (SELECT o.tier FROM orders o WHERE o.cast_id = q.cast_id AND (COALESCE(o.amount_cents,0) > 0 OR o.status = 'subscription') ORDER BY o.id DESC LIMIT 1) AS cast_tier,
       EXISTS (SELECT 1 FROM orders o WHERE o.cast_id = q.cast_id AND (COALESCE(o.amount_cents,0) > 0 OR o.status = 'subscription')) AS cast_paid
     FROM qian_draws q LEFT JOIN customers c ON c.id = q.customer_id
     WHERE q.created_at >= ? ORDER BY q.id DESC LIMIT ?`,
  ).all(since, limit) as unknown as QianDetailRow[];
}

/** 10-13 解籤看板 (Neil: 「全部都补上吧」): one row of the by-set / by-situation tables. */
export interface QianSliceRow { key: string; draws: number; toCast: number; paid: number; member: number; followups: number }

/**
 * 10-13 解籤看板: the lots split by set and by kind of matter, and the money the personal readings took. Money comes from
 * the orders table (tier "qian" — written by fulfilQianPayment), refunds subtracted; our own test accounts left out.
 */
export function qianBreakdown(since: number): {
  bySet: QianSliceRow[]; bySituation: QianSliceRow[];
  money: { currency: string; orders: number; minor: number; refunded: number; refundedMinor: number }[];
} {
  const d = db();
  const mineQ = "(q.customer_id IS NULL OR q.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
  const slice = (col: string) => (d.prepare(
    `SELECT ${col} AS key, COUNT(*) AS draws, SUM(q.cast_id IS NOT NULL) AS toCast,
       SUM(q.paid_at IS NOT NULL AND COALESCE(q.amount_minor,0) > 0) AS paid,
       SUM(q.paid_session LIKE 'member:%') AS member, SUM(q.followup_at IS NOT NULL) AS followups
     FROM qian_draws q WHERE q.created_at >= ? AND ${mineQ} GROUP BY ${col} ORDER BY draws DESC`,
  ).all(since) as unknown as QianSliceRow[]).map((r) => ({ key: r.key, draws: Number(r.draws), toCast: Number(r.toCast ?? 0), paid: Number(r.paid ?? 0), member: Number(r.member ?? 0), followups: Number(r.followups ?? 0) }));
  const money = (d.prepare(
    `SELECT UPPER(COALESCE(o.currency,'?')) AS currency, COUNT(*) AS orders, SUM(COALESCE(o.amount_cents,0)) AS minor,
       SUM(o.refunded_at IS NOT NULL) AS refunded, SUM(CASE WHEN o.refunded_at IS NOT NULL THEN COALESCE(o.amount_cents,0) ELSE 0 END) AS refundedMinor
     FROM orders o WHERE o.tier = 'qian' AND o.status = 'paid' AND o.created_at >= ? AND COALESCE(o.amount_cents,0) > 0
       AND (o.customer_id IS NULL OR o.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))
     GROUP BY 1 ORDER BY minor DESC`,
  ).all(since) as unknown as { currency: string; orders: number; minor: number; refunded: number; refundedMinor: number }[])
    .map((r) => ({ currency: r.currency, orders: Number(r.orders), minor: Number(r.minor ?? 0), refunded: Number(r.refunded ?? 0), refundedMinor: Number(r.refundedMinor ?? 0) }));
  return { bySet: slice("q.set_name"), bySituation: slice("q.situation"), money };
}

/**
 * 10-12 承接 ⑨ 埋点 (进度表 §四 36 ⑨⑩): the two-way traffic between a lot and a cast, and whether a matter that has both
 * does better than one with casts alone. Our own test accounts left out.
 */
export function qianStats(since: number): {
  draws: number; drawsToCast: number; drawsJoined: number; personalPaid: number; personalMember: number; personalPass: number;
  /** 10-13: personal readings whose included follow-up was used; of those, how many went on to a cast */
  followups: number; followupsToCast: number;
  castCustomers: number; castCustomersWithQian: number;
  withQian: { matters: number; paid: number; revisitsSent: number; revisitsAnswered: number };
  castsOnly: { matters: number; paid: number; revisitsSent: number; revisitsAnswered: number };
} {
  const d = db();
  const one = (sql: string, ...a: unknown[]) => (d.prepare(sql).get(...a) as { v: number } | undefined)?.v ?? 0;
  const mineQ = "(q.customer_id IS NULL OR q.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
  const draws = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.created_at >= ? AND ${mineQ}`, since);
  const drawsToCast = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.created_at >= ? AND q.cast_id IS NOT NULL AND ${mineQ}`, since);
  const drawsJoined = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.created_at >= ? AND q.cast_id IS NULL AND q.matter_id IS NOT NULL AND ${mineQ}`, since);
  const personalPaid = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.paid_at >= ? AND COALESCE(q.amount_minor,0) > 0 AND ${mineQ}`, since);
  // 10-23 进度表 105 ④: under a pass and under a membership, apart (both were 「会员额度」)
  const underPass = "q.paid_session IN (SELECT 'member:' || id FROM subscriptions WHERE substr(stripe_subscription_id, 1, 5) = 'pass_')";
  const personalPass = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.paid_at >= ? AND ${underPass} AND ${mineQ}`, since);
  const personalMember = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.paid_at >= ? AND q.paid_session LIKE 'member:%' AND NOT (${underPass}) AND ${mineQ}`, since);
  const followups = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.followup_at >= ? AND ${mineQ}`, since);
  const followupsToCast = one(`SELECT COUNT(*) AS v FROM qian_draws q WHERE q.followup_at >= ? AND q.cast_id IS NOT NULL AND ${mineQ}`, since);
  const castCustomers = one(`SELECT COUNT(DISTINCT c.customer_id) AS v FROM casts c WHERE c.created_at >= ? AND c.locale = 'zh-hant' AND c.customer_id IS NOT NULL AND c.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)`, since);
  const castCustomersWithQian = one(`SELECT COUNT(DISTINCT c.customer_id) AS v FROM casts c WHERE c.created_at >= ? AND c.locale = 'zh-hant' AND c.customer_id IS NOT NULL
    AND c.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)
    AND EXISTS (SELECT 1 FROM qian_draws q WHERE q.customer_id = c.customer_id OR q.matter_id = c.matter_id OR q.cast_id = c.id)`, since);
  // 10-13 事故: the first version asked, for every matter, whether any lot pointed at any of its casts — with no index on
  // casts.matter_id that is matters × lots × casts, >80 s on the live data, and node:sqlite is synchronous, so opening the
  // dashboard froze the whole site (~10 min of 499s). Now the set of matters with a lot is built once (CTE), ~20 ms.
  const group = (withQian: boolean) => {
    const ms = `WITH qm AS (SELECT matter_id AS id FROM qian_draws WHERE matter_id IS NOT NULL
        UNION SELECT c.matter_id FROM qian_draws q JOIN casts c ON c.id = q.cast_id WHERE c.matter_id IS NOT NULL),
      ms AS (SELECT m.id FROM matters m WHERE m.last_at >= ? AND m.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)
        AND m.id IN (SELECT matter_id FROM casts WHERE locale = 'zh-hant' AND matter_id IS NOT NULL) AND m.id ${withQian ? "" : "NOT "}IN (SELECT id FROM qm))`;
    const rev = d.prepare(`${ms} SELECT COUNT(*) AS v, SUM(r.outcome IS NOT NULL) AS a FROM revisits r JOIN casts c ON c.id = r.cast_id
      WHERE r.sent_at IS NOT NULL AND c.matter_id IN (SELECT id FROM ms)`).get(since) as { v: number; a: number | null } | undefined;
    return {
      matters: one(`${ms} SELECT COUNT(*) AS v FROM ms`, since),
      paid: one(`${ms} SELECT COUNT(*) AS v FROM ms WHERE ms.id IN (SELECT c.matter_id FROM orders o JOIN casts c ON c.id = o.cast_id WHERE COALESCE(o.amount_cents,0) > 0 OR o.status = 'subscription')`, since),
      revisitsSent: Number(rev?.v ?? 0),
      revisitsAnswered: Number(rev?.a ?? 0),
    };
  };
  return { draws, drawsToCast, drawsJoined, personalPaid, personalMember, personalPass, followups, followupsToCast, castCustomers, castCustomersWithQian, withQian: group(true), castsOnly: group(false) };
}

/** 10-12 解籤收尾 ③: a browser proved whose it is (signed in, paid, claimed) — its unowned lots of the last 90 days join that account. */
export function claimQianDraws(device: string, customerId: number, now = Date.now()): number {
  const r = db().prepare("UPDATE qian_draws SET customer_id = ? WHERE device = ? AND customer_id IS NULL AND created_at >= ?").run(customerId, device, now - 90 * 86_400_000);
  return Number((r as { changes?: number | bigint }).changes ?? 0);
}
