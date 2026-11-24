package io.github.catalonec1.plsqllint.ide;

import com.intellij.codeInspection.LocalQuickFix;
import com.intellij.codeInspection.ProblemDescriptor;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.project.Project;
import com.intellij.psi.PsiDocumentManager;
import com.intellij.psi.PsiFile;
import io.github.catalonec1.plsqllint.core.Finding;
import org.jetbrains.annotations.NotNull;

/** Pro quick fix: applies the replacement computed by the lint engine. */
final class ApplyFix implements LocalQuickFix {
    private final String name;
    private final int deltaFromProblem;
    private final String original;
    private final String replacement;

    ApplyFix(Finding f, String text) {
        Finding.Fix fix = f.fix();
        this.name = fix.name();
        this.deltaFromProblem = fix.offset() - f.offset();
        this.original = text.substring(fix.offset(), fix.offset() + fix.length());
        this.replacement = fix.replacement();
    }

    @Override
    public @NotNull String getFamilyName() {
        return "PL/SQL Lint Pro: " + name;
    }

    @Override
    public void applyFix(@NotNull Project project, @NotNull ProblemDescriptor descriptor) {
        PsiFile file = descriptor.getPsiElement().getContainingFile();
        if (file == null) return;
        Document doc = PsiDocumentManager.getInstance(project).getDocument(file);
        if (doc == null) return;
        int problemStart = descriptor.getPsiElement().getTextRange().getStartOffset()
                + descriptor.getTextRangeInElement().getStartOffset();
        int start = problemStart + deltaFromProblem;
        int end = start + original.length();
        if (start < 0 || end > doc.getTextLength()) return;
        if (!doc.getCharsSequence().subSequence(start, end).toString().equals(original)) return; // text moved on
        doc.replaceString(start, end, replacement);
        PsiDocumentManager.getInstance(project).commitDocument(doc);
    }
}
