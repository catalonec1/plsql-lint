# ORA Error Helper (JetBrains plugin)

Explains Oracle ORA-, PLS- and TNS- errors inside any JetBrains IDE: cause and fix, offline.

- `core/` - catalogue (`errors.tsv`: code, F/P free or Pro, title, cause, fix), scanner, HTML. Plain Java, tested with `./gradlew -p core test`.
- `src/` - IDE integration: *Explain Oracle Error* action (editor + console context menu, Tools menu), *ORA Errors* tool window, Pro licensing (product code `PCATORAHLP`).
- Build and Plugin Verifier run in GitHub Actions (`.github/workflows/jetbrains-more-plugins.yml`).

Free: 44 common errors, one code at a time. Pro: 251 errors and whole stack traces.
