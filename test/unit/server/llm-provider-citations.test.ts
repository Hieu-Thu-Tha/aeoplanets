import assert from "node:assert/strict";
import test from "node:test";
import { formatSourcesAppendix } from "../../../server/services/llm-provider/citations";
import { extractOpenaiCitations } from "../../../server/services/llm-provider/openai/output";
import { extractGeminiCitations } from "../../../server/services/llm-provider/gemini/output";
import { extractAnthropicCitations } from "../../../server/services/llm-provider/anthropic/output";

test("formatSourcesAppendix renders markdown links, numbers unique urls, drops entries without them", () => {
  const out = formatSourcesAppendix([
    { url: "https://a.example/one", title: "First [source]" },
    { url: "https://a.example/one", title: "Duplicate" },
    { url: "https://b.example/two", title: null },
    { url: "", title: "No url — dropped" },
  ]);
  assert.equal(out, "Sources:\n\n[1] [First source](https://a.example/one)\n\n[2] https://b.example/two");
});

test("formatSourcesAppendix returns null when nothing is citable", () => {
  assert.equal(formatSourcesAppendix([]), null);
  assert.equal(formatSourcesAppendix([{ url: "", title: "x" }]), null);
});

test("extractOpenaiCitations reads url_citation annotations", () => {
  const response = {
    choices: [{ message: { annotations: [
      { type: "url_citation", url_citation: { url: "https://a.example/one", title: "First", start_index: 0, end_index: 4 } },
      { type: "search_result" },
      { type: "url_citation", url_citation: { url: "https://b.example/two", title: "Second" } },
    ] } }],
  };
  assert.deepEqual(extractOpenaiCitations(response), [
    { url: "https://a.example/one", title: "First" },
    { url: "https://b.example/two", title: "Second" },
  ]);
});

test("extractOpenaiCitations returns nothing for non-search completions", () => {
  assert.deepEqual(extractOpenaiCitations({ choices: [{ message: { content: "Hi" } }] }), []);
});

test("extractGeminiCitations reads groundingChunks from the first candidate", () => {
  const response = {
    candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { uri: "https://redirect.example/a", title: "example-a.com" } },
      { web: { uri: "https://redirect.example/b" } },
      { content: "not a web chunk" },
    ] } }, { groundingMetadata: { groundingChunks: [{ web: { uri: "https://ignore/me" } }] } }],
  };
  assert.deepEqual(extractGeminiCitations(response), [
    { url: "https://redirect.example/a", title: "example-a.com" },
    { url: "https://redirect.example/b", title: null },
  ]);
});

test("extractAnthropicCitations prefers text-block citations over tool results", () => {
  const response = {
    content: [
      { type: "web_search_tool_result", content: [
        { type: "web_search_result", url: "https://raw.example/one", title: "Raw" },
      ] },
      { type: "text", text: "part one", citations: [{ type: "web_search_result_location", url: "https://cited.example/one", title: "Cited" }] },
      { type: "text", text: "part two", citations: [{ type: "web_search_result_location", url: "https://cited.example/two", title: "Cited two" }] },
      { type: "web_search_tool_result", content: [] },
    ],
  };
  assert.deepEqual(extractAnthropicCitations(response), [
    { url: "https://cited.example/one", title: "Cited" },
    { url: "https://cited.example/two", title: "Cited two" },
  ]);
});

test("extractAnthropicCitations falls back to tool result blocks when text has no citations", () => {
  const response = {
    content: [
      { type: "web_search_tool_result", content: [
        { type: "web_search_result", url: "https://raw.example/one", title: "Raw one" },
        { type: "web_search_result_error" },
      ] },
      { type: "text", text: "no citations here" },
    ],
  };
  assert.deepEqual(extractAnthropicCitations(response), [
    { url: "https://raw.example/one", title: "Raw one" },
  ]);
});
