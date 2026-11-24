"""plsql-lint: a fast, dependency-free linter for Oracle SQL and PL/SQL."""

__version__ = "0.2.0"

from .linter import Config, lint_files, lint_text  # noqa: E402
from .rules import RULES, Finding, Severity  # noqa: E402

__all__ = ["Config", "Finding", "RULES", "Severity", "lint_files", "lint_text", "__version__"]
