import { redirect } from "next/navigation";

/** Legacy URL → workflow public template viewer. */
export default async function ClippingPublicTemplateRedirectPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  redirect(`/workflow/public/${encodeURIComponent(templateId)}`);
}
