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

const SLOT_COUNT = 10;

type Props = { srcs?: readonly string[] };

export function HeroVideoCarousel3D({ srcs = DEFAULT_SRCS }: Props) {
  const list = srcs.length ? srcs : DEFAULT_SRCS;
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => ({
    src: list[i % list.length]!,
    index: i,
  }));

  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.stage}>
        <div
          className={styles.inner}
          style={
            {
              '--quantity': SLOT_COUNT,
            } as CSSProperties
          }
        >
          {slots.map(({ src, index }) => (
            <div
              key={`${index}-${src}`}
              className={styles.card}
              style={{ '--index': index } as CSSProperties}
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
