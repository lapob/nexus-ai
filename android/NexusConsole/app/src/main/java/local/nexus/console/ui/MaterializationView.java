package local.nexus.console.ui;

import local.nexus.motion.NexusMotion;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/**
 * Velo di particelle che si espande e svanisce quando una superficie nuova
 * si materializza. Coordinate in buffer fissi: nessuna allocazione in onDraw.
 */
@SuppressLint("ViewConstructor")
public final class MaterializationView extends NexusCanvasView {
    private static final int PARTICLE_CAPACITY = 34;
    private final Paint node = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint link = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float[] xs = new float[PARTICLE_CAPACITY];
    private final float[] ys = new float[PARTICLE_CAPACITY];
    private ValueAnimator animator;
    private float progress;

    public MaterializationView(Context context, Motion motion) {
        super(context, motion);
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        setClickable(false);
        node.setColor(NexusUi.ACCENT);
        link.setColor(NexusUi.ACCENT);
        link.setStyle(Paint.Style.STROKE);
        link.setStrokeWidth(dp(1) * .55f);
    }

    public void materialize() {
        if (!motion.enabled()) { setVisibility(View.GONE); return; }
        if (animator != null) animator.cancel();
        progress = 0f;
        setAlpha(1f);
        setVisibility(View.VISIBLE);
        animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(motion.duration(NexusMotion.MATERIALIZE));
        animator.setInterpolator(motion.emphasized());
        animator.addUpdateListener(value -> { progress = (float) value.getAnimatedValue(); invalidate(); });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator animation) { setVisibility(View.GONE); }
            @Override public void onAnimationCancel(Animator animation) { setVisibility(View.GONE); }
        });
        animator.start();
    }

    @Override protected void onDetachedFromWindow() {
        if (animator != null) animator.cancel();
        super.onDetachedFromWindow();
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int count = motion.lowBudget() ? 18 : PARTICLE_CAPACITY;
        float cx = getWidth() * .5f;
        float cy = getHeight() * .42f;
        float reach = Math.min(getWidth(), getHeight()) * (.12f + progress * .46f);
        float fade = (float) Math.sin(Math.PI * Math.min(1f, progress));
        for (int index = 0; index < count; index++) {
            double angle = index * 2.399963229728653 + progress * .62;
            float lane = .32f + ((index * 37) % 67) / 100f;
            float drift = (float) Math.sin(index * 1.71 + progress * 5.4) * dp(5);
            xs[index] = cx + (float) Math.cos(angle) * reach * lane + drift;
            ys[index] = cy + (float) Math.sin(angle) * reach * lane - drift * .36f;
            node.setAlpha(Math.max(0, Math.min(255, Math.round(fade * (110 + (index % 5) * 23)))));
            canvas.drawCircle(xs[index], ys[index], dp(index % 7 == 0 ? 2 : 1), node);
        }
        link.setAlpha(Math.round(fade * (motion.lowBudget() ? 20 : 34)));
        for (int index = 0; index < count; index += 4) {
            int peer = (index + 7) % count;
            canvas.drawLine(xs[index], ys[index], xs[peer], ys[peer], link);
        }
    }
}
