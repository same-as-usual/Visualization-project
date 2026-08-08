"""Extractor behaviour tests — these pin the false-positive controls.

The gold-set precision gate (100-150 labeled postings) lands in Phase 2 proper;
these tests pin the *mechanics* the gold-set numbers will depend on.
"""

import pytest

from nlp.extractor import EXTRACTOR_VERSION, SkillExtractor, strip_html


@pytest.fixture(scope="module")
def ex():
    return SkillExtractor()


def names(mentions):
    return {m.skill for m in mentions}


# ── word boundaries ────────────────────────────────────────────────────────

def test_java_does_not_match_javascript(ex):
    found = names(ex.extract("We need strong JavaScript skills."))
    assert "JavaScript" in found
    assert "Java" not in found


def test_java_matches_java(ex):
    assert "Java" in names(ex.extract("Backend services written in Java and Spring Boot."))


# ── case sensitivity ───────────────────────────────────────────────────────

def test_excel_verb_not_matched(ex):
    assert "Excel" not in names(ex.extract("You will excel in a fast-paced team."))


def test_excel_tool_matched(ex):
    assert "Excel" in names(ex.extract("Advanced Excel and Power BI required."))


def test_go_needs_context(ex):
    assert "Go" not in names(ex.extract("Go to our website to apply. Go getters wanted."))
    assert "Go" in names(ex.extract("Services written in Go and Python."))
    assert "Go" in names(ex.extract("Experience with Golang microservices."))


def test_r_needs_context(ex):
    assert "R" not in names(ex.extract("Apply via our R portal."))
    assert "R" in names(ex.extract("Statistical analysis in R and Python."))
    assert "R" in names(ex.extract("Proficiency with R programming required."))


def test_context_must_cover_the_mention_not_just_the_document(ex):
    # "in R" validates the second R only; the bare first "R" must not free-ride.
    text = "R division. We model churn in R every quarter."
    mentions = [m for m in ex.extract(text) if m.skill == "R"]
    assert len(mentions) == 1
    assert mentions[0].start > text.index("churn")


# ── aliases ────────────────────────────────────────────────────────────────

def test_aliases_canonicalize(ex):
    found = names(ex.extract("Stack: Postgres, sklearn, PowerBI, ReactJS, K8s."))
    assert {"PostgreSQL", "scikit-learn", "Power BI", "React", "Kubernetes"} <= found


def test_matched_alias_preserved(ex):
    (m,) = [m for m in ex.extract("We use Postgres.") if m.skill == "PostgreSQL"]
    assert m.matched_alias == "Postgres"


# ── versioning & spans ─────────────────────────────────────────────────────

def test_mentions_are_version_stamped(ex):
    (m,) = ex.extract("Python required.")
    assert m.taxonomy_version == ex.taxonomy_version
    assert m.extractor_version == EXTRACTOR_VERSION


def test_char_spans_are_exact(ex):
    text = "Experience with Apache Spark pipelines."
    (m,) = [m for m in ex.extract(text) if m.skill == "Apache Spark"]
    assert text[m.start:m.end] == "Apache Spark"


def test_one_mention_per_skill_first_occurrence(ex):
    text = "Python, Python, and more Python."
    mentions = [m for m in ex.extract(text) if m.skill == "Python"]
    assert len(mentions) == 1
    assert mentions[0].start == 0


# ── html handling (Remotive full-text) ─────────────────────────────────────

def test_strip_html():
    assert strip_html("<p>SQL &amp; <b>dbt</b></p>").strip() == "SQL & dbt"


def test_extract_from_html(ex):
    html_text = "<ul><li>5+ years <strong>Python</strong></li><li>dbt &amp; Snowflake</li></ul>"
    found = names(ex.extract(html_text, is_html=True))
    assert {"Python", "dbt", "Snowflake"} <= found


def test_dbt_case_sensitive(ex):
    # "dbt"/"DBT" are listed surfaces; an unrelated capitalized word must not match plain-ly
    assert "dbt" in names(ex.extract("Transformations in dbt."))
    assert "dbt" not in names(ex.extract("Dbt is not a surface we accept."))


# ── taxonomy hygiene ───────────────────────────────────────────────────────

def test_taxonomy_loads_without_duplicates_and_valid_policies(ex):
    assert len(ex.skills) > 100
    for sd in ex.skills.values():
        assert sd.match_policy in ("plain", "case_sensitive", "context_required")
        if sd.match_policy == "context_required":
            assert sd.context_patterns
