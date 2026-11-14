package local.nexus.console.ui;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;

/**
 * Emblema del varco e delle conferme. PC offline: anello eclissato e spento.
 * Server spento: anello del PC vivo con nucleo freddo che pulsa piano. Avvio:
 * archi che convergono verso il nucleo che si riaccende. Conferma: tono rosso.
 * Con animazioni ridotte resta un'immagine statica equivalente.
 */
@SuppressLint("ViewConstructor")
public final class NexusGateView extends NexusCanvasView {
    public static final int PROBING = 0, PC_OFFLINE = 1, SERVER_OFFLINE = 2, SERVER_STARTING = 3;
    /** Stessi emblemi per le conferme sensibili e per il comando inviato. */
    public static final int CONFIRM = 4, SENT = 5;

    private final int kind;
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bounds = new RectF();
    private final long born = SystemClock.uptimeMillis();

    public NexusGateView(Context context, Motion motion, int kind) {
        super(context, motion);
        this.kind = kind;
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(dp(1));
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setStrokeWidth(dp(2));
        halo.setStyle(Paint.Style.STROKE);
        halo.setStrokeCap(Paint.Cap.ROUND);
        halo.setStrokeWidth(dp(12));
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        boolean moving = motion.enabled() && isAttachedToWindow();
        float t = moving ? (SystemClock.uptimeMillis() - born) / 1000f * (motion.lowBudget() ? .6f : 1f) : 0f;
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float radius = Math.min(getWidth(), getHeight()) * .34f;
        int cool = Color.rgb(84, 102, 104);
        int warm = Color.rgb(246, 190, 128);
        boolean starting = kind == SERVER_STARTING || kind == SENT;
        boolean server = kind == SERVER_OFFLINE || starting;
        int tone = kind == PC_OFFLINE ? cool : kind == PROBING ? Color.rgb(120, 170, 172) : kind == CONFIRM ? NexusUi.DANGER : NexusUi.ACCENT;

        // Orbite di fondo: tre anelli sottili concentrici.
        for (int index = 0; index < 3; index++) {
            float r = radius * (1.18f - index * .26f);
            ring.setColor(tone);
            ring.setAlpha(kind == PC_OFFLINE ? 26 : 34 - index * 6);
            canvas.drawCircle(cx, cy, r, ring);
        }

        // Arco principale: eclissato (PC), stabile (server), in corsa (avvio/verifica).
        bounds.set(cx - radius, cy - radius, cx + radius, cy + radius);
        float speed = starting ? 160f : kind == PROBING ? 120f : kind == CONFIRM ? 26f : kind == SERVER_OFFLINE ? 14f : 6f;
        float sweep = kind == PC_OFFLINE ? 64f : starting ? 210f + (float) Math.sin(t * 2.4f) * 60f : 128f;
        float start = -90f + t * speed;
        arc.setColor(tone);
        arc.setAlpha(kind == PC_OFFLINE ? 110 : 230);
        halo.setColor(tone);
        halo.setAlpha(kind == PC_OFFLINE ? 10 : 34);
        canvas.drawArc(bounds, start, sweep, false, halo);
        canvas.drawArc(bounds, start, sweep, false, arc);
        if (kind != PC_OFFLINE) {
            bounds.inset(radius * .26f, radius * .26f);
            arc.setAlpha(150);
            canvas.drawArc(bounds, 90f - t * speed * 1.4f, sweep * .62f, false, arc);
        }

        // Nucleo: spento (PC), freddo e pulsante (server), acceso (avvio).
        float pulse = moving ? (float) (.5 + .5 * Math.sin(t * (starting ? 5.2 : 1.9))) : .5f;
        int coreColor = kind == PC_OFFLINE ? cool : server ? (starting ? NexusUi.ACCENT : warm) : tone;
        dot.setColor(coreColor);
        dot.setAlpha(kind == PC_OFFLINE ? 70 : 40 + Math.round(pulse * 50));
        canvas.drawCircle(cx, cy, dp(14) + pulse * dp(kind == PC_OFFLINE ? 0 : 6), dot);
        dot.setAlpha(kind == PC_OFFLINE ? 120 : 235);
        canvas.drawCircle(cx, cy, dp(starting ? 6 : 5), dot);

        // PC offline: frattura dell'orbita, segno che il collegamento è interrotto.
        if (kind == PC_OFFLINE) {
            arc.setColor(cool);
            arc.setAlpha(150);
            float gx = cx + (float) Math.cos(Math.toRadians(-38)) * radius;
            float gy = cy + (float) Math.sin(Math.toRadians(-38)) * radius;
            canvas.drawLine(gx - dp(7), gy - dp(7), gx + dp(7), gy + dp(7), arc);
        }
        if (moving && kind != PC_OFFLINE) postInvalidateOnAnimation();
        else if (moving) postInvalidateDelayed(48);
    }
}
