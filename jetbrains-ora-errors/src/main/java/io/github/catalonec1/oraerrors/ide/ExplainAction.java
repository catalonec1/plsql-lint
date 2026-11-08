package io.github.catalonec1.oraerrors.ide;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.popup.JBPopup;
import com.intellij.openapi.ui.popup.JBPopupFactory;
import com.intellij.util.ui.JBUI;
import io.github.catalonec1.oraerrors.core.Explainer;
import io.github.catalonec1.oraerrors.core.OraScanner;
import org.jetbrains.annotations.NotNull;

import javax.swing.JEditorPane;
import java.awt.datatransfer.DataFlavor;

/**
 * Explain Oracle Error: explains the code at the caret, or every code in the selection (whole stack traces
 * are Pro; the free version explains the first code and lists the others). Without an editor it reads the
 * clipboard.
 */
public final class ExplainAction extends DumbAwareAction {
    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        Project project = e.getProject();
        Editor editor = e.getData(CommonDataKeys.EDITOR);
        String text = null;
        if (editor != null) {
            String sel = editor.getSelectionModel().getSelectedText();
            if (sel != null && !sel.isBlank()) {
                text = sel;
            } else {
                CharSequence doc = editor.getDocument().getImmutableCharSequence();
                String code = OraScanner.codeAt(doc, editor.getCaretModel().getOffset());
                if (code == null) {
                    int line = editor.getCaretModel().getLogicalPosition().line;
                    int s = editor.getDocument().getLineStartOffset(line);
                    int en = editor.getDocument().getLineEndOffset(line);
                    text = doc.subSequence(s, en).toString();
                } else {
                    text = code;
                }
            }
        }
        if (text == null) {
            text = CopyPasteManager.getInstance().getContents(DataFlavor.stringFlavor);
        }
        String html = Explainer.explain(text == null ? "" : text, ProLicense.isPro());
        JEditorPane pane = HtmlView.create(html);
        pane.setPreferredSize(JBUI.size(560, 300));
        JBPopup popup = JBPopupFactory.getInstance()
                .createComponentPopupBuilder(HtmlView.scroll(pane), pane)
                .setTitle("Oracle Error Explanation")
                .setResizable(true)
                .setMovable(true)
                .setRequestFocus(true)
                .createPopup();
        if (editor != null) {
            popup.showInBestPositionFor(editor);
        } else if (project != null) {
            popup.showCenteredInCurrentWindow(project);
        }
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
