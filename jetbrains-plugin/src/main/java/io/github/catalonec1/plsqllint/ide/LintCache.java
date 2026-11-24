package io.github.catalonec1.plsqllint.ide;

import com.intellij.lang.Language;
import com.intellij.openapi.util.Key;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.psi.PsiFile;
import com.intellij.psi.util.CachedValue;
import com.intellij.psi.util.CachedValueProvider;
import com.intellij.psi.util.CachedValuesManager;
import io.github.catalonec1.plsqllint.core.Finding;
import io.github.catalonec1.plsqllint.core.Linter;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Lints a file once per modification and shares the result between all PLLxxx inspections. */
final class LintCache {
    static final Set<String> EXTENSIONS = Set.of(
            "sql", "pls", "plb", "pks", "pkb", "pck", "prc", "fnc", "trg", "tps", "tpb", "bdy", "spc", "vw", "ddl", "dml");
    private static final Set<String> SQL_LANGUAGES = Set.of("SQL", "ORACLE", "ORACLESQLPLUS", "GENERICSQL", "SQL92");
    private static final Key<CachedValue<List<Finding>>> KEY = Key.create("plsql.lint.findings");

    private LintCache() {}

    static boolean isPlsqlFile(PsiFile file) {
        VirtualFile vf = file.getVirtualFile();
        if (vf != null) {
            String ext = vf.getExtension();
            if (ext != null && EXTENSIONS.contains(ext.toLowerCase(Locale.ROOT))) return true;
        }
        Language lang = file.getLanguage();
        while (lang != null) {
            if (SQL_LANGUAGES.contains(lang.getID().toUpperCase(Locale.ROOT))) return true;
            lang = lang.getBaseLanguage();
        }
        return false;
    }

    static List<Finding> findings(PsiFile file) {
        return CachedValuesManager.getCachedValue(file, KEY, () -> {
            Linter.Config cfg = Linter.Config.defaults(true);
            cfg.select.add("PLL009");
            List<Finding> result = Linter.lint(file.getViewProvider().getContents().toString(), cfg);
            return CachedValueProvider.Result.create(result, file);
        });
    }
}
