"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CircleDot,
  Download,
  Loader2,
  Maximize2,
  RefreshCw,
  Square,
  UploadCloud,
  Video,
  Wand2,
  X,
} from "lucide-react";

import { ClippingPageShell } from "@/app/clipping/_components/ClippingShell";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import { clippingBtnOutlineSm, clippingBtnPrimarySm } from "@/lib/clippingUi";
import { cn } from "@/lib/utils";

import { studioBrowserApiUrl } from "@/lib/studioAppOrigin";
import {
  clippingHookInter,
  clippingHookMontserrat,
  clippingHookPoppins,
  ensureClippingHookTitleFont,
  hookTitleCanvasFont,
  preloadAllClippingHookTitleFonts,
} from "./clippingHookTitleFonts";

/**
 * Output canvas resolution. 9:16 is the only supported aspect ratio because
 * clippers ship to short-form platforms (TikTok / Reels / Shorts).
 */
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
/** Frame rate captured from the canvas. 30fps balances size and smoothness. */
const RECORDING_FPS = 30;
/** Default hook recording duration (seconds). */
const DEFAULT_HOOK_DURATION = 10;
/** Countdown shown before each phase. */
const COUNTDOWN_SECONDS = 3;

/**
 * Top position of the hook title as a fraction of canvas height.
 * 0.18 keeps the title in the upper third — over the webcam, above the face.
 */
const HOOK_TITLE_TOP_RATIO = 0.18;
/** Maximum title width as a fraction of canvas width. */
const HOOK_TITLE_MAX_WIDTH_RATIO = 0.88;
/** Base font size (px) at the canvas's native 1080px width (fixed; long text wraps). */
const HOOK_TITLE_BASE_FONT_PX = 78;
const DEFAULT_HOOK_TITLE_FONT = "Montserrat";
const DEFAULT_HOOK_TITLE_COLOR = "#ffffff";

const HOOK_TITLE_FONT_OPTIONS = [
  { value: "Montserrat", label: "Montserrat" },
  { value: "Inter", label: "Inter" },
  { value: "Poppins", label: "Poppins" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica Neue", label: "Helvetica Neue" },
] as const;

/**
 * Suggested hook titles. Newlines split lines; users can edit freely after picking.
 */
const HOOK_TITLE_EXAMPLES: readonly string[] = [
  "Making $600 without talking",
  "Making a doctor salary in 67 min\n(watch me cook)",
  "Making $1k without speaking challenge",
  "Making $10k/mo without speaking challenge\n(watch me cook)",
  "Making $1k in a minute without speaking challenge",
];

type Stage =
  | "permission"
  | "setup"
  | "ready_for_hook"
  | "countdown_hook"
  | "recording_hook"
  | "ready_for_video"
  | "countdown_video"
  | "recording_video"
  | "processing"
  | "done"
  | "error";

interface CamDevice {
  deviceId: string;
  label: string;
}

type ClippingTemplateFullscreenPreview = {
  url: string;
  label: string;
};

function ClippingTemplateFullscreenPlayer({
  preview,
  onClose,
}: {
  preview: ClippingTemplateFullscreenPreview | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, onClose]);

  if (!preview || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/92 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Template fullscreen preview"
      onClick={onClose}
    >
      <div className="absolute left-4 right-16 top-4 z-10">
        <p className="truncate text-sm font-semibold text-white">{preview.label}</p>
        <p className="mt-0.5 text-[11px] text-white/50">Preview with sound before you record</p>
      </div>
      <button
        type="button"
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg transition hover:bg-black/85"
        title="Close preview"
        aria-label="Close preview"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <video
        key={preview.url}
        src={preview.url}
        className="max-h-[82vh] w-full max-w-[min(96vw,520px)] object-contain"
        controls
        autoPlay
        playsInline
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

type ClippingTemplateLibraryItem = {
  filename: string;
  label: string;
  url: string;
};

type ClippingTemplateId = "classic" | "split_focus_bottom_webcam";

const TEMPLATE_TOP_RATIO = 0.75;
const WEBCAM_CARD_ASPECT = 3 / 4; // portrait target

function parseClippingTemplateId(raw: string | null): ClippingTemplateId {
  return raw === "split_focus_bottom_webcam" ? "split_focus_bottom_webcam" : "classic";
}

/**
 * Best-effort detection of the most compatible MediaRecorder MIME type.
 * mp4 first for Safari + iOS, webm/vp9 fallback elsewhere.
 */
function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* keep trying */
    }
  }
  return undefined;
}

