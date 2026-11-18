# Fixtures

- `ollama-*.json|sse`: gravados de verdade do Ollama local (qwen3.5:4b) em 2026-11-18 via `curl` (endpoints OpenAI-compatible `/v1/chat/completions` e `/v1/responses`).
- `openai-*.json|sse` e `anthropic-*.json|sse`: payloads no formato documentado pelos provedores (sem chave de API real neste ambiente). IDs e números são sintéticos; os nomes de campos seguem docs/research/providers-codex-pricing.md.
