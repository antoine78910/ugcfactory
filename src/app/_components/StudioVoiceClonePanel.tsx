"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { studioSelectContentClass, studioSelectItemClass } from "@/app/_components/StudioModelPicker";
import {
  ELEVENLABS_AGE_OPTIONS,
  ELEVENLABS_ACCENT_OPTIONS,
  ELEVENLABS_GENDER_OPTIONS,
  ELEVENLABS_LABEL_SKIP,
  ELEVENLABS_LANGUAGE_OPTIONS,
} from "@/lib/elevenLabsVoiceLabelOptions";
import { cn } from "@/lib/utils";
import { getPersonalElevenLabsApiKey } from "@/app/_components/CreditsPlanContext";

const MAX_FILES = 25;
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
/** ElevenLabs IVC expects enough speech content; we enforce a minimum total duration. */
export const VOICE_CLONE_MIN_AUDIO_SECONDS = 10;
const ACCEPTED_TYPES = ".mp3,.wav,.ogg,.flac,.aac,.m4a,.mp4,.mov,.webm";

function isProbablyVideoFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

/** Reads duration in seconds from an audio or video file in the browser. */
function getMediaDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const isVideo = isProbablyVideoFile(file);
    const el = isVideo ? document.createElement("video") : document.createElement("audio");
    el.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("Could not read media duration."));
    };
    el.src = url;
  });
}

