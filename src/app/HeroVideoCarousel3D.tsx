'use client';

/**
 * 3D ring of hero clips for the marketing LP.
 * Clips play through without mid-play pauses while the carousel is on screen.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { HERO_STUDIO_VIDEOS, heroCarouselPosterUrl } from '@/lib/heroCarouselAssets';
import styles from './HeroVideoCarousel3D.module.css';

const DEFAULT_SRCS = HERO_STUDIO_VIDEOS;

const MAX_UNIQUE_SRCS = 10;
/** Panels within this angle of “front” may play (wide — matches visible arc in the bowl). */
const PLAY_ARC_DEG = 165;

type Props = { srcs?: readonly string[] };

function srcToPosterUrl(src: string): string | undefined {
  return heroCarouselPosterUrl(src);
}

function normaliseDegrees(deg: number): number {
  const mod = ((deg % 360) + 360) % 360;
  return mod > 180 ? mod - 360 : mod;
}

function uniqueCarouselSrcs(srcs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of srcs) {
    const base = (src.split('?')[0] ?? src).trim();
    if (!base || seen.has(base)) continue;
    seen.add(base);
    out.push(src);
    if (out.length >= MAX_UNIQUE_SRCS) break;
  }
  return out;
}

/** Read the live rotateY from the composited ring transform (single source of truth). */
function readRingRotateYDeg(ring: HTMLElement): number {
  const transform = getComputedStyle(ring).transform;
  if (!transform || transform === 'none') return 0;
  const m = new DOMMatrixReadOnly(transform);
  const angleRad = Math.atan2(m.m13, m.m33);
  return (angleRad * 180) / Math.PI;
}

export function HeroVideoCarousel3D({ srcs = DEFAULT_SRCS }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const list = useMemo(
    () => uniqueCarouselSrcs(srcs.length ? srcs : DEFAULT_SRCS),
    [srcs],
  );
  const slice = 360 / list.length;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ring = root.querySelector<HTMLElement>(`.${styles.ring}`);
    if (!ring) return;

    const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video'));
    if (videos.length === 0) return;

    const panelAngles = videos.map((video) => {
      const raw = Number(video.dataset.angle ?? '0');
      return Number.isFinite(raw) ? raw : 0;
    });

    const warmed = videos.map(() => false);

    for (const video of videos) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
    }

    let carouselActive = false;
    let rafId: number | null = null;

    const playSafely = (v: HTMLVideoElement, index: number) => {
      if (!warmed[index]) {
        warmed[index] = true;
        v.preload = 'auto';
      }
      if (v.paused) {
        const promise = v.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      }
    };

    const sync = () => {
      if (!carouselActive || document.visibilityState !== 'visible') return;

      const ringRot = readRingRotateYDeg(ring);

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i]!;
        const eff = normaliseDegrees(panelAngles[i]! + ringRot);
        if (Math.abs(eff) <= PLAY_ARC_DEG) playSafely(v, i);
        // Never pause here — rotation used to pause “back” panels mid-clip while still visible.
      }
    };

    const tick = () => {
      sync();
      rafId = window.requestAnimationFrame(tick);
    };

    const pauseAll = () => {
      for (const v of videos) {
        if (!v.paused) v.pause();
      }
    };

    const start = () => {
      if (carouselActive) return;
      carouselActive = true;
      sync();
      if (rafId === null) rafId = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      carouselActive = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      pauseAll();
    };

    const onStall = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement;
      if (!carouselActive || v.paused) return;
      const i = videos.indexOf(v);
      if (i < 0) return;
      const ringRot = readRingRotateYDeg(ring);
      const eff = normaliseDegrees(panelAngles[i]! + ringRot);
      if (Math.abs(eff) <= PLAY_ARC_DEG) playSafely(v, i);
    };

    for (const v of videos) {
      v.addEventListener('waiting', onStall);
      v.addEventListener('stalled', onStall);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) start();
        else stop();
      },
      { root: null, rootMargin: '120px 0px', threshold: 0 },
    );
    io.observe(root);

    const rect = root.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) start();

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') pauseAll();
      else if (carouselActive) sync();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const retryOnGesture = () => {
      if (carouselActive) sync();
    };
    root.addEventListener('touchstart', retryOnGesture, { passive: true });
    root.addEventListener('pointerdown', retryOnGesture, { passive: true });

    return () => {
      io.disconnect();
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      root.removeEventListener('touchstart', retryOnGesture);
      root.removeEventListener('pointerdown', retryOnGesture);
      for (const v of videos) {
        v.removeEventListener('waiting', onStall);
        v.removeEventListener('stalled', onStall);
      }
    };
  }, [list.length]);

  if (!list.length) return null;

  const panels = list.map((src, i) => ({
    src,
    angle: slice * i,
    poster: srcToPosterUrl(src),
  }));

  return (
    <div ref={rootRef} className={styles.root} aria-hidden>
      <div className={styles.scene}>
        <div className={styles.ring}>
          {panels.map(({ src, angle, poster }) => (
            <div
              key={src}
              className={styles.panel}
              style={{ '--angle': `${angle}deg` } as CSSProperties}
            >
              <video
                className={styles.video}
                src={src}
                poster={poster}
                data-angle={angle}
                muted
                loop
                playsInline
                controls={false}
                preload="none"
                disableRemotePlayback
                disablePictureInPicture
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
