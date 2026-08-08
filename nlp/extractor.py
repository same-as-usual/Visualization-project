"""Skill extraction: spaCy PhraseMatcher over a versioned taxonomy.

Why PhraseMatcher and not an LLM/NER model (see plan, ADR-worthy):
auditable (every match traces to a taxonomy line + char span), regression-
testable (frozen gold set in CI), free, and fast enough to re-extract the
entire raw zone whenever the taxonomy version bumps.

False-positive control is a CASE + CONTEXT problem, not just word boundaries:
  - plain           : case-insensitive token match ("python", "PYTHON")
  - case_sensitive  : exact-case token match — "Excel" the tool, not "excel at"
  - context_required: exact-case AND a context regex must cover the mention —
                      "R programming" yes, "R&D" tokenized apart / plain "R" no.

Every result is stamped with (taxonomy_version, extractor_version) so
posting_skills rows are reproducible.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path

import spacy
import yaml
from spacy.matcher import PhraseMatcher

EXTRACTOR_VERSION = "0.1.0"
DEFAULT_TAXONOMY = Path(__file__).parent / "taxonomy" / "skills.yaml"

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\r\f\v]+")


def strip_html(text: str) -> str:
    """Remotive descriptions are HTML; Adzuna excerpts are plain text."""
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text)


@dataclass(frozen=True)
class SkillDef:
    name: str
    category: str
    match_policy: str  # plain | case_sensitive | context_required
    aliases: tuple[str, ...]
    context_patterns: tuple[re.Pattern, ...]
    esco_uri: str | None = None


@dataclass(frozen=True)
class SkillMention:
    skill: str
    category: str
    matched_alias: str
    start: int  # char offset in the (html-stripped) text
    end: int
    taxonomy_version: str
    extractor_version: str = EXTRACTOR_VERSION


class SkillExtractor:
    def __init__(self, taxonomy_path: str | Path = DEFAULT_TAXONOMY):
        with open(taxonomy_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f)
        self.taxonomy_version: str = str(raw["version"])
        self.skills: dict[str, SkillDef] = {}
        for entry in raw["skills"]:
            policy = entry.get("match_policy", "plain")
            if policy not in ("plain", "case_sensitive", "context_required"):
                raise ValueError(f"{entry['name']}: unknown match_policy {policy!r}")
            patterns = tuple(
                re.compile(p) for p in entry.get("context_patterns", [])
            )
            if policy == "context_required" and not patterns:
                raise ValueError(f"{entry['name']}: context_required needs context_patterns")
            sd = SkillDef(
                name=entry["name"],
                category=entry.get("category", "uncategorized"),
                match_policy=policy,
                aliases=tuple(entry.get("aliases", [])),
                context_patterns=patterns,
                esco_uri=entry.get("esco_uri"),
            )
            if sd.name in self.skills:
                raise ValueError(f"duplicate skill: {sd.name}")
            self.skills[sd.name] = sd

        self.nlp = spacy.blank("en")
        # Two matchers: LOWER for plain skills, ORTH for exact-case skills.
        self._lower = PhraseMatcher(self.nlp.vocab, attr="LOWER")
        self._orth = PhraseMatcher(self.nlp.vocab, attr="ORTH")
        for sd in self.skills.values():
            surfaces = [sd.name, *sd.aliases]
            docs = [self.nlp.make_doc(s) for s in surfaces]
            (self._lower if sd.match_policy == "plain" else self._orth).add(sd.name, docs)

    def extract(self, text: str, *, is_html: bool = False) -> list[SkillMention]:
        """Return one mention per skill (first occurrence) found in `text`."""
        if is_html:
            text = strip_html(text)
        doc = self.nlp.make_doc(text)
        candidates: list[tuple[SkillDef, int, int]] = []
        for matcher in (self._lower, self._orth):
            for match_id, start_tok, end_tok in matcher(doc):
                sd = self.skills[self.nlp.vocab.strings[match_id]]
                span = doc[start_tok:end_tok]
                candidates.append((sd, span.start_char, span.end_char))

        mentions: dict[str, SkillMention] = {}
        for sd, start, end in sorted(candidates, key=lambda c: c[1]):
            if sd.name in mentions:
                continue  # keep first occurrence only
            if sd.match_policy == "context_required" and not self._context_ok(
                sd, text, start, end
            ):
                continue
            mentions[sd.name] = SkillMention(
                skill=sd.name,
                category=sd.category,
                matched_alias=text[start:end],
                start=start,
                end=end,
                taxonomy_version=self.taxonomy_version,
            )
        return sorted(mentions.values(), key=lambda m: m.start)

    @staticmethod
    def _context_ok(sd: SkillDef, text: str, start: int, end: int) -> bool:
        """A context pattern must MATCH OVER the mention (not merely appear
        somewhere in the document) — 'in R' elsewhere must not validate an
        unrelated bare 'R'. Unambiguous aliases self-validate via patterns
        that cover their own surface form (e.g. Golang)."""
        for pat in sd.context_patterns:
            for m in pat.finditer(text):
                if m.start() <= start and m.end() >= end:
                    return True
        return False
