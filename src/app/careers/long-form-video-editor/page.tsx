import { redirect } from "next/navigation";

/** Legacy URL after a brief rename — role is smart short-form video editor. */
export default function LongFormVideoEditorRedirectPage() {
  redirect("/careers/smart-video-editor");
}
