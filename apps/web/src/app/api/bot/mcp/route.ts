import { PROTOCOL, TOOLS, authorized, callTool, rateLimited } from "@/lib/ops-bot-mcp";
import { botLog } from "@/lib/ops-bot";
import { featureState } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 11-27 运营 bot 的 MCP 入口（YaoFlow 自己的 Grok Bot 接这里）。范围见 src/lib/ops-bot-mcp.ts；功能开关 ops-bot 关掉时整个入口 404。 */
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const asked = typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : PROTOCOL;
      return reply(m.id, {
        protocolVersion: asked, capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "yaoflow-ops", version: "1.0.0" },
        instructions: "YaoFlow 社媒运营。先 get_guidelines，再 get_assignments。写稿只进待审；发帖只发 get_due_posts 给的稿；回帖每条先 check_reply、发后 log_reply；每轮结束 send_report。",
      });
    }
    case "ping": return reply(m.id, {});
    case "tools/list": return reply(m.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      try {
        const r = await callTool(name, m.params?.arguments);
        botLog(`mcp.${name}`, { error: r.isError ? r.content[0]?.text.slice(0, 200) : undefined });
        return reply(m.id, r);
      } catch (e) {
        return reply(m.id, { content: [{ type: "text", text: `工具出错：${e instanceof Error ? e.message.slice(0, 200) : e}` }], isError: true });
      }
    }
    default:
      return m.id === undefined ? null : fail(m.id, -32601, `method not found: ${m.method}`);
  }
}

export async function POST(req: Request) {
  if (featureState("ops-bot") === "off") return new Response("Not Found", { status: 404 });
  if (!authorized(req)) return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
  if (rateLimited()) return Response.json(fail(null, -32000, "rate limited: 60 calls/min"), { status: 429 });
  let body: Rpc | Rpc[];
  try { body = await req.json(); } catch { return Response.json(fail(null, -32700, "parse error"), { status: 400 }); }
  const batch = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(batch.map(handle))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { "cache-control": "no-store" } });
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
export async function DELETE() {
  return new Response(null, { status: 405 });
}
