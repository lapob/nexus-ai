package local.nexus.remote

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.RenderProcessGoneDetail
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateRectAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/** One local-only GPU scene. No JavaScript bridge, remote page, or file access. */
internal class CosmicSceneState {
    var bounds by mutableStateOf(Rect.Zero)
    var state by mutableStateOf("idle")
    var energy by mutableFloatStateOf(0f)
    var reduced by mutableStateOf(false)
    var present by mutableStateOf(false)
    var inspection by mutableStateOf(listOf(0f, 0f, 0f))
}
internal val LocalCosmicScene = staticCompositionLocalOf { CosmicSceneState() }

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun CosmicScene(modifier: Modifier = Modifier) {
    val scene = LocalCosmicScene.current
    val density = LocalDensity.current.density
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var web by remember { mutableStateOf<WebView?>(null) }
    var origin by remember { mutableStateOf(Rect.Zero) }
    var loaded by remember { mutableStateOf(false) }
    var generation by remember { mutableIntStateOf(0) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> { web?.onResume(); web?.evaluateJavascript("window.nexusPaused=false;window.nexusVisualizer?.refresh()", null) }
                Lifecycle.Event.ON_STOP -> { web?.evaluateJavascript("window.nexusPaused=true", null); web?.onPause() }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); web?.stopLoading(); web?.destroy(); web = null }
    }
    key(generation) {
    AndroidView(modifier = modifier.onGloballyPositioned { origin = it.boundsInWindow() }, factory = { context ->
        WebView(context).apply {
            web = this
            setBackgroundColor(AndroidColor.TRANSPARENT)
            importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            isFocusable = false
            setOnTouchListener { _, _ -> true }
            settings.apply {
                javaScriptEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                blockNetworkLoads = true
                domStorageEnabled = false
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportMultipleWindows(false)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(ByteArray(0)))
                override fun onPageFinished(view: WebView?, url: String?) { loaded = true }
                override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                    (view?.parent as? android.view.ViewGroup)?.removeView(view)
                    view?.destroy()
                    if (web === view) web = null
                    loaded = false
                    generation += 1
                    return true
                }
            }
            val html = context.assets.open("cosmic-visualizers.html").bufferedReader().use { it.readText() }
            loadDataWithBaseURL("https://visualizer.nexus.invalid/", html, "text/html", "UTF-8", null)
        }
    })
    }
    val current by rememberUpdatedState(scene)
    val currentOrigin by rememberUpdatedState(origin)
    LaunchedEffect(loaded, density) {
        if (!loaded) return@LaunchedEffect
        var previous = ""
        while (true) {
            val s = current; val b = s.bounds; val o = currentOrigin
            val data = JSONObject().put("state", s.state).put("energy", if (s.energy.isFinite()) s.energy.coerceIn(0f, 1f) else 0f)
                .put("reduced", s.reduced).put("visible", s.present)
                .put("inspection", JSONArray(s.inspection))
                .put("bounds", JSONArray(listOf((b.left-o.left)/density, (b.top-o.top)/density, b.width/density, b.height/density))).toString()
            if (data != previous && lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                web?.evaluateJavascript("window.updateNexusVisual && window.updateNexusVisual($data)", null)
                previous = data
            }
            // Follow the display clock; unchanged state never crosses into WebView.
            withFrameNanos { }
        }
    }
}

