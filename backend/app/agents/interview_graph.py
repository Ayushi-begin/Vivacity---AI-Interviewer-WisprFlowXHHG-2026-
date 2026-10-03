"""The interview as a LangGraph state machine.

    START → generate_questions → collect_answer ⟲ (×3, pauses for each answer)
          → evaluate_answers → build_roadmap → END

`collect_answer` pauses with `interrupt()`. The service resumes it with
`Command(resume=<answer text>)`. Every step is checkpointed under
thread_id = interview id, so an interview survives restarts. If a step fails, the
service retries it with `ainvoke(None)`.

Nodes never touch the database. The service copies results into SQL tables.
"""
import asyncio
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import interrupt

from app.agents import prompts
from app.agents.llm import LLMError, StructuredLLM
from app.agents.schemas import AnswerEvaluation, QuestionSet, StudyRoadmap
from app.agents.state import InterviewState

QUESTION_COUNT = 3
MAX_RESUME_CHARS = 15_000
# Answers scoring below this mark their question's topic as a weak area.
WEAK_SCORE_THRESHOLD = 7
# Enough for a focused roadmap. Each evaluation can add up to 3 more topics.
MAX_WEAK_AREAS = 6


def _clean_topic(topic: str) -> str:
    return " ".join(topic.split())[:100]


def weak_areas_from(questions: list[dict[str, Any]], evaluations: list[dict[str, Any]]) -> list[str]:
    """Low-scoring question topics first, then the evaluator's weak topics, de-duplicated
    and capped at MAX_WEAK_AREAS."""
    seen: set[str] = set()
    ordered: list[str] = []

    def add(topic: str) -> None:
        topic = _clean_topic(topic)
        if topic and topic.lower() not in seen:
            seen.add(topic.lower())
            ordered.append(topic)

    for question, evaluation in zip(questions, evaluations, strict=True):
        if evaluation["score"] < WEAK_SCORE_THRESHOLD:
            add(question["topic"])
    for evaluation in evaluations:
        for topic in evaluation["weak_topics"]:
            add(topic)
    return ordered[:MAX_WEAK_AREAS]


def build_interview_graph(
    llm: StructuredLLM, checkpointer: BaseCheckpointSaver
) -> CompiledStateGraph:
    async def generate_questions(state: InterviewState) -> InterviewState:
        system, user = prompts.render(
            "question_generation",
            role=state["role"],
            company=state["company"],
            question_count=QUESTION_COUNT,
            resume_text=state["resume_text"][:MAX_RESUME_CHARS],
        )
        result = await llm.generate(QuestionSet, system=system, user=user)
        if len(result.questions) < QUESTION_COUNT:
            raise LLMError(f"Expected {QUESTION_COUNT} questions, got {len(result.questions)}")
        questions = [
            {**q.model_dump(), "topic": _clean_topic(q.topic) or "General"}
            for q in result.questions[:QUESTION_COUNT]
        ]
        return {"questions": questions, "answers": []}

    def collect_answer(state: InterviewState) -> InterviewState:
        answers = state.get("answers", [])
        position = len(answers) + 1
        answer = interrupt(
            {"position": position, "question": state["questions"][position - 1]["question"]}
        )
        return {"answers": [*answers, str(answer)]}

    def after_answer(state: InterviewState) -> str:
        if len(state["answers"]) < len(state["questions"]):
            return "collect_answer"
        return "evaluate_answers"

    async def evaluate_answers(state: InterviewState) -> InterviewState:
        async def evaluate(question: dict[str, Any], answer: str) -> dict[str, Any]:
            system, user = prompts.render(
                "answer_evaluation",
                role=state["role"],
                company=state["company"],
                question=question["question"],
                topic=question["topic"],
                what_it_tests=question["what_it_tests"],
                resume_text=state["resume_text"][:MAX_RESUME_CHARS],
                answer=answer,
            )
            result = await llm.generate(AnswerEvaluation, system=system, user=user)
            data = result.model_dump()
            data["score"] = max(0, min(10, result.score))
            data["weak_topics"] = [t for t in map(_clean_topic, result.weak_topics) if t][:3]
            return data

        evaluations = list(
            await asyncio.gather(
                *(evaluate(q, a) for q, a in zip(state["questions"], state["answers"], strict=True))
            )
        )
        return {
            "evaluations": evaluations,
            "weak_areas": weak_areas_from(state["questions"], evaluations),
        }

    async def build_roadmap(state: InterviewState) -> InterviewState:
        results = "\n\n".join(
            f"Q{i}. [{q['topic']}] {q['question']}\n"
            f"Score: {e['score']}/10\n"
            f"What was missing: {e['what_was_missing']}"
            for i, (q, e) in enumerate(zip(state["questions"], state["evaluations"], strict=True), 1)
        )
        system, user = prompts.render(
            "roadmap",
            role=state["role"],
            company=state["company"],
            weak_areas="\n".join(f"- {t}" for t in state["weak_areas"]) or "(none)",
            results=results,
        )
        result = await llm.generate(StudyRoadmap, system=system, user=user)
        roadmap = result.model_dump()
        for item in roadmap["items"]:
            item["topic"] = _clean_topic(item["topic"])
            item["estimated_hours"] = max(1, min(200, item["estimated_hours"]))
        return {"roadmap": roadmap}

    graph = StateGraph(InterviewState)
    graph.add_node("generate_questions", generate_questions)
    graph.add_node("collect_answer", collect_answer)
    graph.add_node("evaluate_answers", evaluate_answers)
    graph.add_node("build_roadmap", build_roadmap)

    graph.add_edge(START, "generate_questions")
    graph.add_edge("generate_questions", "collect_answer")
    graph.add_conditional_edges(
        "collect_answer", after_answer, ["collect_answer", "evaluate_answers"]
    )
    graph.add_edge("evaluate_answers", "build_roadmap")
    graph.add_edge("build_roadmap", END)
    return graph.compile(checkpointer=checkpointer)
