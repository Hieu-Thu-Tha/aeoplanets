import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  apiErrorFromResponse,
  getApiErrorMessage,
  isAiUsageCapError,
} from "../../../client/src/lib/apiError";

test("preserves quota metadata and exposes the server message", () => {
  const error = apiErrorFromResponse(
    429,
    "Too Many Requests",
    JSON.stringify({
      code: "AI_USAGE_CAP_REACHED",
      message: "Your monthly AI allowance has been reached.",
    }),
  );

  assert.equal(error.message, "429: Your monthly AI allowance has been reached.");
  assert.equal(getApiErrorMessage(error, "fallback"), "Your monthly AI allowance has been reached.");
  assert.equal(isAiUsageCapError(error), true);
});

test("keeps non-quota API failures distinct", () => {
  const timeout = apiErrorFromResponse(
    504,
    "Gateway Timeout",
    JSON.stringify({ message: "The analysis is taking longer than expected." }),
  );

  assert.equal(getApiErrorMessage(timeout, "fallback"), "The analysis is taking longer than expected.");
  assert.equal(isAiUsageCapError(timeout), false);

  const otherRateLimit = apiErrorFromResponse(
    429,
    "Too Many Requests",
    JSON.stringify({ code: "RATE_LIMITED", message: "Try again later." }),
  );
  assert.equal(isAiUsageCapError(otherRateLimit), false);

  const codedQuotaFailure = apiErrorFromResponse(
    503,
    "Service Unavailable",
    JSON.stringify({ code: "AI_USAGE_CAP_REACHED", message: "Allowance reached." }),
  );
  assert.equal(isAiUsageCapError(codedQuotaFailure), true);
});

test("retains non-JSON response text and ordinary errors", () => {
  const responseError = apiErrorFromResponse(500, "Server Error", "Upstream unavailable");
  assert.equal(responseError.message, "500: Upstream unavailable");
  assert.equal(getApiErrorMessage(new Error("Network failed"), "fallback"), "Network failed");
  assert.equal(getApiErrorMessage(null, "fallback"), "fallback");
  assert.equal(responseError instanceof ApiError, true);
});
