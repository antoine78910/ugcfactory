"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CircleDot,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  UploadCloud,
  Video,
  Wand2,
} from "lucide-react";

import { calculateMotionControlCreditsFromDuration } from "@/lib/pricing";
import { registerStudioGenerationClient } from "@/lib/registerStudioGenerationClient";
import {
  completeStudioTask,
  pollKlingVideo,
} from "@/lib/studioKlingClientPoll";
import {
  patchMotionPendingJob,
  removeMotionPendingJob,
  upsertMotionPendingJob,
} from "@/lib/motionControlPendingSession";

type MotionQuality = "720p" | "1080p";
type MotionImageSource = "auto" | "upload";
type MotionStatus =
  | "idle"
  | "uploading"
  | "submitting"
  | "polling"
  | "ready"
  | "error";

/** Kling 3.0 motion-control accepts up to ~30s per call. The hook slider is capped at 30s. */
const MOTION_CONTROL_MAX_SECONDS_PER_JOB = 30;
/** Kind label used when registering the studio_generations row. */
const MOTION_CONTROL_GENERATION_KIND = "kling/motion-control";
/** Provider returned by /api/kling/motion-control (for sessionStorage + DB row). */
const MOTION_CONTROL_PROVIDER = "kie-market";

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
/** Base font size (px) at the canvas's native 1080px width. Scales down if too wide. */
const HOOK_TITLE_BASE_FONT_PX = 78;

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

type ClippingTemplateId = "classic" | "split_focus_bottom_webcam";

const TEMPLATE_TOP_RATIO = 0.75;
const TEMPLATE_BOTTOM_RATIO = 0.25;
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
 * Draws `src` covering the destination rectangle, cropping from the centre to
 * preserve the destination aspect ratio. Equivalent to CSS `object-fit: cover`.
 */
function drawCover(
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
  ctx.drawImage(src, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
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

/**
 * Draws a multi-line hook title centered horizontally near the top of the canvas.
 * Auto-scales the font down so the widest line fits within `maxWidth`. White fill
 * with a thick black stroke + drop shadow for legibility against any webcam feed.
 */
function drawHookTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  if (lines.length === 0) return;

  const maxWidth = canvasWidth * HOOK_TITLE_MAX_WIDTH_RATIO;
  let fontSize = HOOK_TITLE_BASE_FONT_PX;
  const fontFamily = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.save();
  ctx.font = `900 ${fontSize}px ${fontFamily}`;
  let widest = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > widest) widest = w;
  }
  if (widest > maxWidth && widest > 0) {
    fontSize = Math.max(28, Math.floor(fontSize * (maxWidth / widest)));
    ctx.font = `900 ${fontSize}px ${fontFamily}`;
  }

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
  ctx.fillStyle = "#ffffff";

  for (let i = 0; i < lines.length; i++) {
    const y = topY + i * lineHeight;
    ctx.strokeText(lines[i], centerX, y);
    ctx.fillText(lines[i], centerX, y);
  }
  ctx.restore();
}

