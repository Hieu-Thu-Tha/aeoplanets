# OpenAI Search Model Migration

## Decision

Replace `gpt-4o-mini-search-preview` with `gpt-5-search-api` in the existing
Chat Completions integration.

OpenAI shut down the preview model on 2026-07-23. Its web search migration
guide identifies `gpt-5-search-api` as the supported replacement when an
existing Chat Completions integration must be preserved. The alternative,
and OpenAI's preferred path for new integrations, is the Responses API with
the `web_search` tool. That alternative changes the request and response
contract and is outside this minimal remediation.

The existing AEO Stars request remains compatible with `gpt-5-search-api`:

- Endpoint: Chat Completions
- Input: system and user messages
- Search: `web_search_options`
- Output: `choices[0].message.content`
- Output limit: `max_completion_tokens`

A live development smoke test returned a successful searched response from
`gpt-5-search-api-2025-10-14` with a URL citation annotation.

## Affected References

- `server/llm-runner.ts`: runtime request and usage attribution
- `server/routes.ts`: visibility-scan job reservation metadata
- `server/config/system-config-defaults.ts`: first-boot pricing default
- `migrations/0010_replace_openai_search_model.sql`: existing DB-backed pricing
  configuration

The pricing registry uses OpenAI's documented standard rates of $1.25 per
million input tokens, $0.125 per million cached input tokens, and $10.00 per
million output tokens. Web-search call charges are recorded as independently
priced meter entries described in `docs/08-ai-metered-usage.md`.

## Provider Failure Behavior

OpenAI is not a fallback for Anthropic. Full and term scans invoke OpenAI,
Anthropic, and Gemini concurrently and keep successful results when one
provider fails. Scheduled scans normally rotate one provider by weekday; a
failure of that selected provider returns no result and does not trigger a
cross-provider retry.

Regression tests cover failure isolation for both Anthropic and OpenAI in the
multi-provider path.

## Cross-Product Assessment

Repository and GitHub organization searches found the deprecated model only
in `AEOStars/Aeostarsinsight`. That is the only repository visible in the
`AEOStars` organization to the investigating account. No shared cross-product
usage was found in the available scope, so no broader product escalation is
currently required. Product owners should confirm whether private repositories
or infrastructure outside that organization use the same model before closing
the cross-product review.

## Deployment Verification

After deploying and running migration `0010`, trigger an AEO Stars visibility
scan in staging with Anthropic unavailable. Verify that the OpenAI result is
stored, the log contains no deprecated-model 404, and successful Gemini/OpenAI
results remain available despite the Anthropic failure.

Sources:

- https://platform.openai.com/docs/deprecations
- https://platform.openai.com/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/pricing
