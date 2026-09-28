/**
 * DataForSEO response interpretation. Receives the SDK-parsed envelope and
 * validates the minimum documented shape before normalizing. The vendor
 * models are optional-everything, so strict runtime checks stay in place —
 * a missing or wrongly-typed required field is DATAFORSEO_MALFORMED_RESPONSE.
 *
 * Unrelated additional DataForSEO fields are tolerated, never modeled.
 */
import { extractInfo, type LLMResult } from "../../../llm-runner";
import type {
  SerpGoogleAiModeLiveAdvancedResponseInfo,
  SerpGoogleOrganicLiveAdvancedResponseInfo,
} from "dataforseo-client";
import {
  DATAFORSEO_SUCCESS_STATUS,
  DataForSeoReference,
  DataForSeoSerpEngine,
  DataForSeoSerpError,
  DataForSeoSerpErrorMetadata,
  DataForSeoSerpResult,
} from "./types";

type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwResponseMalformed(
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata: Partial<DataForSeoSerpErrorMetadata> = {},
): never {
  throw new DataForSeoSerpError(
    "DATAFORSEO_MALFORMED_RESPONSE",
    `DataForSEO returned a malformed ${detail}`,
    { engine, ...metadata },
  );
}

function requiredRecord(
  value: unknown,
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata?: Partial<DataForSeoSerpErrorMetadata>,
): JsonRecord {
  if (!isRecord(value)) throwResponseMalformed(engine, detail, metadata);
  return value;
}

function requiredNumber(
  value: unknown,
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata?: Partial<DataForSeoSerpErrorMetadata>,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwResponseMalformed(engine, detail, metadata);
  }
  return value;
}

function requiredString(
  value: unknown,
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata?: Partial<DataForSeoSerpErrorMetadata>,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throwResponseMalformed(engine, detail, metadata);
  }
  return value;
}

function nullableString(
  value: unknown,
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata?: Partial<DataForSeoSerpErrorMetadata>,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throwResponseMalformed(engine, detail, metadata);
  return value;
}

function nullableNumber(
  value: unknown,
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata?: Partial<DataForSeoSerpErrorMetadata>,
): number | null {
  if (value === null || value === undefined) return null;
  return requiredNumber(value, engine, detail, metadata);
}

function nullableBoolean(
  value: unknown,
  engine: DataForSeoSerpEngine,
  detail: string,
  metadata?: Partial<DataForSeoSerpErrorMetadata>,
): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") throwResponseMalformed(engine, detail, metadata);
  return value;
}

function safeStatusMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 200);
}

function nestedAnswerNodes(
  node: JsonRecord,
  engine: DataForSeoSerpEngine,
  taskId: string,
): JsonRecord[] {
  const nodes: JsonRecord[] = [];
  for (const key of ["items", "components"] as const) {
    const nested = node[key];
    if (nested === null || nested === undefined) continue;
    if (!Array.isArray(nested)) {
      throwResponseMalformed(engine, `AI surface ${key} field`, { taskId });
    }
    for (const value of nested) {
      const child = requiredRecord(value, engine, `AI surface ${key} entry`, { taskId });
      nodes.push(child, ...nestedAnswerNodes(child, engine, taskId));
    }
  }
  return nodes;
}

function findAiSurface(
  items: JsonRecord[],
  engine: DataForSeoSerpEngine,
  taskId: string,
): JsonRecord | undefined {
  const directSurface = items.find((item) => item.type === "ai_overview");
  if (directSurface) return directSurface;

  for (const item of items) {
    if (item.type !== "knowledge_graph") continue;
    if (item.items === null || item.items === undefined) continue;
    if (!Array.isArray(item.items)) {
      throwResponseMalformed(engine, "knowledge graph items field", { taskId });
    }
    const knowledgeGraphSurfaces = item.items
      .map((value) => requiredRecord(value, engine, "knowledge graph item", { taskId }))
      .filter((value) => value.type === "knowledge_graph_ai_overview_item");
    if (knowledgeGraphSurfaces.length > 1) {
      throwResponseMalformed(engine, "duplicate knowledge graph AI Overview items", { taskId });
    }
    if (knowledgeGraphSurfaces[0]) return knowledgeGraphSurfaces[0];
  }

  return undefined;
}

