export type CreatorProductTemplate = {
  id: string;
  name: string;
  productUrl: string;
  imageUrl: string;
  /** File in public/link-to-ad/product-videos. Served by the CDN, not read from disk. */
  videoFile: string;
  /** Silent 5s Seedance 2.5 UGC clip in the same folder. */
  ugcVideoFile: string;
  /** Second silent 5s clip: creator face on camera, presenting the product. */
  ugcPresenterVideoFile: string;
  /** TikTok, AliExpress, and other links that should open this same product template. */
  relatedUrls: string[];
};

/** Shared static-ad and Link to Ad product clones. Not editable in the app. */
export const CREATOR_PRODUCT_TEMPLATES: CreatorProductTemplate[] = [
  {
    id: "pixelplay",
    name: "PixelPlay",
    productUrl: "https://pixelplayco.com/products/pixelplay",
    imageUrl: "https://pixelplayco.com/cdn/shop/files/1.png?v=1782878073",
    videoFile: "pixelplay.mp4",
    ugcVideoFile: "ugc-pixelplay.mp4",
    ugcPresenterVideoFile: "ugc2-pixelplay.mp4",
    relatedUrls: [
      "https://www.tiktok.com/@piixelplay/video/7339333428837371178",
      "https://www.aliexpress.us/item/3256808382870245.html",
    ],
  },
  {
    id: "pet-comb",
    name: "Pet comb",
    productUrl:
      "https://boministore.com/products/pet-cat-comb-dog-hair-removal-selfcleaning-flea-comb-for-cats-dog-grooming-combs-clean-brush-cat-hair-remover-brush-pet-supplies",
    imageUrl: "https://boministore.com/cdn/shop/products/product-image-1854261277.jpg?v=1672407510",
    videoFile: "cat-brush.mp4",
    ugcVideoFile: "ugc-cat-brush.mp4",
    ugcPresenterVideoFile: "ugc2-cat-brush.mp4",
    relatedUrls: [
      "https://www.tiktok.com/@pet..supplies/video/7112871757157092650",
      "https://www.aliexpress.us/item/3256805568803370.html",
    ],
  },
  {
    id: "veggie-slicer",
    name: "Vegetable slicer",
    productUrl: "https://ceppal.myshopify.com/products/cubehexa%E2%84%A2-electric-vegetable-slicer-05667",
    imageUrl:
      "https://ceppal.myshopify.com/cdn/shop/products/S40430fcf012243efa6a66b941b2e0df64_1200x1200.webp?v=1673380319",
    videoFile: "vegetable-slicer.mp4",
    ugcVideoFile: "ugc-vegetable-slicer.mp4",
    ugcPresenterVideoFile: "ugc2-vegetable-slicer.mp4",
    relatedUrls: ["https://www.tiktok.com/@noorhiba.online/video/7408954241366150408"],
  },
  {
    id: "spoon-scale",
    name: "Spoon scale",
    productUrl:
      "https://trendszio.com/products/titre-balance-de-cuisine-numerique-mini-cuillere-balance-electronique-lcd-0-1-500g-pour-lait-cafe-et-patisserie-copie-copie",
    imageUrl: "https://trendszio.com/cdn/shop/files/Capture_d_ecran_2026-04-05_a_00.31.12.png?v=1775342813",
    videoFile: "spoon-scale.mp4",
    ugcVideoFile: "ugc-spoon-scale.mp4",
    ugcPresenterVideoFile: "ugc2-spoon-scale.mp4",
    relatedUrls: [
      "https://www.tiktok.com/@kitchenconqueror/video/7170801533565766958",
      "https://www.aliexpress.us/item/3256806005073521.html",
    ],
  },
  {
    id: "bat-lights",
    name: "Bat wall lights",
    productUrl: "https://highpeakco.com/products/led-bat-wall-lights",
    imageUrl: "https://highpeakco.com/cdn/shop/files/led-bat-wall-lights-highpeak-hero.webp?v=1760080510",
    videoFile: "bat-lights.mp4",
    ugcVideoFile: "ugc-bat-lights.mp4",
    ugcPresenterVideoFile: "ugc2-bat-lights.mp4",
    relatedUrls: [
      "https://www.tiktok.com/@christian.branson1/video/7669085601420922125",
      "https://www.aliexpress.us/item/3256812902804787.html",
    ],
  },
  {
    id: "christmas-projector",
    name: "Christmas projector",
    productUrl: "https://www.urbanomax.com/products/christmas-ceiling-projector-lamp",
    imageUrl: "https://www.urbanomax.com/cdn/shop/files/6f4150e8-7ee7-4fc8-8431-6b30d9b1d65b.png?v=1790597025",
    videoFile: "christmas-projector.mp4",
    ugcVideoFile: "ugc-christmas-projector.mp4",
    ugcPresenterVideoFile: "ugc2-christmas-projector.mp4",
    relatedUrls: [
      "https://www.tiktok.com/@sarvina450/video/7686197199415397662",
      "https://www.aliexpress.us/item/3256813118273970.html",
    ],
  },
  {
    id: "phomemo-t02",
    name: "Phomemo T02",
    productUrl: "https://phomemo.com/en-jp/products/t02-portable-printer?variant=47566767489253",
    imageUrl: "https://phomemo.com/cdn/shop/files/phomemo-t02-inkless-mini-printer-5006638.png?v=1786172540",
    videoFile: "phomemo.mp4",
    ugcVideoFile: "ugc-phomemo.mp4",
    ugcPresenterVideoFile: "ugc2-phomemo.mp4",
    relatedUrls: [
      "https://www.tiktok.com/@minithermoprinter/video/7252042923271818501",
      "https://www.aliexpress.us/item/3256805737198253.html",
    ],
  },
];

