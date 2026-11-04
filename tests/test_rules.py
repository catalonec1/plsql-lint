import json
import os
import subprocess
import sys

import pytest

from plsql_lint import Config, lint_text
from plsql_lint.cli import main
from plsql_lint.tokenizer import Kind, tokenize

HERE = os.path.dirname(__file__)
FIX = os.path.join(HERE, "fixtures")


def codes(sql, **cfg):
    return [f.code for f in lint_text(sql, config=Config(**cfg) if cfg else None)]


# ---------------------------------------------------------------- tokenizer
def test_tokenizer_strings_comments_qquote():
    toks = tokenize("x := q'[it's]' || 'a''b' -- c\n/* d\n e */ y")
    kinds = [t.kind for t in toks]
    assert kinds == [Kind.WORD, Kind.SYMBOL, Kind.STRING, Kind.SYMBOL, Kind.STRING,
                     Kind.COMMENT, Kind.COMMENT, Kind.WORD]
    assert toks[-1].line == 3


def test_tokenizer_identifiers_with_dollar_hash():
    toks = tokenize("v$session sys#x")
    assert [t.text for t in toks] == ["v$session", "sys#x"]


def test_tokenizer_numbers_and_range():
    toks = tokenize("FOR i IN 1..10 LOOP x := 1.5e3; END LOOP;")
    assert "1" in [t.text for t in toks] and ".." in [t.text for t in toks]
    assert "1.5e3" in [t.text for t in toks]


# ---------------------------------------------------------------- PLL001
def test_when_others_null_is_error():
    sql = "BEGIN x; EXCEPTION WHEN OTHERS THEN NULL; END;"
    f = lint_text(sql)
    assert [x.code for x in f] == ["PLL001"]
    assert f[0].severity.value == "error"


def test_when_others_without_raise_is_warning():
    f = lint_text("BEGIN x; EXCEPTION WHEN OTHERS THEN log_it(SQLERRM); END;")
    assert f[0].code == "PLL001" and f[0].severity.value == "warning"


def test_when_others_with_raise_ok():
    assert codes("BEGIN x; EXCEPTION WHEN OTHERS THEN log_it; RAISE; END;") == []
    assert codes("BEGIN x; EXCEPTION WHEN OTHERS THEN "
                 "RAISE_APPLICATION_ERROR(-20001, 'x'); END;") == []


def test_when_others_handler_with_nested_blocks():
    sql = """BEGIN x;
    EXCEPTION
      WHEN OTHERS THEN
        IF a = 1 THEN log_it; END IF;
        CASE WHEN b = 1 THEN y; END CASE;
        RAISE;
    END;"""
    assert codes(sql) == []


def test_raise_in_next_handler_does_not_count():
    sql = "BEGIN x; EXCEPTION WHEN OTHERS THEN log_it; WHEN NO_DATA_FOUND THEN RAISE; END;"
    assert codes(sql) == ["PLL001"]


# ---------------------------------------------------------------- PLL002
def test_select_star():
    assert codes("SELECT * FROM t;") == ["PLL002"]
    assert codes("SELECT DISTINCT * FROM t;") == ["PLL002"]
    assert codes("SELECT a, b FROM t;") == []
    assert codes("SELECT COUNT(*) FROM t;") == []


def test_select_star_inside_exists_ok():
    assert codes("SELECT a FROM t WHERE EXISTS (SELECT * FROM u WHERE u.id = t.id);") == []


# ---------------------------------------------------------------- PLL003
def test_commit_in_loop():
    assert codes("BEGIN FOR r IN c LOOP COMMIT; END LOOP; END;") == ["PLL003"]
    assert codes("BEGIN WHILE x LOOP ROLLBACK; END LOOP; END;") == ["PLL003"]
    assert codes("BEGIN FOR r IN c LOOP x; END LOOP; COMMIT; END;") == []


def test_on_commit_ddl_ok():
    assert codes("CREATE GLOBAL TEMPORARY TABLE t (a NUMBER) ON COMMIT DELETE ROWS;") == []


# ---------------------------------------------------------------- PLL004
@pytest.mark.parametrize("op", ["=", "<>", "!=", "^="])
def test_compare_with_null(op):
    assert codes(f"SELECT a FROM t WHERE b {op} NULL;") == ["PLL004"]


def test_null_on_left():
    assert codes("BEGIN IF NULL = x THEN y; END IF; END;") == ["PLL004"]


def test_update_set_null_ok():
    assert codes("UPDATE t SET a = NULL, b = NULL WHERE c IS NULL;") == []
    assert codes("BEGIN x := NULL; END;") == []


def test_update_set_with_subquery_compare_null():
    assert codes("UPDATE t SET a = (SELECT b FROM u WHERE c = NULL);") == ["PLL004"]


# ---------------------------------------------------------------- PLL005
def test_execute_immediate_concat():
    assert codes("BEGIN EXECUTE IMMEDIATE 'DROP TABLE ' || t; END;") == ["PLL005"]
    assert codes("BEGIN EXECUTE IMMEDIATE l_sql USING a; END;") == []
    assert codes("BEGIN EXECUTE IMMEDIATE 'x' INTO v USING a || b; END;") == []


def test_dbms_assert_trusted():
    assert codes("BEGIN EXECUTE IMMEDIATE 'DROP TABLE ' || DBMS_ASSERT.SQL_OBJECT_NAME(t); END;") == []


def test_open_for_concat():
    assert codes("BEGIN OPEN c FOR 'SELECT a FROM ' || t; END;") == ["PLL005"]
    assert codes("BEGIN OPEN c FOR SELECT a || b FROM t; END;") == []


