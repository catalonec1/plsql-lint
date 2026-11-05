package io.github.catalonec1.plsqllint.core;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProRulesTest {
    private static List<String> pro(String sql) {
        return Linter.lint(sql, Linter.Config.defaults(true)).stream()
                .filter(f -> Rules.ALL.get(f.code()).pro())
                .map(f -> f.line() + ":" + f.col() + " " + f.code())
                .collect(Collectors.toList());
    }

    private static String res(String name) throws IOException {
        try (var in = ProRulesTest.class.getResourceAsStream(name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void freeConfigHasNoProRules() {
        assertTrue(Linter.Config.defaults(false).select.stream().noneMatch(c -> Rules.ALL.get(c).pro()));
        assertEquals(5, Rules.ALL.values().stream().filter(Rules.Rule::pro).count());
    }

    @Test
    void realisticPackage() throws IOException {
        assertEquals(List.of(
                "6:12 PLL018",   // log_error: autonomous, INSERT, no COMMIT
                "21:12 PLL016",  // COUNT(*) INTO l_cnt ... l_cnt > 0
                "28:7 PLL017",   // UPDATE inside cursor FOR loop
                "41:5 PLL020",   // DELETE FROM tmp_ids;
                "42:5 PLL020",   // UPDATE orders o SET ... ;
                "57:32 PLL019",  // IDENTIFIED BY "Secret123"
                "58:60 PLL019"   // IDENTIFIED BY tiger
        ), pro(res("/corpus/pkg_orders.pkb")));
    }

    @Test
    void misc() throws IOException {
        assertEquals(List.of(
                "6:5 PLL017",    // insert inside "for rec in c loop"
                "17:10 PLL016"   // count(1) into n ... n = 0
        ), pro(res("/corpus/misc.sql")));
    }

    @Test
    void numericAndReverseLoopsAreNotCursorLoops() {
        assertEquals(List.of(), pro("BEGIN FOR i IN 1..10 LOOP UPDATE t SET x = i WHERE id = i; END LOOP; END;"));
        assertEquals(List.of(), pro("BEGIN FOR i IN REVERSE 1..n LOOP DELETE t WHERE id = i; END LOOP; END;"));
        assertEquals(List.of(), pro("BEGIN WHILE x LOOP UPDATE t SET a = 1 WHERE id = 2; END LOOP; END;"));
        assertEquals(List.of("1:52 PLL017"),
                pro("BEGIN FOR r IN (SELECT id FROM t) LOOP IF 1=1 THEN DELETE t WHERE id = r.id; END IF; END LOOP; END;"));
    }

    @Test
    void dmlWithoutWhereIgnoresDdlTriggersAndGrants() {
        assertEquals(List.of(), pro("CREATE TRIGGER x AFTER UPDATE OR DELETE ON t FOR EACH ROW BEGIN NULL; END;"));
        assertEquals(List.of(), pro("GRANT SELECT, UPDATE, DELETE ON t TO u;"));
        assertEquals(List.of(), pro("SELECT * FROM t FOR UPDATE;"));
        assertEquals(List.of(), pro("ALTER TABLE c ADD FOREIGN KEY (p) REFERENCES p (id) ON DELETE CASCADE;"));
        assertEquals(List.of(), pro("DELETE FROM t WHERE CURRENT OF c;"));
        assertEquals(List.of(), pro("MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.v = s.v DELETE WHERE t.v = 0;"));
        assertEquals(List.of("1:1 PLL020"), pro("DELETE t;"));
        assertEquals(List.of("1:1 PLL020"), pro("update t set a = (select max(b) from u where u.id = 1);"));
    }

    @Test
    void autonomousWithCommitOrWithoutDmlIsFine() {
        assertEquals(List.of(), pro("PROCEDURE p IS PRAGMA AUTONOMOUS_TRANSACTION; BEGIN INSERT INTO l VALUES (1); COMMIT; END;"));
        assertEquals(List.of(), pro("FUNCTION f RETURN NUMBER IS PRAGMA AUTONOMOUS_TRANSACTION; BEGIN RETURN 1; END;"));
        assertEquals(List.of("1:23 PLL018"),
                pro("PROCEDURE p IS PRAGMA AUTONOMOUS_TRANSACTION; BEGIN IF x THEN UPDATE l SET a = 1 WHERE b = 2; END IF; END;"));
    }

    @Test
    void countWithoutZeroTestIsFine() {
        assertEquals(List.of(), pro("BEGIN SELECT COUNT(*) INTO n FROM t; total := total + n; END;"));
        assertEquals(List.of("1:14 PLL016"), pro("BEGIN SELECT COUNT(*) INTO n FROM t; IF n >= 1 THEN x; END IF; END;"));
    }

    @Test
    void passwordBindAndValuesAreFine() {
        assertEquals(List.of(), pro("ALTER USER u IDENTIFIED BY VALUES 'S:ABC';"));
        assertEquals(List.of(), pro("ALTER USER u IDENTIFIED BY &pwd;"));
        assertEquals(List.of(), pro("CREATE USER u IDENTIFIED EXTERNALLY;"));
    }

    @Test
    void noqaSuppressesProRules() {
        assertEquals(List.of(), pro("DELETE t; -- noqa: PLL020"));
        assertEquals(List.of(), pro("-- plsql-lint: disable-file=PLL020\nDELETE t;"));
    }

    @Test
    void ruleTableIsConsistent() {
        assertFalse(Rules.ALL.isEmpty());
        Rules.ALL.forEach((code, r) -> {
            assertEquals(code, r.code());
            assertTrue(code.matches("PLL\\d{3}"));
        });
    }
}
