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
            // Stesse fasi del core web/desktop (core-render.ts): sfasamento per
            // grano e onda che scompone il guscio dall'alto verso il basso.
            grainStagger[index] = grainSeed[index] * .16f + .04f + (1f - y) * .07f;
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

    /** Energie per stato, identiche a ENERGY di web/src/core-render.ts. */
    public static final float ENERGY_IDLE = .15f, ENERGY_LISTENING = .4f, ENERGY_THINKING = .6f,
        ENERGY_RESPONDING = 1f, ENERGY_SPEAKING = .85f, ENERGY_ERROR = .35f;
    private float energy = ENERGY_THINKING, energyTarget = ENERGY_THINKING;
    private long lastFrame;

    /** Stato del server o della voce: l'energia converge in modo morbido, come sul web. */
    public void setEnergy(float target) {
        energyTarget = Math.max(0f, Math.min(1f, target));
        if (!motion.enabled()) { energy = energyTarget; invalidate(); }
    }

    /**
     * Dissolvenza radiale come nel core web (smoothstep verso il bordo), tarata
     * sul nucleo di Control che occupa più superficie: la luce arriva a zero
     * esattamente sul bordo della vista, quindi nessun grano viene tagliato.
     */
    private static float radialFade(float distance, float half) {
        float t = Math.min(1f, Math.max(0f, (distance / half - .72f) / (1f - .72f)));
        return 1f - t * t * (3f - 2f * t);
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        boolean moving = !offline && motion.enabled() && isAttachedToWindow();
        boolean lowBudget = motion.lowBudget();
        // Tempo reale: a 120 Hz il nucleo non gira piu veloce che a 60 Hz.
        // Con animazioni ridotte resta la forma composta, ferma e leggibile.
        float seconds = moving ? (SystemClock.uptimeMillis() - born) / 1000f : 0f;
        long now = born + Math.round(seconds * 1000f);
        if (!moving) now = SystemClock.uptimeMillis();
        // Convergenza dell'energia indipendente dalla frequenza: 0,04 per frame a 60 Hz sul web.
        float dt = lastFrame == 0L ? 0f : Math.min(.25f, (now - lastFrame) / 1000f);
        lastFrame = now;
        energy += (energyTarget - energy) * (moving ? 1f - (float) Math.exp(-2.45f * dt) : 1f);
        // Il respiro entra piano (~3 s) dopo l'avvio, come sul web; fermo con movimento ridotto.
        float ramp = moving ? Math.min(1f, Math.max(0f, (seconds - 1.2f) / 3f)) : 0f;
        float breath = ramp * ramp * (3f - 2f * ramp);
        float phase = seconds * (45f + 60f * energy) % 360f;
        float zoom = 1f + (NexusCoreBreath.zoom(seconds) - 1f) * breath;
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float half = Math.min(getWidth(), getHeight()) / 2f;
        float radius = half * .58f * zoom;
        float inhale = moving ? NexusCoreBreath.inhale(seconds) : .5f;
        canvas.drawCircle(cx, cy, radius * (.42f + inhale * .08f) * (.9f + .2f * energy), heart);
        int grains = offline ? 36 : lowBudget ? 48 : GRAIN_CAPACITY;
        float spin = seconds * (.08f + .22f * energy);
        float spinCos = (float) Math.cos(spin), spinSin = (float) Math.sin(spin);
        for (int index = 0; index < grains; index++) {
            int at = grains == GRAIN_CAPACITY ? index : index * GRAIN_CAPACITY / grains;
            float b = breath * NexusCoreBreath.breath(seconds, grainStagger[at]);
            float wave = moving ? (float) Math.sin(seconds * (.6f + energy * 1.4f) + grainSeed[at] * 6.2831f + grainY[at] * 4f) : 0f;
            float shell = .62f + .05f * wave * (.4f + energy);
            NexusCoreBreath.breathePoint(breathed, grainX[at] * shell, grainY[at] * shell, grainZ[at] * shell, b, grainSeed[at], seconds);
            float x = breathed[0] * spinCos + breathed[2] * spinSin;
            float z = -breathed[0] * spinSin + breathed[2] * spinCos;
            float depth = .62f + .38f * (z + 1f) * .5f;
            float lift = Math.abs(b);
            float gx = cx + x * radius, gy = cy + breathed[1] * radius;
            float fade = radialFade((float) Math.hypot(gx - cx, gy - cy), half);
            if (fade < .002f) continue;
            float light = (offline ? 70 : (92 + 120 * depth) * (.55f + .45f * energy) / .82f) * (1f - .26f * lift) * fade;
            grain.setAlpha(Math.max(0, Math.min(255, Math.round(light))));
            canvas.drawCircle(gx, gy, dp(1) * (.65f + .75f * depth + (b > 0 ? .45f * lift : 0f)) * (1f + energy * .3f) * (.35f + .65f * fade), grain);
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
            float orbitBreath = breath * NexusCoreBreath.breath(seconds, index * .011f) * .09f;
            float wave = offline ? 0f : (float) Math.sin(Math.toRadians(phase * .8f + index * 47f)) * .055f + orbitBreath;
            float distance = radius * (index % 3 == 0 ? 1.24f + wave : index % 2 == 0 ? 1.03f - wave : .82f + wave);
            float fade = radialFade(distance, half);
            float dot = dp(index % 3 == 0 ? 2 : 1) * (.35f + .65f * fade);
            particle.setAlpha(Math.round((offline ? 65 : 115 + (index * 13) % 100) * fade));
            nodeX[index] = cx + (float) Math.cos(angle) * distance;
            nodeY[index] = cy + (float) Math.sin(angle) * distance;
            if (fade >= .002f) canvas.drawCircle(nodeX[index], nodeY[index], dot, particle);
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
