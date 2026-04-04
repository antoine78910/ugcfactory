"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getPersonalElevenLabsApiKey } from "@/app/_components/CreditsPlanContext";

const MAX_FILES = 25;
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ACCEPTED_TYPES = ".mp3,.wav,.ogg,.flac,.aac,.m4a,.mp4,.mov,.webm";

type ClonedVoice = {
  voiceId: string;
  name: string;
};

type LabelEntry = { key: string; value: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudioVoiceClonePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labelEntries, setLabelEntries] = useState<LabelEntry[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ClonedVoice | null>(null);
  const [copied, setCopied] = useState(false);

  // ---- file management ----

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const fresh = arr.filter((f) => {
        if (f.size > MAX_FILE_BYTES) {
          toast.error(`${f.name} exceeds ${MAX_FILE_MB} MB limit.`);
          return false;
        }
        const key = `${f.name}:${f.size}`;
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      const next = [...prev, ...fresh].slice(0, MAX_FILES);
      if (prev.length + fresh.length > MAX_FILES) {
        toast.warning(`Maximum ${MAX_FILES} files allowed. Extra files were ignored.`);
      }
      return next;
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // ---- label entries ----

  const addLabel = () => setLabelEntries((prev) => [...prev, { key: "", value: "" }]);

  const updateLabel = (i: number, field: "key" | "value", val: string) => {
    setLabelEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));
  };

  const removeLabel = (i: number) => setLabelEntries((prev) => prev.filter((_, idx) => idx !== i));

  // ---- submit ----

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Voice name is required.");
      return;
    }
    if (!files.length) {
      toast.error("Upload at least one audio sample.");
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const form = new FormData();
      form.set("name", trimmedName);
      if (description.trim()) form.set("description", description.trim());

      const validLabels: Record<string, string> = {};
      for (const { key, value } of labelEntries) {
        const k = key.trim();
        const v = value.trim();
        if (k && v) validLabels[k] = v;
      }
      if (Object.keys(validLabels).length) {
        form.set("labels", JSON.stringify(validLabels));
      }

      const personalKey = getPersonalElevenLabsApiKey();
      if (personalKey) form.set("personalApiKey", personalKey);

      for (const file of files) {
        form.append("files", file);
      }

      const res = await fetch("/api/elevenlabs/clone-voice", {
        method: "POST",
        body: form,
        cache: "no-store",
      });

      const json = (await res.json()) as { voiceId?: string; name?: string; error?: string };
      if (!res.ok || !json.voiceId) {
        throw new Error(json.error ?? "Voice cloning failed.");
      }

      setResult({ voiceId: json.voiceId, name: json.name ?? trimmedName });
      toast.success("Voice clone created!", { description: `Voice ID: ${json.voiceId}` });
    } catch (e) {
      toast.error("Clone failed", {
        description: e instanceof Error ? e.message : "Unknown error.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyVoiceId = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.voiceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setResult(null);
    setName("");
    setDescription("");
    setLabelEntries([]);
    setFiles([]);
  };

  // ---- render ----

  if (result) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-green-500/20 bg-green-950/20 p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-green-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{result.name}</p>
            <p className="text-xs text-white/50">Voice clone created successfully</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-white/60">Voice ID</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs font-mono text-violet-300">
              {result.voiceId}
            </code>
            <button
              type="button"
              onClick={copyVoiceId}
              className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-white/40">
          This voice is now available in your ElevenLabs account. Use the Voice ID in the
          Voice Change tool or copy it for use in your workflows.
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="w-full border-white/15 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
        >
          Clone another voice
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-white/70">Voice name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Voice Clone"
          disabled={isSubmitting}
          className="border-white/10 bg-black/20 text-sm text-white placeholder:text-white/30 focus-visible:ring-violet-500/40"
        />
      </div>

      {/* Audio samples */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-white/70">
          Audio samples *
          <span className="ml-1 font-normal text-white/40">
            (up to {MAX_FILES} files · {MAX_FILE_MB} MB each)
          </span>
        </Label>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition",
            files.length
              ? "border-violet-400/20 bg-violet-950/10"
              : "border-white/15 bg-white/[0.02] hover:border-violet-400/30 hover:bg-white/[0.04]",
          )}
        >
          <Upload className="h-5 w-5 text-white/40" />
          <p className="text-xs font-medium text-white/60">
            Drop audio files here or <span className="text-violet-400">browse</span>
          </p>
          <p className="text-[10px] text-white/30">MP3, WAV, OGG, FLAC, AAC, M4A, MP4, MOV, WEBM</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />

        {/* File list */}
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${file.size}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
              >
                <Mic className="h-3.5 w-3.5 shrink-0 text-violet-400/70" />
                <span className="flex-1 truncate text-[11px] text-white/80">{file.name}</span>
                <span className="shrink-0 text-[10px] text-white/35">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={isSubmitting}
                  className="ml-1 shrink-0 rounded p-0.5 text-white/30 transition hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-white/70">
          Description <span className="font-normal text-white/40">(optional)</span>
        </Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="E.g. Deep male voice, warm and calm for narration."
          rows={2}
          disabled={isSubmitting}
          className="resize-none border-white/10 bg-black/20 text-sm text-white placeholder:text-white/30 focus-visible:ring-violet-500/40"
        />
      </div>

      {/* Labels */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-white/70">
            Labels <span className="font-normal text-white/40">(optional)</span>
          </Label>
          <button
            type="button"
            onClick={addLabel}
            disabled={isSubmitting || labelEntries.length >= 8}
            className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/[0.07] disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add label
          </button>
        </div>

        {labelEntries.length > 0 && (
          <div className="space-y-1.5">
            {labelEntries.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={entry.key}
                  onChange={(e) => updateLabel(i, "key", e.target.value)}
                  placeholder="Key (e.g. gender)"
                  disabled={isSubmitting}
                  className="h-8 flex-1 border-white/10 bg-black/20 text-xs text-white placeholder:text-white/30"
                />
                <Input
                  value={entry.value}
                  onChange={(e) => updateLabel(i, "value", e.target.value)}
                  placeholder="Value (e.g. female)"
                  disabled={isSubmitting}
                  className="h-8 flex-1 border-white/10 bg-black/20 text-xs text-white placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => removeLabel(i)}
                  disabled={isSubmitting}
                  className="shrink-0 rounded p-1 text-white/30 transition hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {labelEntries.length === 0 && (
          <p className="text-[10px] text-white/30">
            Labels appear in your ElevenLabs voice library (e.g. gender, accent, use_case).
          </p>
        )}
      </div>

      {/* Tip */}
      <p className="rounded-lg border border-violet-400/10 bg-violet-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-white/50">
        <span className="font-semibold text-violet-300/80">Tip:</span> More samples = better quality.
        Use clear, noise-free recordings of at least 1 minute total. MP3 or WAV work best.
      </p>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !name.trim() || files.length === 0}
        className="w-full bg-violet-600 font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cloning voice…
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" />
            Clone voice
          </>
        )}
      </Button>
    </div>
  );
}
