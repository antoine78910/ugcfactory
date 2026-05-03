"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { LinkToAdAssetTypeSwitch } from "@/app/_components/LinkToAdAssetTypeSwitch";

export type LinkToAdProductSetupRecentRow = {
  id: string;
  title: string | null;
  storeUrl: string;
  createdAt: string;
  thumbUrl: string | null;
};

type GeneratePayload = {
  url: string;
  displayName: string;
  assetType: "product" | "app";
  screenshotPreferred: "desktop" | "mobile";
};

export function LinkToAdProductSetupDialog({
  open,
  onOpenChange,
  initialUrl,
  initialDisplayName,
  initialAssetType,
  initialScreenshotPreferred,
  recentRuns,
  previewThumbUrl,
  onPickRecentRun,
  onCreateManually,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl: string;
  initialDisplayName: string;
  initialAssetType: "product" | "app";
  initialScreenshotPreferred: "desktop" | "mobile";
  recentRuns: LinkToAdProductSetupRecentRow[];
  previewThumbUrl: string | null;
  onPickRecentRun: (runId: string) => void;
  onCreateManually: () => void;
  onGenerate: (payload: GeneratePayload) => void | Promise<void>;
}) {
  const [draftUrl, setDraftUrl] = useState(initialUrl);
  const [draftName, setDraftName] = useState(initialDisplayName);
  const [draftAssetType, setDraftAssetType] = useState<"product" | "app">(initialAssetType);
  const [screenshotPreferred, setScreenshotPreferred] = useState<"desktop" | "mobile">(initialScreenshotPreferred);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftUrl(initialUrl);
    setDraftName(initialDisplayName);
    setDraftAssetType(initialAssetType);
    setScreenshotPreferred(initialScreenshotPreferred);
    setBusy(false);
  }, [open, initialUrl, initialDisplayName, initialAssetType, initialScreenshotPreferred]);

  const isApp = draftAssetType === "app";
  const heading = isApp ? "ADD YOUR APP" : "ADD YOUR PRODUCT";
  const sub = isApp
    ? "Add a link or upload screenshots to use your app across generations."
    : "Add a link or upload images to use your product across generations.";

  async function handleGenerate() {
    const url = draftUrl.trim();
    if (!url) {
      toast.error("Missing URL");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error("URL must start with https:// (or http://).");
      return;
    }
    setBusy(true);
    try {
      await onGenerate({
        url,
        displayName: draftName.trim(),
        assetType: draftAssetType,
        screenshotPreferred,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[222] bg-black/65 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[223] max-h-[min(92vh,720px)] w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#0c0b10] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.65)] outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.99] data-[state=open]:zoom-in-[0.99]",
          )}
        >
          <Dialog.Title className="sr-only">{heading}</Dialog.Title>
          <Dialog.Description className="sr-only">{sub}</Dialog.Description>

          <div className="flex justify-center">
            <LinkToAdAssetTypeSwitch value={draftAssetType} onChange={setDraftAssetType} />
          </div>

          <div className="relative mt-5 text-center">
            <button
              type="button"
              className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/20 hover:text-white"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{heading}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/45">{sub}</p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lta-setup-name" className="text-xs text-white/50">
                Display name <span className="text-white/35">(optional)</span>
              </Label>
              <Input
                id="lta-setup-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={isApp ? "My app name" : "My product name"}
                className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/25"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="lta-setup-url" className="text-xs text-white/50">
                  {isApp ? "App URL" : "Product page URL"}
                </Label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <Input
                    id="lta-setup-url"
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    placeholder={isApp ? "https://your-app.com" : "https://your-product-page.com"}
                    className="border-white/10 bg-white/[0.04] pl-10 text-white placeholder:text-white/25"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleGenerate();
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:pb-0.5">
                <span className="text-xs font-medium text-white/35">or</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl border border-white/15 bg-white text-black hover:bg-white/90"
                  onClick={onCreateManually}
                >
                  Create manually
                </Button>
              </div>
            </div>

            {isApp ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  Screenshot for generation
                </p>
                <p className="mt-1 text-xs text-white/40">
                  We capture both desktop and mobile. Choose which frame we use as the main reference image.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "desktop" as const, label: "Desktop" },
                      { id: "mobile" as const, label: "Mobile" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setScreenshotPreferred(opt.id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                        screenshotPreferred === opt.id
                          ? "border-violet-400/50 bg-violet-500/20 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {previewThumbUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxiedMediaSrc(previewThumbUrl)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <p className="text-xs leading-snug text-white/50">
                  Current reference preview from your link. Generate again after changing the URL to rescan.
                </p>
              </div>
            ) : null}

            <Button
              type="button"
              disabled={busy || !draftUrl.trim()}
              className="h-11 w-full rounded-2xl bg-violet-400 font-semibold text-black hover:bg-violet-300"
              onClick={() => void handleGenerate()}
            >
              {busy ? "Starting…" : "Generate"}
            </Button>
          </div>

          {recentRuns.length > 0 ? (
            <div className="mt-8 border-t border-white/[0.07] pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Recent projects</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {recentRuns.slice(0, 9).map((r) => {
                  const label =
                    (r.title && r.title.trim()) ||
                    (() => {
                      try {
                        return new URL(r.storeUrl).hostname.replace(/^www\./, "");
                      } catch {
                        return r.storeUrl.slice(0, 24);
                      }
                    })();
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onPickRecentRun(r.id)}
                      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-violet-400/35 hover:bg-white/[0.05]"
                    >
                      <div className="aspect-square w-full overflow-hidden bg-black/50">
                        {r.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proxiedMediaSrc(r.thumbUrl)}
                            alt=""
                            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-white/25">No image</div>
                        )}
                      </div>
                      <span className="truncate px-2 py-2 text-[11px] font-semibold text-white/85">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
