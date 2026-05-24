'use client';

/**
 * 3D ring of hero clips for the marketing LP.
 * Front-facing panels play continuously (no mid-clip pause at zone boundaries).
 */

import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { HERO_STUDIO_VIDEOS, heroCarouselPosterUrl } from '@/lib/heroCarouselAssets';
import styles from './HeroVideoCarousel3D.module.css';

const DEFAULT_SRCS = HERO_STUDIO_VIDEOS;

const MAX_UNIQUE_SRCS = 10;
const RING_FULL_TURN_MS = 36_000;
const REDUCED_MOTION_RING_ANGLE_DEG = -22;
/** Enter “front” zone (wider). */
const FRONT_ENTER_DEG = 108;
/** Leave only when clearly on the back half (hysteresis avoids pause/play flicker). */
const FRONT_EXIT_DEG = 128;

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

/** Match the running CSS `@keyframes heroSpin` (0deg → -360deg). */
function readRingRotateYDeg(ring: HTMLElement, reducedMotion: boolean): number {
  if (reducedMotion) return REDUCED_MOTION_RING_ANGLE_DEG;
  const anim = ring.getAnimations()[0];
  if (anim) {
    const timing = anim.effect?.getTiming();
    const dur = Number(timing?.duration ?? RING_FULL_TURN_MS);
    if (dur > 0) {
      const t = Number(anim.currentTime ?? 0);
      const progress = ((t % dur) + dur) % dur / dur;
      return -360 * progress;
    }
  }
  const transform = getComputedStyle(ring).transform;
  if (transform && transform !== 'none') {
    const m = new DOMMatrixReadOnly(transform);
    const angleRad = Math.atan2(m.m13, m.m33);
    return (angleRad * 180) / Math.PI;
  }
  return 0;
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

    const frontActive = videos.map(() => false);

    for (const video of videos) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let carouselActive = false;
    let rafId: number | null = null;

    const playSafely = (v: HTMLVideoElement) => {
      if (v.readyState === 0) v.preload = 'auto';
      const promise = v.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    };

    const ensureFrontPlayback = (v: HTMLVideoElement, index: number) => {
      if (!frontActive[index]) {
        frontActive[index] = true;
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      if (v.preload === 'none') v.preload = 'auto';
      if (v.paused) playSafely(v);
    };

    const sync = () => {
      if (!carouselActive || document.visibilityState !== 'visible') return;

      const ringRot = readRingRotateYDeg(ring, prefersReducedMotion);

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i]!;
        const eff = normaliseDegrees(panelAngles[i]! + ringRot);
        const absEff = Math.abs(eff);

        if (!frontActive[i]) {
          if (absEff <= FRONT_ENTER_DEG) ensureFrontPlayback(v, i);
        } else if (absEff >= FRONT_EXIT_DEG) {
          frontActive[i] = false;
          if (!v.paused) v.pause();
        } else {
          ensureFrontPlayback(v, i);
        }
      }
    };

    const tick = () => {
      sync();
      rafId = window.requestAnimationFrame(tick);
    };

    const pauseAll = () => {
      for (let i = 0; i < videos.length; i++) {
        frontActive[i] = false;
        const v = videos[i]!;
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

    const onCanPlay = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement;
      const i = videos.indexOf(v);
      if (i < 0 || !carouselActive) return;
      if (frontActive[i] && v.paused) playSafely(v);
    };

    for (const v of videos) {
      v.addEventListener('canplay', onCanPlay);
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
        v.removeEventListener('canplay', onCanPlay);
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
                preload="metadata"
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