type ClonedVoice = {
  voiceId: string;
  name: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudioVoiceClonePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labelLanguage, setLabelLanguage] = useState<string>(ELEVENLABS_LABEL_SKIP);
  const [labelAccent, setLabelAccent] = useState<string>(ELEVENLABS_LABEL_SKIP);
  const [labelGender, setLabelGender] = useState<string>(ELEVENLABS_LABEL_SKIP);
  const [labelAge, setLabelAge] = useState<string>(ELEVENLABS_LABEL_SKIP);
  const [files, setFiles] = useState<File[]>([]);
  const [totalAudioSeconds, setTotalAudioSeconds] = useState<number | null>(null);
  const [durationLoading, setDurationLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ClonedVoice | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (files.length === 0) {
      setTotalAudioSeconds(0);
      return;
    }
    let cancelled = false;
    setDurationLoading(true);
    void (async () => {
      try {
        let sum = 0;
        for (const f of files) {
          const d = await getMediaDurationSeconds(f);
          sum += d;
        }
        if (!cancelled) setTotalAudioSeconds(sum);
      } catch {
        if (!cancelled) setTotalAudioSeconds(null);
      } finally {
        if (!cancelled) setDurationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

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
    if (durationLoading || totalAudioSeconds === null) {
      toast.error("Wait until audio duration is measured.");
      return;
    }
    if (totalAudioSeconds < VOICE_CLONE_MIN_AUDIO_SECONDS) {
      toast.error(`At least ${VOICE_CLONE_MIN_AUDIO_SECONDS} seconds of audio required.`, {
        description: `Current total: ${totalAudioSeconds.toFixed(1)} s.`,
      });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const form = new FormData();
      form.set("name", trimmedName);
      if (description.trim()) form.set("description", description.trim());

      const validLabels: Record<string, string> = {};
      if (labelLanguage !== ELEVENLABS_LABEL_SKIP) validLabels.language = labelLanguage;
      if (labelAccent !== ELEVENLABS_LABEL_SKIP) validLabels.accent = labelAccent;
      if (labelGender !== ELEVENLABS_LABEL_SKIP) validLabels.gender = labelGender;
      if (labelAge !== ELEVENLABS_LABEL_SKIP) validLabels.age = labelAge;
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
    setLabelLanguage(ELEVENLABS_LABEL_SKIP);
    setLabelAccent(ELEVENLABS_LABEL_SKIP);
    setLabelGender(ELEVENLABS_LABEL_SKIP);
    setLabelAge(ELEVENLABS_LABEL_SKIP);
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
            (min {VOICE_CLONE_MIN_AUDIO_SECONDS}s total · up to {MAX_FILES} files · {MAX_FILE_MB} MB each)
          </span>
        </Label>
        <p className="text-[11px] leading-snug text-amber-200/80">
          {VOICE_CLONE_MIN_AUDIO_SECONDS} seconds of audio required — add enough samples so the total duration
          reaches at least {VOICE_CLONE_MIN_AUDIO_SECONDS}s (multiple files count together).
        </p>

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
        {files.length > 0 ? (
          <p
            className={cn(
              "text-[11px] font-medium",
              durationLoading
                ? "text-white/45"
                : totalAudioSeconds !== null && totalAudioSeconds >= VOICE_CLONE_MIN_AUDIO_SECONDS
                  ? "text-emerald-400/90"
                  : "text-amber-200/85",
            )}
          >
            {durationLoading
              ? "Measuring total audio duration…"
              : totalAudioSeconds === null
                ? "Could not measure duration — try other files."
                : `Total: ${totalAudioSeconds.toFixed(1)} s · minimum ${VOICE_CLONE_MIN_AUDIO_SECONDS}s required`}
          </p>
        ) : null}
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

      {/* Labels — ElevenLabs API keys: language, accent, gender, age */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs font-semibold text-white/70">
            Labels <span className="font-normal text-white/40">(optional)</span>
          </Label>
          <p className="mt-0.5 text-[10px] leading-snug text-white/35">
            Same keys as in the ElevenLabs voice library. Values match the dashboard filters (language, accent,
            gender, age).
          </p>
        </div>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-white/55">Language</Label>
            <Select value={labelLanguage} onValueChange={setLabelLanguage} disabled={isSubmitting}>
              <SelectTrigger className="h-10 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-xs text-white">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent position="popper" className={studioSelectContentClass}>
                <SelectItem value={ELEVENLABS_LABEL_SKIP} className={studioSelectItemClass}>
                  Not set
                </SelectItem>
                {ELEVENLABS_LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className={studioSelectItemClass}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-white/55">Accent</Label>
            <Select value={labelAccent} onValueChange={setLabelAccent} disabled={isSubmitting}>
              <SelectTrigger className="h-10 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-xs text-white">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent position="popper" className={studioSelectContentClass}>
                <SelectItem value={ELEVENLABS_LABEL_SKIP} className={studioSelectItemClass}>
                  Not set
                </SelectItem>
                {ELEVENLABS_ACCENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className={studioSelectItemClass}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-white/55">Gender</Label>
            <Select value={labelGender} onValueChange={setLabelGender} disabled={isSubmitting}>
              <SelectTrigger className="h-10 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-xs text-white">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent position="popper" className={studioSelectContentClass}>
                <SelectItem value={ELEVENLABS_LABEL_SKIP} className={studioSelectItemClass}>
                  Not set
                </SelectItem>
                {ELEVENLABS_GENDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className={studioSelectItemClass}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-white/55">Age</Label>
            <Select value={labelAge} onValueChange={setLabelAge} disabled={isSubmitting}>
              <SelectTrigger className="h-10 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-xs text-white">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent position="popper" className={studioSelectContentClass}>
                <SelectItem value={ELEVENLABS_LABEL_SKIP} className={studioSelectItemClass}>
                  Not set
                </SelectItem>
                {ELEVENLABS_AGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className={studioSelectItemClass}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tip */}
      <p className="rounded-lg border border-violet-400/10 bg-violet-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-white/50">
        <span className="font-semibold text-violet-300/80">Tip:</span> More samples = better quality.
        Use clear, noise-free recordings of at least 1 minute total. MP3 or WAV work best.
      </p>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={
          isSubmitting ||
          !name.trim() ||
          files.length === 0 ||
          durationLoading ||
          totalAudioSeconds === null ||
          totalAudioSeconds < VOICE_CLONE_MIN_AUDIO_SECONDS
        }
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
