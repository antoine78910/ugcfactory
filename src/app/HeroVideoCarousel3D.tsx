'use client';

import type { CSSProperties } from 'react';
import styles from './HeroVideoCarousel3D.module.css';

const DEFAULT_SRCS = [
  '/carousel/slide-1.mp4',
  '/carousel/slide-2.mp4',
  '/carousel/slide-3.mp4',
  '/carousel/slide-4.mp4',
  '/carousel/slide-5.mp4',
  '/carousel/slide-6.mp4',
  '/carousel/slide-7.mp4',
];

const PANEL_COUNT = 10;
const SLICE = 360 / PANEL_COUNT;

type Props = { srcs?: readonly string[] };

export function HeroVideoCarousel3D({ srcs = DEFAULT_SRCS }: Props) {
  const list = srcs.length ? srcs : DEFAULT_SRCS;

  const panels = Array.from({ length: PANEL_COUNT }, (_, i) => ({
    src: list[i % list.length]!,
    angle: SLICE * i,
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
