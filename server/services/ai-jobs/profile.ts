import { createHash } from "node:crypto";
import type { AiJobModelCall } from "@shared/schema";
import { canonicalizeExpectedMeters } from "@shared/ai-billing";

const PROFILE_HASH_VERSION = "ai-model-profile-v2\0";

export function hashAiJobModelProfile(profile: readonly AiJobModelCall[]): string {
  if (profile.length === 0) throw new RangeError("AI job model profile cannot be empty");
  const canonical = profile.map(({ provider, model, meters }) => {
    if (!provider || !model) throw new TypeError("AI job model calls require provider and model");
    return [provider, model, canonicalizeExpectedMeters(meters)];
  });
  return createHash("sha256")
    .update(PROFILE_HASH_VERSION)
    .update(JSON.stringify(canonical))
    .digest("hex");
}
