/**
 * DataForSEO provider contracts — the only file that owns DataForSEO-specific
 * types. The vendor SDK (dataforseo-client) provides typed transports, but its
 * response models are optional-everything with catch-all index signatures, so
 * every read must still be validated at runtime (see output.ts).
 */
import { SerpGoogleAiModeLiveAdvancedRequestInfo, SerpGoogleOrganicLiveAdvancedRequestInfo } from "dataforseo-client";

export const DATAFORSEO_BASE_URL = "https://api.dataforseo.com";
export const DATAFORSEO_SUCCESS_STATUS = 20000;

export type DataForSeoSerpEngine = "google_ai_mode" | "google_ai_overview";

type DataForSeoLocation =
  | { locationCode: number; locationName?: never; locationCoordinate?: never }
  | { locationCode?: never; locationName: string; locationCoordinate?: never }
  | { locationCode?: never; locationName?: never; locationCoordinate: string };

type DataForSeoLanguage =
  | { languageCode: string; languageName?: never }
  | { languageCode?: never; languageName: string };

export type DataForSeoSerpRequest = {
  keyword: string;
  device?: "desktop" | "mobile";
  os?: "windows" | "macos" | "android" | "ios";
  tag?: string;
} & DataForSeoLocation & DataForSeoLanguage;

export interface DataForSeoReference {
  url: string | null;
  title: string | null;
  domain: string | null;
  snippet: string | null;
  source: string | null;
}

export interface DataForSeoAnswerMetadata {
  keyword: string;
  resultType: "ai_mode" | "organic";
  surfaceType: "ai_overview" | "knowledge_graph_ai_overview_item" | null;
  locationCode: number | null;
  languageCode: string | null;
  itemTypes: string[];
  rankGroup: number | null;
  rankAbsolute: number | null;
  asynchronousAiOverview: boolean | null;
}

/**
 * The normalized Google answer surface as returned by DataForSEO — the input
 * to visibility-signal extraction, not a visibility result itself. It is
 * brand-agnostic: whether the BRAND appeared is decided downstream.
 */
export interface DataForSeoSerpResult {
  vendor: "dataforseo";
  engine: DataForSeoSerpEngine;
  /** Whether the Google response contained an AI answer surface at all (AI Mode answer or AI Overview). */
  isAnswerPresent: boolean;
  answerText: string | null;
  answerMarkdown: string | null;
  references: DataForSeoReference[];
  taskId: string;
  /** Vendor-reported task cost in USD, as returned by DataForSEO (float). Conversion to the ledger's costMicroUsd belongs to downstream processing.*/
  costUsd: number | null;
  resultTimestamp: string | null;
  checkUrl: string | null;
  metadata: DataForSeoAnswerMetadata;
}

export type DataForSeoSerpErrorCode =
  | "DATAFORSEO_MISSING_CREDENTIALS"
  | "DATAFORSEO_INVALID_REQUEST"
  | "DATAFORSEO_TIMEOUT"
  | "DATAFORSEO_TRANSPORT_ERROR"
  | "DATAFORSEO_HTTP_ERROR"
  | "DATAFORSEO_INVALID_JSON"
  | "DATAFORSEO_PROVIDER_ERROR"
  | "DATAFORSEO_TASK_ERROR"
  | "DATAFORSEO_MALFORMED_RESPONSE";

export type DataForSeoSerpErrorMetadata = {
  engine: DataForSeoSerpEngine;
  timeoutMs?: number;
  httpStatus?: number;
  providerStatusCode?: number;
  providerStatusMessage?: string | null;
  taskId?: string;
  taskStatusCode?: number;
  taskStatusMessage?: string | null;
  missingEnvironmentVariables?: string[];
};

export class DataForSeoSerpError extends Error {
  readonly code: DataForSeoSerpErrorCode;
  readonly metadata: Readonly<DataForSeoSerpErrorMetadata>;

  constructor(
    code: DataForSeoSerpErrorCode,
    message: string,
    metadata: DataForSeoSerpErrorMetadata,
  ) {
    super(`[${code}] ${message}`);
    this.name = "DataForSeoSerpError";
    this.code = code;
    this.metadata = metadata;
  }
}

export interface DataForSeoSerpClientOptions {
  /** Injectable fetch — also the seam the vendor SDK's http client receives. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Minimal provider input serialized into the SDK request models. */
export type DataForSeoRequestPayload = {
  keyword: string;
  location_code?: number;
  location_name?: string;
  location_coordinate?: string;
  language_code?: string;
  language_name?: string;
  device?: "desktop" | "mobile";
  os?: "windows" | "macos" | "android" | "ios";
  tag?: string;
  /**
   * Organic Advanced only — parsing depth (results per SERP). Sent explicitly
   * as the vendor default (10 = one billed SERP unit); above 10 the vendor
   * bills per additional 10-result unit. The AI Mode request model has no
   * depth parameter, so it is omitted there.
   */
  depth?: number;
  /** Organic Advanced only — forces the vendor to hydrate the AI Overview surface. */
  load_async_ai_overview?: boolean;
};
