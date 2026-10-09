export type CreatorProductTemplate = {
  id: string;
  name: string;
  productUrl: string;
  imageUrl: string;
};

/** Shared static-ad and Link to Ad product clones. Not editable in the app. */
export const CREATOR_PRODUCT_TEMPLATES: CreatorProductTemplate[] = [
  {
    id: "pixelplay",
    name: "PixelPlay",
    productUrl: "https://pixelplayco.com/products/pixelplay",
    imageUrl: "https://pixelplayco.com/cdn/shop/files/1.png?v=1782878073",
  },
  {
    id: "pet-comb",
    name: "Pet comb",
    productUrl:
      "https://boministore.com/products/pet-cat-comb-dog-hair-removal-selfcleaning-flea-comb-for-cats-dog-grooming-combs-clean-brush-cat-hair-remover-brush-pet-supplies",
    imageUrl: "https://boministore.com/cdn/shop/products/product-image-1854261277.jpg?v=1672407510",
  },
  {
    id: "veggie-slicer",
    name: "Vegetable slicer",
    productUrl: "https://ceppal.myshopify.com/products/cubehexa%E2%84%A2-electric-vegetable-slicer-05667",
    imageUrl:
      "https://ceppal.myshopify.com/cdn/shop/products/S40430fcf012243efa6a66b941b2e0df64_1200x1200.webp?v=1673380319",
  },
  {
    id: "spoon-scale",
    name: "Spoon scale",
    productUrl:
      "https://trendszio.com/products/titre-balance-de-cuisine-numerique-mini-cuillere-balance-electronique-lcd-0-1-500g-pour-lait-cafe-et-patisserie-copie-copie",
    imageUrl: "https://trendszio.com/cdn/shop/files/Capture_d_ecran_2026-04-05_a_00.31.12.png?v=1775342813",
  },
  {
    id: "bat-lights",
    name: "Bat wall lights",
    productUrl: "https://highpeakco.com/products/led-bat-wall-lights",
    imageUrl: "https://highpeakco.com/cdn/shop/files/led-bat-wall-lights-highpeak-hero.webp?v=1760080510",
  },
  {
    id: "christmas-projector",
    name: "Christmas projector",
    productUrl: "https://www.urbanomax.com/products/christmas-ceiling-projector-lamp",
    imageUrl: "https://www.urbanomax.com/cdn/shop/files/6f4150e8-7ee7-4fc8-8431-6b30d9b1d65b.png?v=1790597025",
  },
  {
    id: "phomemo-t02",
    name: "Phomemo T02",
    productUrl: "https://phomemo.com/en-jp/products/t02-portable-printer?variant=47566767489253",
    imageUrl: "https://phomemo.com/cdn/shop/files/phomemo-t02-inkless-mini-printer-5006638.png?v=1786172540",
  },
];
