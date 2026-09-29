import json
import re

from app.config import settings
from app.models import Priority
from app.schemas import (
    ArchitectureSuggestion,
    ArchNodeSuggestion,
    BRDGenerateResponse,
    BRDSections,
    TaskSuggestion,
)

# The first real implementation of the AI_PROVIDER abstraction the PRD names
# (§6.9/§8) — only the config flag existed before this. "mock" is deterministic
# and needs no API key; it's what Phase 2 verification exercises end-to-end.
# "anthropic"/"gemini" make a real call, gated on their respective API key being
# configured. Every AI-assisted feature added later (BRD summarization, feedback
# categorization, ...) should dispatch through this same settings.ai_provider
# switch rather than picking a provider for itself.


def suggest_tasks_from_brd(sections: BRDSections) -> list[TaskSuggestion]:
    if settings.ai_provider == "mock":
        return _mock_suggest(sections)
    if settings.ai_provider == "anthropic":
        return _anthropic_suggest(sections)
    if settings.ai_provider == "gemini":
        return _gemini_suggest(sections)
    raise NotImplementedError(
        f"AI_PROVIDER={settings.ai_provider!r} is not implemented yet — use 'mock', 'anthropic', or 'gemini'"
    )


_LINE_SPLIT = re.compile(r"\r?\n+")
_BULLET_PREFIX = re.compile(r"^[\s\-*•\d.)]+")


def _lines_from_section(text: str) -> list[str]:
    lines = []
    for raw in _LINE_SPLIT.split(text or ""):
        line = _BULLET_PREFIX.sub("", raw).strip()
        if line:
            lines.append(line)
    return lines


def _mock_suggest(sections: BRDSections) -> list[TaskSuggestion]:
    suggestions: list[TaskSuggestion] = []
    for section_key, section_text in (
        ("requirements", sections.requirements),
        ("acceptance_criteria", sections.acceptance_criteria),
    ):
        for line in _lines_from_section(section_text):
            suggestions.append(TaskSuggestion(title=line[:200], brd_section=section_key, priority=Priority.MEDIUM))
    return suggestions


_TASK_BREAKDOWN_PROMPT = """You are helping a product manager break an approved BRD into engineering tasks.

Objective:
{objective}

Scope:
{scope}

Requirements:
{requirements}

Acceptance criteria:
{acceptance_criteria}

Propose a concise list of engineering tasks that implement this BRD. Respond with ONLY a JSON array
(no prose, no markdown fences) of objects with keys: "title" (string), "description" (string, optional),
"brd_section" (one of "objective", "scope", "requirements", "acceptance_criteria"), and "priority"
(one of "LOW", "MEDIUM", "HIGH", "CRITICAL")."""

_CODE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _prompt_for(sections: BRDSections) -> str:
    return _TASK_BREAKDOWN_PROMPT.format(
        objective=sections.objective, scope=sections.scope,
        requirements=sections.requirements, acceptance_criteria=sections.acceptance_criteria,
    )


def _parse_suggestions(raw_text: str, provider: str) -> list[TaskSuggestion]:
    cleaned = _CODE_FENCE.sub("", raw_text.strip())
    try:
        items = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{provider} response was not valid JSON — could not parse task suggestions") from exc
    return [TaskSuggestion(**item) for item in items]


def _anthropic_suggest(sections: BRDSections) -> list[TaskSuggestion]:
    api_key = settings.anthropic_api_key
    if not api_key:
        raise RuntimeError("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set")

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=settings.ai_model or "claude-sonnet-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": _prompt_for(sections)}],
    )
    raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
    return _parse_suggestions(raw_text, "Anthropic")


def _gemini_suggest(sections: BRDSections) -> list[TaskSuggestion]:
    api_key = settings.gemini_api_key
    if not api_key:
        raise RuntimeError("AI_PROVIDER=gemini requires GEMINI_API_KEY to be set")

    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=settings.ai_model or "gemini-2.5-flash",
        contents=_prompt_for(sections),
    )
    raw_text = response.text or ""
    return _parse_suggestions(raw_text, "Gemini")


# --- Architecture board generation (Planning workspace's "Generate with AI" wizard) ---
#
# Same settings.ai_provider dispatch as suggest_tasks_from_brd above. The
# model only proposes graph *structure* — see ArchitectureSuggestion's
# docstring in schemas.py for why positions are computed by the caller
# (app/routers/workspace.py's auto-layout), not asked of the model.


def generate_architecture(prompt: str, brd_context: str | None) -> ArchitectureSuggestion:
    if settings.ai_provider == "mock":
        return _mock_architecture(prompt, brd_context)
    if settings.ai_provider == "anthropic":
        return _anthropic_architecture(prompt, brd_context)
    if settings.ai_provider == "gemini":
        return _gemini_architecture(prompt, brd_context)
    raise NotImplementedError(
        f"AI_PROVIDER={settings.ai_provider!r} is not implemented yet — use 'mock', 'anthropic', or 'gemini'"
    )


