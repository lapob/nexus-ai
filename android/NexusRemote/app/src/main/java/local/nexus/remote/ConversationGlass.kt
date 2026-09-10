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
        if (!enabled) { drawContent(); return@drawWithContent }
        val band = 40.dp.toPx().coerceAtMost(size.height / 4f)
        val top = size.height - band
        output.compositingStrategy = CompositingStrategy.Offscreen
        output.record {
        if (Build.VERSION.SDK_INT >= 31 && !efficient) {
            content.record { this@drawWithContent.drawContent() }
            drawLayer(content)
            for (upper in listOf(true, false)) {
            val glass = if (upper) upperGlass else lowerGlass
            val mask = if (upper) upperMask else lowerMask
            val edge = if (upper) 0f else top
            glass.renderEffect = BlurEffect(6.dp.toPx(), 6.dp.toPx(), TileMode.Clamp)
            glass.record(size = IntSize(size.width.roundToInt(), band.roundToInt())) {
                translate(top = -edge) { drawLayer(content) }
            }
            mask.compositingStrategy = CompositingStrategy.Offscreen
            mask.record(size = IntSize(size.width.roundToInt(), band.roundToInt())) {
                drawLayer(glass)
                drawRect(Brush.verticalGradient(if (upper) listOf(Color.White, Color.Transparent) else listOf(Color.Transparent, Color.White)), blendMode = BlendMode.DstIn)
            }
            translate(top = edge) { drawLayer(mask) }
            }
        } else this@drawWithContent.drawContent()
        val fraction = if (size.height > 0) band / size.height else 0f
        drawRect(Brush.verticalGradient(0f to Color.Transparent, fraction to Color.White, (1f - fraction) to Color.White, 1f to Color.Transparent), blendMode = BlendMode.DstIn)
        }
        drawLayer(output)
    }
}
