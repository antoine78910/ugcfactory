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

/** 10 clips, ~36° apart, about 5 readable in view; no duplicate `<video>` URLs. */
const MAX_UNIQUE_SRCS = 10;

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
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        const panel = video.parentElement;
        return panel ? { video, panel } : null;
      })
      .filter((entry): entry is { video: HTMLVideoElement; panel: HTMLElement } => Boolean(entry));

    let running = false;
    let nudgeInterval: number | null = null;

    const pauseAll = () => {
      for (const { video } of videoPanels) video.pause();
    };

    /** All clips play while visible, no “top N by screen area” rule (center of the 3D ring read smaller and was wrongly paused). */
    const playAllEligible = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        pauseAll();
        return;
      }
      if (document.visibilityState !== 'visible') {
        pauseAll();
        return;
      }
      for (const { video } of videoPanels) {
        if (video.paused) void video.play().catch(() => {});
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          if (running) playAllEligible();
        }, { timeout: 1000 });
      } else {
        playAllEligible();
      }
      if (nudgeInterval) clearInterval(nudgeInterval);
      nudgeInterval = window.setInterval(() => {
        if (running) playAllEligible();
      }, 1600);
    };

    const stop = () => {
      running = false;
      if (nudgeInterval) {
        clearInterval(nudgeInterval);
        nudgeInterval = null;
      }
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
      else if (running) playAllEligible();
    };
    document.addEventListener('visibilitychange', onVis);

    /**
     * Mobile Safari/Chrome can block autoplay until a user gesture.
     * Retry playback on first touch/pointer interaction in the carousel area.
     */
    const retryPlaybackFromGesture = () => {
      if (running) playAllEligible();
    };
    root.addEventListener('touchstart', retryPlaybackFromGesture, { passive: true });
    root.addEventListener('pointerdown', retryPlaybackFromGesture, { passive: true });
    root.addEventListener('click', retryPlaybackFromGesture, { passive: true });

    return () => {
      io.disconnect();
      stop();
      document.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('touchstart', retryPlaybackFromGesture);
      root.removeEventListener('pointerdown', retryPlaybackFromGesture);
      root.removeEventListener('click', retryPlaybackFromGesture);
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
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.loop = true;
    void v.play().catch(() => {});
  };

  /** If playback resumes near the end of the loop, rewind first. */
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
                autoPlay
                controls={false}
                preload="metadata"
                disableRemotePlayback
                disablePictureInPicture
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
