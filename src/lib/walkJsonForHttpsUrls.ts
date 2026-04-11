/** Deep scan for playable/asset https URLs when providers nest output unpredictably. */
export function walkJsonForHttpsUrls(root: unknown): string[] {
  const out: string[] = [];
  function walk(x: unknown): void {
    if (typeof x === "string") {
      if (/^https?:\/\//i.test(x)) out.push(x);
      else if (x.startsWith("//")) out.push(`https:${x}`);
    } else if (Array.isArray(x)) {
      for (const i of x) walk(i);
    } else if (x && typeof x === "object") {
      for (const v of Object.values(x as Record<string, unknown>)) walk(v);
    }
  }
  walk(root);
  return [...new Set(out)];
}
