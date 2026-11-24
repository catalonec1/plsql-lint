# Oracle Plan Reader (JetBrains plugin)

Reads the text output of `DBMS_XPLAN` (DISPLAY, DISPLAY_CURSOR with ALLSTATS LAST) and reports what to fix.

- `core/` - parser (`PlanParser`), checks PR01-PR15 (`PlanAnalyzer`), HTML report. Plain Java, tested with `./gradlew -p core test`.
- `src/` - IDE integration: *Analyze Oracle Execution Plan* action, *Plan Reader* tool window, Pro licensing (product code `PCATPLANRD`).
- Build and Plugin Verifier run in GitHub Actions (`.github/workflows/jetbrains-more-plugins.yml`).

Free checks: PR01 most expensive step, PR02 big full scans, PR03 cartesian joins. Pro: PR04-PR15.
