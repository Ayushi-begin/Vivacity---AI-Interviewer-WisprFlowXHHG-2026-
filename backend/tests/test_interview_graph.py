"""Unit tests for the graph helpers and prompt files (no HTTP, no database)."""
from pathlib import Path

import pytest

from app.agents import prompts
from app.agents.interview_graph import weak_areas_from

PROMPT_VALUES = {
    "question_generation": dict(role="R", company="C", question_count=3, resume_text="T"),
    "answer_evaluation": dict(
        role="R", company="C", question="Q", topic="T", what_it_tests="W", resume_text="T", answer="A"
    ),
    "roadmap": dict(role="R", company="C", weak_areas="- X", results="..."),
}


@pytest.mark.parametrize("name", sorted(PROMPT_VALUES))
def test_every_prompt_renders_with_its_placeholders(name: str) -> None:
    system, user = prompts.render(name, **PROMPT_VALUES[name])
    assert "$" not in system and "$" not in user


def test_every_prompt_file_is_used() -> None:
    files = {p.name.split(".")[0] for p in Path(prompts.__file__).parent.glob("*.md")}
    assert files == set(PROMPT_VALUES)


def test_missing_placeholder_fails_loudly() -> None:
    with pytest.raises(KeyError):
        prompts.render("roadmap", role="R")


def test_user_text_is_not_treated_as_a_template() -> None:
    _, user = prompts.render(
        "question_generation", role="R", company="C", question_count=3, resume_text="cost $role ${company}"
    )
    assert "cost $role ${company}" in user


def test_weak_areas_low_scores_first_then_weak_topics_deduplicated() -> None:
    questions = [{"topic": "Python"}, {"topic": "System Design"}, {"topic": "SQL"}]
    evaluations = [
        {"score": 9, "weak_topics": ["sql"]},
        {"score": 6, "weak_topics": ["Caching", "system  design"]},
        {"score": 2, "weak_topics": ["Indexing"]},
    ]
    assert weak_areas_from(questions, evaluations) == ["System Design", "SQL", "Caching", "Indexing"]


def test_weak_areas_are_capped_keeping_low_score_topics_first() -> None:
    questions = [{"topic": "A"}, {"topic": "B"}, {"topic": "C"}]
    evaluations = [
        {"score": 1, "weak_topics": ["X1", "X2", "X3"]},
        {"score": 2, "weak_topics": ["Y1", "Y2", "Y3"]},
        {"score": 3, "weak_topics": ["Z1", "Z2", "Z3"]},
    ]
    assert weak_areas_from(questions, evaluations) == ["A", "B", "C", "X1", "X2", "X3"]


def test_weak_areas_empty_when_everything_is_strong() -> None:
    questions = [{"topic": "Python"}]
    assert weak_areas_from(questions, [{"score": 7, "weak_topics": []}]) == []
