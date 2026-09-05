package local.nexus.remote

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlin.math.*

private class AstralInspection {
    var dragging = false
    var start = Offset.Zero
    var point = Offset.Zero
    var lastNanos = 0L
    val rotation = FloatArray(2)
    val velocity = FloatArray(2)
    val target = FloatArray(2)
}

/** Native counterpart of src/shared/astral-core.js: one uninterrupted clock,
 * three fluid ribbons, identical geometry and real state/voice modulation. */
@Composable
internal fun AstralCore(diameter: Dp, state: String, energy: Float, reduceMotion: Boolean, particleBudget: Int, onClick: () -> Unit) {
    val target = when (state) {
        "ready" -> .2f; "listening" -> .57f; "transcribing" -> .7f; "thinking" -> .74f
        "responding" -> .85f; "speaking" -> .9f; "executing" -> .82f; "permission" -> .32f
        "offline" -> .03f; "error" -> .1f; "booting" -> .3f; else -> .15f
    }
    val activity = animateFloatAsState(target, tween(600), label = "astralState")
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var visible by remember(lifecycle) { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ -> visible = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val clock = remember { mutableFloatStateOf(0f) }
    val emergence = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(Unit) { emergence.animateTo(1f, tween(if (reduceMotion) 0 else 1600)) }
    LaunchedEffect(visible, reduceMotion) {
        if (visible && !reduceMotion) {
            var previous = 0L
            while (true) withFrameNanos { now ->
                if (previous != 0L) clock.floatValue += ((now - previous) / 1_000_000_000f).coerceIn(0f, .25f) * (.55f + activity.value * .35f)
                previous = now
            }
        }
    }
    val voice = animateFloatAsState(energy.coerceIn(0f, 1f), tween(120), label = "astralVoice")
    val opacity = animateFloatAsState(if (state == "offline" || state == "error") .35f else 1f, tween(700), label = "astralConnection")
    val count = ((particleBudget * 6).coerceIn(210, 660) / 3) * 3
    val xs = remember(count) { FloatArray(count) }; val ys = remember(count) { FloatArray(count) }; val zs = remember(count) { FloatArray(count) }
    val seeds = remember(count) { FloatArray(count) { i -> val n = sin((i + 1) * 91.733) * 43758.5453; (n - floor(n)).toFloat() } }
    val palette = remember { arrayOf(Color(0xFF7DF5FA), Color(0xFFE1F9FF), Color(0xFFA189FA)) }
    val inspection = remember { AstralInspection() }
    val driftX = remember(count) { FloatArray(count) }; val driftY = remember(count) { FloatArray(count) }
    val velocityX = remember(count) { FloatArray(count) }; val velocityY = remember(count) { FloatArray(count) }
    Canvas(Modifier.size(diameter).pointerInput(reduceMotion) {
        if (!reduceMotion) detectDragGestures(
            onDragStart = { inspection.start = it; inspection.point = it; inspection.dragging = true },
            onDragEnd = { inspection.dragging = false },
            onDragCancel = { inspection.dragging = false },
            onDrag = { change, _ ->
                change.consume()
                inspection.point = change.position
                val delta = change.position - inspection.start
                val dimension = min(size.width, size.height).toFloat().coerceAtLeast(1f)
                inspection.target[0] = (delta.y / dimension * 2.8f).coerceIn(-1.15f, 1.15f)
                inspection.target[1] = (delta.x / dimension * 2.8f).coerceIn(-1.15f, 1.15f)
            }
        )
    }.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
        .semantics { contentDescription = if (state == "offline") "NexusNXS offline" else "NexusNXS Core" }) {
        val flow = clock.floatValue; val activityLevel = activity.value; val audio = voice.value
        val now = System.nanoTime()
        val dt = if (inspection.lastNanos == 0L) .016f else ((now - inspection.lastNanos) / 1_000_000_000f).coerceIn(0f, 1f)
        inspection.lastNanos = now
        repeat(2) { axis ->
            val goal = if (inspection.dragging && !reduceMotion) inspection.target[axis] else 0f
            val omega = if (inspection.dragging) 9f else 1.7f; val decay = exp(-omega * dt)
            val error = inspection.rotation[axis] - goal; val a = inspection.velocity[axis] + omega * error
            inspection.rotation[axis] = goal + (error + a * dt) * decay
            inspection.velocity[axis] = (inspection.velocity[axis] - omega * a * dt) * decay
        }
        val reveal = 1f - (1f - emergence.value).pow(3)
        val unit = size.minDimension * 1.15f; val scale = 1f + sin(flow * .67f) * .026f + audio * .055f
        val dim = opacity.value
        repeat(count) { i ->
            val ribbon = i % 3; val progress = (((i / 3) * .61803398875) % 1.0).toFloat()
            val a = progress * (PI * 2).toFloat() + flow * .17f + ribbon * 2.094f
            val phi = i * 2.399963f + sin(flow * .6f + i * .13f) * .3f
            val radius = .28f + .024f * sin(a * 3f + flow * .55f + ribbon)
            val tube = .018f + seeds[i] * .038f + activityLevel * .008f
            var x = (radius + tube * cos(phi)) * cos(a); var y = (radius + tube * cos(phi)) * sin(a)
            var z = tube * sin(phi) + .036f * sin(a * 2f - flow * .5f)
            if (i % 11 == 0) { val reach = .22f + seeds[i] * .72f; x *= reach; y *= reach; z += sin(phi) * .13f }
            val tilt = (ribbon - 1) * 1.04f + .28f
            val rotatedY = y * cos(tilt) - z * sin(tilt); z = y * sin(tilt) + z * cos(tilt); y = rotatedY
            val yaw = flow * .09f + ribbon * .16f
            val rotatedX = x * cos(yaw) + z * sin(yaw); z = -x * sin(yaw) + z * cos(yaw); x = rotatedX
            val roll = ribbon * .85f + sin(flow * .2f) * .17f
            val projectedX = x * cos(roll) - y * sin(roll); y = x * sin(roll) + y * cos(roll); x = projectedX
            val yawInspect = inspection.rotation[1]; val pitchInspect = inspection.rotation[0]
            val inspectX = x * cos(yawInspect) + z * sin(yawInspect); z = -x * sin(yawInspect) + z * cos(yawInspect); x = inspectX
            val inspectY = y * cos(pitchInspect) - z * sin(pitchInspect); z = y * sin(pitchInspect) + z * cos(pitchInspect); y = inspectY
            val perspective = 1f / (1f - z * .75f); val scatter = (1f - reveal) * (.28f + seeds[i] * .28f)
            xs[i] = center.x + (x * perspective * scale + cos(phi) * scatter) * unit
            ys[i] = center.y + (y * perspective * scale + sin(phi) * scatter) * unit; zs[i] = z
            val dx = xs[i] - inspection.point.x; val dy = ys[i] - inspection.point.y
            val distance = hypot(dx, dy).coerceAtLeast(1f)
            val influence = if (inspection.dragging) (1f - distance / (size.minDimension * .32f)).coerceAtLeast(0f) else 0f
            val gx = dx / distance * influence * size.minDimension * .14f
            val gy = dy / distance * influence * size.minDimension * .14f
            val omega = if (influence > .01f) 4.5f else 1.7f; val decay = exp(-omega * dt)
            val ex = driftX[i] - gx; val ey = driftY[i] - gy
            val ax = velocityX[i] + omega * ex; val ay = velocityY[i] + omega * ey
            driftX[i] = gx + (ex + ax * dt) * decay; driftY[i] = gy + (ey + ay * dt) * decay
            velocityX[i] = (velocityX[i] - omega * ax * dt) * decay; velocityY[i] = (velocityY[i] - omega * ay * dt) * decay
            xs[i] += driftX[i]; ys[i] += driftY[i]
        }
        for (i in 0 until count step 3) {
            val peer = (i + if (i % 11 == 0) 33 else 9) % count
            if (hypot(xs[i] - xs[peer], ys[i] - ys[peer]) < size.minDimension * .25f)
                drawLine(Color(0xFF88DAEE).copy(alpha = (.05f + activityLevel * .1f) * reveal * dim), Offset(xs[i],ys[i]), Offset(xs[peer],ys[peer]), max(.4f, size.minDimension * .0011f))
        }
        repeat(count) { i ->
            val depth = (.55f + zs[i] * 1.3f).coerceIn(.15f, 1f)
            val color = palette[if (i % 19 == 0) 2 else if (i % 3 == 0) 1 else 0]
            val dot = max(.55f, size.minDimension * (.0017f + seeds[i] * .0015f)) * (.65f + depth * .7f)
            val point = Offset(xs[i],ys[i]); val alpha = reveal * (.32f + depth * .62f) * dim
            if (i % 13 == 0) {
                drawCircle(color.copy(alpha = alpha * .045f), dot * 7f, point)
                drawCircle(color.copy(alpha = alpha * .09f), dot * 3.7f, point)
            }
            drawCircle(color.copy(alpha = alpha), dot, point)
        }
        drawCircle(Brush.radialGradient(listOf(palette[0].copy(alpha = reveal * (.55f + activityLevel * .35f) * dim), Color.Transparent), center = center, radius = size.minDimension * .08f), size.minDimension * .08f)
        drawCircle(Color(0xFFE9FFFF).copy(alpha = reveal * dim), max(1f,size.minDimension * .006f))
    }
}
