import { llmsTxt } from "@/lib/llms";
import { caseLocales, llmsSite, plainText } from "@/lib/llms-route";

// 进度表 26: facts for AI search engines; prices and allowances come from the same constants the checkout uses
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return plainText(llmsTxt(llmsSite(), caseLocales()));
}
