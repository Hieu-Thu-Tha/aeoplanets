import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import {
  createAiJobAdmissionMiddleware,
  hasValidAiJobAdmission,
} from "../../../../server/services/ai-jobs/admission";

function responseMock(): Response & EventEmitter & {
  statusCodeValue?: number;
  bodyValue?: unknown;
} {
  const response = new EventEmitter() as Response & EventEmitter & {
    statusCodeValue?: number;
    bodyValue?: unknown;
  };
  response.statusCode = 200;
  response.headersSent = false;
  response.setHeader = (() => response) as Response["setHeader"];
  response.status = ((code: number) => {
    response.statusCode = code;
    response.statusCodeValue = code;
    return response;
  }) as Response["status"];
  response.json = ((body: unknown) => {
    response.bodyValue = body;
    return response;
  }) as Response["json"];
  return response;
}

test("middleware runs route and async descendants inside one admission", async () => {
  const middleware = createAiJobAdmissionMiddleware(
    (req) => String((req as Request & { ownerId: string }).ownerId),
  );
  const response = responseMock();
  let detached!: Promise<boolean>;
  let nextCalls = 0;

  await middleware({ ownerId: "owner-1" } as unknown as Request, response, () => {
    nextCalls += 1;
    assert.equal(hasValidAiJobAdmission("owner-1"), true);
    detached = Promise.resolve().then(() => hasValidAiJobAdmission("owner-1"));
  });

  assert.equal(nextCalls, 1);
  assert.equal(await detached, true);
  assert.equal(hasValidAiJobAdmission("owner-1"), false);
  response.emit("finish");
});

test("middleware initialization failure creates no admission", async () => {
  const middleware = createAiJobAdmissionMiddleware(() => {
    throw new Error("invalid session");
  });
  const response = responseMock();
  let nextCalls = 0;

  await middleware({} as Request, response, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCodeValue, 503);
  assert.equal((response.bodyValue as { code: string }).code, "AI_USAGE_CHECK_FAILED");
  assert.equal(hasValidAiJobAdmission("owner-1"), false);
});
