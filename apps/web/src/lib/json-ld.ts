/**
 * Structured data for <script type="application/ld+json">: one block per top-level node, safe inside the tag.
 *
 * 10-15 (jamiejen1225, Safari 16.6, /qian/liushi-jiazi/38): "undefined is not an object (evaluating
 * 'r["@context"].toLowerCase')". Not our code — a browser extension parses every ld+json block and reads ["@context"]
 * off the result, and that page put its two nodes in one top-level array. An array is valid JSON-LD and Google reads it,
 * but naive parsers crash on it and the crash lands on the live board as a page error. One node per block reads the same
 * to Google (it is the form of Google's own examples) and nobody trips on it.
 *
 * The same sink carried a stored XSS: case pages put the author's public wording (≤80 chars; links refused, `<` not)
 * through JSON.stringify, which leaves "</script>" as it is — a wording could close the tag and open a script on a
 * public yaoflow.com page. `<` `>` `&` become \u escapes: the same JSON to any parser, nothing for the HTML parser.
 */
export function jsonLdBlocks(data: object | readonly object[]): string[] {
  const nodes = (Array.isArray(data) ? data : [data]) as readonly object[];
  return nodes.map((n) => JSON.stringify(n).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"));
}