/** Public URL for the pre-made ad. Same-origin so the player can load it. */
function productVideoUrl(file: string | undefined): string | null {
  if (!file) return null;
  return `/link-to-ad/product-videos/${encodeURIComponent(file)}`;
}

export function creatorTemplateVideoUrl(templateId: string): string | null {
  return productVideoUrl(CREATOR_PRODUCT_TEMPLATES.find((item) => item.id === templateId)?.videoFile);
}

export function creatorTemplateUgcVideoUrl(templateId: string): string | null {
  return productVideoUrl(CREATOR_PRODUCT_TEMPLATES.find((item) => item.id === templateId)?.ugcVideoFile);
}

export function creatorTemplatePresenterVideoUrl(templateId: string): string | null {
  return productVideoUrl(CREATOR_PRODUCT_TEMPLATES.find((item) => item.id === templateId)?.ugcPresenterVideoFile);
}

function normalizeProductUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      /* keep the raw path */
    }
    path = path.replace(/\/+$/, "").toLowerCase().replace(/™/g, "");
    return `${host}${path}`;
  } catch {
    return "";
  }
}

function hostAndProductSlug(normalized: string): { host: string; slug: string } {
  const slash = normalized.indexOf("/");
  const host = slash === -1 ? normalized : normalized.slice(0, slash);
  const parts = (slash === -1 ? "" : normalized.slice(slash)).split("/").filter(Boolean);
  const productIndex = parts.findIndex((part) => part === "products" || part === "product");
  const slug = (productIndex >= 0 ? parts[productIndex + 1] : "") ?? "";
  return { host, slug };
}

function longIds(value: string): string[] {
  return value.match(/\d{16,}/g) ?? [];
}

/** Match a pasted store, TikTok, or AliExpress URL to one influencer product template. */
export function findCreatorTemplateByProductUrl(url: string): CreatorProductTemplate | null {
  const key = normalizeProductUrl(url);
  if (!key) return null;
  const pasted = hostAndProductSlug(key);
  const pastedIds = new Set(longIds(url));
  for (const template of CREATOR_PRODUCT_TEMPLATES) {
    const product = normalizeProductUrl(template.productUrl);
    if (product === key) return template;
    const known = hostAndProductSlug(product);
    if (pasted.host === known.host && pasted.slug && pasted.slug === known.slug) return template;
    for (const related of template.relatedUrls) {
      if (normalizeProductUrl(related) === key) return template;
      if (longIds(related).some((id) => pastedIds.has(id))) return template;
    }
  }
  return null;
}
