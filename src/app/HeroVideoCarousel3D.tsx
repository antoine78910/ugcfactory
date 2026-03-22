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

const CARD_COUNT = 9;
const ARC_DEG = 160;
const HALF = ARC_DEG / 2;

type Props = { srcs?: readonly string[] };

export function HeroVideoCarousel3D({ srcs = DEFAULT_SRCS }: Props) {
  const list = srcs.length ? srcs : DEFAULT_SRCS;

  const cards = Array.from({ length: CARD_COUNT }, (_, i) => ({
    src: list[i % list.length]!,
    angle: -HALF + (ARC_DEG / (CARD_COUNT - 1)) * i,
  }));

  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.scene}>
        <div className={styles.arc}>
          {cards.map(({ src, angle }, i) => (
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