function answerValue(
  surface: JsonRecord,
  key: "text" | "markdown",
  engine: DataForSeoSerpEngine,
  taskId: string,
): string | null {
  const direct = nullableString(surface[key], engine, `AI surface ${key} field`, { taskId })?.trim();
  if (direct) return direct;

  const parts: string[] = [];
  for (const node of nestedAnswerNodes(surface, engine, taskId)) {
    const value = nullableString(node[key], engine, `AI surface ${key} field`, { taskId })?.trim();
    if (value && parts.at(-1) !== value) parts.push(value);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function referencesFromSurface(
  surface: JsonRecord,
  engine: DataForSeoSerpEngine,
  taskId: string,
): DataForSeoReference[] {
  const references: DataForSeoReference[] = [];
  const seen = new Set<string>();

  for (const node of [surface, ...nestedAnswerNodes(surface, engine, taskId)]) {
    const rawReferences = node.references;
    if (rawReferences === null || rawReferences === undefined) continue;
    if (!Array.isArray(rawReferences)) {
      throwResponseMalformed(engine, "AI surface references field", { taskId });
    }

    for (const rawReference of rawReferences) {
      const reference = requiredRecord(rawReference, engine, "AI surface reference", { taskId });
      const normalized: DataForSeoReference = {
        url: nullableString(reference.url, engine, "AI reference URL", { taskId }),
        title: nullableString(reference.title, engine, "AI reference title", { taskId }),
        domain: nullableString(reference.domain, engine, "AI reference domain", { taskId }),
        snippet: nullableString(reference.text, engine, "AI reference snippet", { taskId }),
        source: nullableString(reference.source, engine, "AI reference source", { taskId }),
      };
      const identity = normalized.url ?? JSON.stringify(normalized);
      if (!seen.has(identity)) {
        seen.add(identity);
        references.push(normalized);
      }
    }
  }

  return references;
}

/**
 * Interprets the SDK-validated provider envelope into the normalized
 * DataForSEO result. Legitimate absence (a successful Google result without
 * an AI Overview surface) returns `isAnswerPresent: false`; a broken envelope throws.
 */
export function normalizeDataForSeoResponse(
  body: unknown,
  engine: DataForSeoSerpEngine,
): DataForSeoSerpResult {
  const envelope = requiredRecord(body, engine, "top-level response");
  const providerStatusCode = requiredNumber(
    envelope.status_code,
    engine,
    "top-level status code",
  );
  const providerStatusMessage = safeStatusMessage(envelope.status_message);

  if (providerStatusCode !== DATAFORSEO_SUCCESS_STATUS) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_PROVIDER_ERROR",
      `DataForSEO provider failed with status ${providerStatusCode}`,
      { engine, providerStatusCode, providerStatusMessage },
    );
  }

  if (!Array.isArray(envelope.tasks) || envelope.tasks.length !== 1) {
    throwResponseMalformed(engine, "tasks array");
  }
  const task = requiredRecord(envelope.tasks[0], engine, "task object");
  const taskId = requiredString(task.id, engine, "task ID");
  const taskStatusCode = requiredNumber(task.status_code, engine, "task status code", { taskId });
  const taskStatusMessage = safeStatusMessage(task.status_message);

  if (taskStatusCode !== DATAFORSEO_SUCCESS_STATUS) {
    throw new DataForSeoSerpError(
      "DATAFORSEO_TASK_ERROR",
      `DataForSEO task ${taskId} failed with status ${taskStatusCode}`,
      {
        engine,
        providerStatusCode,
        providerStatusMessage,
        taskId,
        taskStatusCode,
        taskStatusMessage,
      },
    );
  }

  if (!Array.isArray(task.result) || task.result.length !== 1) {
    throwResponseMalformed(engine, "task result array", { taskId });
  }
  const result = requiredRecord(task.result[0], engine, "task result object", { taskId });
  const expectedResultType = engine === "google_ai_mode" ? "ai_mode" : "organic";
  const resultType = requiredString(result.type, engine, "result type", { taskId });
  if (resultType !== expectedResultType) {
    throwResponseMalformed(engine, "result type", { taskId });
  }
  const keyword = requiredString(result.keyword, engine, "result keyword", { taskId });

  if (!Array.isArray(result.item_types) || !result.item_types.every((value) => typeof value === "string")) {
    throwResponseMalformed(engine, "result item types", { taskId });
  }
  const itemTypes = [...result.item_types] as string[];

  if (!Array.isArray(result.items)) throwResponseMalformed(engine, "result items array", { taskId });
  const items = result.items.map((value) =>
    requiredRecord(value, engine, "result item", { taskId }));
  const directSurfaces = items.filter((item) => item.type === "ai_overview");
  if (directSurfaces.length > 1) throwResponseMalformed(engine, "duplicate AI surface items", { taskId });

  const costUsd = nullableNumber(task.cost, engine, "task cost", { taskId });
  const resultTimestamp = nullableString(result.datetime, engine, "result timestamp", { taskId });
  const checkUrl = nullableString(result.check_url, engine, "result check URL", { taskId });
  const locationCode = nullableNumber(result.location_code, engine, "result location code", { taskId });
  const languageCode = nullableString(result.language_code, engine, "result language code", { taskId });

  const surface = findAiSurface(items, engine, taskId);
  if (!surface) {
    return {
      vendor: "dataforseo",
      engine,
      isAnswerPresent: false,
      answerText: null,
      answerMarkdown: null,
      references: [],
      taskId,
      costUsd,
      resultTimestamp,
      checkUrl,
      metadata: {
        keyword,
        resultType: expectedResultType,
        surfaceType: null,
        locationCode,
        languageCode,
        itemTypes,
        rankGroup: null,
        rankAbsolute: null,
        asynchronousAiOverview: null,
      },
    };
  }

  const answerText = answerValue(surface, "text", engine, taskId);
  const answerMarkdown = answerValue(surface, "markdown", engine, taskId);
  if (answerText === null && answerMarkdown === null) {
    throwResponseMalformed(engine, "AI surface without answer content", { taskId });
  }

  return {
    vendor: "dataforseo",
    engine,
    isAnswerPresent: true,
    answerText,
    answerMarkdown,
    references: referencesFromSurface(surface, engine, taskId),
    taskId,
    costUsd,
    resultTimestamp,
    checkUrl,
    metadata: {
      keyword,
      resultType: expectedResultType,
      surfaceType: surface.type as "ai_overview" | "knowledge_graph_ai_overview_item",
      locationCode,
      languageCode,
      itemTypes,
      rankGroup: nullableNumber(surface.rank_group, engine, "AI surface rank group", { taskId }),
      rankAbsolute: nullableNumber(surface.rank_absolute, engine, "AI surface absolute rank", { taskId }),
      asynchronousAiOverview: nullableBoolean(
        surface.asynchronous_ai_overview,
        engine,
        "AI surface asynchronous flag",
        { taskId },
      ),
    },
  };
}

