package io.github.catalonec1.plsqllint.core;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class FixTest {
    private static String fixFirst(String sql, String code) {
        for (Finding f : Linter.lint(sql, Linter.Config.defaults(true))) {
            if (f.code().equals(code)) return f.fix() == null ? null : f.fix().apply(sql);
        }
        throw new AssertionError("no " + code + " in " + sql);
    }

    @Test
    void compareNull() {
        assertEquals("SELECT a FROM t WHERE b IS NULL;", fixFirst("SELECT a FROM t WHERE b = NULL;", "PLL004"));
        assertEquals("IF x IS NOT NULL THEN y; END IF;", fixFirst("IF x <> NULL THEN y; END IF;", "PLL004"));
        assertEquals("IF x IS NOT NULL THEN y; END IF;", fixFirst("IF x !=null THEN y; END IF;", "PLL004"));
        assertNull(fixFirst("IF NULL = x THEN y; END IF;", "PLL004"));
    }

    @Test
    void emptyString() {
        assertEquals("WHERE b IS NULL", fixFirst("WHERE b = ''", "PLL012"));
        assertEquals("IF v IS NOT NULL THEN", fixFirst("IF v <> '' THEN", "PLL012"));
    }

    @Test
    void varchar() {
        assertEquals("v VARCHAR2(10);", fixFirst("v VARCHAR(10);", "PLL013"));
        assertEquals("v varchar2(10);", fixFirst("v varchar(10);", "PLL013"));
    }

    @Test
    void endName() {
        String sql = "CREATE OR REPLACE PROCEDURE app.do_it IS\nBEGIN\n  NULL;\nEND;\n/\n";
        assertEquals("CREATE OR REPLACE PROCEDURE app.do_it IS\nBEGIN\n  NULL;\nEND do_it;\n/\n", fixFirst(sql, "PLL011"));
    }

    @Test
    void offsetsPointAtTheToken() {
        String sql = "BEGIN\n  x := 1;\n  GOTO l;\nEND;";
        Finding f = Linter.lint(sql).get(0);
        assertEquals("PLL007", f.code());
        assertEquals("GOTO", sql.substring(f.offset(), f.offset() + f.length()));
    }
}