# Deterministic keyword-based generator — needs no API key, so it's what's
# actually exercised end-to-end in this dev environment (same role
# _mock_suggest plays for task suggestions). Always emits a sensible baseline
# pipeline, then layers in optional components the prompt/BRD text hints at.
def _mock_architecture(prompt: str, brd_context: str | None) -> ArchitectureSuggestion:
    text = f"{prompt}\n{brd_context or ''}".lower()

    def mentions(*words: str) -> bool:
        return any(w in text for w in words)

    nodes: list[ArchNodeSuggestion] = [
        ArchNodeSuggestion(key="client", label="Client", category="CLIENT"),
        ArchNodeSuggestion(key="gateway", label="API Gateway", category="API_GATEWAY"),
        ArchNodeSuggestion(key="service", label="Application Service", category="SERVICE"),
        ArchNodeSuggestion(key="database", label="Database", category="DATABASE"),
    ]
    edges = [
        {"source": "client", "target": "gateway", "kind": "SYNC", "label": "requests"},
        {"source": "gateway", "target": "service", "kind": "SYNC", "label": "routes"},
        {"source": "service", "target": "database", "kind": "SYNC", "label": "reads/writes"},
    ]

    if mentions("load balanc"):
        nodes.append(ArchNodeSuggestion(key="lb", label="Load Balancer", category="LOAD_BALANCER"))
        edges[0] = {"source": "client", "target": "lb", "kind": "SYNC", "label": "requests"}
        edges.append({"source": "lb", "target": "gateway", "kind": "SYNC", "label": "distributes"})

    if mentions("cache", "redis"):
        nodes.append(ArchNodeSuggestion(key="cache", label="Cache", category="CACHE"))
        edges.append({"source": "service", "target": "cache", "kind": "SYNC", "label": "cache lookup"})

    if mentions("queue", "async", "event", "kafka", "rabbitmq", "background job"):
        nodes.append(ArchNodeSuggestion(key="queue", label="Message Queue", category="QUEUE"))
        edges.append({"source": "service", "target": "queue", "kind": "ASYNC", "label": "publishes"})

    if mentions("ai", "llm", "model", "gpt", "claude", "gemini", "machine learning"):
        nodes.append(ArchNodeSuggestion(key="ai_model", label="AI Model", category="AI_MODEL"))
        edges.append({"source": "service", "target": "ai_model", "kind": "SYNC", "label": "inference"})

    if mentions("auth", "login", "sso", "oauth"):
        nodes.append(ArchNodeSuggestion(key="auth", label="Auth / Identity", category="AUTH"))
        edges.append({"source": "gateway", "target": "auth", "kind": "SYNC", "label": "authenticates"})

    if mentions("storage", "s3", "blob", "file upload", "upload"):
        nodes.append(ArchNodeSuggestion(key="storage", label="Object Storage", category="STORAGE"))
        edges.append({"source": "service", "target": "storage", "kind": "DATA", "label": "stores files"})

    if mentions("cdn", "static asset"):
        nodes.append(ArchNodeSuggestion(key="cdn", label="CDN", category="CDN"))
        edges.append({"source": "cdn", "target": "client", "kind": "DATA", "label": "serves assets"})

    if mentions("third party", "external api", "integration", "payment", "stripe", "webhook"):
        nodes.append(ArchNodeSuggestion(key="external", label="External API", category="EXTERNAL_API"))
        edges.append({"source": "service", "target": "external", "kind": "SYNC", "label": "calls"})

    return ArchitectureSuggestion(nodes=nodes, edges=edges)


_ARCHITECTURE_PROMPT = """You are a software architect helping a product manager sketch a system architecture diagram.

{brd_section}Request: {prompt}

Propose a small, sensible set of architecture components and how they connect. Respond with ONLY a JSON
object (no prose, no markdown fences) shaped like:
{{"nodes": [{{"key": "short_id", "label": "Display name", "category": "ONE_OF_THE_CATEGORIES", "description": "optional one-line note"}}],
 "edges": [{{"source": "key", "target": "key", "kind": "SYNC|ASYNC|DATA", "label": "optional short label"}}]}}

Valid categories: CLIENT, API_GATEWAY, SERVICE, DATABASE, CACHE, QUEUE, EXTERNAL_API, AI_MODEL, STORAGE,
CDN, LOAD_BALANCER, AUTH, CUSTOM. Keep it to 4-10 nodes — a readable sketch, not an exhaustive inventory."""


def _architecture_prompt(prompt: str, brd_context: str | None) -> str:
    brd_section = f"Relevant BRD context:\n{brd_context}\n\n" if brd_context else ""
    return _ARCHITECTURE_PROMPT.format(brd_section=brd_section, prompt=prompt)


