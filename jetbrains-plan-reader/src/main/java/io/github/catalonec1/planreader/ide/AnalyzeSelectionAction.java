package io.github.catalonec1.planreader.ide;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.project.Project;
import org.jetbrains.annotations.NotNull;

import java.awt.datatransfer.DataFlavor;

/** Analyze Oracle Execution Plan: sends the selection (or the whole document, or the clipboard) to Plan Reader. */
public final class AnalyzeSelectionAction extends DumbAwareAction {
    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        Project project = e.getProject();
        if (project == null) return;
        Editor editor = e.getData(CommonDataKeys.EDITOR);
        String text = null;
        if (editor != null) {
            text = editor.getSelectionModel().getSelectedText();
            if (text == null || text.isBlank()) text = editor.getDocument().getText();
        }
        if (text == null || !text.contains("|")) {
            String clip = CopyPasteManager.getInstance().getContents(DataFlavor.stringFlavor);
            if (clip != null && clip.contains("|")) text = clip;
        }
        String t = text;
        PlanToolWindowFactory.withPanel(project, p -> { if (t != null) p.setPlanText(t); });
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
