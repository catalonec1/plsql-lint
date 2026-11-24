package io.github.catalonec1.planreader.ide;

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

public final class PlanToolWindowFactory implements ToolWindowFactory, DumbAware {
    static final String ID = "Plan Reader";
    private static final Key<PlanPanel> PANEL = Key.create("oracle.plan.reader.panel");

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        PlanPanel panel = new PlanPanel();
        Content content = ContentFactory.getInstance().createContent(panel, "", false);
        toolWindow.getContentManager().addContent(content);
        project.putUserData(PANEL, panel);
    }

    static void withPanel(Project project, Consumer<PlanPanel> action) {
        ToolWindow tw = ToolWindowManager.getInstance(project).getToolWindow(ID);
        if (tw == null) return;
        tw.show(() -> {
            PlanPanel p = project.getUserData(PANEL);
            if (p != null) action.accept(p);
        });
    }
}
