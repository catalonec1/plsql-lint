package io.github.catalonec1.oraerrors.ide;

import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Key;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import org.jetbrains.annotations.NotNull;

import java.util.function.Consumer;

public final class OraToolWindowFactory implements ToolWindowFactory, DumbAware {
    static final String ID = "ORA Errors";
    private static final Key<OraPanel> PANEL = Key.create("ora.errors.panel");

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        OraPanel panel = new OraPanel();
        Content content = ContentFactory.getInstance().createContent(panel, "", false);
        toolWindow.getContentManager().addContent(content);
        project.putUserData(PANEL, panel);
    }

    /** Opens the tool window and runs {@code action} on its panel. */
    static void withPanel(Project project, Consumer<OraPanel> action) {
        ToolWindow tw = ToolWindowManager.getInstance(project).getToolWindow(ID);
        if (tw == null) return;
        tw.show(() -> {
            OraPanel p = project.getUserData(PANEL);
            if (p != null) action.accept(p);
        });
    }
}