# ---------------------------------------------------------------- PLL006..PLL011
def test_dbms_output():
    assert codes("BEGIN DBMS_OUTPUT.PUT_LINE('x'); END;") == ["PLL006"]


def test_goto():
    assert codes("BEGIN GOTO done; <<done>> NULL; END;") == ["PLL007"]


def test_rownum_order_by():
    assert codes("SELECT a FROM t WHERE ROWNUM <= 10 ORDER BY a;") == ["PLL008"]
    assert codes("SELECT a FROM (SELECT a FROM t ORDER BY a) WHERE ROWNUM <= 10;") == []
    assert codes("SELECT a FROM t ORDER BY a FETCH FIRST 10 ROWS ONLY;") == []


def test_line_length_is_opt_in():
    assert codes("-- " + "x" * 130) == []
    assert codes("-- " + "x" * 130, select={"PLL009"}) == ["PLL009"]
    assert codes("-- " + "x" * 130, select={"PLL009"}, max_line_length=200) == []


def test_raise_application_error_range():
    assert codes("BEGIN RAISE_APPLICATION_ERROR(-20001, 'ok'); RAISE; END;") == []
    assert codes("BEGIN RAISE_APPLICATION_ERROR(-1, 'bad'); END;") == ["PLL010"]
    assert codes("BEGIN RAISE_APPLICATION_ERROR(20001, 'bad'); END;") == ["PLL010"]


def test_end_without_name():
    sql = "CREATE OR REPLACE PROCEDURE p IS BEGIN x; END;\n/\n"
    assert codes(sql) == ["PLL011"]
    assert codes("CREATE OR REPLACE PROCEDURE p IS BEGIN x; END p;\n/\n") == []


# ---------------------------------------------------------------- strings/comments
def test_nothing_inside_strings_or_comments():
    sql = """BEGIN
      v := 'SELECT * FROM t WHERE a = NULL'; -- COMMIT; GOTO x
      /* WHEN OTHERS THEN NULL; */
      v := q'{DBMS_OUTPUT.PUT_LINE('x')}';
    END;"""
    assert codes(sql) == []


# ---------------------------------------------------------------- suppression & config
def test_inline_disable():
    assert codes("SELECT * FROM t; -- plsql-lint: disable=PLL002") == []
    assert codes("SELECT * FROM t; -- noqa") == []
    assert codes("SELECT * FROM t; -- noqa: PLL007") == ["PLL002"]


def test_file_disable():
    sql = "-- plsql-lint: disable-file=PLL002\nSELECT * FROM t;\nSELECT * FROM u;"
    assert codes(sql) == []


def test_select_and_ignore():
    sql = "BEGIN DBMS_OUTPUT.PUT_LINE('x'); GOTO a; END;"
    assert codes(sql, select={"PLL007"}) == ["PLL007"]
    assert codes(sql, ignore={"PLL006"}) == ["PLL007"]


# ---------------------------------------------------------------- fixtures & CLI
def test_good_fixture_clean():
    assert main([os.path.join(FIX, "good.sql")]) == 0


def test_bad_fixture_all_expected():
    with open(os.path.join(FIX, "bad.sql")) as fh:
        found = sorted(set(codes(fh.read())))
    assert found == ["PLL001", "PLL002", "PLL003", "PLL004", "PLL005",
                     "PLL006", "PLL010", "PLL011"]


def test_cli_json(capsys):
    rc = main(["--format", "json", os.path.join(FIX, "bad.sql")])
    data = json.loads(capsys.readouterr().out)
    assert rc == 1 and data and {"path", "line", "col", "code", "severity", "message"} <= set(data[0])


def test_cli_github_format(capsys):
    main(["--format", "github", "--select", "PLL002", os.path.join(FIX, "bad.sql")])
    assert capsys.readouterr().out.startswith("::warning file=")


def test_cli_directory_and_min_severity(capsys):
    rc = main(["--min-severity", "error", FIX])
    out = capsys.readouterr().out
    assert rc == 1 and "PLL006" not in out and "PLL004" in out


def test_cli_exit_zero_and_errors(capsys):
    assert main(["--exit-zero", os.path.join(FIX, "bad.sql")]) == 0
    assert main([]) == 2
    assert main(["--select", "NOPE", FIX]) == 2
    assert main([os.path.join(FIX, "missing.sql")]) == 2


def test_cli_stdin():
    proc = subprocess.run([sys.executable, "-m", "plsql_lint", "-"], input="SELECT * FROM t;",
                          capture_output=True, text=True,
                          env={**os.environ, "PYTHONPATH": os.path.join(HERE, "..", "src")})
    assert proc.returncode == 1 and "<stdin>:1:8: PLL002" in proc.stdout


def test_config_file(tmp_path, monkeypatch, capsys):
    (tmp_path / "pyproject.toml").write_text('[tool.plsql-lint]\nignore = ["PLL002"]\n')
    (tmp_path / "a.sql").write_text("SELECT * FROM t;\n")
    monkeypatch.chdir(tmp_path)
    assert main(["a.sql"]) == 0


def test_cli_extend_select(tmp_path, capsys):
    f = tmp_path / "long.sql"
    f.write_text("-- " + "x" * 130 + "\nSELECT * FROM t;\n")
    assert main([str(f), "--extend-select", "PLL009", "--format", "json"]) == 1
    found = {d["code"] for d in json.loads(capsys.readouterr().out)}
    assert found == {"PLL002", "PLL009"}
