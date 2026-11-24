package io.github.catalonec1.oraerrors.ide;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.project.DumbAwareAction;
import io.github.catalonec1.oraerrors.core.OraScanner;
import org.jetbrains.annotations.NotNull;

/** Opens the ORA Errors tool window on the code at the caret (if any). */
public final class OpenCatalogAction extends DumbAwareAction {
    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        if (e.getProject() == null) return;
        Editor editor = e.getData(CommonDataKeys.EDITOR);
        String code = null;
        if (editor != null) {
            String sel = editor.getSelectionModel().getSelectedText();
            code = sel != null ? OraScanner.distinctCodes(sel).stream().findFirst().orElse(null)
                    : OraScanner.codeAt(editor.getDocument().getImmutableCharSequence(), editor.getCaretModel().getOffset());
        }
        String c = code;
        OraToolWindowFactory.withPanel(e.getProject(), p -> { if (c != null) p.show(c); });
    }

    @Override
    public void update(@NotNull AnActionEvent e) {
        e.getPresentation().setEnabledAndVisible(e.getProject() != null);
    }

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }
}
