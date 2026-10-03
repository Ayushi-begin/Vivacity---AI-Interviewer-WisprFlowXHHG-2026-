from typing import Protocol, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """The model call failed or returned output that didn't match the schema."""


class StructuredLLM(Protocol):
    """What the graph needs from a model. Tests pass a fake that returns canned objects."""

    async def generate(self, schema: type[T], *, system: str, user: str) -> T: ...


class OpenAIStructuredLLM:
    def __init__(self, *, api_key: str, model: str) -> None:
        self._chat = ChatOpenAI(model=model, api_key=api_key, timeout=90, max_retries=2)

    async def generate(self, schema: type[T], *, system: str, user: str) -> T:
        runnable = self._chat.with_structured_output(schema, method="json_schema", strict=True)
        try:
            result = await runnable.ainvoke(
                [SystemMessage(content=system), HumanMessage(content=user)]
            )
        except Exception as exc:  # network, rate limit, refusal, schema mismatch
            raise LLMError(f"{schema.__name__} generation failed") from exc
        if not isinstance(result, schema):
            raise LLMError(f"{schema.__name__} generation returned no result")
        return result