@Composable
internal fun CosmicCore(diameter: Dp, state: String, energy: Float, reduceMotion: Boolean, onSwipeDown: (() -> Unit)? = null, onPresentationDrag: ((Offset?) -> Unit)? = null, onClick: () -> Unit) {
    val scene = LocalCosmicScene.current
    val interaction = remember { MutableInteractionSource() }
    var layoutBounds by remember { mutableStateOf(Rect.Zero) }
    val pressed by interaction.collectIsPressedAsState()
    val swipeDown by rememberUpdatedState(onSwipeDown)
    val presentationDrag by rememberUpdatedState(onPresentationDrag)
    val swipeThreshold = with(LocalDensity.current) { 64.dp.toPx() }
    val touchScale by animateFloatAsState(if (pressed && !reduceMotion) .984f else 1f,
        tween(if (reduceMotion) 0 else if (pressed) local.nexus.motion.NexusMotion.PRESS else local.nexus.motion.NexusMotion.CORE_RELEASE,
            easing = CubicBezierEasing(.2f, 0f, .2f, 1f)), label = "Core touch")
    // Read snapshot values during composition so layout/press frames schedule
    // the scene update, including when no other application state changes.
    val measuredBounds = layoutBounds
    val inset = measuredBounds.width * (1f - touchScale) / 2f
    SideEffect {
        scene.state = state; scene.energy = energy; scene.reduced = reduceMotion
        scene.bounds = Rect(measuredBounds.left + inset, measuredBounds.top + inset,
            measuredBounds.right - inset, measuredBounds.bottom - inset)
    }
    DisposableEffect(scene) { scene.present = true; onDispose { scene.present = false } }
    Box(Modifier.size(diameter).onGloballyPositioned { layoutBounds = it.boundsInWindow() }
        .pointerInput(reduceMotion, swipeThreshold) {
            var displacement = Offset.Zero
            var dragOrigin = Offset.Zero
            detectDragGestures(
                onDragStart = { dragOrigin = layoutBounds.topLeft + it; displacement = Offset.Zero },
                onDragEnd = {
                    presentationDrag?.invoke(null)
                    if (displacement.y > swipeThreshold && displacement.y > kotlin.math.abs(displacement.x) * 1.5f) swipeDown?.invoke()
                    scene.inspection = listOf(0f, 0f, 0f)
                },
                onDragCancel = { presentationDrag?.invoke(null); displacement = Offset.Zero; scene.inspection = listOf(0f, 0f, 0f) },
                onDrag = { change, _ ->
                    // The host moves under the finger. Window coordinates prevent
                    // local deltas from feeding its own movement back into the drag.
                    displacement = layoutBounds.topLeft + change.position - dragOrigin
                    if (swipeDown != null) presentationDrag?.invoke(displacement)
                    change.consume()
                    if (!reduceMotion) scene.inspection = listOf(change.position.x / size.width * 2f - 1f, change.position.y / size.height * 2f - 1f, 1f)
                }
            )
        }
        .semantics { contentDescription = "NexusNXS Core" }.clickable(interactionSource = interaction, indication = null, onClick = onClick))
}

/** One host survives presentation changes; renderer bounds and hitbox move together. */
@Composable
internal fun CosmicPresentationCore(target: Rect, origin: Offset, state: String, energy: Float, reduceMotion: Boolean, onSwipeDown: (() -> Unit)?, compactTarget: Rect = Rect.Zero, onDragProgress: (Float, Boolean) -> Unit = { _, _ -> }, onClick: () -> Unit) {
    if (target.width <= 0f) return
    var dragging by remember { mutableStateOf(false) }
    var dragBounds by remember { mutableStateOf(target) }
    var dragStart by remember { mutableStateOf(target) }
    var dragDestination by remember { mutableStateOf(compactTarget) }
    val minimumTravel = with(LocalDensity.current) { 120.dp.toPx() }
    val animated by animateRectAsState(if (dragging) dragBounds else target, tween(if (reduceMotion || dragging) 0 else 500,
        easing = CubicBezierEasing(.2f, 0f, .2f, 1f)), label = "Voice Core presentation")
    val bounds = if (dragging) dragBounds else animated
    val diameter = with(LocalDensity.current) { bounds.width.toDp() }
    Box(Modifier.offset { IntOffset((bounds.left - origin.x).toInt(), (bounds.top - origin.y).toInt()) }.size(diameter)) {
        CosmicCore(diameter, state, energy, reduceMotion, onSwipeDown,
            onPresentationDrag = { displacement ->
                if (displacement == null) {
                    dragging = false; onDragProgress(0f, false)
                } else if (compactTarget.width > 0f && (dragging || displacement.y > 0f && displacement.y > kotlin.math.abs(displacement.x) * 1.5f)) {
                    if (!dragging) { dragStart = bounds; dragDestination = compactTarget; dragging = true }
                    val progress = (displacement.y.coerceAtLeast(0f) / maxOf(minimumTravel, dragDestination.center.y - dragStart.center.y)).coerceIn(0f, 1f)
                    val size = dragStart.width + (dragDestination.width - dragStart.width) * progress
                    val center = Offset(dragStart.center.x + (dragDestination.center.x - dragStart.center.x) * progress,
                        dragStart.center.y + displacement.y.coerceAtLeast(0f))
                    dragBounds = Rect(center - Offset(size / 2f, size / 2f), androidx.compose.ui.geometry.Size(size, size))
                    onDragProgress(progress, true)
                }
            }, onClick = onClick)
    }
}

@Composable
internal fun CosmicStandaloneCore(diameter: Dp, state: String, energy: Float, reduceMotion: Boolean, onClick: () -> Unit) {
    val scene = remember { CosmicSceneState() }
    CompositionLocalProvider(LocalCosmicScene provides scene) {
        Box(Modifier.size(diameter)) {
            CosmicScene(Modifier.fillMaxSize())
            CosmicCore(diameter, state, energy, reduceMotion, onClick = onClick)
        }
    }
}
