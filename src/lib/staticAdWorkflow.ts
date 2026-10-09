/** Master workflow. Product templates are pages inside it, not separate user spaces. */
export const STATIC_AD_WORKFLOW_NAME = "Static Ads";

export function staticAdPageId(templateId: string): string {
  return `static-ad-${templateId}`;
}