function fileExtensionFromMime(mime: string | undefined): string {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

/**
 * Fits the full video frame inside the destination rect without cropping
 * (CSS `object-fit: contain`). Letterboxes / pillarboxes with whatever is already
 * drawn beneath — callers should clear/fill the rect first when needed.
 */
function drawContain(
  ctx: CanvasRenderingContext2D,
  src: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const sw = src.videoWidth;
  const sh = src.videoHeight;
  if (!sw || !sh) return;
  const targetRatio = dw / dh;
  const sourceRatio = sw / sh;
  let drawW = dw;
  let drawH = dh;
  let drawX = dx;
  let drawY = dy;
  if (sourceRatio > targetRatio) {
    drawW = dw;
    drawH = dw / sourceRatio;
    drawX = dx;
    drawY = dy + (dh - drawH) / 2;
  } else {
    drawH = dh;
    drawW = dh * sourceRatio;
    drawX = dx + (dw - drawW) / 2;
    drawY = dy;
  }
  ctx.drawImage(src, 0, 0, sw, sh, drawX, drawY, drawW, drawH);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCoverRounded(
  ctx: CanvasRenderingContext2D,
  src: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  radius: number,
  mirror: boolean,
): void {
  const sw = src.videoWidth;
  const sh = src.videoHeight;
  if (!sw || !sh) return;
  const targetRatio = dw / dh;
  const sourceRatio = sw / sh;
  let cropW = sw;
  let cropH = sh;
  let cropX = 0;
  let cropY = 0;
  if (sourceRatio > targetRatio) {
    cropW = sh * targetRatio;
    cropX = (sw - cropW) / 2;
  } else {
    cropH = sw / targetRatio;
    cropY = (sh - cropH) / 2;
  }
  ctx.save();
  roundedRectPath(ctx, dx, dy, dw, dh, radius);
  ctx.clip();
  if (mirror) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, dw, dh);
  } else {
    ctx.drawImage(src, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
  }
  ctx.restore();
}

/** Wraps a single line to fit `maxWidth` without changing font size. */
function wrapLineToWidth(
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [""];
  if (ctx.measureText(trimmed).width <= maxWidth) return [trimmed];

  const words = trimmed.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  const pushWordByChar = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (chunk && ctx.measureText(next).width > maxWidth) {
        wrapped.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) wrapped.push(current);
    if (ctx.measureText(word).width > maxWidth) {
      pushWordByChar(word);
    } else {
      current = word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [trimmed];
}

function wrapHookTitleLines(
  ctx: CanvasRenderingContext2D,
  rawLines: string[],
  maxWidth: number,
): string[] {
  const wrapped: string[] = [];
  for (const line of rawLines) {
    wrapped.push(...wrapLineToWidth(ctx, line, maxWidth));
  }
  return wrapped;
}

/**
 * Draws a multi-line hook title centered horizontally near the top of the canvas.
 * Font size stays fixed; long lines wrap. Fill color is configurable; black stroke
 * + drop shadow keep text legible on any webcam feed.
 */
function drawHookTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  fontFamily: string,
  fillColor: string,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const rawLines = text.split(/\r?\n/).map((l) => l.trimEnd());
  while (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  while (rawLines.length > 0 && rawLines[0] === "") rawLines.shift();
  if (rawLines.length === 0) return;

  const fontSize = HOOK_TITLE_BASE_FONT_PX;
  const maxWidth = canvasWidth * HOOK_TITLE_MAX_WIDTH_RATIO;
  ctx.save();
  ctx.font = hookTitleCanvasFont(fontSize, fontFamily);
  const lines = wrapHookTitleLines(ctx, rawLines, maxWidth);

  const lineHeight = Math.round(fontSize * 1.18);
  const topY = Math.round(canvasHeight * HOOK_TITLE_TOP_RATIO);
  const centerX = Math.round(canvasWidth / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
  ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.13));
  ctx.fillStyle = fillColor;

  for (let i = 0; i < lines.length; i++) {
    const y = topY + i * lineHeight;
    ctx.strokeText(lines[i], centerX, y);
    ctx.fillText(lines[i], centerX, y);
  }
  ctx.restore();
}

function fitFullWidthRect(
  boundsX: number,
  boundsY: number,
  boundsW: number,
  boundsH: number,
  aspect: number,
  fill = 0.94,
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(1, boundsW);
  const targetH = Math.round(w / aspect);
  const maxH = Math.max(1, Math.round(boundsH * fill));
  const h = Math.min(targetH, maxH);
  const x = boundsX;
  const y = boundsY + Math.round((boundsH - h) / 2);
  return { x, y, w: Math.round(w), h };
}

export default function ClippingStudio() {
  const searchParams = useSearchParams();
  const clipId = searchParams.get("id") ?? null;
  const templateId = parseClippingTemplateId(searchParams.get("template"));

  const [stage, setStage] = useState<Stage>("permission");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [hookDuration, setHookDuration] = useState<number>(DEFAULT_HOOK_DURATION);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Tracks how many seconds are left in the current recording phase. */
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState<number | null>(null);

  const [cameras, setCameras] = useState<CamDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [mirrorWebcam, setMirrorWebcam] = useState(true);
  const [hookTitle, setHookTitle] = useState<string>("");
  const [hookTitleFont, setHookTitleFont] = useState<string>(DEFAULT_HOOK_TITLE_FONT);
  const [hookTitleColor, setHookTitleColor] = useState<string>(DEFAULT_HOOK_TITLE_COLOR);

  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateObjectUrl, setTemplateObjectUrl] = useState<string | null>(null);
  const [templateDurationSec, setTemplateDurationSec] = useState<number | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<ClippingTemplateLibraryItem[]>([]);
  const [templateLibraryLoading, setTemplateLibraryLoading] = useState(false);
  const [selectedLibraryTemplateUrl, setSelectedLibraryTemplateUrl] = useState<string | null>(null);
  const [templateFullscreenPreview, setTemplateFullscreenPreview] =
    useState<ClippingTemplateFullscreenPreview | null>(null);

  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportedExt, setExportedExt] = useState<string>("webm");
  const [awaitingFinalDecision, setAwaitingFinalDecision] = useState(false);

  /** Refs that should not trigger re-renders. */
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const templateVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);
  /** Keeps canvas composite rate aligned with captureStream fps (less CPU, preview stays in sync). */
  const lastCompositeTimeRef = useRef<number>(0);

  const userMediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedAudioStreamRef = useRef<MediaStream | null>(null);
  const templateAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef<string | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Latest stage exposed to the render loop. We keep it in a ref because the
   * draw loop is started once and reads the current phase on every frame.
   */
  const stageRef = useRef<Stage>("permission");
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /**
   * Latest hook title exposed to the render loop. Kept in a ref so typing in
   * the textarea updates the canvas live without re-creating the draw loop.
   */
  const hookTitleRef = useRef<string>("");
  const hookTitleFontRef = useRef<string>(DEFAULT_HOOK_TITLE_FONT);
  const hookTitleColorRef = useRef<string>(DEFAULT_HOOK_TITLE_COLOR);
  useEffect(() => {
    hookTitleRef.current = hookTitle;
  }, [hookTitle]);
  useEffect(() => {
    hookTitleFontRef.current = hookTitleFont;
  }, [hookTitleFont]);
  useEffect(() => {
    hookTitleColorRef.current = hookTitleColor;
  }, [hookTitleColor]);
  useEffect(() => {
    void preloadAllClippingHookTitleFonts(HOOK_TITLE_BASE_FONT_PX);
  }, []);
  useEffect(() => {
    void ensureClippingHookTitleFont(hookTitleFont, HOOK_TITLE_BASE_FONT_PX);
  }, [hookTitleFont]);

  /* ------------------------------ Cleanup ------------------------------ */
  const stopRenderLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const stopAllStreams = useCallback(() => {
    if (userMediaStreamRef.current) {
      for (const track of userMediaStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      userMediaStreamRef.current = null;
    }
    if (mixedAudioStreamRef.current) {
      for (const track of mixedAudioStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      mixedAudioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
    templateAudioSourceRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const revokeTemplateObjectUrlIfNeeded = useCallback((url: string | null | undefined) => {
    const u = (url ?? "").trim();
    if (!u.startsWith("blob:")) return;
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }, []);

  const probeTemplateDuration = useCallback((url: string) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.src = url;
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setTemplateDurationSec(probe.duration);
      }
    };
    probe.onerror = () => {
      setTemplateDurationSec(null);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopRenderLoop();
      clearTimers();
      stopAllStreams();
      revokeTemplateObjectUrlIfNeeded(templateObjectUrl);
      if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    };
    // We deliberately run cleanup once on unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- Permission flow --------------------------- */
  const requestPermissions = useCallback(async (): Promise<MediaStream | null> => {
    setErrorMessage(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Your browser does not support camera capture.");
      setStage("error");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          facingMode: selectedCameraId ? undefined : "user",
        },
        // Capture video only: exported audio must come from template only.
        audio: false,
      });
      userMediaStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        webcamVideoRef.current.muted = true;
        try {
          await webcamVideoRef.current.play();
        } catch {
          /* autoplay can fail until user gesture */
        }
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`,
          }));
        setCameras(cams);
        if (!selectedCameraId && cams[0]) setSelectedCameraId(cams[0].deviceId);
      } catch {
        /* ignore device enumeration failures */
      }
      return stream;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not access camera.";
      setErrorMessage(msg);
      setStage("error");
      return null;
    }
  }, [selectedCameraId]);

  const handleAllowAccess = useCallback(async () => {
    const stream = await requestPermissions();
    if (stream) setStage("setup");
  }, [requestPermissions]);

  /** Re-acquire the stream when the user picks a different camera. */
  const switchCamera = useCallback(
    async (deviceId: string) => {
      setSelectedCameraId(deviceId);
      if (userMediaStreamRef.current) {
        for (const t of userMediaStreamRef.current.getTracks()) t.stop();
        userMediaStreamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          // Keep camera switch aligned with the no-microphone recording policy.
          audio: false,
        });
        userMediaStreamRef.current = stream;
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          await webcamVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not switch camera.";
        setErrorMessage(msg);
      }
    },
    [],
  );

  /* --------------------------- Template upload --------------------------- */
  const onTemplateFile = useCallback(
    (file: File | null) => {
      revokeTemplateObjectUrlIfNeeded(templateObjectUrl);
      if (!file) {
        setTemplateFile(null);
        setTemplateObjectUrl(null);
        setSelectedLibraryTemplateUrl(null);
        setTemplateDurationSec(null);
        return;
      }
      const url = URL.createObjectURL(file);
      setTemplateFile(file);
      setTemplateObjectUrl(url);
      setSelectedLibraryTemplateUrl(null);
      probeTemplateDuration(url);
    },
    [probeTemplateDuration, revokeTemplateObjectUrlIfNeeded, templateObjectUrl],
  );

  const applyLibraryTemplate = useCallback(
    (template: ClippingTemplateLibraryItem) => {
      revokeTemplateObjectUrlIfNeeded(templateObjectUrl);
      setTemplateFile(null);
      setTemplateObjectUrl(template.url);
      setSelectedLibraryTemplateUrl(template.url);
      probeTemplateDuration(template.url);
    },
    [probeTemplateDuration, revokeTemplateObjectUrlIfNeeded, templateObjectUrl],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTemplateLibraryLoading(true);
      try {
        const res = await fetch(studioBrowserApiUrl("/api/clipping/templates"), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as { templates?: unknown } | null;
        if (cancelled) return;
        const rows = Array.isArray(json?.templates) ? json.templates : [];
        const parsed = rows
          .filter((row) => row && typeof row === "object")
          .map((row) => {
            const t = row as { filename?: unknown; label?: unknown; url?: unknown };
            const filename = typeof t.filename === "string" ? t.filename.trim() : "";
            const label = typeof t.label === "string" ? t.label.trim() : "";
            const url = typeof t.url === "string" ? t.url.trim() : "";
            if (!filename || !url) return null;
            return { filename, label: label || filename, url } satisfies ClippingTemplateLibraryItem;
          })
          .filter((item): item is ClippingTemplateLibraryItem => item !== null);
        setTemplateLibrary(parsed);
      } catch {
        if (!cancelled) setTemplateLibrary([]);
      } finally {
        if (!cancelled) setTemplateLibraryLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ----------------------------- Render loop ----------------------------- */
  const startRenderLoop = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false, desynchronized: true });
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = true;

    const tick = (rafTime: number) => {
      const minIntervalMs = 1000 / RECORDING_FPS;
      if (rafTime - lastCompositeTimeRef.current < minIntervalMs * 0.9) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastCompositeTimeRef.current = rafTime;

      const webcam = webcamVideoRef.current;
      const template = templateVideoRef.current;
      const phase = stageRef.current;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const isSplitPhase =
        phase === "ready_for_video" ||
        phase === "countdown_video" ||
        phase === "recording_video";

      if (isSplitPhase) {
        if (templateId === "split_focus_bottom_webcam") {
          const topH = Math.round(CANVAS_HEIGHT * TEMPLATE_TOP_RATIO);
          const bottomY = topH;
          const bottomH = CANVAS_HEIGHT - topH;

          if (template && template.readyState >= 2) {
            drawContain(ctx, template, 0, 0, CANVAS_WIDTH, topH);
          } else {
            ctx.fillStyle = "#0b0912";
            ctx.fillRect(0, 0, CANVAS_WIDTH, topH);
          }

          // Green-screen style webcam panel in the bottom 1/4.
          ctx.fillStyle = "#0f2b1d";
          ctx.fillRect(0, bottomY, CANVAS_WIDTH, bottomH);
          ctx.fillStyle = "rgba(88, 214, 141, 0.16)";
          ctx.fillRect(0, bottomY, CANVAS_WIDTH, bottomH);

          if (webcam && webcam.readyState >= 2) {
            const webcamCard = fitFullWidthRect(
              0,
              bottomY,
              CANVAS_WIDTH,
              bottomH,
              WEBCAM_CARD_ASPECT,
              1,
            );
            const cardW = webcamCard.w;
            const cardH = webcamCard.h;
            const cardX = webcamCard.x;
            const cardY = webcamCard.y;

            // Soft glow + rounded webcam card for smoother look.
            ctx.save();
            roundedRectPath(ctx, cardX - 8, cardY - 8, cardW + 16, cardH + 16, 34);
            ctx.fillStyle = "rgba(26, 188, 156, 0.22)";
            ctx.fill();
            ctx.restore();

            drawCoverRounded(ctx, webcam, cardX, cardY, cardW, cardH, 28, mirrorWebcam);
            ctx.save();
            roundedRectPath(ctx, cardX, cardY, cardW, cardH, 28);
            ctx.strokeStyle = "rgba(255,255,255,0.42)";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
          }
        } else {
          if (webcam && webcam.readyState >= 2) {
            const webcamCard = fitFullWidthRect(
              0,
              0,
              CANVAS_WIDTH,
              CANVAS_HEIGHT / 2,
              WEBCAM_CARD_ASPECT,
              1,
            );
            drawCoverRounded(
              ctx,
              webcam,
              webcamCard.x,
              webcamCard.y,
              webcamCard.w,
              webcamCard.h,
              28,
              mirrorWebcam,
            );
            ctx.save();
            roundedRectPath(ctx, webcamCard.x, webcamCard.y, webcamCard.w, webcamCard.h, 28);
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
          }

          if (template && template.readyState >= 2) {
            drawContain(
              ctx,
              template,
              0,
              CANVAS_HEIGHT / 2,
              CANVAS_WIDTH,
              CANVAS_HEIGHT / 2,
            );
          } else {
            ctx.fillStyle = "#0b0912";
            ctx.fillRect(0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT / 2);
          }
        }
      } else if (webcam && webcam.readyState >= 2) {
        const webcamCard = fitFullWidthRect(
          0,
          0,
          CANVAS_WIDTH,
          CANVAS_HEIGHT,
          WEBCAM_CARD_ASPECT,
          0.94,
        );
        // During hook phase, keep webcam in a 3:4 portrait card instead of full-screen
        // to preserve apparent sharpness on lower-quality webcam feeds.
        drawCoverRounded(
          ctx,
          webcam,
          webcamCard.x,
          webcamCard.y,
          webcamCard.w,
          webcamCard.h,
          30,
          mirrorWebcam,
        );
        ctx.save();
        roundedRectPath(ctx, webcamCard.x, webcamCard.y, webcamCard.w, webcamCard.h, 30);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        drawHookTitle(
          ctx,
          hookTitleRef.current,
          CANVAS_WIDTH,
          CANVAS_HEIGHT,
          hookTitleFontRef.current,
          hookTitleColorRef.current,
        );
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    lastCompositeTimeRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [mirrorWebcam, templateId]);

  useEffect(() => {
    // Show live camera preview as soon as setup is reached.
    if (stage === "setup") startRenderLoop();
  }, [stage, startRenderLoop]);

  /* ----------------------------- Recording ----------------------------- */
  const ensureAudioGraph = useCallback((): MediaStream | null => {
    if (mixedAudioStreamRef.current) return mixedAudioStreamRef.current;
    const userStream = userMediaStreamRef.current;
    if (!userStream) return null;
    try {
      const AudioCtor =
        typeof window !== "undefined"
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext
          : undefined;
      if (!AudioCtor) return null;
      const audioCtx = new AudioCtor();
      audioContextRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();

      const tpl = templateVideoRef.current;
      if (tpl) {
        try {
          const tplSource = audioCtx.createMediaElementSource(tpl);
          tplSource.connect(dest);
          tplSource.connect(audioCtx.destination);
          templateAudioSourceRef.current = tplSource;
        } catch {
          /* element may already be wired or have no audio – fine */
        }
      }

      mixedAudioStreamRef.current = dest.stream;
      return dest.stream;
    } catch {
      return null;
    }
  }, []);

  const startMediaRecorder = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const videoStream = canvas.captureStream(RECORDING_FPS);
    const audioStream = ensureAudioGraph();
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...(audioStream ? audioStream.getAudioTracks() : []),
    ]);

    const mime = pickRecorderMimeType();
    recorderMimeRef.current = mime;
    recorderChunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        combined,
        mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined,
      );
    } catch {
      try {
        recorder = new MediaRecorder(combined);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Recording is not supported.";
        setErrorMessage(msg);
        setStage("error");
        return false;
      }
    }
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recorderChunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const finalMime = recorderMimeRef.current ?? "video/webm";
      const blob = new Blob(recorderChunksRef.current, { type: finalMime });
      const url = URL.createObjectURL(blob);
      setExportedBlob(blob);
      setExportedUrl(url);
      setExportedExt(fileExtensionFromMime(finalMime));
      setAwaitingFinalDecision(true);
      setStage("done");
    };
    recorder.start(250);
    recorderRef.current = recorder;

    return true;
  }, [ensureAudioGraph]);

  /* --------------------------- Phase orchestration --------------------------- */
  const beginCountdownThen = useCallback(
    (next: () => void) => {
      clearTimers();
      setCountdown(COUNTDOWN_SECONDS);
      let remaining = COUNTDOWN_SECONDS;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCountdown(null);
          next();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    },
    [clearTimers],
  );

  const startSession = useCallback(() => {
    setStage("ready_for_hook");
    startRenderLoop();
  }, [startRenderLoop]);

  const startHookCountdown = useCallback(() => {
    setStage("countdown_hook");
    beginCountdownThen(() => {
      void (async () => {
        await ensureClippingHookTitleFont(
          hookTitleFontRef.current,
          HOOK_TITLE_BASE_FONT_PX,
        );
      const ok = startMediaRecorder();
      if (!ok) return;

      setStage("recording_hook");
      let left = hookDuration;
      setPhaseSecondsLeft(left);
      phaseTimerRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          if (phaseTimerRef.current) {
            clearInterval(phaseTimerRef.current);
            phaseTimerRef.current = null;
          }
          setPhaseSecondsLeft(null);
          // Pause recording while we ask the user about the next phase. Single
          // file output is the goal, so we keep the same MediaRecorder alive.
          try {
            recorderRef.current?.pause();
          } catch {
            /* ignore */
          }
          setStage("ready_for_video");
        } else {
          setPhaseSecondsLeft(left);
        }
      }, 1000);
      })();
    });
  }, [beginCountdownThen, hookDuration, startMediaRecorder]);

  const startVideoCountdown = useCallback(() => {
    if (!templateObjectUrl) {
      setErrorMessage("Upload a template video before recording phase 2.");
      return;
    }
    const tpl = templateVideoRef.current;
    if (!tpl) {
      setErrorMessage("Template video missing.");
      return;
    }
    setStage("countdown_video");
    beginCountdownThen(() => {
      try {
        recorderRef.current?.resume();
      } catch {
        /* ignore */
      }
      tpl.currentTime = 0;
      tpl.muted = false;
      tpl.play().catch(() => {});
      setStage("recording_video");
      const totalSec = Math.max(
        1,
        Math.floor(templateDurationSec ?? tpl.duration ?? 1),
      );
      let left = totalSec;
      setPhaseSecondsLeft(left);
      phaseTimerRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          if (phaseTimerRef.current) {
            clearInterval(phaseTimerRef.current);
            phaseTimerRef.current = null;
          }
          setPhaseSecondsLeft(null);
        } else {
          setPhaseSecondsLeft(left);
        }
      }, 1000);
    });
  }, [beginCountdownThen, templateDurationSec, templateObjectUrl]);

  /** Stop the recorder and end the session. Triggered by template `ended`. */
  const finalizeRecording = useCallback(() => {
    setStage("processing");
    clearTimers();
    setPhaseSecondsLeft(null);
    try {
      const tpl = templateVideoRef.current;
      if (tpl) tpl.pause();
    } catch {
      /* ignore */
    }
    try {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* ignore */
    }
  }, [clearTimers]);

  /** Manual stop button (skip the rest of the template). */
  const handleStopRecording = useCallback(() => {
    finalizeRecording();
  }, [finalizeRecording]);

  /**
   * Stop recorder and discard accumulated chunks without producing a final file.
   * Used when user wants to retake the hook before phase 2 starts.
   */
  const discardCurrentRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    recorderChunksRef.current = [];
  }, []);

  const retakeHookPhase = useCallback(() => {
    clearTimers();
    setCountdown(null);
    setPhaseSecondsLeft(null);
    setErrorMessage(null);
    setAwaitingFinalDecision(false);
    discardCurrentRecording();
    if (templateVideoRef.current) {
      try {
        templateVideoRef.current.pause();
        templateVideoRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setStage("ready_for_hook");
  }, [clearTimers, discardCurrentRecording]);

  /* ------------------------------ Reset ------------------------------ */
  const resetForRetake = useCallback(() => {
    clearTimers();
    setPhaseSecondsLeft(null);
    setCountdown(null);
    setAwaitingFinalDecision(false);
    discardCurrentRecording();
    if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    setExportedUrl(null);
    setExportedBlob(null);
    if (templateVideoRef.current) {
      try {
        templateVideoRef.current.pause();
        templateVideoRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setStage("ready_for_hook");
  }, [clearTimers, discardCurrentRecording, exportedUrl]);

  /* ------------------------------- UI ------------------------------- */
  const currentLabel = useMemo(() => {
    switch (stage) {
      case "ready_for_hook":
        return "Ready for the hook?";
      case "countdown_hook":
        return "Get ready…";
      case "recording_hook":
        return phaseSecondsLeft !== null
          ? `Hook · ${phaseSecondsLeft}s`
          : "Recording hook";
      case "ready_for_video":
        return "Ready for the video?";
      case "countdown_video":
        return "Get ready…";
      case "recording_video":
        return phaseSecondsLeft !== null
          ? `Video · ${phaseSecondsLeft}s left`
          : "Recording video";
      case "processing":
        return "Exporting…";
      case "done":
        return "Clip ready";
      default:
        return "";
    }
  }, [stage, phaseSecondsLeft]);

  const isLive =
    stage === "ready_for_hook" ||
    stage === "countdown_hook" ||
    stage === "recording_hook" ||
    stage === "ready_for_video" ||
    stage === "countdown_video" ||
    stage === "recording_video" ||
    stage === "processing";
  const compactControls =
    stage !== "permission" && stage !== "setup" && stage !== "error" && stage !== "done";
  const canEditControls = !isLive || stage === "ready_for_hook";

  return (
    <ClippingPageShell active="tools" mainClassName="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Mount next/font faces in the DOM so canvas + export can use them. */}
      <div aria-hidden className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0">
        <span className={clippingHookMontserrat.className}>Aa</span>
        <span className={clippingHookInter.className}>Aa</span>
        <span className={clippingHookPoppins.className}>Aa</span>
      </div>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              <Wand2 className="size-4 text-violet-400" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Clipping Studio</h1>
              <p className="text-xs text-white/45">
                One take · hook + split-screen template · auto export
                {clipId ? <span className="ml-2 text-white/35">· id {clipId}</span> : null}
                <span className="ml-2 text-white/35">
                  · {templateId === "split_focus_bottom_webcam" ? "Template 2" : "Template 1"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`${CLIPPING_TOOLS_PATH}/template${clipId ? `?id=${encodeURIComponent(clipId)}` : ""}`}
              className={clippingBtnOutlineSm}
            >
              Change template
            </Link>
            <Link
              href={
                clipId
                  ? `${CLIPPING_TOOLS_PATH}?id=${encodeURIComponent(clipId)}`
                  : CLIPPING_TOOLS_PATH
              }
              className={clippingBtnOutlineSm}
            >
              Back to tools
            </Link>
            {stage === "done" && exportedUrl ? (
              <a
                href={exportedUrl}
                download={`clip-${clipId ?? "session"}.${exportedExt}`}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
              >
                <Download className="size-4" aria-hidden /> Download
              </a>
            ) : null}
          </div>
        </header>

        <div
          className={
            compactControls
              ? "relative flex min-h-[72vh] items-center justify-center"
              : "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
          }
        >
          {/* ---------- Stage / live preview ---------- */}
          <section
            className={
              compactControls
                ? "relative flex w-full max-w-[520px] flex-col items-center justify-center gap-4 rounded-3xl border border-white/8 bg-black/40 p-4 sm:p-6"
                : "relative flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/8 bg-black/40 p-4 sm:p-6"
            }
          >
            <div
              className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-black"
              style={{ aspectRatio: "9 / 16" }}
            >
              {/* Hidden decode surfaces — composite happens on the visible canvas below. */}
              <video
                ref={webcamVideoRef}
                playsInline
                muted
                autoPlay
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
              <video
                ref={templateVideoRef}
                playsInline
                preload="auto"
                src={templateObjectUrl ?? undefined}
                onEnded={() => {
                  if (stageRef.current === "recording_video") finalizeRecording();
                }}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
              {/* Single output canvas: full recording resolution, scaled by CSS (GPU) — avoids per-frame CPU downscale copy. */}
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="block h-full w-full object-contain transform-gpu"
              />

              {/* Overlays per stage. */}
              {stage === "permission" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center">
                  <Video className="size-8 text-white/70" aria-hidden />
                  <p className="text-sm font-semibold">Allow camera access</p>
                  <p className="max-w-[18rem] text-xs text-white/55">
                    We capture only what you record. Nothing leaves your device until
                    you click download.
                  </p>
                  <button
                    type="button"
                    onClick={handleAllowAccess}
                    className={cn(clippingBtnPrimarySm, "px-4 py-2")}
                  >
                    Allow access
                  </button>
                </div>
              ) : null}

              {countdown !== null ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                  <span className="select-none text-[120px] font-black leading-none text-white drop-shadow-[0_0_30px_rgba(139,92,246,0.6)]">
                    {countdown}
                  </span>
                </div>
              ) : null}

              {stage === "ready_for_hook" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 p-6 text-center">
                  <p className="text-base font-semibold">Ready for the hook?</p>
                  <p className="text-xs text-white/60">
                    A 3-2-1 countdown starts then we record {hookDuration}s of webcam.
                  </p>
                  <button
                    type="button"
                    onClick={startHookCountdown}
                    className={cn(clippingBtnPrimarySm, "inline-flex gap-2 px-5 py-2.5 text-sm")}
                  >
                    <CircleDot className="size-4" aria-hidden /> I&apos;m ready
                  </button>
                </div>
              ) : null}

              {stage === "ready_for_video" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 p-6 text-center">
                  <p className="text-base font-semibold">Ready for the video?</p>
                  <p className="text-xs text-white/60">
                    {templateId === "split_focus_bottom_webcam"
                      ? "Template plays on top (3/4), webcam records in the bottom panel (1/4). Recording continues until the template ends."
                      : "Webcam stays in a 3:4 portrait frame on top, the template plays below. Recording continues until the template ends."}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={startVideoCountdown}
                      className={cn(clippingBtnPrimarySm, "inline-flex gap-2 px-4 py-2.5 text-sm")}
                    >
                      <CircleDot className="size-4" aria-hidden /> Continue
                    </button>
                    <button
                      type="button"
                      onClick={retakeHookPhase}
                      className={cn(clippingBtnOutlineSm, "inline-flex gap-2 px-4 py-2.5 text-sm")}
                    >
                      <RefreshCw className="size-4" aria-hidden /> Retake hook
                    </button>
                  </div>
                </div>
              ) : null}

              {stage === "processing" ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65">
                  <Loader2 className="size-6 animate-spin text-violet-300" aria-hidden />
                  <p className="text-xs font-medium text-white/75">Finalising clip…</p>
                </div>
              ) : null}

              {stage === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center">
                  <p className="text-sm font-semibold text-red-200">Something went wrong</p>
                  <p className="max-w-[18rem] text-xs text-red-200/70">
                    {errorMessage ?? "Unknown error."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setStage("permission");
                    }}
                    className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white/10"
                  >
                    Try again
                  </button>
                </div>
              ) : null}

              {/* Live recording dot. */}
              {(stage === "recording_hook" || stage === "recording_video") &&
              countdown === null ? (
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/85 px-2 py-1 text-[10px] font-bold uppercase tracking-widest">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" />
                  REC
                </div>
              ) : null}

              {currentLabel && stage !== "permission" && stage !== "error" ? (
                <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                  {currentLabel}
                </div>
              ) : null}
            </div>

            {/* Stop button while recording video — lets the clipper bail before template ends. */}
            {stage === "recording_video" ? (
              <button
                type="button"
                onClick={handleStopRecording}
                className="inline-flex items-center gap-2 rounded-xl border border-red-400/35 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/25"
              >
                <Square className="size-4" aria-hidden /> Stop & export
              </button>
            ) : null}

            {/* Done state: video playback + retake. */}
            {stage === "done" && exportedUrl ? (
              <div className="flex w-full max-w-[420px] flex-col items-center gap-3">
                <video
                  src={exportedUrl}
                  controls
                  className="w-full rounded-2xl border border-white/10 bg-black"
                  style={{ aspectRatio: "9 / 16" }}
                />
                <div className="flex items-center gap-2">
                  <a
                    href={exportedUrl}
                    download={`clip-${clipId ?? "session"}.${exportedExt}`}
                    className={cn(clippingBtnPrimarySm, "inline-flex items-center gap-2 px-4 py-2")}
                  >
                    <Download className="size-4" aria-hidden /> Download clip
                  </a>
                  <button
                    type="button"
                    onClick={resetForRetake}
                    className={cn(clippingBtnOutlineSm, "inline-flex items-center gap-2 px-4 py-2")}
                  >
                    <RefreshCw className="size-4" aria-hidden /> Retake
                  </button>
                </div>
                {awaitingFinalDecision ? (
                  <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    <button
                      type="button"
                      onClick={() => setAwaitingFinalDecision(false)}
                      className={cn(clippingBtnPrimarySm, "inline-flex gap-2 px-3 py-1.5")}
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={resetForRetake}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.1]"
                    >
                      Retake
                    </button>
                  </div>
                ) : null}
                <p className="text-[11px] text-white/45">
                  File: {exportedBlob ? `${(exportedBlob.size / 1024 / 1024).toFixed(1)} MB` : "—"} ·{" "}
                  {exportedExt.toUpperCase()}
                </p>
              </div>
            ) : null}
          </section>

          {/* ---------- Setup / controls ---------- */}
          <aside
            className={
              compactControls
                ? "absolute right-0 top-0 hidden w-[220px] flex-col gap-2 rounded-2xl border border-white/8 bg-black/45 p-3 lg:flex"
                : "flex flex-col gap-4 rounded-3xl border border-white/8 bg-black/30 p-5"
            }
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UploadCloud className="size-4 text-violet-300" aria-hidden /> Template
              video
            </div>
            <div
              className={`group relative flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-center text-xs text-white/55 transition hover:border-violet-400/40 hover:bg-white/[0.04] ${
                compactControls ? "px-2 py-3" : "px-3 py-6"
              }`}
            >
              <input
                ref={templateFileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => onTemplateFile(e.target.files?.[0] ?? null)}
                disabled={!canEditControls}
              />
              {templateFile ? (
                <span className="text-white/85">{templateFile.name}</span>
              ) : selectedLibraryTemplateUrl ? (
                <span className="text-white/85">Using saved template</span>
              ) : (
                <>
                  <span className="text-white/80">Upload your template video</span>
                  <span className="text-white/40">
                    {templateId === "split_focus_bottom_webcam"
                      ? "It plays on the top 3/4 during phase 2"
                      : "It plays on the bottom half during phase 2"}
                  </span>
                </>
              )}
              {templateDurationSec ? (
                <span className="text-[10px] text-white/40">
                  Duration: {templateDurationSec.toFixed(1)}s
                </span>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => templateFileInputRef.current?.click()}
                  disabled={!canEditControls}
                  className="rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Upload template
                </button>
                {templateObjectUrl ? (
                  <button
                    type="button"
                    disabled={!canEditControls}
                    onClick={() =>
                      setTemplateFullscreenPreview({
                        url: templateObjectUrl,
                        label:
                          templateFile?.name?.trim() ||
                          templateLibrary.find((t) => t.url === templateObjectUrl)?.label ||
                          "Selected template",
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-400/35 bg-violet-500/15 px-3 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                    Preview with sound
                  </button>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                Or use an existing template
              </p>
              {templateLibraryLoading ? (
                <p className="mt-2 text-[11px] text-white/50">Loading templates…</p>
              ) : templateLibrary.length === 0 ? (
                <p className="mt-2 text-[11px] text-white/50">
                  No saved templates found in <code>/public/studio/template-clipping</code>.
                </p>
              ) : (
                <div className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
                  {templateLibrary.map((item) => {
                    const selected = selectedLibraryTemplateUrl === item.url;
                    const itemLabel = item.label?.trim() || item.filename;
                    return (
                      <article
                        key={item.filename}
                        className={cn(
                          "overflow-hidden rounded-lg border transition",
                          selected
                            ? "border-violet-400/60 bg-violet-500/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-white/90",
                        )}
                        title={item.filename}
                      >
                        <div className="group relative aspect-square w-full overflow-hidden bg-black/40">
                          <video
                            src={item.url}
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                            onMouseEnter={(e) => {
                              const v = e.currentTarget;
                              void v.play().catch(() => {});
                            }}
                            onMouseLeave={(e) => {
                              const v = e.currentTarget;
                              v.pause();
                              v.currentTime = 0;
                            }}
                          />
                          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                          <button
                            type="button"
                            disabled={!canEditControls}
                            title="Fullscreen preview with sound"
                            aria-label={`Fullscreen preview: ${itemLabel}`}
                            onClick={() =>
                              setTemplateFullscreenPreview({ url: item.url, label: itemLabel })
                            }
                            className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/90 opacity-100 backdrop-blur-sm transition hover:bg-black/70 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyLibraryTemplate(item)}
                          disabled={!canEditControls}
                          className="w-full px-2 py-1.5 text-left text-[11px] font-medium leading-snug break-all whitespace-normal transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {itemLabel}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <label
                htmlFor="hook-title-input"
                className="text-xs font-semibold uppercase tracking-widest text-white/45"
              >
                Hook title
              </label>
              <textarea
                id="hook-title-input"
                value={hookTitle}
                onChange={(e) => setHookTitle(e.target.value)}
                placeholder="Optional title shown over the hook"
                rows={2}
                disabled={!canEditControls}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/85 placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="hook-title-font"
                    className="text-[10px] uppercase tracking-widest text-white/35"
                  >
                    Font
                  </label>
                  <select
                    id="hook-title-font"
                    value={hookTitleFont}
                    onChange={(e) => setHookTitleFont(e.target.value)}
                    disabled={!canEditControls}
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/85 focus:border-violet-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {HOOK_TITLE_FONT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="hook-title-color"
                    className="text-[10px] uppercase tracking-widest text-white/35"
                  >
                    Text color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="hook-title-color"
                      type="color"
                      value={hookTitleColor}
                      onChange={(e) => setHookTitleColor(e.target.value)}
                      disabled={!canEditControls}
                      className="size-9 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-black/40 p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Hook title text color"
                    />
                    <input
                      type="text"
                      value={hookTitleColor}
                      onChange={(e) => setHookTitleColor(e.target.value)}
                      disabled={!canEditControls}
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-2 py-2 font-mono text-[11px] text-white/85 focus:border-violet-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] leading-snug text-white/40">
                Long titles keep the same size and wrap to extra lines. Use Enter for manual line
                breaks.
              </p>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-white/35">
                  Examples
                </span>
                <div className="flex flex-col gap-1">
                  {HOOK_TITLE_EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setHookTitle(example)}
                      disabled={!canEditControls}
                      title={example}
                      className="truncate rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-left text-[10px] font-medium text-white/75 transition hover:border-violet-400/40 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {example.replace(/\n/g, " · ")}
                    </button>
                  ))}
                  {hookTitle ? (
                    <button
                      type="button"
                      onClick={() => setHookTitle("")}
                      disabled={!canEditControls}
                      className="self-start rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] font-medium text-white/45 transition hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Clear title
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <label className="text-xs font-semibold uppercase tracking-widest text-white/45">
                Hook duration
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={hookDuration}
                  onChange={(e) => setHookDuration(Number(e.target.value))}
                  className="flex-1"
                  disabled={!canEditControls}
                />
                <span className="w-10 text-right text-xs text-white/70">
                  {hookDuration}s
                </span>
              </div>
            </div>

            {cameras.length > 0 ? (
              <div className="flex flex-col gap-1.5 text-sm">
                <label className="text-xs font-semibold uppercase tracking-widest text-white/45">
                  Camera
                </label>
                <select
                  value={selectedCameraId ?? ""}
                  onChange={(e) => switchCamera(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/85"
                  disabled={!canEditControls}
                >
                  {cameras.map((c) => (
                    <option key={c.deviceId} value={c.deviceId}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/75">
              <span>Mirror webcam (selfie view)</span>
              <input
                type="checkbox"
                checked={mirrorWebcam}
                onChange={(e) => setMirrorWebcam(e.target.checked)}
                disabled={!canEditControls}
              />
            </label>

            <div className="mt-2 border-t border-white/5 pt-3">
              {stage === "setup" ? (
                <button
                  type="button"
                  onClick={startSession}
                  className={cn(clippingBtnPrimarySm, "inline-flex w-full justify-center gap-2 px-4 py-2.5 text-sm")}
                >
                  <Wand2 className="size-4" aria-hidden /> Start session
                </button>
              ) : stage === "permission" ? (
                <button
                  type="button"
                  onClick={handleAllowAccess}
                  className={cn(clippingBtnPrimarySm, "inline-flex w-full justify-center gap-2 px-4 py-2.5 text-sm")}
                >
                  <Video className="size-4" aria-hidden /> Allow camera
                </button>
              ) : (
                <p className="text-[11px] text-white/45">
                  Session in progress. Use Stop & export to bail early, or finish the
                  template for an automatic export.
                </p>
              )}
            </div>

            <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11px] text-white/45">
              <li>Allow camera access</li>
              <li>
                Upload the template that plays{" "}
                {templateId === "split_focus_bottom_webcam" ? "on the top 3/4" : "on the bottom half"}
              </li>
              <li>Click ready, record the hook for {hookDuration}s</li>
              <li>Click ready again, record over the template</li>
              <li>Download the single auto-merged clip</li>
            </ol>
          </aside>
        </div>
      <ClippingTemplateFullscreenPlayer
        preview={templateFullscreenPreview}
        onClose={() => setTemplateFullscreenPreview(null)}
      />
    </ClippingPageShell>
  );
}
