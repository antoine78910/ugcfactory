"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import styles from "./LandingRevealCarousel.module.css";

const PRODUCTS = [
  { src: "/carousel/product-1.png", alt: "Roast & Ritual Coffee" },
  { src: "/carousel/product-2.png", alt: "Lumina Radiance Elixir" },
  { src: "/carousel/product-3.png", alt: "Aqua Luxe Bottle" },
  { src: "/carousel/product-4.png", alt: "Aurelion Luminous Serum" },
  { src: "/carousel/product-5.png", alt: "Designer Perfume" },
  { src: "/carousel/product-6.png", alt: "Volcanic Heat Chips" },
  { src: "/carousel/product-7.png", alt: "Pure Serum" },
] as const;

/** Bump when replacing carousel MP4s so immutable CDN cache does not serve stale 404s. */
const CAROUSEL_MP4_CACHE = "v3";

const UGC_SLIDES = [
  { src: `/carousel/slide1.mp4?${CAROUSEL_MP4_CACHE}` },
  { src: `/carousel/slide2.mp4?${CAROUSEL_MP4_CACHE}` },
  { src: `/carousel/slide3.mp4?${CAROUSEL_MP4_CACHE}` },
  { src: `/carousel/slide4.mp4?${CAROUSEL_MP4_CACHE}` },
  { src: `/carousel/slide5.mp4?${CAROUSEL_MP4_CACHE}` },
  { src: `/carousel/slide6.mp4?${CAROUSEL_MP4_CACHE}` },
  { src: `/carousel/slide7.mp4?${CAROUSEL_MP4_CACHE}` },
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
  /**
   * Per-card lazy gate for the MP4 overlay. Without this, all 14 slides (2 copies × 7)
   * would kick off network requests at once, which is what makes the image→video
   * carousel feel slow on mobile. We only mount the `<video src>` when the card is
   * actually close to the viewport.
   */
  const [videoMounted, setVideoMounted] = useState(false);

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
    if (!videoSrc) return;
    const card = cardRef.current;
    if (!card) return;
    if (typeof IntersectionObserver === "undefined") {
      setVideoMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVideoMounted(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: null, rootMargin: "250px 250px", threshold: 0 },
    );
    io.observe(card);
    return () => io.disconnect();
  }, [videoSrc]);

  useEffect(() => {
    if (!videoMounted) return;
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.autoplay = true;
    video.controls = false;
    video.disablePictureInPicture = true;
    void video.play().catch(() => {});
  }, [videoMounted, videoSrc]);

  return (
    <div
      ref={cardRef}
      className="pointer-events-none relative z-10 isolate w-[46vw] max-w-[25rem] min-w-[9.5rem] shrink-0 overflow-hidden rounded-3xl bg-[#0a0a0c] sm:w-[90vw]"
      style={{ aspectRatio: "0.64" }}
    >
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        className="object-cover"
        /**
         * Drop `unoptimized` so Next serves AVIF/WebP at the actual displayed
         * width (~500px max). Lighthouse was flagging product-1 / product-2 as
         * "image larger than displayed" because the raw 585x914 PNGs were sent
         * at 1× regardless of viewport. Combined with `images.minimumCacheTTL`
         * = 1y, the optimized variants are cached aggressively on the edge.
         */
        sizes="(max-width:768px) 46vw, 400px"
        loading={slideIndex === 0 ? "eager" : "lazy"}
        quality={70}
        draggable={false}
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
        {videoSrc && videoMounted ? (
          <video
            ref={videoRef}
            key={`${slideIndex}-${videoSrc}`}
            src={videoSrc}
            poster={imageSrc}
            autoPlay
            loop
            muted
            playsInline
            controls={false}
            preload="metadata"
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
            onCanPlay={(e) => {
              const v = e.currentTarget;
              v.muted = true;
              void v.play().catch(() => {});
            }}
            onLoadedData={(e) => {
              const video = e.currentTarget;
              video.muted = true;
              video.defaultMuted = true;
              void video.play().catch(() => {});
            }}
            className={`h-full w-full object-cover ${styles.revealVideo}`}
          />
        ) : (
          <div className="h-full w-full bg-black/40" aria-hidden />
        )}
      </div>
    </div>
  );
}

export function LandingRevealCarousel() {
  const [isActive, setIsActive] = useState(false);
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const carouselSetRef = useRef<HTMLDivElement>(null);
  /** Second copy of the strip, used to measure scroll period (first set width + flex gap). */
  const carouselSet2Ref = useRef<HTMLDivElement>(null);
  const revealSectionRef = useRef<HTMLElement | null>(null);
  const revealRegistryRef = useRef<(RevealRegistryEntry | null)[]>(
    Array.from({ length: REVEAL_SLIDE_TOTAL }, () => null),
  );

  useEffect(() => {
    const el = revealSectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setIsActive(entry.isIntersecting);
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
    /** One full loop = distance from copy A’s left edge to copy B’s left edge (includes inter-set flex gap). */
    let scrollPeriodPx = 0;
    let offset = 0;
    const speedPxPerSec = 70;

    const measure = () => {
      const set2 = carouselSet2Ref.current;
      if (!set2) {
        scrollPeriodPx = setEl.getBoundingClientRect().width;
        return;
      }
      const r1 = setEl.getBoundingClientRect();
      const r2 = set2.getBoundingClientRect();
      const period = r2.left - r1.left;
      scrollPeriodPx = Number.isFinite(period) && period > 1 ? period : setEl.getBoundingClientRect().width;
      while (scrollPeriodPx > 0 && offset >= scrollPeriodPx) offset -= scrollPeriodPx;
    };

    const tick = (ts: number) => {
      if (document.visibilityState !== "visible") {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      if (scrollPeriodPx > 0) {
        offset += speedPxPerSec * dt;
        while (offset >= scrollPeriodPx) offset -= scrollPeriodPx;
        /* Same direction as before: -period + offset (not -offset), with period = set1→set2 distance incl. gap */
        trackEl.style.transform = `translate3d(${(-scrollPeriodPx + offset).toFixed(2)}px, 0, 0)`;
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
    requestAnimationFrame(() => measure());
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(setEl);
    const set2El = carouselSet2Ref.current;
    if (set2El) resizeObserver.observe(set2El);
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
      className="overflow-hidden bg-gradient-to-b from-[#0c0a14]/35 via-[#09080f]/20 to-transparent mt-12 pb-10 pt-14 sm:mt-16 sm:pb-12 sm:pt-16"
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
                videoSrc={item.slide.src}
                imageAlt={item.product.alt}
              />
            ))}
          </div>
          <div ref={carouselSet2Ref} aria-hidden="true" className="flex items-center gap-3 md:gap-5">
            {PAIRED_CAROUSEL_ITEMS.map((item, i) => (
              <RevealSlide
                key={`reveal-b-${i}`}
                slideIndex={i + PAIRED_CAROUSEL_ITEMS.length}
                registryRef={revealRegistryRef}
                imageSrc={item.product.src}
                videoSrc={item.slide.src}
                imageAlt={item.product.alt}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
