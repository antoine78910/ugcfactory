export type LinkToAdTemplateSummary = {
  normalizedUrl: string;
  storeUrl: string;
  title: string | null;
  thumbUrl: string | null;
  sourceRunId: string;
  createdAt: string;
};

const LINK_TO_AD_TEMPLATES_KEY = "youry-link-to-ad-templates-v1";
const MAX_LINK_TO_AD_TEMPLATES = 60;

function sanitizeTemplateRow(row: unknown): LinkToAdTemplateSummary | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const normalizedUrl = typeof r.normalizedUrl === "string" ? r.normalizedUrl.trim() : "";
  const storeUrl = typeof r.storeUrl === "string" ? r.storeUrl.trim() : "";
  const sourceRunId = typeof r.sourceRunId === "string" ? r.sourceRunId.trim() : "";
  if (!normalizedUrl || !storeUrl || !sourceRunId) return null;
  const createdAtRaw = typeof r.createdAt === "string" ? r.createdAt.trim() : "";
  const createdAt = createdAtRaw || new Date().toISOString();
  const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : null;
  const thumbUrl = typeof r.thumbUrl === "string" && r.thumbUrl.trim() ? r.thumbUrl.trim() : null;
  return { normalizedUrl, storeUrl, title, thumbUrl, sourceRunId, createdAt };
}

export function readLinkToAdTemplates(): LinkToAdTemplateSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LINK_TO_AD_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeTemplateRow)
      .filter((x): x is LinkToAdTemplateSummary => x !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_LINK_TO_AD_TEMPLATES);
  } catch {
    return [];
  }
}

function writeLinkToAdTemplates(rows: LinkToAdTemplateSummary[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LINK_TO_AD_TEMPLATES_KEY, JSON.stringify(rows.slice(0, MAX_LINK_TO_AD_TEMPLATES)));
  } catch {
    // Ignore quota/storage errors.
  }
}

export function upsertLinkToAdTemplate(row: LinkToAdTemplateSummary): LinkToAdTemplateSummary[] {
  const current = readLinkToAdTemplates();
  const next = [row, ...current.filter((x) => x.normalizedUrl !== row.normalizedUrl)];
  writeLinkToAdTemplates(next);
  return next;
}

export function removeLinkToAdTemplate(normalizedUrl: string): LinkToAdTemplateSummary[] {
  const key = normalizedUrl.trim();
  const next = readLinkToAdTemplates().filter((x) => x.normalizedUrl !== key);
  writeLinkToAdTemplates(next);
  return next;
}

