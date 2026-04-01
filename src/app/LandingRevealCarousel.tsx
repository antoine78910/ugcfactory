"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MutableRefObject } from "react";

const PRODUCTS = [
  { src: "/carousel/product-1.png", alt: "Roast & Ritual Coffee" },
  { src: "/carousel/product-2.png", alt: "Lumina Radiance Elixir" },
  { src: "/carousel/product-3.png", alt: "Aqua Luxe Bottle" },
  { src: "/carousel/product-4.png", alt: "Aurelion Luminous Serum" },
  { src: "/carousel/product-5.png", alt: "Designer Perfume" },
  { src: "/carousel/product-6.png", alt: "Volcanic Heat Chips" },
  { src: "/carousel/product-7.png", alt: "Pure Serum" },
] as const;

const UGC_SLIDES = [
  { src: "/carousel/slide1.mp4" },
  { src: "/carousel/slide2.mp4" },
  { src: "/carousel/slide3.mp4" },
  { src: "/carousel/slide4.mp4" },
  { src: "/carousel/slide5.mp4" },
  { src: "/carousel/slide6.mp4" },
  { src: "/carousel/slide7.mp4" },
] as const;

const PAIRED_CAROUSEL_ITEMS = PRODUCTS.map((product, index) => ({
  product,
  slide: UGC_SLIDES[index],
}));

const REVEAL_SLIDE_TOTAL = PAIRED_CAROUSEL_ITEMS.length * 2;

type RevealRegistryEntry = {
  card: HTMLDivElement;
  overlay: HTMLDivElement;
};

function RevealSlide({
  imageSrc,
  videoSrc,
  imageAlt,
  slideIndex,
  registryRef,
}: {
  imageSrc: string;
  videoSrc: string | null;
  imageAlt: string;
  slideIndex: number;
  registryRef: MutableRefObject<(RevealRegistryEntry | null)[]>;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const overlay = overlayRef.current;
    const reg = registryRef.current;
    if (!card || !overlay || slideIndex < 0 || slideIndex >= reg.length) return;
    reg[slideIndex] = { card, overlay };
    return () => {
      reg[slideIndex] = null;
    };
  }, [registryRef, slideIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    void video.play().catch(() => {});
  }, [videoSrc]);

  return (
    <div
      ref={cardRef}
      className="relative z-10 isolate w-[70vw] max-w-[25rem] shrink-0 overflow-hidden rounded-3xl bg-[#0a0a0c] sm:w-[90vw]"
      style={{ aspectRatio: "0.64" }}
    >
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        className="object-cover"
        sizes="(max-width:768px) 90vw, 400px"
        loading={slideIndex === 0 ? "eager" : "lazy"}
      />
      <div
        ref={overlayRef}
        className="absolute inset-0 z-[1] will-change-[clip-path]"
        style={{
          clipPath: "inset(0 0 0 100%)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
            onCanPlay={(e) => {
              void e.currentTarget.play().catch(() => {});
            }}
            onLoadedData={(e) => {
              const video = e.currentTarget;
              video.muted = true;
              video.defaultMuted = true;
              void video.play().catch(() => {});
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-black/40" aria-hidden />
        )}
      </div>
    </div>
  );
}

export function LandingRevealCarousel() {
  const [revealVideosReady, setRevealVideosReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const carouselSetRef = useRef<HTMLDivElement>(null);
  const revealSectionRef = useRef<HTMLElement | null>(null);
  const revealRegistryRef = useRef<(RevealRegistryEntry | null)[]>(
    Array.from({ length: REVEAL_SLIDE_TOTAL }, () => null),
  );

  useEffect(() => {
    const el = revealSectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealVideosReady(true);
          setIsActive(true);
        } else {
          setIsActive(false);
        }
      },
      { root: null, rootMargin: "480px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const trackEl = carouselTrackRef.current;
    const setEl = carouselSetRef.current;
    if (!trackEl || !setEl) return;

    let rafId = 0;
    let lastTs = performance.now();
    let setWidth = 0;
    let offset = 0;
    const speedPxPerSec = 70;

    const measure = () => {
      setWidth = setEl.getBoundingClientRect().width;
    };

    const tick = (ts: number) => {
      if (document.visibilityState !== "visible") {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      if (setWidth > 0) {
        offset = (offset + speedPxPerSec * dt) % setWidth;
        trackEl.style.transform = `translate3d(${(-setWidth + offset).toFixed(2)}px, 0, 0)`;
      }

      const cx = window.innerWidth * 0.5;
      const reg = revealRegistryRef.current;
      const updates: { overlay: HTMLDivElement; clipPath: string }[] = [];

      for (let i = 0; i < reg.length; i++) {
        const entry = reg[i];
        if (!entry) continue;
        const rect = entry.card.getBoundingClientRect();
        const width = rect.width;
        let clipPath = "inset(0 0 0 100%)";
        if (Number.isFinite(width) && width >= 0.5) {
          let splitPct = ((cx - rect.left) / width) * 100;
          if (!Number.isFinite(splitPct)) splitPct = 100;
          splitPct = Math.max(0, Math.min(100, splitPct));
          clipPath = `inset(0 0 0 ${splitPct.toFixed(3)}%)`;
        }
        updates.push({ overlay: entry.overlay, clipPath });
      }

      for (const update of updates) {
        update.overlay.style.clipPath = update.clipPath;
      }

      rafId = requestAnimationFrame(tick);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(setEl);
    window.addEventListener("resize", measure);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isActive]);

  return (
    <section
      ref={revealSectionRef}
      className="overflow-hidden bg-gradient-to-b from-[#0c0a14]/35 via-[#09080f]/20 to-transparent -mt-14 pb-10 pt-14 sm:-mt-20 sm:pt-16"
    >
      <div className="mx-auto mb-14 max-w-6xl px-5 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          Turn any product into realistic AI UGC ads
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-white/52 sm:text-lg">
          Transform simple product shots into authentic, scroll-stopping videos that actually convert.
        </p>
      </div>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 bg-gradient-to-r from-[#050507] to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 bg-gradient-to-l from-[#050507] to-transparent sm:w-28" />
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-[16] w-[4px] -translate-x-1/2 bg-gradient-to-b from-transparent via-violet-300/95 to-transparent shadow-[0_0_24px_rgba(139,92,246,0.7)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-[15] w-[14px] -translate-x-1/2 bg-gradient-to-b from-transparent via-violet-400/35 to-transparent blur-[2px]"
          aria-hidden
        />

        <div
          ref={carouselTrackRef}
          className="relative z-[12] flex items-center gap-2 py-2 will-change-transform md:gap-5"
          style={{ width: "max-content" }}
        >
          <div ref={carouselSetRef} className="flex items-center gap-3 md:gap-5">
            {PAIRED_CAROUSEL_ITEMS.map((item, i) => (
              <RevealSlide
                key={`reveal-a-${i}`}
                slideIndex={i}
                registryRef={revealRegistryRef}
                imageSrc={item.product.src}
                videoSrc={revealVideosReady ? item.slide.src : null}
                imageAlt={item.product.alt}
              />
            ))}
          </div>
          <div aria-hidden="true" className="flex items-center gap-3 md:gap-5">
            {PAIRED_CAROUSEL_ITEMS.map((item, i) => (
              <RevealSlide
                key={`reveal-b-${i}`}
                slideIndex={i + PAIRED_CAROUSEL_ITEMS.length}
                registryRef={revealRegistryRef}
                imageSrc={item.product.src}
                videoSrc={revealVideosReady ? item.slide.src : null}
                imageAlt={item.product.alt}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
