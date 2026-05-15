/** Parse a JSON object from an LLM response (strips optional ```json fences). */
export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const direct = trimmed.replace(/^```json\s*|\s*```$/g, "").trim();

  try {
    return JSON.parse(direct) as Record<string, unknown>;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Model response did not contain valid JSON.");
  }
}
