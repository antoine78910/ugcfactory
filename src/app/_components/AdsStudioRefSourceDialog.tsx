"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isProbablyVideoUrl,
  type StudioHistoryItem,
} from "@/app/_components/StudioGenerationsHistory";
import { buildLtaGroupsFromRunsListJson, type ElementRefPickLtaGroup } from "@/lib/ltaRunsRefGroups";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { STUDIO_VIDEO_TAB_KINDS } from "@/lib/studioGenerationKinds";
import { isKieServableReferenceImageUrl } from "@/lib/kieSoraReferenceImage";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import { cn } from "@/lib/utils";

const ADS_STUDIO_MEDIA_KIND_PARAM = [...STUDIO_VIDEO_TAB_KINDS, "studio_image", "studio_upscale"].join(",");

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Product/App slot vs Avatar slot — drives which sections are shown. */
  mode: "product" | "avatar";
  onPickUrl: (url: string) => void;
  /** Optional: open native file picker from parent (same accept as Ads Studio). */
  onRequestFileUpload?: () => void;
};

export function AdsStudioRefSourceDialog({
  open,
  onOpenChange,
  mode,
  onPickUrl,
  onRequestFileUpload,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [imageItems, setImageItems] = useState<StudioHistoryItem[]>([]);
  const [ltaGroups, setLtaGroups] = useState<ElementRefPickLtaGroup[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, studioRes, avRes] = await Promise.all([
        fetch("/api/runs/list", { cache: "no-store" }),
        fetch(`/api/studio/generations?kind=${encodeURIComponent(ADS_STUDIO_MEDIA_KIND_PARAM)}`, { cache: "no-store" }),
        mode === "avatar" ? loadAvatarUrls() : Promise.resolve([] as string[]),
      ]);

      if (!runsRes.ok) {
        const t = await runsRes.text().catch(() => "");
        throw new Error(t || `Runs HTTP ${runsRes.status}`);
      }
      const runsJson = (await runsRes.json()) as Parameters<typeof buildLtaGroupsFromRunsListJson>[0];
      const { ltaGroups: nextLta } = buildLtaGroupsFromRunsListJson(runsJson);
      setLtaGroups(nextLta);

      if (studioRes.ok) {
        const studioJson = (await studioRes.json()) as { data?: StudioHistoryItem[] };
        const studioRows = (studioJson.data ?? []).sort((a, b) => b.createdAt - a.createdAt);
        const imgs = studioRows.filter(
          (r) =>
            r.kind === "image" &&
            r.status === "ready" &&
            Boolean(r.mediaUrl?.trim()) &&
            !isProbablyVideoUrl(r.mediaUrl),
        );
        setImageItems(imgs);
      } else {
        setImageItems([]);
      }

      if (mode === "avatar") {
        setAvatarUrls(avRes);
      }
    } catch (e) {
      toast.error("Could not load sources", {
        description: userMessageFromCaughtError(e, "Try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function pick(url: string) {
    const u = url.trim();
    if (!u || !isKieServableReferenceImageUrl(u)) {
      toast.error("Invalid image", { description: "Pick a valid HTTPS image URL." });
      return;
    }
    onPickUrl(u);
    onOpenChange(false);
  }

  const productPhotoUrls = ltaGroups.flatMap((g) => g.productMedia.filter((m) => m.kind === "image").map((m) => m.url));
  const uniqueProductPhotos = [...new Set(productPhotoUrls)];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[520] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[521] flex max-h-[min(88vh,780px)] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#101014] shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <Dialog.Title className="text-base font-semibold text-white">
              {mode === "product" ? "Product reference" : "Avatar reference"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Choose an image from generations, Link to Ad, or your avatar library.
          </Dialog.Description>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 studio-params-scroll">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/55">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Loading…
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {mode === "avatar" ? (
                  <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                      <span className="inline-flex size-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                        A
                      </span>
                      Element — Avatar library
                    </h3>
                    {avatarUrls.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {avatarUrls.map((url, idx) => (
                          <button
                            key={`${url}-${idx}`}
                            type="button"
                            onClick={() => pick(url)}
                            className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-white/15 bg-black/30 transition hover:border-violet-400/55"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-1 text-[10px] font-medium text-white/85 opacity-0 transition group-hover:opacity-100">
                              Use
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-white/50">
                        No avatars yet. Generate avatars in{" "}
                        <span className="font-medium text-white/70">Create → Avatar</span>, then reopen this dialog.
                      </p>
                    )}
                  </section>
                ) : null}

                <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                    <span className="inline-flex size-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                      <ImageIcon className="size-3.5" aria-hidden />
                    </span>
                    Element — Image generations
                  </h3>
                  {imageItems.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {imageItems.slice(0, 24).map((row) => {
                        const u = row.mediaUrl?.trim() ?? "";
                        if (!u) return null;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => pick(u)}
                            className="group relative aspect-square overflow-hidden rounded-lg border border-white/15 bg-black/30 transition hover:border-violet-400/55"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="" className="h-full w-full object-cover" />
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 py-1 text-[9px] font-medium text-white/80 opacity-0 transition group-hover:opacity-100 line-clamp-2">
                              {row.label.slice(0, 48)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-white/45">No studio images yet. Create some in Image tab first.</p>
                  )}
                </section>

                {mode === "product" ? (
                  <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                      <span className="inline-flex size-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                        <Sparkles className="size-3.5" aria-hidden />
                      </span>
                      Element — Link to Ad product photos
                    </h3>
                    {uniqueProductPhotos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {uniqueProductPhotos.map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => pick(url)}
                            className="group relative aspect-square overflow-hidden rounded-lg border border-white/15 bg-black/30 transition hover:border-violet-400/55"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-1 text-[10px] font-medium text-white/85 opacity-0 transition group-hover:opacity-100">
                              Use
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-white/45">
                        No product photos found in Link to Ad runs. Run Link to Ad with product images first.
                      </p>
                    )}
                  </section>
                ) : null}

                {mode === "avatar" ? (
                  <section className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                      Element — Upload library (coming soon)
                    </h3>
                    <p className="text-sm leading-relaxed text-white/40">
                      Dedicated avatar uploads for Ads Studio will appear here in a future update. Until then, use{" "}
                      <span className="font-medium text-white/55">Avatar library</span> above or{" "}
                      <span className="font-medium text-white/55">Image generations</span>.
                    </p>
                  </section>
                ) : null}

                <section
                  className={cn(
                    "rounded-xl border border-white/10 bg-white/[0.03] p-4",
                    !onRequestFileUpload && "opacity-60",
                  )}
                >
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                    <span className="inline-flex size-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                      <Upload className="size-3.5" aria-hidden />
                    </span>
                    Element — Upload file
                  </h3>
                  <p className="mb-3 text-sm text-white/45">Upload a new image from your device (same as the slot&apos;s + control).</p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!onRequestFileUpload}
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => {
                      onRequestFileUpload?.();
                      onOpenChange(false);
                    }}
                  >
                    Choose file…
                  </Button>
                </section>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" className="w-full border-white/15 bg-transparent text-white/80 hover:bg-white/[0.06] sm:w-auto">
                Close
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
