package local.nexus.console.ui;

import local.nexus.motion.NexusMotion;

import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;

/** Arco di carico: traccia tenue, arco ciano (rosso oltre il 90 %) che scorre al nuovo valore. */
@SuppressLint("ViewConstructor")
public final class MetricGaugeView extends NexusCanvasView {
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bounds = new RectF();
    private float shown;
    private float target;
    private ValueAnimator animator;

    public MetricGaugeView(Context context, Motion motion, int value) {
        super(context, motion);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        track.setStyle(Paint.Style.STROKE); track.setStrokeWidth(dp(4)); track.setStrokeCap(Paint.Cap.ROUND);
        track.setColor(Color.argb(30, 132, 190, 192));
        arc.setStyle(Paint.Style.STROKE); arc.setStrokeWidth(dp(4)); arc.setStrokeCap(Paint.Cap.ROUND);
        halo.setStyle(Paint.Style.STROKE); halo.setStrokeWidth(dp(10)); halo.setStrokeCap(Paint.Cap.ROUND);
        target = Math.max(0, Math.min(100, value));
        shown = motion.enabled() ? 0f : target;
        if (motion.enabled()) post(() -> animateTo(target));
    }

    public void setValue(int value) {
        float next = Math.max(0, Math.min(100, value));
        if (Math.abs(next - target) < .5f) return;
        target = next;
        animateTo(next);
    }

    private void animateTo(float next) {
        if (animator != null) animator.cancel();
        if (!motion.enabled()) { shown = next; invalidate(); return; }
        animator = ValueAnimator.ofFloat(shown, next);
        animator.setDuration(motion.duration(NexusMotion.CURSOR_PULSE));
        animator.setInterpolator(motion.standard());
        animator.addUpdateListener(animation -> { shown = (float) animation.getAnimatedValue(); invalidate(); });
        animator.start();
    }

    @Override protected void onDetachedFromWindow() {
        if (animator != null) animator.cancel();
        super.onDetachedFromWindow();
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float inset = dp(7);
        bounds.set(inset, inset, getWidth() - inset, getHeight() - inset);
        canvas.drawArc(bounds, 135, 270, false, track);
        int color = target >= 90 ? NexusUi.DANGER : NexusUi.ACCENT;
        arc.setColor(color);
        halo.setColor(color);
        halo.setAlpha(28);
        float sweep = Math.max(2f, 270f * shown / 100f);
        canvas.drawArc(bounds, 135, sweep, false, halo);
        canvas.drawArc(bounds, 135, sweep, false, arc);
    }
}
