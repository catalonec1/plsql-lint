package io.github.catalonec1.plsqllint.ide;

import com.intellij.codeInspection.LocalQuickFix;
import com.intellij.codeInspection.ProblemDescriptor;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.project.Project;
import com.intellij.psi.PsiDocumentManager;
import com.intellij.psi.PsiFile;
import org.jetbrains.annotations.NotNull;

/** Adds "-- noqa: PLLxxx" at the end of the line; understood by the CLI too. */
final class NoqaFix implements LocalQuickFix {
    private final String code;

    NoqaFix(String code) {
        this.code = code;
    }

    @Override
    public @NotNull String getName() {
        return "Suppress " + code + " on this line (-- noqa)";
    }

    @Override
    public @NotNull String getFamilyName() {
        return "Suppress with -- noqa";
    }

    @Override
    public void applyFix(@NotNull Project project, @NotNull ProblemDescriptor descriptor) {
        PsiFile file = descriptor.getPsiElement().getContainingFile();
        if (file == null) return;
        Document doc = PsiDocumentManager.getInstance(project).getDocument(file);
        if (doc == null) return;
        int offset = descriptor.getPsiElement().getTextRange().getStartOffset()
                + descriptor.getTextRangeInElement().getStartOffset();
        int line = doc.getLineNumber(Math.min(offset, doc.getTextLength()));
        int lineEnd = doc.getLineEndOffset(line);
        String lineText = doc.getCharsSequence().subSequence(doc.getLineStartOffset(line), lineEnd).toString();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("noqa:\\s*([A-Za-z0-9_,\\s]+)$").matcher(lineText);
        if (m.find()) {
            doc.insertString(lineEnd, "," + code);
        } else {
            doc.insertString(lineEnd, " -- noqa: " + code);
        }
        PsiDocumentManager.getInstance(project).commitDocument(doc);
    }
}
