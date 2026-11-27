import { execFile } from "node:child_process";
import { awsCostFetchedAt, recordOps, saveAwsCostDays, type AwsCostRow } from "./db";

/**
 * 服务器成本按 AWS 实时账单 (09-27, Neil: 「我在 AWS 的 IAM 账号中添加了账单的功能…按 AWS 的实时账单来算」).
 *
 * Cost Explorer through the instance's own role (the aws CLI picks it up from
 * the metadata service; no key in .env). One call returns every day since the
 * server existed, by service; each read overwrites the days it covers, because
 * AWS keeps revising the last day or two ("estimated"). Each Cost Explorer call
 * is billed ($0.01), and AWS itself only refreshes the figures a few times a day,
 * so at most one read every 12 hours.
 */
export const AWS_COST_FROM = "2026-07-01";
const MAX_AGE_MS = 12 * 3_600_000;

interface CeGroup { Keys: string[]; Metrics: { UnblendedCost: { Amount: string } } }
interface CeResult { TimePeriod: { Start: string }; Groups: CeGroup[]; Estimated?: boolean }
interface CeResponse { ResultsByTime: CeResult[]; NextPageToken?: string }

function aws(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Cost Explorer lives in us-east-1 whatever region the server is in
    execFile(process.env.AWS_CLI ?? "/usr/local/bin/aws", args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, AWS_PAGER: "", AWS_DEFAULT_REGION: "us-east-1" } }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).slice(0, 200)));
      else resolve(stdout);
    });
  });
}

/** Cost Explorer's answer → one row per day and service (exported for the test). */
export function parseCostExplorer(r: CeResponse): AwsCostRow[] {
  const out: AwsCostRow[] = [];
  for (const t of r.ResultsByTime ?? []) {
    for (const g of t.Groups ?? []) {
      const usd = Number(g.Metrics?.UnblendedCost?.Amount ?? 0);
      if (!Number.isFinite(usd)) continue;
      out.push({ day: t.TimePeriod.Start, service: g.Keys[0] ?? "?", usd, estimated: !!t.Estimated });
    }
  }
  return out;
}

export async function refreshAwsCost(force = false, now = Date.now()): Promise<{ ran: boolean; rows?: number }> {
  const last = awsCostFetchedAt();
  if (!force && last && now - last < MAX_AGE_MS) return { ran: false };
  const end = new Date(now + 86_400_000).toISOString().slice(0, 10); // End is exclusive: through today
  try {
    let token: string | undefined;
    let rows = 0;
    for (let page = 0; page < 10; page++) {
      const args = ["ce", "get-cost-and-usage", "--time-period", `Start=${AWS_COST_FROM},End=${end}`, "--granularity", "DAILY",
        "--metrics", "UnblendedCost", "--group-by", "Type=DIMENSION,Key=SERVICE", "--output", "json"];
      if (token) args.push("--next-page-token", token);
      const r = JSON.parse(await aws(args)) as CeResponse;
      const parsed = parseCostExplorer(r);
      saveAwsCostDays(parsed, now);
      rows += parsed.length;
      token = r.NextPageToken;
      if (!token) break;
    }
    return { ran: true, rows };
  } catch (e) {
    recordOps("aws_cost_fail", e instanceof Error ? e.message : "unknown");
    return { ran: false };
  }
}

/** Cost Explorer's service names, as the finance page shows them. */
export const AWS_SERVICE_LABEL: Record<string, string> = {
  "Amazon Elastic Compute Cloud - Compute": "EC2 机器时长",
  "EC2 - Other": "EC2 其他（硬盘、快照、CPU 超额积分、区域内流量）",
  "Amazon Virtual Private Cloud": "公网 IPv4 地址",
  "Amazon Simple Storage Service": "S3（异地备份）",
  "AWS Cost Explorer": "账单接口调用",
  Tax: "税",
};
