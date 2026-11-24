package io.github.catalonec1.plsqllint.ide;

import com.intellij.codeInspection.InspectionManager;
import com.intellij.codeInspection.LocalInspectionTool;
import com.intellij.codeInspection.LocalQuickFix;
import com.intellij.codeInspection.ProblemDescriptor;
import com.intellij.codeInspection.ProblemHighlightType;
import com.intellij.openapi.util.TextRange;
import com.intellij.psi.PsiFile;
import io.github.catalonec1.plsqllint.core.Finding;
import io.github.catalonec1.plsqllint.core.Rules;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.List;

/**
 * Base class of the PLL001..PLL020 inspections. Every rule is its own inspection so
 * users can toggle it and change its severity in Settings | Editor | Inspections.
 */
public abstract class PllInspection extends LocalInspectionTool {
    private final String code;

    protected PllInspection(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    @Override
    public ProblemDescriptor @NotNull [] checkFile(@NotNull PsiFile file, @NotNull InspectionManager manager, boolean isOnTheFly) {
        if (file.getViewProvider().getPsi(file.getViewProvider().getBaseLanguage()) != file) return ProblemDescriptor.EMPTY_ARRAY;
        if (!LintCache.isPlsqlFile(file)) return ProblemDescriptor.EMPTY_ARRAY;
        Rules.Rule rule = Rules.ALL.get(code);
        List<Finding> mine = new ArrayList<>();
        for (Finding f : LintCache.findings(file)) if (f.code().equals(code)) mine.add(f);
        if (mine.isEmpty()) return ProblemDescriptor.EMPTY_ARRAY;

        boolean pro = ProLicense.isPro();
        if (rule.pro() && !pro) {
            if (isOnTheFly) ProNotifier.proIssuesHidden(file.getProject(), code, mine.size());
            return ProblemDescriptor.EMPTY_ARRAY;
        }
        String text = file.getViewProvider().getContents().toString();
        int textLength = text.length();
        List<ProblemDescriptor> out = new ArrayList<>(mine.size());
        for (Finding f : mine) {
            int start = Math.min(f.offset(), textLength);
            int end = Math.min(start + f.length(), textLength);
            if (end <= start && textLength > 0) {
                start = Math.max(0, Math.min(start, textLength - 1));
                end = start + 1;
            }
            List<LocalQuickFix> fixes = new ArrayList<>(2);
            if (f.fix() != null && pro) fixes.add(new ApplyFix(f, text));
            fixes.add(new NoqaFix(code));
            out.add(manager.createProblemDescriptor(file, new TextRange(start, end),
                    code + ": " + f.message(), ProblemHighlightType.GENERIC_ERROR_OR_WARNING, isOnTheFly,
                    fixes.toArray(LocalQuickFix.EMPTY_ARRAY)));
        }
        return out.toArray(ProblemDescriptor.EMPTY_ARRAY);
    }
}
