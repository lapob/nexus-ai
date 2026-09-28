package local.nexus.console;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.os.Build;
import android.view.View;

/** Hardware backdrop for the two fixed bars; the scrolling content is the only source. */
final class ControlBackdropView extends View {
    private final View source;
    private final Paint mask = new Paint();
    private final float fade;
    private int topBand;
    private int bottomBand;
    private HardwareBackdrop hardware;

    ControlBackdropView(Context context, View source) {
        super(context);
        this.source = source;
        fade = 20f * getResources().getDisplayMetrics().density;
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        setClickable(false);
        setFocusable(false);
        mask.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.DST_IN));
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
        if (hardware == null) hardware = new HardwareBackdrop();
        hardware.capture(source, getWidth(), getHeight(), topBand, bottomBand, getResources().getDisplayMetrics().density);
        if (topBand > 0) drawBand(canvas, 0, Math.min(topBand, getHeight()), true);
        if (bottomBand > 0) drawBand(canvas, Math.max(0, getHeight() - bottomBand), getHeight(), false);
    }

    @androidx.annotation.RequiresApi(31)
    private void drawBand(Canvas canvas, float top, float bottom, boolean upper) {
        int clip = canvas.save();
        canvas.clipRect(0, top, getWidth(), bottom);
        int layer = canvas.saveLayer(0, top, getWidth(), bottom, null);
        hardware.draw(canvas, upper);
        float start = upper ? Math.max(top, bottom - fade) : top;
        float end = upper ? bottom : Math.min(bottom, top + fade);
        if (end > start) {
            mask.setShader(new LinearGradient(0, start, 0, end,
                upper ? Color.BLACK : Color.TRANSPARENT,
                upper ? Color.TRANSPARENT : Color.BLACK, Shader.TileMode.CLAMP));
            canvas.drawRect(0, top, getWidth(), bottom, mask);
        }
        canvas.restoreToCount(layer);
        canvas.restoreToCount(clip);
    }

    @Override protected void onDetachedFromWindow() {
        if (Build.VERSION.SDK_INT >= 31 && hardware != null) hardware.release();
        hardware = null;
        super.onDetachedFromWindow();
    }

    @androidx.annotation.RequiresApi(31)
    private static final class HardwareBackdrop {
        private final Band top = new Band();
        private final Band bottom = new Band();

        void capture(View source, int width, int height, int topHeight, int bottomHeight, float density) {
            int margin = (int) Math.ceil(16f * density);
            if (topHeight > 0) top.capture(source, width, 0, Math.min(height, topHeight + margin), density);
            if (bottomHeight > 0) bottom.capture(source, width, Math.max(0, height - bottomHeight - margin), height, density);
        }

        void draw(Canvas canvas, boolean upper) { (upper ? top : bottom).draw(canvas); }
        void release() { top.node.discardDisplayList(); bottom.node.discardDisplayList(); }

        private static final class Band {
            private final android.graphics.RenderNode node = new android.graphics.RenderNode("Control bar backdrop");
            private boolean configured;
            private int origin;

            void capture(View source, int width, int start, int end, float density) {
                origin = start;
                int sampledWidth = Math.max(1, (width + 3) / 4);
                int sampledHeight = Math.max(1, (end - start + 3) / 4);
                node.setPosition(0, 0, sampledWidth, sampledHeight);
                if (!configured) {
                    node.setRenderEffect(android.graphics.RenderEffect.createBlurEffect(4f * density, 4f * density, Shader.TileMode.CLAMP));
                    configured = true;
                }
                Canvas recording = node.beginRecording(sampledWidth, sampledHeight);
                try {
                    recording.scale(.25f, .25f);
                    recording.translate(0, -origin);
                    source.draw(recording);
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
