'use client';

import type { CSSProperties } from 'react';
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

/** More panels on the ring (smaller angle step) = tighter spacing + ~7+ visible; videos cycle through `srcs`. */
const PANEL_COUNT = 20;

type Props = { srcs?: readonly string[] };

export function HeroVideoCarousel3D({ srcs = DEFAULT_SRCS }: Props) {
  const list = srcs.length ? srcs : DEFAULT_SRCS;
  const slice = 360 / PANEL_COUNT;

  const panels = Array.from({ length: PANEL_COUNT }, (_, i) => ({
    src: list[i % list.length]!,
    angle: slice * i,
  }));

  return (
    <div className={styles.root} aria-hidden>
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
                preload="metadata"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
