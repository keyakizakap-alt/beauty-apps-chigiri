/**
 * images-lib.mjs の型。
 * スクリプトは Node から直接動かすため .mjs のままにし、
 * 型だけをここで与えてテストと型チェックを通す。
 */
export type ImageKind = "jpeg" | "png" | "webp";

export type ImageProduct = {
  id: string;
  imagePath?: string | null;
  [key: string]: unknown;
};

export declare function targetPathFor(productId: string): string;
export declare function detectImageType(buffer: Uint8Array): ImageKind | null;
export declare function isCandidateFile(filename: string): boolean;
export declare function productIdFromFilename(filename: string): string;
export declare function matchFilesToProducts(
  filenames: string[],
  products: ImageProduct[],
): {
  matched: Array<{ file: string; productId: string }>;
  unmatched: string[];
};
export declare function productsWithoutImage<T extends ImageProduct>(
  products: T[],
): T[];
