/**
 * DataForSEO provider execution. Owns credentials, Basic authentication, the
 * bounded AbortController timeout, endpoint selection via the vendor SDK, and
 * the mapping of HTTP/transport/timeout/JSON failures onto the typed error
 * contract. Response interpretation lives in output.ts.
 */
import {
  SerpApi,
  SerpGoogleAiModeLiveAdvancedRequestInfo,
  SerpGoogleOrganicLiveAdvancedRequestInfo,
} from "dataforseo-client";
import {
  DATAFORSEO_BASE_URL,
  DataForSeoRequestPayload,
  DataForSeoSerpClientOptions,
  DataForSeoSerpEngine,
  DataForSeoSerpError,
  DataForSeoSerpRequest,
  DataForSeoSerpResult,
} from "./types";
import { normalizeDataForSeoResponse, isRecord } from "./output";
import { usageFromDataForSeo, expectedMeterForEngine } from "./usage";
import type { AiUsageContext } from "../../ai-usage";
import { executeAiCall } from "../../ai-usage";

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 180_000;

type ProviderHttpException = {
  isApiException: true;
  status: number;
};

function isProviderHttpException(error: unknown): error is ProviderHttpException {
  return isRecord(error)
    && error.isApiException === true
    && typeof error.status === "number";
}

function readCredentials(engine: DataForSeoSerpEngine): { login: string; password: string } {
  const login = process.env.DATAFORSEO_API_USERNAME;
  const password = process.env.DATAFORSEO_API_PASSWORD;
  const missingEnvironmentVariables = [
    ...(!login ? ["DATAFORSEO_API_USERNAME"] : []),
    ...(!password ? ["DATAFORSEO_API_PASSWORD"] : []),
  ];
  if (missingEnvironmentVariables.length > 0) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_MISSING_CREDENTIALS",
      "DataForSEO credentials are not configured",
      { engine, missingEnvironmentVariables },
    );
  }
  return { login: login as string, password: password as string };
}

function requireRequest(
  engine: DataForSeoSerpEngine,
  request: DataForSeoSerpRequest,
): DataForSeoRequestPayload {
  if (typeof request.keyword !== "string" || request.keyword.trim().length === 0) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_INVALID_REQUEST",
      "DataForSEO keyword must be a non-empty string",
      { engine },
    );
  }

  const locationRepresentations = [
    request.locationCode !== undefined ? "locationCode" : null,
    request.locationName !== undefined ? "locationName" : null,
    request.locationCoordinate !== undefined ? "locationCoordinate" : null,
  ].filter((value): value is string => value !== null);
  const languageRepresentations = [
    request.languageCode !== undefined ? "languageCode" : null,
    request.languageName !== undefined ? "languageName" : null,
  ].filter((value): value is string => value !== null);

  if (locationRepresentations.length !== 1 || languageRepresentations.length !== 1) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_INVALID_REQUEST",
      "DataForSEO request requires exactly one location and one language representation",
      { engine },
    );
  }

  const payload: DataForSeoRequestPayload = {
    keyword: request.keyword,
    ...(request.locationCode !== undefined ? { location_code: request.locationCode } : {}),
    ...(request.locationName !== undefined ? { location_name: request.locationName } : {}),
    ...(request.locationCoordinate !== undefined
      ? { location_coordinate: request.locationCoordinate }
      : {}),
    ...(request.languageCode !== undefined ? { language_code: request.languageCode } : {}),
    ...(request.languageName !== undefined ? { language_name: request.languageName } : {}),
    ...(request.device !== undefined ? { device: request.device } : {}),
    ...(request.os !== undefined ? { os: request.os } : {}),
    ...(request.tag !== undefined ? { tag: request.tag } : {}),
  };
  if (engine === "google_ai_overview") {
    // Explicit vendor default: one 10-result SERP = one billed unit. Sent
    // even though 10 is the default so estimation config stays pinned to the
    // request shape that produced the actual cost.
    payload.depth = 10;
    payload.load_async_ai_overview = true;
  }
  return payload;
}

function requireTimeout(engine: DataForSeoSerpEngine, timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_INVALID_REQUEST",
      `DataForSEO timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds`,
      { engine },
    );
  }
  return timeoutMs;
}

