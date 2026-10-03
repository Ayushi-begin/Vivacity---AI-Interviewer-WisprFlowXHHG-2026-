"""Test doubles: a scripted LLM and a minimal real PDF builder."""
import re
from dataclasses import dataclass, field
from typing import Any

from app.agents.llm import LLMError
from app.agents.schemas import (
    AnswerEvaluation,
    GeneratedQuestion,
    QuestionSet,
    RoadmapItem,
    StudyRoadmap,
)

TOPICS = ["Python", "System Design", "SQL"]


@dataclass
class FakeLLM:
    """Returns canned structured output and records every prompt.

    - `scores`: score per question topic (evaluations run in parallel, so they're keyed by topic).
    - `fail_on`: schema names that raise LLMError, to simulate outages.
    """

    scores: dict[str, int] = field(default_factory=lambda: {"Python": 8, "System Design": 5, "SQL": 3})
    weak_topics: dict[str, list[str]] = field(default_factory=lambda: {"SQL": ["Indexing"]})
    fail_on: set[str] = field(default_factory=set)
    calls: list[dict[str, Any]] = field(default_factory=list)

    def count(self, schema_name: str) -> int:
        return sum(1 for c in self.calls if c["schema"] == schema_name)

    async def generate(self, schema, *, system: str, user: str):
        self.calls.append({"schema": schema.__name__, "system": system, "user": user})
        if schema.__name__ in self.fail_on:
            raise LLMError(f"{schema.__name__} unavailable")

        if schema is QuestionSet:
            return QuestionSet(
                questions=[
                    GeneratedQuestion(
                        question=f"Tell me about your {topic} experience in depth.",
                        topic=topic,
                        what_it_tests=f"Depth in {topic}",
                    )
                    for topic in TOPICS
                ]
            )

        if schema is AnswerEvaluation:
            topic = re.search(r'<question topic="([^"]+)">', user).group(1)
            return AnswerEvaluation(
                score=self.scores[topic],
                what_was_good=f"Good points on {topic}",
                what_was_missing=f"Missing depth on {topic}",
                better_answer=f"A stronger {topic} answer",
                weak_topics=self.weak_topics.get(topic, []),
            )

        if schema is StudyRoadmap:
            block = re.search(r"<weak_areas>\n(.*?)\n</weak_areas>", user, re.S).group(1)
            topics = [line.removeprefix("- ") for line in block.splitlines() if line.startswith("- ")]
            return StudyRoadmap(
                summary="Focus on the weak areas.",
                items=[
                    RoadmapItem(
                        topic=t,
                        priority="high",
                        why=f"Scored low on {t}",
                        study_steps=[f"Study {t}", f"Practise {t}"],
                        resources=[f"{t} official docs"],
                        estimated_hours=10,
                    )
                    for t in topics
                ],
            )
        raise AssertionError(f"Unexpected schema {schema}")


RESUME_LINES = [
    "Ada Lovelace - Senior Backend Engineer",
    "Experience: Built a payments platform in Python and FastAPI serving 2M users.",
    "Designed a sharded PostgreSQL cluster and cut p99 latency by 40 percent.",
    "Skills: Python, SQL, System Design, Kubernetes, Redis.",
]


def make_pdf(lines: list[str] = RESUME_LINES) -> bytes:
    """Build a small but valid single-page PDF with real extractable text."""

    def escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    content = "BT /F1 11 Tf 72 720 Td 16 TL " + " ".join(f"({escape(l)}) Tj T*" for l in lines) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode()
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return out
