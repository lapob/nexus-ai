package local.nexus.remote

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.layer.CompositingStrategy
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Blur only a small live strip, never a screenshot or the keyboard owned by Android. */
@Composable
internal fun Modifier.conversationGlass(enabled: Boolean, efficient: Boolean): Modifier {
    val content = rememberGraphicsLayer()
    val upperGlass = rememberGraphicsLayer()
    val lowerGlass = rememberGraphicsLayer()
    val upperMask = rememberGraphicsLayer()
    val lowerMask = rememberGraphicsLayer()
    val output = rememberGraphicsLayer()
    return drawWithContent {
        if (!enabled || size.width < 1f || size.height < 1f) { drawContent(); return@drawWithContent }
        val band = 48.dp.toPx().coerceAtMost(size.height / 4f)
        val top = size.height - band
        val fraction = if (size.height > 0) band / size.height else 0f
        val blurEnabled = Build.VERSION.SDK_INT >= 31 && !efficient
        val blurRadius = 6.dp.toPx()
        val stripSize = IntSize(size.width.roundToInt(), band.roundToInt().coerceAtLeast(1))
        // Record each dependency before its consumer. Nested recordings reuse
        // Compose's mutable DrawScope and can make density resolve to itself.
        content.record { this@drawWithContent.drawContent() }
        if (blurEnabled) {
            for (upper in listOf(true, false)) {
                val glass = if (upper) upperGlass else lowerGlass
                val mask = if (upper) upperMask else lowerMask
                val edge = if (upper) 0f else top
                glass.renderEffect = BlurEffect(blurRadius, blurRadius, TileMode.Clamp)
                glass.record(size = stripSize) {
                    translate(top = -edge) { drawLayer(content) }
                }
                mask.compositingStrategy = CompositingStrategy.Offscreen
                mask.blendMode = BlendMode.Plus
                mask.record(size = stripSize) {
                    drawLayer(glass)
                    drawRect(Brush.verticalGradient(if (upper) listOf(Color.White, Color.Transparent) else listOf(Color.Transparent, Color.White)), blendMode = BlendMode.DstIn)
                }
            }
        }
        output.compositingStrategy = CompositingStrategy.Offscreen
        output.record {
            drawLayer(content)
            if (blurEnabled) {
                // Cross-fade sharp and blurred text without doubling glyphs.
                drawRect(Brush.verticalGradient(0f to Color.Transparent, fraction to Color.White, (1f - fraction) to Color.White, 1f to Color.Transparent), blendMode = BlendMode.DstIn)
                drawLayer(upperMask)
                translate(top = top) { drawLayer(lowerMask) }
            }
            drawRect(Brush.verticalGradient(
            0f to Color.Transparent,
            fraction * .18f to Color.White.copy(alpha = .08f),
            fraction * .45f to Color.White.copy(alpha = .42f),
            fraction * .76f to Color.White.copy(alpha = .86f),
            fraction to Color.White,
            (1f - fraction) to Color.White,
            (1f - fraction * .76f) to Color.White.copy(alpha = .86f),
            (1f - fraction * .45f) to Color.White.copy(alpha = .42f),
            (1f - fraction * .18f) to Color.White.copy(alpha = .08f),
            1f to Color.Transparent
            ), blendMode = BlendMode.DstIn)
        }
        drawLayer(output)
    }
}