function mapProviderError(
  engine: DataForSeoSerpEngine,
  error: unknown,
  timeoutMs: number,
  aborted: boolean,
  observedHttpStatus: number | undefined,
): never {
  if (error instanceof DataForSeoSerpError) throw error;
  if (aborted || (isRecord(error) && error.name === "AbortError")) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_TIMEOUT",
      `DataForSEO request timed out after ${timeoutMs} milliseconds`,
      { engine, timeoutMs },
    );
  }
  if (error instanceof SyntaxError) {
    // The SDK parses the response body itself; a SyntaxError therefore means
    // the provider answered HTTP 2xx with a body that is not valid JSON.
    throw new DataForSeoSerpError(
      "DATAFORSEO_INVALID_JSON",
      "DataForSEO returned invalid JSON",
      { engine, ...(observedHttpStatus !== undefined ? { httpStatus: observedHttpStatus } : {}) },
    );
  }
  // The SDK's ApiException (dataforseo-client models/ApiException.js) marks
  // itself with isApiException and carries the HTTP status, but it is not
  // exported from the package barrels — so the failure is detected
  // structurally instead of via a deep import.
  if (isProviderHttpException(error)) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_HTTP_ERROR",
      `DataForSEO HTTP request failed with status ${error.status}`,
      { engine, httpStatus: error.status },
    );
  }
  throw new DataForSeoSerpError(
    "DATAFORSEO_TRANSPORT_ERROR",
    "DataForSEO transport request failed",
    { engine },
  );
}

async function fetchDataForSeoSerp(
  engine: DataForSeoSerpEngine,
  request: DataForSeoSerpRequest,
  options: DataForSeoSerpClientOptions = {},
): Promise<DataForSeoSerpResult> {
  const { login, password } = readCredentials(engine);
  const timeoutMs = requireTimeout(engine, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const payload = requireRequest(engine, request);

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // The auth wrapper observes every transport response; the SDK parses the
  // body itself, so a JSON syntax error reports this captured HTTP status.
  let observedHttpStatus: number | undefined = undefined;
  const authorizedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`,
    );
    const response = fetchImpl(input, { ...init, headers, signal: controller.signal })
      .then((resolved) => {
        observedHttpStatus = resolved.status;
        return resolved;
      });
    return response;
  };

  try {
    const serpApi = new SerpApi(DATAFORSEO_BASE_URL, { fetch: authorizedFetch });
    const response = engine === "google_ai_mode"
      ? await serpApi.googleAiModeLiveAdvanced([
        new SerpGoogleAiModeLiveAdvancedRequestInfo(payload),
      ])
      : await serpApi.googleOrganicLiveAdvanced([
        new SerpGoogleOrganicLiveAdvancedRequestInfo(payload),
      ]);

    if (response === null) {
      throw new DataForSeoSerpError(
        "DATAFORSEO_MALFORMED_RESPONSE",
        `DataForSEO returned a malformed ${engine} response envelope`,
        { engine, ...(observedHttpStatus !== undefined ? { httpStatus: observedHttpStatus } : {}) },
      );
    }
    return normalizeDataForSeoResponse(response, engine);
  } catch (error: unknown) {
    mapProviderError(
      engine,
      error,
      timeoutMs,
      controller.signal.aborted || (isRecord(error) && error.name === "AbortError"),
      observedHttpStatus,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchGoogleAiMode(
  request: DataForSeoSerpRequest,
  options?: DataForSeoSerpClientOptions,
): Promise<DataForSeoSerpResult> {
  return fetchDataForSeoSerp("google_ai_mode", request, options);
}

export function fetchGoogleAiOverview(
  request: DataForSeoSerpRequest,
  options?: DataForSeoSerpClientOptions,
): Promise<DataForSeoSerpResult> {
  return fetchDataForSeoSerp("google_ai_overview", request, options);
}

/**
 * Metered execution: routes one DataForSEO task through the shared usage
 * funnel (reservation → priced persistence → actual-cost reconciliation →
 * budget caps). The per-engine call meter carries the vendor's reported task
 * cost as the billed actual. Visibility-signal extraction from the returned
 * normalized result is the caller's next stage (dataforseoResultFromResponse).
 */
export async function runDataForSeo(
  engine: DataForSeoSerpEngine,
  request: DataForSeoSerpRequest,
  ctx: AiUsageContext | undefined,
  options?: DataForSeoSerpClientOptions,
): Promise<DataForSeoSerpResult> {
  const fetchAndNormalize = () => fetchDataForSeoSerp(engine, request, options);
  return executeAiCall(
    ctx,
    "dataforseo",
    engine,
    fetchAndNormalize,
    usageFromDataForSeo,
    { expectedMeters: [expectedMeterForEngine(engine)] },
  );
}
