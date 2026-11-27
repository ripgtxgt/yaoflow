import { llmsFullTxt } from "@/lib/llms";
import { caseLocales, llmsSite, plainText } from "@/lib/llms-route";

// 进度表 26: llms.txt plus the timing and how-to-ask articles in full and the 64 hexagram pages
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return plainText(llmsFullTxt(llmsSite(), caseLocales()));
}
