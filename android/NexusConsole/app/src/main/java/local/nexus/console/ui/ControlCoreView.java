package local.nexus.console.ui;

import local.nexus.motion.NexusCoreBreath;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;

/**
 * Nucleo della schermata di connessione: sfera di grani che respira come il
 * core web/desktop, anelli e nodi orbitali. Tutto dipende dal tempo reale,
 * mai dal numero di frame; buffer fissi, nessuna allocazione in onDraw.
 */
@SuppressLint("ViewConstructor")
public final class ControlCoreView extends NexusCanvasView {
    private static final int PARTICLE_CAPACITY = 14;
    /** Grani del nucleo che respirano come su web/desktop (sfera di Fibonacci). */
    private static final int GRAIN_CAPACITY = 96;
    private final boolean offline;
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint particle = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float[] nodeX = new float[PARTICLE_CAPACITY];
    private final float[] nodeY = new float[PARTICLE_CAPACITY];
    private final Paint grain = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint heart = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float[] grainX = new float[GRAIN_CAPACITY];
    private final float[] grainY = new float[GRAIN_CAPACITY];
    private final float[] grainZ = new float[GRAIN_CAPACITY];
    private final float[] grainSeed = new float[GRAIN_CAPACITY];
    private final float[] grainStagger = new float[GRAIN_CAPACITY];
    private final float[] breathed = new float[3];
    private final RectF outerBounds = new RectF();
    private final RectF innerBounds = new RectF();
    /** Origine temporale: rotazioni e respiro dipendono dal tempo, mai dal numero di frame. */
    private final long born = SystemClock.uptimeMillis();

    public ControlCoreView(Context context, Motion motion, boolean offline) {
        super(context, motion);
        this.offline = offline;
        for (int index = 0; index < GRAIN_CAPACITY; index++) {
            float y = 1f - 2f * (index + .5f) / GRAIN_CAPACITY;
            float ring = (float) Math.sqrt(Math.max(0f, 1f - y * y));
            double turn = index * 2.399963229728653;
            grainX[index] = (float) Math.cos(turn) * ring;
            grainY[index] = y;
            grainZ[index] = (float) Math.sin(turn) * ring;
            grainSeed[index] = ((index * 73) % 97) / 97f;
            // Sfasamento a onda dal centro verso il bordo, come i grani del sito.
            grainStagger[index] = .07f * (float) Math.hypot(grainX[index], grainY[index]) + .025f * grainSeed[index];
        }
        grain.setColor(offline ? Color.rgb(92, 108, 109) : Color.rgb(150, 246, 244));
        heart.setColor(offline ? Color.argb(26, 92, 106, 107) : Color.argb(40, 75, 231, 233));
        int color = offline ? Color.rgb(78, 94, 95) : NexusUi.ACCENT;
        stroke.setColor(color);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeWidth(dp(2));
        glow.setColor(offline ? Color.argb(20, 92, 106, 107) : Color.argb(48, 75, 231, 233));
        glow.setStyle(Paint.Style.STROKE);
        glow.setStrokeWidth(dp(10));
        particle.setColor(color);
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        boolean moving = !offline && motion.enabled() && isAttachedToWindow();
        boolean lowBudget = motion.lowBudget();
        // Tempo reale: a 120 Hz il nucleo non gira piu veloce che a 60 Hz.
        // Con animazioni ridotte resta la forma composta, ferma e leggibile.
        float seconds = moving ? (SystemClock.uptimeMillis() - born) / 1000f : 0f;
        float phase = seconds * 75f % 360f;
        float zoom = moving ? NexusCoreBreath.zoom(seconds) : 1f;
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float radius = Math.min(getWidth(), getHeight()) * .29f * zoom;
        float inhale = moving ? NexusCoreBreath.inhale(seconds) : .5f;
        canvas.drawCircle(cx, cy, radius * (.42f + inhale * .08f), heart);
        int grains = offline ? 36 : lowBudget ? 48 : GRAIN_CAPACITY;
        float spin = seconds * .21f;
        float spinCos = (float) Math.cos(spin), spinSin = (float) Math.sin(spin);
        for (int index = 0; index < grains; index++) {
            int at = grains == GRAIN_CAPACITY ? index : index * GRAIN_CAPACITY / grains;
            float b = moving ? NexusCoreBreath.breath(seconds, grainStagger[at]) : 0f;
            NexusCoreBreath.breathePoint(breathed, grainX[at] * .62f, grainY[at] * .62f, grainZ[at] * .62f, b, grainSeed[at], seconds);
            float x = breathed[0] * spinCos + breathed[2] * spinSin;
            float z = -breathed[0] * spinSin + breathed[2] * spinCos;
            float depth = .62f + .38f * (z + 1f) * .5f;
            float lift = Math.abs(b);
            grain.setAlpha(Math.max(0, Math.min(255, Math.round((offline ? 70 : 92 + 120 * depth) * (1f - .25f * lift)))));
            canvas.drawCircle(cx + x * radius, cy + breathed[1] * radius, dp(1) * (.65f + .75f * depth + (b > 0 ? .45f * lift : 0f)), grain);
        }
        outerBounds.set(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.save();
        canvas.rotate(offline ? -24f : phase, cx, cy);
        canvas.drawArc(outerBounds, -36, offline ? 72 : 118, false, glow);
        canvas.drawArc(outerBounds, -36, offline ? 72 : 118, false, stroke);
        canvas.drawArc(outerBounds, 126, offline ? 58 : 86, false, stroke);
        innerBounds.set(cx - radius * .72f, cy - radius * .72f, cx + radius * .72f, cy + radius * .72f);
        canvas.rotate(offline ? 0 : -phase * 1.55f, cx, cy);
        canvas.drawArc(innerBounds, 18, offline ? 100 : 174, false, stroke);
        canvas.restore();
        int particleCount = lowBudget ? 7 : PARTICLE_CAPACITY;
        for (int index = 0; index < particleCount; index++) {
            double angle = Math.toRadians(index * (360d / particleCount) + (offline ? 0 : phase * .55f));
            float orbitBreath = moving ? NexusCoreBreath.breath(seconds, index * .011f) * .09f : 0f;
            float wave = offline ? 0f : (float) Math.sin(Math.toRadians(phase * .8f + index * 47f)) * .055f + orbitBreath;
            float distance = radius * (index % 3 == 0 ? 1.24f + wave : index % 2 == 0 ? 1.03f - wave : .82f + wave);
            float dot = dp(index % 3 == 0 ? 2 : 1);
            particle.setAlpha(offline ? 65 : 115 + (index * 13) % 100);
            nodeX[index] = cx + (float) Math.cos(angle) * distance;
            nodeY[index] = cy + (float) Math.sin(angle) * distance;
            canvas.drawCircle(nodeX[index], nodeY[index], dot, particle);
        }
        if (!offline) {
            particle.setStyle(Paint.Style.STROKE);
            particle.setStrokeWidth(dp(1) * .55f);
            particle.setAlpha(lowBudget ? 22 : 34);
            for (int index = 0; index < particleCount; index += 2) {
                int peer = (index + 5) % particleCount;
                canvas.drawLine(nodeX[index], nodeY[index], nodeX[peer], nodeY[peer], particle);
            }
            particle.setStyle(Paint.Style.FILL);
        }
        particle.setAlpha(offline ? 80 : 210);
        canvas.drawCircle(cx, cy, dp(4) * (.9f + inhale * .2f), particle);
        if (moving) postInvalidateOnAnimation();
    }
}
