package local.nexus.console.ui;

import local.nexus.motion.NexusSymbolPaths;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;

import java.util.HashMap;
import java.util.Map;

/**
 * Icone coerenti di Control: i vettori arrivano dal catalogo condiviso
 * NexusSymbolPaths (generato e firmato offline), il simbolo Nexus è disegnato.
 * I tracciati sono analizzati una sola volta e riusati da tutte le icone.
 */
public final class NexusGlyphDrawable extends Drawable {
    private static final Map<String, Path> symbolPaths = new HashMap<>();
    private final Motion motion;
    private final String glyph;
    private final Runnable nextIconFrame = this::invalidateSelf;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path symbol;
    private final RectF page = new RectF();
    private final RectF orbit = new RectF(4, 4, 20, 20);
    private final int size;

    public NexusGlyphDrawable(Motion motion, String glyph, int color, int size) {
        this.motion = motion;
        this.glyph = glyph;
        this.size = size;
        fill.setColor(color);
        stroke.setColor(color);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.35f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        if ("nexus".equals(glyph)) symbol = null;
        else {
            String name = symbolName(glyph);
            Path cached = symbolPaths.get(name);
            if (cached == null) {
                cached = androidx.core.graphics.PathParser.createPathFromPathData(NexusSymbolPaths.path(name));
                Matrix matrix = new Matrix();
                matrix.setScale(1f / 40f, 1f / 40f);
                matrix.postTranslate(0, 24);
                cached.transform(matrix);
                symbolPaths.put(name, cached);
            }
            symbol = cached;
        }
        setBounds(0, 0, size, size);
    }

    private String symbolName(String value) {
        switch (value) {
            case "folder-open": return "FolderOpen";
            case "folder": return "Folder";
            case "game": return "Game";
            case "chat": return "Chat";
            case "browser": return "Browser";
            case "terminal": return "Terminal";
            case "supremo": return "RemoteDesktop";
            case "note": return "Description";
            case "restart": return "Restart";
            case "power": return "Power";
            case "stop": return "Stop";
            case "close-app": return "Close";
            case "pulse": return "Pulse";
            case "dashboard": return "Dashboard";
            case "system": return "Memory";
            case "services": return "Services";
            default: return "Apps";
        }
    }

    @Override public void draw(Canvas canvas) {
        Rect bounds = getBounds();
        float edge = Math.min(bounds.width(), bounds.height());
        canvas.save();
        canvas.translate(bounds.exactCenterX() - edge / 2f, bounds.exactCenterY() - edge / 2f);
        canvas.scale(edge / 24f, edge / 24f);
        if ("folder-open".equals(glyph)) {
            boolean moving = isVisible() && motion.enabled() && !motion.lowBudget();
            float phase = moving ? (SystemClock.uptimeMillis() % 2400L) / 2400f : 0f;
            float lift = (float) Math.sin(phase * Math.PI * 2) * .65f;
            page.set(7, 2 + lift, 15, 14 + lift); canvas.drawRoundRect(page, 1, 1, stroke);
            page.set(10, 4 - lift, 18, 16 - lift); canvas.drawRoundRect(page, 1, 1, stroke);
            canvas.drawLine(12, 7 - lift, 16, 7 - lift, stroke);
            canvas.drawLine(12, 10 - lift, 16, 10 - lift, stroke);
            if (moving) scheduleSelf(nextIconFrame, SystemClock.uptimeMillis() + 16);
        }
        if (symbol != null) canvas.drawPath(symbol, fill);
        else {
            canvas.drawCircle(12, 12, 2.1f, stroke);
            canvas.drawArc(orbit, -38, 84, false, stroke);
            canvas.drawArc(orbit, 82, 80, false, stroke);
            canvas.drawArc(orbit, 202, 84, false, stroke);
        }
        canvas.restore();
    }

    @Override public boolean setVisible(boolean visible, boolean restart) {
        if (!visible) unscheduleSelf(nextIconFrame);
        return super.setVisible(visible, restart);
    }
    @Override public void setAlpha(int alpha) { fill.setAlpha(alpha); stroke.setAlpha(alpha); invalidateSelf(); }
    @Override public void setColorFilter(ColorFilter filter) { fill.setColorFilter(filter); stroke.setColorFilter(filter); invalidateSelf(); }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    @Override public int getIntrinsicWidth() { return size; }
    @Override public int getIntrinsicHeight() { return size; }
}
