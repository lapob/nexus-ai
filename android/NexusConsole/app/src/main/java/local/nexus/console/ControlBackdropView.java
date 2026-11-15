package local.nexus.console;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;

/**
 * Vetro sfocato sotto le due barre fisse (titolo e schede in alto, dock in
 * basso); l'unica sorgente è il contenuto che scorre.
 *
 * Ogni banda è un solo passaggio fuori schermo: fondale, contenuto e maschera
 * di sfumatura vengono registrati nel RenderNode che porta già la sfocatura,
 * senza saveLayer aggiuntivi. Misurato su Galaxy S25 a 120 Hz: con saveLayer
 * e maschera separati lo scorrimento di Panoramica perdeva il 4-6% dei frame.
 */
final class ControlBackdropView extends View {
    private final View source;
    private final Drawable base;
    private final float fade;
    private final float bottomFade;
    private int topBand;
    private int bottomBand;
    private HardwareBackdrop hardware;

    ControlBackdropView(Context context, View source, Drawable base) {
        super(context);
        this.source = source;
        this.base = base;
        fade = 20f * getResources().getDisplayMetrics().density;
        bottomFade = 32f * getResources().getDisplayMetrics().density;
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        setClickable(false);
        setFocusable(false);
    }

    void setBands(int top, int bottom) {
        if (topBand == top && bottomBand == bottom) return;
        topBand = top;
        bottomBand = bottom;
        invalidate();
    }

    @Override protected void onDraw(Canvas canvas) {
        if (Build.VERSION.SDK_INT < 31 || !canvas.isHardwareAccelerated()
                || getWidth() == 0 || getHeight() == 0 || (topBand == 0 && bottomBand == 0)) return;
        if (hardware == null) hardware = new HardwareBackdrop(base, fade, bottomFade);
        float density = getResources().getDisplayMetrics().density;
        int width = getWidth(), height = getHeight();
        if (topBand > 0) {
            int bandBottom = Math.min(topBand, height);
            hardware.top.capture(source, width, height, 0, Math.min(height, bandBottom + margin(density)), 0, bandBottom, true, density);
            drawBand(canvas, 0, bandBottom, hardware.top);
        }
        if (bottomBand > 0) {
            int bandTop = Math.max(0, height - bottomBand);
            hardware.bottom.capture(source, width, height, Math.max(0, bandTop - margin(density)), height, bandTop, height, false, density);
            drawBand(canvas, bandTop, height, hardware.bottom);
        }
    }

    private static int margin(float density) { return (int) Math.ceil(16f * density); }

    @androidx.annotation.RequiresApi(31)
    private void drawBand(Canvas canvas, float top, float bottom, HardwareBackdrop.Band band) {
        int clip = canvas.save();
        canvas.clipRect(0, top, getWidth(), bottom);
        band.draw(canvas);
        canvas.restoreToCount(clip);
    }

    @Override protected void onDetachedFromWindow() {
        if (Build.VERSION.SDK_INT >= 31 && hardware != null) hardware.release();
        hardware = null;
        super.onDetachedFromWindow();
    }

    @androidx.annotation.RequiresApi(31)
    private static final class HardwareBackdrop {
        final Band top;
        final Band bottom;

        HardwareBackdrop(Drawable base, float fade, float bottomFade) {
            top = new Band(base, fade);
            bottom = new Band(base, bottomFade);
        }

        void release() { top.node.discardDisplayList(); bottom.node.discardDisplayList(); }

        static final class Band {
            final android.graphics.RenderNode node = new android.graphics.RenderNode("Control bar backdrop");
            private final Drawable base;
            private final float fadeLength;
            private final Paint mask = new Paint();
            private boolean configured;
            private int origin;
            private float maskStart = Float.NaN, maskEnd;

            Band(Drawable base, float fadeLength) {
                this.base = base;
                this.fadeLength = fadeLength;
                mask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
            }

            /**
             * Registra la fascia [start, end) del contenuto a un quarto di risoluzione.
             * La banda visibile è [bandTop, bandBottom): fuori da lì la maschera azzera
             * il contenuto, così la sfocatura non riporta dentro ciò che sta oltre.
             */
            void capture(View source, int width, int height, int start, int end, int bandTop, int bandBottom, boolean upper, float density) {
                origin = start;
                int sampledWidth = Math.max(1, (width + 3) / 4);
                int sampledHeight = Math.max(1, (end - start + 3) / 4);
                node.setPosition(0, 0, sampledWidth, sampledHeight);
                if (!configured) {
                    node.setRenderEffect(android.graphics.RenderEffect.createBlurEffect(4f * density, 4f * density, Shader.TileMode.CLAMP));
                    configured = true;
                }
                float from = upper ? Math.max(bandTop, bandBottom - fadeLength) : bandTop;
                float to = upper ? bandBottom : Math.min(bandBottom, bandTop + fadeLength);
                if (from != maskStart || to != maskEnd) {
                    maskStart = from; maskEnd = to;
                    int[] alpha = upper ? new int[]{255, 215, 128, 40, 0} : new int[]{0, 40, 128, 215, 255};
                    int[] colors = new int[alpha.length];
                    for (int i = 0; i < alpha.length; i++) colors[i] = Color.argb(alpha[i], 0, 0, 0);
                    mask.setShader(new LinearGradient(0, from, 0, Math.max(from + 1f, to), colors, null, Shader.TileMode.CLAMP));
                }
                Canvas recording = node.beginRecording(sampledWidth, sampledHeight);
                try {
                    recording.scale(.25f, .25f);
                    recording.translate(0, -origin);
                    // Solo la fascia sotto la barra: senza ritaglio la GPU ridisegnava
                    // a ogni frame di scorrimento l'intera pagina.
                    recording.clipRect(0, start, width, end);
                    // Il fondale cosmico copre il contenuto nitido sotto la barra:
                    // dietro il titolo resta solo vetro, mai testo leggibile sovrapposto.
                    if (base != null) {
                        base.setBounds(0, 0, width, height);
                        base.draw(recording);
                    }
                    source.draw(recording);
                    recording.drawRect(0, start, width, end, mask);
                } finally { node.endRecording(); }
            }

            void draw(Canvas canvas) {
                int saved = canvas.save();
                canvas.translate(0, origin);
                canvas.scale(4f, 4f);
                canvas.drawRenderNode(node);
                canvas.restoreToCount(saved);
            }
        }
    }
}
