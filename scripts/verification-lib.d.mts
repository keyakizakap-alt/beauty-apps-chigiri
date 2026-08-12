/**
 * verification-lib.mjs の型。
 * スクリプトは Node から直接動かすため .mjs のままにし、
 * 型だけをここで与えてテストと型チェックを通す。
 */
export type WorksheetRow = Record<string, string | number>;

export type VerificationProduct = {
  id: string;
  price: number;
  volume?: string;
  officialUrl: string | null;
  sourceCheckedAt: string | null;
  dataConfidence: string;
  [key: string]: unknown;
};

export declare const COLUMNS: string[];
export declare function toCsv(rows: WorksheetRow[], columns?: string[]): string;
export declare function parseCsv(text: string): Record<string, string>[];
export declare function toWorksheetRows(
  products: VerificationProduct[],
): WorksheetRow[];
export declare function applyVerification(
  products: VerificationProduct[],
  rows: Record<string, string>[],
): {
  products: VerificationProduct[];
  applied: string[];
  dropped: string[];
  skipped: string[];
  errors: string[];
};