/**
 * Provider conversion, named for parity with the other engines
 * (perplexityResultFromResponse): the SDK-parsed SERP response becomes the
 * existing visibility-result contract (LLMResult). Pure — no transport, no
 * persistence, no cost logic.
 *
 * Internally the response first normalizes into the DataForSeoSerpResult
 * contract (unit 1), then text-based signals (appeared / position / sentiment
 * / competitors) reuse the shared extractInfo heuristics over the answer
 * content so DataForSEO scores identically to the LLM engines. Structured
 * overrides: modelId is the DataForSEO engine identity, citations come from
 * the vendor's structured references, and the raw response is the answer
 * Markdown with its inline [[n]](url) citations.
 */
export function dataforseoResultFromResponse(
  response: SerpGoogleAiModeLiveAdvancedResponseInfo | SerpGoogleOrganicLiveAdvancedResponseInfo,
  engine: DataForSeoSerpEngine,
  brandName: string,
  competitors: string[],
  companyName?: string | null,
): LLMResult {
  const normalized = normalizeDataForSeoResponse(response, engine);

  if (!normalized.isAnswerPresent) {
    return {
      modelId: engine,
      appeared: false,
      position: null,
      sentiment: null,
      competitorsMentioned: [],
      citationPresent: false,
      rawResponse: "",
    };
  }

  const responseText = normalized.answerMarkdown ?? normalized.answerText ?? "";
  const signals = extractInfo(responseText, brandName, competitors, companyName);

  return {
    modelId: engine,
    ...signals,
    // The vendor's structured references are the citation truth for a SERP
    // surface; the URL-pattern heuristics extractInfo runs are for free-text
    // LLM answers and do not apply here.
    citationPresent: normalized.references.length > 0,
  };
}
