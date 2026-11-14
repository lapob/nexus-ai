package local.nexus.console.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.view.View;

/**
 * Storico dell'ultimo minuto: area sfumata sotto la curva e punto luminoso
 * sull'ultimo valore. Buffer fisso, nessuna allocazione a ogni campione o frame.
 */
public final class SparklineView extends View {
    private static final int SAMPLE_CAPACITY = 20;
    private final float[] samples = new float[SAMPLE_CAPACITY];
    private int sampleCount;
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path area = new Path();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint head = new Paint(Paint.ANTI_ALIAS_FLAG);

    public SparklineView(Context context) {
        super(context);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        line.setColor(NexusUi.ACCENT); line.setStrokeWidth(dp(1)); line.setStyle(Paint.Style.STROKE);
        glow.setColor(Color.argb(30, 101, 220, 216)); glow.setStrokeWidth(dp(5)); glow.setStyle(Paint.Style.STROKE);
        head.setColor(NexusUi.ACCENT);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    public void add(int value) {
        float bounded = Math.max(0, Math.min(100, value));
        if (sampleCount < SAMPLE_CAPACITY) {
            samples[sampleCount++] = bounded;
        } else {
            System.arraycopy(samples, 1, samples, 0, SAMPLE_CAPACITY - 1);
            samples[SAMPLE_CAPACITY - 1] = bounded;
        }
        invalidate();
    }

    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        // Area sotto la curva che sfuma nel vetro: profondità senza rumore.
        fill.setShader(new LinearGradient(0, 0, 0, height,
            Color.argb(46, 75, 231, 233), Color.TRANSPARENT, Shader.TileMode.CLAMP));
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (sampleCount < 2) return;
        float step = getWidth() / (float) (sampleCount - 1);
        float inset = dp(3);
        float span = getHeight() - inset * 2;
        area.reset();
        area.moveTo(0, getHeight());
        for (int index = 0; index < sampleCount; index++) area.lineTo(index * step, inset + span - samples[index] / 100f * span);
        area.lineTo((sampleCount - 1) * step, getHeight());
        area.close();
        canvas.drawPath(area, fill);
        for (int index = 1; index < sampleCount; index++) {
            float x1 = (index - 1) * step, y1 = inset + span - samples[index - 1] / 100f * span;
            float x2 = index * step, y2 = inset + span - samples[index] / 100f * span;
            canvas.drawLine(x1, y1, x2, y2, glow);
            canvas.drawLine(x1, y1, x2, y2, line);
        }
        float lastX = (sampleCount - 1) * step, lastY = inset + span - samples[sampleCount - 1] / 100f * span;
        head.setAlpha(60);
        canvas.drawCircle(lastX - dp(2), lastY, dp(5), head);
        head.setAlpha(255);
        canvas.drawCircle(lastX - dp(2), lastY, dp(2), head);
    }
}
