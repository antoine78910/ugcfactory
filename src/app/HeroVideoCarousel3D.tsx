'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';
import styles from './HeroVideoCarousel3D.module.css';

const DEFAULT_SRCS = [
  '/studio/0328(1).mp4',
  '/studio/0328(2).mp4',
  '/studio/0328(3).mp4',
  '/studio/0328(4).mp4',
  '/studio/0328(5).mp4',
  '/studio/0328(6).mp4',
  '/studio/0328(7).mp4',
  '/studio/0328(8).mp4',
  '/studio/0328(9).mp4',
  '/studio/0328(10).mp4',
];

/** 10 clips, ~36° apart — about 5 readable in view; no duplicate `<video>` URLs. */
const MAX_UNIQUE_SRCS = 10;

/** At most this many videos decode/play at once (reduces global stalls). */
const MAX_PLAYING = 5;

/** Min overlap (px²) with the hero band to count as a play candidate. */
const MIN_VISIBLE_AREA = 700;

/**
 * Visibility sync interval — higher = fewer getBoundingClientRect calls (less forced layout).
 */
const SYNC_MS = 200;

/** Consecutive “out of top-N” samples before pausing (× SYNC_MS ≈ delay). */
const PAUSE_AFTER_TICKS = 3;

type Props = { srcs?: readonly string[] };

export function HeroVideoCarousel3D({ srcs = DEFAULT_SRCS }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const list = (srcs.length ? srcs : DEFAULT_SRCS).slice(0, MAX_UNIQUE_SRCS);
  const slice = 360 / list.length;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll<HTMLVideoElement>("video"));
    const videoPanels = videos
      .map((video) => {
        const panel = video.parentElement;
        return panel ? { video, panel } : null;
      })
      .filter((entry): entry is { video: HTMLVideoElement; panel: HTMLElement } => Boolean(entry));

    const grace = new Map<HTMLVideoElement, number>();
    let raf = 0;
    let lastSync = 0;
    let running = false;

    const pauseAll = () => {
      for (const { video } of videoPanels) video.pause();
    };

    const runSync = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        pauseAll();
        return;
      }
      if (document.visibilityState !== 'visible') {
        pauseAll();
        return;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padX = vw * 0.04;
      const bandTop = vh * 0.08;
      const bandBottom = vh * 0.97;

      const candidates: { video: HTMLVideoElement; area: number }[] = [];

      for (const { video, panel } of videoPanels) {
        const rect = panel.getBoundingClientRect();
        const iw = Math.min(rect.right, vw - padX) - Math.max(rect.left, padX);
        const ih = Math.min(rect.bottom, bandBottom) - Math.max(rect.top, bandTop);
        const area = Math.max(0, iw) * Math.max(0, ih);
        const cx = (rect.left + rect.right) / 2;
        if (cx < padX || cx > vw - padX) continue;
        if (iw < 52 || ih < 88) continue;
        if (area < MIN_VISIBLE_AREA) continue;

        candidates.push({ video, area });
      }

      candidates.sort((a, b) => b.area - a.area);
      const allow = new Set(
        candidates.slice(0, MAX_PLAYING).map((c) => c.video),
      );

      for (const { video } of videoPanels) {
        if (allow.has(video)) {
          grace.set(video, 0);
          if (video.paused) void video.play().catch(() => {});
        } else {
          const n = (grace.get(video) ?? 0) + 1;
          grace.set(video, n);
          if (n >= PAUSE_AFTER_TICKS && !video.paused) video.pause();
        }
      }
    };

    const loop = (t: number) => {
      if (!running) return;
      if (t - lastSync >= SYNC_MS) {
        lastSync = t;
        runSync();
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastSync = 0;
      // Defer first frame to idle time so video setup doesn't compete with initial paint.
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => { if (running) raf = requestAnimationFrame(loop); }, { timeout: 1000 });
      } else {
        raf = requestAnimationFrame(loop);
      }
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      pauseAll();
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) start();
        else stop();
      },
      { root: null, rootMargin: '120px 0px', threshold: 0 },
    );
    io.observe(root);

    if (typeof window !== 'undefined') {
      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.top < vh && rect.bottom > 0) start();
    }

    const onVis = () => {
      if (document.visibilityState !== 'visible') pauseAll();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      io.disconnect();
      stop();
      document.removeEventListener('visibilitychange', onVis);
      grace.clear();
    };
  }, []);

  const handleEnded = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.visibilityState !== 'visible') return;
    v.currentTime = 0;
    void v.play().catch(() => {});
  };

  const handleLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    v.loop = true;
  };

  /** After our governor pauses near the end, `play()` can resume on a ended state — rewind first. */
  const handlePlay = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const d = v.duration;
    if (d && Number.isFinite(d) && v.currentTime >= d - 0.08) v.currentTime = 0;
  };

  if (!list.length) return null;

  const panels = list.map((src, i) => ({
    src,
    angle: slice * i,
  }));

  return (
    <div ref={rootRef} className={styles.root} aria-hidden>
      <div className={styles.scene}>
        <div className={styles.ring}>
          {panels.map(({ src, angle }, i) => (
            <div
              key={i}
              className={styles.panel}
              style={{ '--angle': `${angle}deg` } as CSSProperties}
            >
              <video
                className={styles.video}
                src={src}
                muted
                loop
                playsInline
                preload="none"
                disableRemotePlayback
                onEnded={handleEnded}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={handlePlay}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
