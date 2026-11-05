package io.github.catalonec1.plsqllint.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * parity.json is produced by running the Python test-suite of plsql-lint and
 * recording every input with the findings of all open-source rules. The Java
 * port must report exactly the same (line, col, code, severity).
 */
class ParityTest {
    @TestFactory
    Stream<DynamicTest> sameFindingsAsPython() throws Exception {
        JsonArray cases;
        try (var in = new InputStreamReader(ParityTest.class.getResourceAsStream("/parity.json"), StandardCharsets.UTF_8)) {
            cases = JsonParser.parseReader(in).getAsJsonArray();
        }
        List<DynamicTest> tests = new ArrayList<>();
        int n = 0;
        for (JsonElement e : cases) {
            String src = e.getAsJsonObject().get("source").getAsString();
            List<String> expected = new ArrayList<>();
            for (JsonElement f : e.getAsJsonObject().getAsJsonArray("findings")) {
                JsonArray a = f.getAsJsonArray();
                expected.add(a.get(0).getAsInt() + ":" + a.get(1).getAsInt() + " " + a.get(2).getAsString() + " " + a.get(3).getAsString());
            }
            String name = "case " + (n++) + ": " + src.lines().findFirst().orElse("").strip();
            tests.add(DynamicTest.dynamicTest(name, () -> {
                Linter.Config cfg = Linter.Config.defaults(false);
                cfg.select.add("PLL009");
                List<String> actual = new ArrayList<>();
                for (Finding f : Linter.lint(src, cfg)) {
                    actual.add(f.line() + ":" + f.col() + " " + f.code() + " " + f.severity().name().toLowerCase(Locale.ROOT));
                }
                assertEquals(expected, actual, src);
            }));
        }
        return tests.stream();
    }
}
