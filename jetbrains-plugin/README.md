# PL/SQL Lint for JetBrains IDEs

Editor plugin for DataGrip, IntelliJ IDEA and every other JetBrains IDE (2024.3+).
Freemium on JetBrains Marketplace (product code `PPLSQLLINT`):

- free: the 15 open-source rules PLL001-PLL015, exactly as in the `plsql-lint` CLI
- Pro (licence or 30-day trial): rules PLL016-PLL020 and quick fixes

| Code | Pro rule |
|------|----------|
| PLL016 | `SELECT COUNT(*) INTO` only to test existence |
| PLL017 | INSERT/UPDATE/DELETE/MERGE inside a cursor FOR loop |
| PLL018 | `PRAGMA AUTONOMOUS_TRANSACTION` with DML and no COMMIT/ROLLBACK (ORA-06519) |
| PLL019 | password in source (`IDENTIFIED BY`) |
| PLL020 | UPDATE / DELETE without WHERE |

## Build

```bash
./gradlew -p core test   # engine tests, no IDE download (parity with the Python rules)
./gradlew buildPlugin    # build/distributions/plsql-lint-jetbrains-1.0.0.zip
./gradlew verifyPlugin   # JetBrains Plugin Verifier
./gradlew runIde         # try it in a sandbox IDE
```

`core/src/test/resources/parity.json` is generated from the Python test-suite; when a
Python rule changes, regenerate it and port the change to `core/`.