def _parse_architecture(raw_text: str, provider: str) -> ArchitectureSuggestion:
    cleaned = _CODE_FENCE.sub("", raw_text.strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{provider} response was not valid JSON — could not parse an architecture") from exc
    return ArchitectureSuggestion(**data)


def _anthropic_architecture(prompt: str, brd_context: str | None) -> ArchitectureSuggestion:
    api_key = settings.anthropic_api_key
    if not api_key:
        raise RuntimeError("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set")

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=settings.ai_model or "claude-sonnet-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": _architecture_prompt(prompt, brd_context)}],
    )
    raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
    return _parse_architecture(raw_text, "Anthropic")


def _gemini_architecture(prompt: str, brd_context: str | None) -> ArchitectureSuggestion:
    api_key = settings.gemini_api_key
    if not api_key:
        raise RuntimeError("AI_PROVIDER=gemini requires GEMINI_API_KEY to be set")

    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=settings.ai_model or "gemini-2.5-flash",
        contents=_architecture_prompt(prompt, brd_context),
    )
    raw_text = response.text or ""
    return _parse_architecture(raw_text, "Gemini")


# --- BRD generation (BRD page's "Generate with AI" prompt) ---
#
# Same settings.ai_provider dispatch as the two generators above. Fills the
# same BRDSections shape the manual authoring form uses (app/routers/brd.py's
# _sections_to_json/_json_to_sections), so the result drops straight into the
# existing draft-then-review form — generation never bypasses the normal
# draft/submit/approve workflow, it just gives the PM a starting point.


def generate_brd(prompt: str) -> BRDGenerateResponse:
    if settings.ai_provider == "mock":
        return _mock_brd(prompt)
    if settings.ai_provider == "anthropic":
        return _anthropic_brd(prompt)
    if settings.ai_provider == "gemini":
        return _gemini_brd(prompt)
    raise NotImplementedError(
        f"AI_PROVIDER={settings.ai_provider!r} is not implemented yet — use 'mock', 'anthropic', or 'gemini'"
    )


_TITLE_WORD_LIMIT = 8


def _mock_brd(prompt: str) -> BRDGenerateResponse:
    clean = " ".join(prompt.split())
    words = clean.split(" ") if clean else []
    title = " ".join(words[:_TITLE_WORD_LIMIT]).rstrip(".,;:") or "New Product Requirements"
    title = title[0].upper() + title[1:] if title else title
    lower_clean = (clean[0].lower() + clean[1:]) if clean else "the requested capability"

    sections = BRDSections(
        objective=f"Deliver {lower_clean}.",
        scope=(
            f"In scope: the core functionality needed to {lower_clean}.\n"
            "Out of scope: anything not explicitly listed under Requirements below — call those out "
            "separately if they turn out to be needed."
        ),
        requirements=(
            f"- Implement the core flow described: {clean}\n"
            "- Handle expected edge cases and invalid input gracefully\n"
            "- Meet this product's existing security and performance bar"
        ),
        acceptance_criteria=(
            "- A user can complete the primary flow described above end to end\n"
            "- Edge cases and error states behave as specified in Requirements\n"
            "- Changes are verified in a real environment before release"
        ),
    )
    return BRDGenerateResponse(title=title, sections=sections)


_BRD_PROMPT = """You are helping a product manager draft a Business Requirements Document (BRD) from a short description.

Request: {prompt}

Respond with ONLY a JSON object (no prose, no markdown fences) shaped like:
{{"title": "Short BRD title", "sections": {{"objective": "...", "scope": "...", "requirements": "...", "acceptance_criteria": "..."}}}}

"requirements" and "acceptance_criteria" should each be a short newline-separated bulleted list (use "- " prefixes).
Keep it concise and concrete — this is a starting draft the PM will edit, not a final document."""


def _parse_brd(raw_text: str, provider: str) -> BRDGenerateResponse:
    cleaned = _CODE_FENCE.sub("", raw_text.strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{provider} response was not valid JSON — could not parse a BRD draft") from exc
    return BRDGenerateResponse(**data)


def _anthropic_brd(prompt: str) -> BRDGenerateResponse:
    api_key = settings.anthropic_api_key
    if not api_key:
        raise RuntimeError("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set")

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=settings.ai_model or "claude-sonnet-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": _BRD_PROMPT.format(prompt=prompt)}],
    )
    raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
    return _parse_brd(raw_text, "Anthropic")


def _gemini_brd(prompt: str) -> BRDGenerateResponse:
    api_key = settings.gemini_api_key
    if not api_key:
        raise RuntimeError("AI_PROVIDER=gemini requires GEMINI_API_KEY to be set")

    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=settings.ai_model or "gemini-2.5-flash",
        contents=_BRD_PROMPT.format(prompt=prompt),
    )
    raw_text = response.text or ""
    return _parse_brd(raw_text, "Gemini")
