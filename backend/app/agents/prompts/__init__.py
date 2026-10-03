"""Prompt templates live next to this file as editable Markdown.

Each step has `<name>.system.md` and `<name>.user.md`. Placeholders use `$name`
syntax (string.Template), so literal braces and JSON examples need no escaping.
A missing placeholder value raises immediately instead of sending a broken prompt.
"""
from functools import cache
from pathlib import Path
from string import Template

_DIR = Path(__file__).parent


@cache
def _template(filename: str) -> Template:
    return Template((_DIR / filename).read_text(encoding="utf-8"))


def render(name: str, **values: object) -> tuple[str, str]:
    """Return (system, user) prompts for the step `name`."""
    text_values = {k: str(v) for k, v in values.items()}
    system = _template(f"{name}.system.md").substitute(text_values)
    user = _template(f"{name}.user.md").substitute(text_values)
    return system, user
