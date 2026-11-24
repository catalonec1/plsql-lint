package io.github.catalonec1.planreader.ide;

import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.ui.Splitter;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.ui.components.JBTextArea;
import com.intellij.util.ui.JBUI;
import io.github.catalonec1.planreader.core.Plan;
import io.github.catalonec1.planreader.core.PlanAnalyzer;
import io.github.catalonec1.planreader.core.PlanParser;
import io.github.catalonec1.planreader.core.Report;

import javax.swing.JButton;
import javax.swing.JEditorPane;
import javax.swing.JPanel;
import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.datatransfer.DataFlavor;

/** Tool window content: plan text on top, report below. */
final class PlanPanel extends JPanel {
    private final JBTextArea input = new JBTextArea();
    private final JEditorPane report = HtmlView.create(intro());

    PlanPanel() {
        super(new BorderLayout());
        input.setFont(new Font(Font.MONOSPACED, Font.PLAIN, JBUI.scaleFontSize(12f)));
        input.getEmptyText().setText("Paste DBMS_XPLAN output here");
        JButton analyze = new JButton("Analyze");
        analyze.addActionListener(e -> analyze());
        JButton paste = new JButton("Paste from Clipboard and Analyze");
        paste.addActionListener(e -> {
            String clip = CopyPasteManager.getInstance().getContents(DataFlavor.stringFlavor);
            if (clip != null) setPlanText(clip);
        });
        JButton pro = new JButton("Pro: Register or Start Trial");
        pro.addActionListener(e -> RegisterAction.register());
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.LEFT));
        buttons.add(analyze);
        buttons.add(paste);
        buttons.add(pro);

        JPanel top = new JPanel(new BorderLayout());
        top.add(new JBScrollPane(input), BorderLayout.CENTER);
        top.add(buttons, BorderLayout.SOUTH);

        Splitter split = new Splitter(true, 0.35f);
        split.setFirstComponent(top);
        split.setSecondComponent(HtmlView.scroll(report));
        add(split, BorderLayout.CENTER);
    }

    void setPlanText(String text) {
        input.setText(text);
        input.setCaretPosition(0);
        analyze();
    }

    private void analyze() {
        Plan plan = PlanParser.parse(input.getText());
        report.setText(Report.html(plan, PlanAnalyzer.analyze(plan), ProLicense.isPro()));
        report.setCaretPosition(0);
    }

    private static String intro() {
        return "<html><body><p>Paste the text output of <code>DBMS_XPLAN.DISPLAY</code> or "
                + "<code>DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'ALLSTATS LAST')</code> above and press Analyze, or select "
                + "a plan in any editor or console and use <b>Analyze Oracle Execution Plan</b> from the context menu.</p>"
                + "<p>Free checks: most expensive step, full scans of big tables, cartesian joins. Pro adds 12 more "
                + "checks: estimate vs actual rows, implicit conversions, functions on indexed columns, nested loops over "
                + "big row sources, FILTER subqueries, missing partition pruning, skip scans, temp spills, remote access, "
                + "big sorts and dynamic statistics.</p></body></html>";
    }
}