function fitCenteredRect(
  boundsX: number,
  boundsY: number,
  boundsW: number,
  boundsH: number,
  aspect: number,
  fill = 0.92,
): { x: number; y: number; w: number; h: number } {
  const maxW = Math.max(1, boundsW * fill);
  const maxH = Math.max(1, boundsH * fill);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  const x = boundsX + Math.round((boundsW - w) / 2);
  const y = boundsY + Math.round((boundsH - h) / 2);
  return { x, y, w: Math.round(w), h: Math.round(h) };
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

  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateObjectUrl, setTemplateObjectUrl] = useState<string | null>(null);
  const [templateDurationSec, setTemplateDurationSec] = useState<number | null>(null);

  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportedExt, setExportedExt] = useState<string>("webm");
  const [awaitingFinalDecision, setAwaitingFinalDecision] = useState(false);

  /* ----- Motion control (Kling 3.0) on the hook portion only ----- */
  const [hookBlob, setHookBlob] = useState<Blob | null>(null);
  const [hookExt, setHookExt] = useState<string>("webm");
  const [hookFrameBlob, setHookFrameBlob] = useState<Blob | null>(null);
  const [hookFramePreviewUrl, setHookFramePreviewUrl] = useState<string | null>(null);

  const [motionImageSource, setMotionImageSource] = useState<MotionImageSource>("auto");
  const [customCharacterFile, setCustomCharacterFile] = useState<File | null>(null);
  const [customCharacterPreviewUrl, setCustomCharacterPreviewUrl] = useState<string | null>(null);
  const [motionQuality, setMotionQuality] = useState<MotionQuality>("720p");
  const [motionStatus, setMotionStatus] = useState<MotionStatus>("idle");
  const [motionResultUrl, setMotionResultUrl] = useState<string | null>(null);
  const [motionError, setMotionError] = useState<string | null>(null);

  /** Refs that should not trigger re-renders. */
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const templateVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

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

  /** Parallel recorder that captures the hook phase only (used as motion reference). */
  const hookRecorderRef = useRef<MediaRecorder | null>(null);
  const hookChunksRef = useRef<Blob[]>([]);
  const hookMimeRef = useRef<string | undefined>(undefined);
  /** Mid-hook canvas snapshot timer, fires once. */
  const hookSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  useEffect(() => {
    hookTitleRef.current = hookTitle;
  }, [hookTitle]);

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
    if (hookSnapshotTimerRef.current) {
      clearTimeout(hookSnapshotTimerRef.current);
      hookSnapshotTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRenderLoop();
      clearTimers();
      stopAllStreams();
      if (templateObjectUrl) URL.revokeObjectURL(templateObjectUrl);
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
      if (templateObjectUrl) URL.revokeObjectURL(templateObjectUrl);
      if (!file) {
        setTemplateFile(null);
        setTemplateObjectUrl(null);
        setTemplateDurationSec(null);
        return;
      }
      const url = URL.createObjectURL(file);
      setTemplateFile(file);
      setTemplateObjectUrl(url);

      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.src = url;
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0) {
          setTemplateDurationSec(probe.duration);
        }
      };
    },
    [templateObjectUrl],
  );

  /* ----------------------------- Render loop ----------------------------- */
  const startRenderLoop = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const tick = () => {
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
            drawCover(ctx, template, 0, 0, CANVAS_WIDTH, topH);
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
              0.9,
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

          // Separator between top template and webcam panel.
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.fillRect(0, topH - 1, CANVAS_WIDTH, 2);
        } else {
          if (webcam && webcam.readyState >= 2) {
            const webcamCard = fitFullWidthRect(
              0,
              0,
              CANVAS_WIDTH,
              CANVAS_HEIGHT / 2,
              WEBCAM_CARD_ASPECT,
              0.92,
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
            drawCover(
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

          // Subtle separator between webcam and template.
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(0, CANVAS_HEIGHT / 2 - 1, CANVAS_WIDTH, 2);
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

        drawHookTitle(ctx, hookTitleRef.current, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      if (previewCanvas) {
        const pctx = previewCanvas.getContext("2d");
        if (pctx) {
          pctx.drawImage(
            canvas,
            0,
            0,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
            0,
            0,
            previewCanvas.width,
            previewCanvas.height,
          );
        }
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [mirrorWebcam]);

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

    // Start a parallel video-only recorder that captures the hook phase only.
    // Same canvas, fresh captureStream — the WebRTC spec allows multiple consumers.
    // Used later as the motion-reference for Kling 3.0 motion control.
    try {
      const hookStream = canvas.captureStream(RECORDING_FPS);
      hookMimeRef.current = mime;
      hookChunksRef.current = [];
      let hookRecorder: MediaRecorder | null = null;
      try {
        hookRecorder = new MediaRecorder(
          hookStream,
          mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined,
        );
      } catch {
        try {
          hookRecorder = new MediaRecorder(hookStream);
        } catch {
          hookRecorder = null;
        }
      }
      if (hookRecorder) {
        hookRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) hookChunksRef.current.push(ev.data);
        };
        hookRecorder.onstop = () => {
          const finalMime = hookMimeRef.current ?? "video/webm";
          const blob = new Blob(hookChunksRef.current, { type: finalMime });
          if (blob.size > 0) {
            setHookBlob(blob);
            setHookExt(fileExtensionFromMime(finalMime));
          }
        };
        hookRecorder.start(250);
        hookRecorderRef.current = hookRecorder;
      }
    } catch {
      /* hook capture is best-effort; main recording continues */
    }
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
      const ok = startMediaRecorder();
      if (!ok) return;

      // Reset any motion-control state from a prior take (the user is starting fresh).
      setHookBlob(null);
      setHookFrameBlob(null);
      setMotionResultUrl(null);
        setMotionStatus("idle");
      setMotionError(null);

      // Mid-hook snapshot becomes the default character image for motion control.
      if (hookSnapshotTimerRef.current) clearTimeout(hookSnapshotTimerRef.current);
      hookSnapshotTimerRef.current = setTimeout(() => {
        const c = canvasRef.current;
        if (!c) return;
        c.toBlob(
          (b) => {
            if (b) setHookFrameBlob(b);
          },
          "image/png",
        );
      }, Math.max(500, Math.floor((hookDuration * 1000) / 2)));

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
          // Stop the hook-only recorder — its job is done.
          try {
            const hr = hookRecorderRef.current;
            if (hr && hr.state !== "inactive") hr.stop();
          } catch {
            /* ignore */
          }
          // Fallback: capture a frame now if the mid-hook snapshot somehow missed.
          if (!hookFrameBlob) {
            const c = canvasRef.current;
            if (c) {
              c.toBlob(
                (b) => {
                  if (b) setHookFrameBlob(b);
                },
                "image/png",
              );
            }
          }
          setStage("ready_for_video");
        } else {
          setPhaseSecondsLeft(left);
        }
      }, 1000);
    });
  }, [beginCountdownThen, hookDuration, hookFrameBlob, startMediaRecorder]);

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

    const hr = hookRecorderRef.current;
    if (hr && hr.state !== "inactive") {
      try {
        hr.ondataavailable = null;
        hr.onstop = null;
        hr.stop();
      } catch {
        /* ignore */
      }
    }
    hookRecorderRef.current = null;
    hookChunksRef.current = [];
  }, []);

  const retakeHookPhase = useCallback(() => {
    clearTimers();
    setCountdown(null);
    setPhaseSecondsLeft(null);
    setErrorMessage(null);
    setAwaitingFinalDecision(false);
    discardCurrentRecording();
    setHookBlob(null);
    setHookFrameBlob(null);
    setMotionResultUrl(null);
    setMotionStatus("idle");
    setMotionError(null);
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
    setHookBlob(null);
    setHookFrameBlob(null);
    setMotionResultUrl(null);
    setMotionStatus("idle");
    setMotionError(null);
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

  /* --------------------------- Motion control --------------------------- */
  // Object-URL lifecycle for the auto-extracted hook frame preview.
  useEffect(() => {
    if (!hookFrameBlob) {
      setHookFramePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(hookFrameBlob);
    setHookFramePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [hookFrameBlob]);

  // Object-URL lifecycle for the user-uploaded character image preview.
  useEffect(() => {
    if (!customCharacterFile) {
      setCustomCharacterPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(customCharacterFile);
    setCustomCharacterPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [customCharacterFile]);

  /** Credit cost mirrors the server preflight in /api/kling/motion-control. */
  const motionCreditCost = useMemo(
    () => calculateMotionControlCreditsFromDuration(hookDuration, motionQuality),
    [hookDuration, motionQuality],
  );
  /** Always 1 with the current 30s hook cap; future-proofed for longer hooks. */
  const motionJobsNeeded = Math.max(
    1,
    Math.ceil(hookDuration / MOTION_CONTROL_MAX_SECONDS_PER_JOB),
  );

  const motionBusy =
    motionStatus === "uploading" ||
    motionStatus === "submitting" ||
    motionStatus === "polling";
  const motionReady = motionStatus === "ready" && Boolean(motionResultUrl);

  const motionStatusLabel = useMemo(() => {
    switch (motionStatus) {
      case "uploading":
        return "Uploading hook & character…";
      case "submitting":
        return "Sending to Kling 3.0…";
      case "polling":
        return "Generating motion control… (~2 min)";
      case "ready":
        return "Motion control ready";
      case "error":
        return "Motion control failed";
      default:
        return null;
    }
  }, [motionStatus]);

  const onSubmitMotionControl = useCallback(async () => {
    if (motionBusy) return;
    if (!hookBlob) {
      setMotionError("Hook clip not captured. Retake the hook and try again.");
      setMotionStatus("error");
      return;
    }
    if (hookDuration < 3) {
      setMotionError("Hook must be at least 3 seconds for motion control.");
      setMotionStatus("error");
      return;
    }
    const characterSource: Blob | null =
      motionImageSource === "upload" ? customCharacterFile : hookFrameBlob;
    if (!characterSource) {
      setMotionError(
        motionImageSource === "upload"
          ? "Choose a character image first."
          : "Hook frame not captured yet — record the hook again.",
      );
      setMotionStatus("error");
      return;
    }

    setMotionError(null);
    setMotionResultUrl(null);
    setMotionStatus("uploading");

    let taskIdLocal: string | null = null;
    try {
      // 1. Upload hook video (motion reference).
      const videoForm = new FormData();
      const videoFile = new File(
        [hookBlob],
        `clip-hook-${clipId ?? "session"}.${hookExt}`,
        { type: hookBlob.type || `video/${hookExt}` },
      );
      videoForm.append("file", videoFile);
      const videoUploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: videoForm,
      });
      const videoJson = (await videoUploadRes.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!videoUploadRes.ok || !videoJson.url) {
        throw new Error(videoJson.error || "Hook upload failed.");
      }
      const motionVideoUrl = videoJson.url;

      // 2. Upload character image.
      const imgForm = new FormData();
      const imgFile =
        characterSource instanceof File
          ? characterSource
          : new File([characterSource], "character.png", {
              type: characterSource.type || "image/png",
            });
      imgForm.append("file", imgFile);
      const imgUploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: imgForm,
      });
      const imgJson = (await imgUploadRes.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!imgUploadRes.ok || !imgJson.url) {
        throw new Error(imgJson.error || "Character image upload failed.");
      }
      const motionImageUrl = imgJson.url;

      // 3. Dispatch motion-control task.
      setMotionStatus("submitting");
      const dispatchRes = await fetch("/api/kling/motion-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: motionImageUrl,
          videoUrl: motionVideoUrl,
          quality: motionQuality,
          motionFamily: "kling-3.0",
          backgroundSource: "input_video",
          videoDurationSeconds: hookDuration,
        }),
      });
      const dispatchJson = (await dispatchRes.json().catch(() => ({}))) as {
        taskId?: string;
        model?: string;
        provider?: string;
        error?: string;
        code?: string;
      };
      if (!dispatchRes.ok || !dispatchJson.taskId) {
        throw new Error(dispatchJson.error || "Motion control could not start.");
      }
      const taskId = dispatchJson.taskId;
      const model = dispatchJson.model || "kling-3.0/motion-control";
      const provider = dispatchJson.provider || MOTION_CONTROL_PROVIDER;
      taskIdLocal = taskId;

      // Track in sessionStorage so a page reload mid-job can resume.
      const creditsCharged = calculateMotionControlCreditsFromDuration(
        hookDuration,
        motionQuality,
      );
      upsertMotionPendingJob({
        taskId,
        label: "Motion control (Clipping)",
        model,
        kind: MOTION_CONTROL_GENERATION_KIND,
        provider,
        inputUrls: [motionImageUrl, motionVideoUrl],
        creditsCharged,
        startedAt: Date.now(),
      });
      const rowId = await registerStudioGenerationClient({
        kind: MOTION_CONTROL_GENERATION_KIND,
        label: "Motion control (Clipping)",
        taskId,
        provider,
        model,
        creditsCharged,
        inputUrls: [motionImageUrl, motionVideoUrl],
      });
      if (rowId) patchMotionPendingJob(taskId, { rowId });

      // 4. Poll until success.
      setMotionStatus("polling");
      const url = await pollKlingVideo(taskId);
      void completeStudioTask(taskId, url);
      removeMotionPendingJob(taskId);
      setMotionResultUrl(url);
      setMotionStatus("ready");
    } catch (err) {
      if (taskIdLocal) {
        try {
          removeMotionPendingJob(taskIdLocal);
        } catch {
          /* ignore */
        }
      }
      const msg = err instanceof Error ? err.message : "Motion control failed.";
      setMotionError(msg);
      setMotionStatus("error");
    }
  }, [
    motionBusy,
    hookBlob,
    hookDuration,
    hookExt,
    hookFrameBlob,
    customCharacterFile,
    motionImageSource,
    motionQuality,
    clipId,
  ]);

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
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Wand2 className="size-4 text-violet-300" aria-hidden />
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
              href={`/clipping/template${clipId ? `?id=${encodeURIComponent(clipId)}` : ""}`}
              className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
            >
              Change template
            </Link>
            <Link
              href={clipId ? `/clipping?id=${encodeURIComponent(clipId)}` : "/clipping"}
              className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
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
              {/* Always mounted preview canvas. */}
              <canvas
                ref={previewCanvasRef}
                width={540}
                height={960}
                className="block h-full w-full"
              />
              {/* Hidden source elements that feed the offscreen canvas. */}
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
              {/* Offscreen full-resolution canvas. */}
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="hidden"
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
                    className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold hover:bg-violet-500"
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
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold hover:bg-violet-500"
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
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500"
                    >
                      <CircleDot className="size-4" aria-hidden /> Continue
                    </button>
                    <button
                      type="button"
                      onClick={retakeHookPhase}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/[0.12]"
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
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold hover:bg-violet-500"
                  >
                    <Download className="size-4" aria-hidden /> Download clip
                  </a>
                  <button
                    type="button"
                    onClick={resetForRetake}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold hover:bg-white/[0.08]"
                  >
                    <RefreshCw className="size-4" aria-hidden /> Retake
                  </button>
                </div>
                {awaitingFinalDecision ? (
                  <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    <button
                      type="button"
                      onClick={() => setAwaitingFinalDecision(false)}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold hover:bg-violet-500"
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

                {/* Motion control panel (Kling 3.0) */}
                <div className="mt-3 w-full rounded-2xl border border-white/8 bg-black/35 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-violet-300" aria-hidden />
                    <h3 className="text-sm font-semibold">Motion control (Kling 3.0)</h3>
                  </div>
                  <p className="mt-1 text-[11px] text-white/55">
                    Re-animate the hook with Kling 3.0. The hook recording is the motion
                    reference; choose a still character image to drive.
                  </p>

                  {!hookBlob ? (
                    <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-100/80">
                      Hook clip not captured (browser may not support a parallel recorder).
                      Retake the hook to enable motion control.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-col gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
                          Character image
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setMotionImageSource("auto")}
                            disabled={motionBusy}
                            className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              motionImageSource === "auto"
                                ? "border-violet-400/60 bg-violet-500/15 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
                            }`}
                          >
                            Use hook frame
                          </button>
                          <button
                            type="button"
                            onClick={() => setMotionImageSource("upload")}
                            disabled={motionBusy}
                            className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              motionImageSource === "upload"
                                ? "border-violet-400/60 bg-violet-500/15 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
                            }`}
                          >
                            Upload image
                          </button>
                        </div>

                        <div className="mt-1 flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                          <div className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-black">
                            {motionImageSource === "auto" ? (
                              hookFramePreviewUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={hookFramePreviewUrl}
                                  alt="Hook frame preview"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="size-4 text-white/40" aria-hidden />
                              )
                            ) : customCharacterPreviewUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={customCharacterPreviewUrl}
                                alt="Custom character preview"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="size-4 text-white/40" aria-hidden />
                            )}
                          </div>
                          <div className="flex-1 text-[11px] text-white/65">
                            {motionImageSource === "auto" ? (
                              hookFrameBlob ? (
                                <span>
                                  Auto-extracted mid-hook frame ({Math.round(
                                    (hookFrameBlob.size / 1024) * 10,
                                  ) / 10}{" "}
                                  KB)
                                </span>
                              ) : (
                                <span className="text-white/40">
                                  No frame captured yet — retake the hook.
                                </span>
                              )
                            ) : customCharacterFile ? (
                              <span className="truncate">{customCharacterFile.name}</span>
                            ) : (
                              <label className="cursor-pointer text-violet-200 hover:text-violet-100">
                                Click to upload an image
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0] ?? null;
                                    if (f) setCustomCharacterFile(f);
                                  }}
                                  disabled={motionBusy}
                                />
                              </label>
                            )}
                          </div>
                          {motionImageSource === "upload" && customCharacterFile ? (
                            <button
                              type="button"
                              onClick={() => setCustomCharacterFile(null)}
                              disabled={motionBusy}
                              className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/60 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Replace
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
                          Quality
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setMotionQuality("720p")}
                            disabled={motionBusy}
                            className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              motionQuality === "720p"
                                ? "border-violet-400/60 bg-violet-500/15 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
                            }`}
                          >
                            720p · 0.85 cr/s
                          </button>
                          <button
                            type="button"
                            onClick={() => setMotionQuality("1080p")}
                            disabled={motionBusy}
                            className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              motionQuality === "1080p"
                                ? "border-violet-400/60 bg-violet-500/15 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
                            }`}
                          >
                            1080p · 1.3 cr/s
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-white/70">
                        <span>
                          Hook · {hookDuration}s · {motionJobsNeeded} generation
                          {motionJobsNeeded > 1 ? "s" : ""}
                        </span>
                        <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-violet-100">
                          {motionCreditCost} credits
                        </span>
                      </div>

                      {motionReady && motionResultUrl ? (
                        <div className="mt-3 flex flex-col items-center gap-2">
                          <video
                            src={motionResultUrl}
                            controls
                            className="w-full max-w-[320px] rounded-xl border border-white/10 bg-black"
                            style={{ aspectRatio: "9 / 16" }}
                          />
                          <a
                            href={motionResultUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={`clip-motion-${clipId ?? "session"}.mp4`}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
                          >
                            <Download className="size-3.5" aria-hidden /> Download motion clip
                          </a>
                        </div>
                      ) : motionBusy ? (
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/8 bg-black/40 px-3 py-3">
                          <Loader2
                            className="size-4 animate-spin text-violet-300"
                            aria-hidden
                          />
                          <span className="text-[11px] text-white/75">
                            {motionStatusLabel}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={onSubmitMotionControl}
                          disabled={
                            motionBusy ||
                            !hookBlob ||
                            (motionImageSource === "auto" && !hookFrameBlob) ||
                            (motionImageSource === "upload" && !customCharacterFile)
                          }
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Sparkles className="size-4" aria-hidden /> Generate motion control
                          <span className="rounded-md bg-white/15 px-2 py-0.5 text-[12px] tabular-nums">
                            {motionCreditCost}
                          </span>
                        </button>
                      )}

                      {motionStatus === "error" && motionError ? (
                        <p className="mt-2 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-100/85">
                          {motionError}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
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
              ) : (
                <>
                  <span className="text-white/80">Drop or pick a video</span>
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
              <button
                type="button"
                onClick={() => templateFileInputRef.current?.click()}
                disabled={!canEditControls}
                className="mt-2 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Choose video
              </button>
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500"
                >
                  <Wand2 className="size-4" aria-hidden /> Start session
                </button>
              ) : stage === "permission" ? (
                <button
                  type="button"
                  onClick={handleAllowAccess}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500"
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
      </div>
    </div>
  );
}
