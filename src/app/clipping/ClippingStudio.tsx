"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CircleDot,
  Download,
  Loader2,
  RefreshCw,
  Square,
  UploadCloud,
  Video,
  Wand2,
} from "lucide-react";

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

  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateObjectUrl, setTemplateObjectUrl] = useState<string | null>(null);
  const [templateDurationSec, setTemplateDurationSec] = useState<number | null>(null);

  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportedExt, setExportedExt] = useState<string>("webm");
  const [awaitingFinalDecision, setAwaitingFinalDecision] = useState(false);

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
  /**
   * Latest stage exposed to the render loop. We keep it in a ref because the
   * draw loop is started once and reads the current phase on every frame.
   */
  const stageRef = useRef<Stage>("permission");
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
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
        err instanceof Error ? err.message : "Could not access camera or microphone.";
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
          audio: { echoCancellation: true, noiseSuppression: true },
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
            const padX = Math.round(CANVAS_WIDTH * 0.12);
            const cardW = CANVAS_WIDTH - padX * 2;
            const cardH = Math.round(bottomH * 0.82);
            const cardX = padX;
            const cardY = bottomY + Math.round((bottomH - cardH) / 2);

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
            if (mirrorWebcam) {
              ctx.save();
              ctx.translate(CANVAS_WIDTH, 0);
              ctx.scale(-1, 1);
              drawCover(ctx, webcam, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT / 2);
              ctx.restore();
            } else {
              drawCover(ctx, webcam, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT / 2);
            }
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
        if (mirrorWebcam) {
          ctx.save();
          ctx.translate(CANVAS_WIDTH, 0);
          ctx.scale(-1, 1);
          drawCover(ctx, webcam, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.restore();
        } else {
          drawCover(ctx, webcam, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
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

      const micTracks = userStream.getAudioTracks();
      if (micTracks.length > 0) {
        const micOnly = new MediaStream(micTracks);
        const micSource = audioCtx.createMediaStreamSource(micOnly);
        micSource.connect(dest);
      }

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
                  <p className="text-sm font-semibold">Allow camera + microphone</p>
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
                      : "Webcam stays on top, the template plays below. Recording continues until the template ends."}
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
                  <Video className="size-4" aria-hidden /> Allow camera & mic
                </button>
              ) : (
                <p className="text-[11px] text-white/45">
                  Session in progress. Use Stop & export to bail early, or finish the
                  template for an automatic export.
                </p>
              )}
            </div>

            <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11px] text-white/45">
              <li>Allow camera + microphone access</li>
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
