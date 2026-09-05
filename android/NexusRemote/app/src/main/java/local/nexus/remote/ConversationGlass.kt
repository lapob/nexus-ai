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
    val glass = rememberGraphicsLayer()
    val mask = rememberGraphicsLayer()
    return drawWithContent {
        if (!enabled) { drawContent(); return@drawWithContent }
        val band = 40.dp.toPx().coerceAtMost(size.height)
        val top = size.height - band
        if (Build.VERSION.SDK_INT >= 31 && !efficient) {
            content.record { this@drawWithContent.drawContent() }
            drawLayer(content)
            glass.renderEffect = BlurEffect(6.dp.toPx(), 6.dp.toPx(), TileMode.Clamp)
            glass.record(size = IntSize(size.width.roundToInt(), band.roundToInt())) {
                translate(top = -top) { drawLayer(content) }
            }
            mask.compositingStrategy = CompositingStrategy.Offscreen
            mask.record(size = IntSize(size.width.roundToInt(), band.roundToInt())) {
                drawLayer(glass)
                drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.White)), blendMode = BlendMode.DstIn)
            }
            translate(top = top) { drawLayer(mask) }
        } else drawContent()
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color(0xB3020607)), startY = top, endY = size.height))
    }
}
