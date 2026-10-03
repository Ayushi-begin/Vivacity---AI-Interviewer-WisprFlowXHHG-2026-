"""Prompt templates live next to this file as editable Markdown.

Each step has `<name>.system.md` and `<name>.user.md`. Placeholders use `$name`
syntax (string.Template), so literal braces and JSON examples need no escaping.
A missing placeholder value raises immediately instead of sending a broken prompt.

Untrusted text (resumes, answers) is wrapped in tags like `<resume>…</resume>`. So
that it can't close those tags early and smuggle instructions outside them, any
delimiter tag found inside a value is defanged before substitution.
"""
import re
from functools import cache
from pathlib import Path
from string import Template

_DIR = Path(__file__).parent
_TAG = re.compile(r"</?([a-z_]+)[\s>]")


@cache
def _template(filename: str) -> Template:
    return Template((_DIR / filename).read_text(encoding="utf-8"))


@cache
def _delimiter_pattern(name: str) -> re.Pattern[str] | None:
    tags = {
        tag
        for kind in ("system", "user")
        for tag in _TAG.findall(_template(f"{name}.{kind}.md").template)
    }
    if not tags:
        return None
    return re.compile(rf"<(\s*/?\s*)({'|'.join(sorted(tags))})\b", re.IGNORECASE)


def _defang(value: str, pattern: re.Pattern[str] | None) -> str:
    # "</resume>" becomes "‹/resume>": still readable, but no longer a delimiter.
    return pattern.sub(r"‹\1\2", value) if pattern else value


def render(name: str, **values: object) -> tuple[str, str]:
    """Return (system, user) prompts for the step `name`."""
    pattern = _delimiter_pattern(name)
    text_values = {k: _defang(str(v), pattern) for k, v in values.items()}
    system = _template(f"{name}.system.md").substitute(text_values)
    user = _template(f"{name}.user.md").substitute(text_values)
    return system, user
