import { redirect } from "next/navigation";

/** Legacy read-only URL → public fullscreen template viewer. */
export default async function ClippingWorkflowTemplateRedirectPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  redirect(`/clipping/public/${encodeURIComponent(templateId)}`);
}
