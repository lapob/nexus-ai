package local.nexus.remote

import local.nexus.motion.NexusMotion
import local.nexus.motion.NexusSystemBars
import local.nexus.motion.NexusInteractionStates

import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.KeyguardManager
import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.hardware.display.DisplayManager
import android.view.Display
import android.animation.ValueAnimator
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.outlined.CallSplit
import androidx.compose.material.icons.automirrored.outlined.EventNote
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.collect
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import java.util.Locale
import kotlin.math.sin
import kotlin.math.cos

@Composable
private fun nexusCopy(italian: String, english: String): String =
    if (LocalConfiguration.current.locales[0].language == Locale.ITALIAN.language) italian else english

private fun Context.nexusCopy(italian: String, english: String): String =
    if (resources.configuration.locales[0].language == Locale.ITALIAN.language) italian else english

/** Variante non-Compose per comandi e persistenza, coerente con la lingua del dispositivo. */
private fun slashCopy(italian: String, english: String): String =
    if (Locale.getDefault().language == Locale.ITALIAN.language) italian else english

private fun spokenLocale(text: String, fallback: Locale): Locale {
    val sample = " ${text.lowercase(Locale.ROOT)} "
    val candidates = listOf(
        Locale.ITALIAN to Regex("\\b(che|chi|come|cosa|questo|questa|sono|puoi|deve|della|perché|anche|risposta|ecco)\\b|[àèéìòù]"),
        Locale("es", "ES") to Regex("\\b(que|cómo|qué|esto|esta|puedes|para|porque|respuesta|también)\\b|[áéíóúñ¿¡]"),
        Locale.FRENCH to Regex("\\b(que|comment|quoi|ceci|vous|pour|parce|réponse|aussi)\\b|[àâçéèêëîïôûùüÿœ]"),
        Locale.GERMAN to Regex("\\b(und|der|die|das|wie|was|kann|für|weil|antwort|auch)\\b|[äöüß]"),
        Locale.ENGLISH to Regex("\\b(the|and|how|what|this|that|you|can|because|answer|also)\\b")
    )
    val best = candidates.map { (locale, pattern) -> locale to pattern.findAll(sample).count() }.maxByOrNull { it.second }
    return if (best != null && best.second >= 2) best.first else fallback
}

/** Traduce le fasi pubbliche del Core senza affidare al modello la lingua UI. */
private fun Context.localizedServerActivity(raw: String): String {
    val text = raw.trim()
    if (resources.configuration.locales[0].language == Locale.ITALIAN.language) return text
    Regex("^In attesa\\s*[·-]\\s*posizione\\s+(\\d+)$", RegexOption.IGNORE_CASE)
        .matchEntire(text)?.let { return "Waiting · position ${it.groupValues[1]}" }
    return when (text) {
        "Comprendo la richiesta…" -> "Understanding the request…"
        "Comprendo la richiesta e preparo il contesto…" -> "Understanding the request and preparing context…"
        "Raccolgo le informazioni utili…" -> "Gathering useful information…"
        "Preparo l’intelligenza più adatta…" -> "Preparing the best approach…"
        "Ragiono e collego i dettagli…" -> "Reasoning through the details…"
        "Formulo la risposta…" -> "Preparing the response…"
        "Genero la risposta…" -> "Generating the response…"
        "Verifico accuratezza, sicurezza e lingua…" -> "Checking accuracy, safety, and language…"
        "Organizzo e controllo la risposta…" -> "Organizing and checking the response…"
        "Risposta pronta" -> "Response ready"
        "Non sono riuscito a completare la risposta" -> "The response could not be completed"
        else -> text
    }
}

private fun Context.copyToClipboard(value: String) {
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("NexusNXS", value))
}

@Composable private fun nexusIsItalian(): Boolean = LocalConfiguration.current.locales[0].language == Locale.ITALIAN.language

private val Ink = Color(0xFF020405)
private val Surface = Color(0xFF121718)
private val Surface2 = Color(0xFF242B2C)
private val Ice = Color(0xFFF7FBFB)
private val Mist = Color(0xFFABBABB)
private val Cyan = Color(0xFF4BE7E9)
private val Hairline = Color(0xFF5B696A)
private val NexusSans = FontFamily.SansSerif
private val NexusSheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
private const val NEXUS_ACTIVITY_CHANNEL = "nexus_private_activity"

/** Un solo linguaggio di movimento: rapido, fisico e coerente in tutta NexusNXS. */
private object NexusFlow {
    val ENTER = NexusMotion.ENTER
    val EXIT = NexusMotion.EXIT
    val QUICK = NexusMotion.QUICK
    val FADE_DELAY = NexusMotion.FADE_DELAY
    val REDUCED = NexusMotion.REDUCED
    val THINKING_PULSE = NexusMotion.THINKING_PULSE
    val CURSOR_PULSE = NexusMotion.CURSOR_PULSE
    val STREAM_FADE = NexusMotion.STREAM_FADE
    val COMPOSER_RESIZE = NexusMotion.COMPOSER_RESIZE
    val VOICE_WAVE = NexusMotion.VOICE_WAVE
    val SKELETON_PULSE = NexusMotion.SKELETON_PULSE
    val PARTICLE_BUDGET = NexusMotion.PARTICLE_BUDGET
    val PARTICLE_TICK = NexusMotion.PARTICLE_TICK
    val emphasized = CubicBezierEasing(NexusMotion.EMPHASIZED_X1, NexusMotion.EMPHASIZED_Y1, NexusMotion.EMPHASIZED_X2, NexusMotion.EMPHASIZED_Y2)
    val standard = CubicBezierEasing(NexusMotion.STANDARD_X1, NexusMotion.STANDARD_Y1, NexusMotion.STANDARD_X2, NexusMotion.STANDARD_Y2)
}

/**
 * Non crea un clock infinito quando il movimento e ridotto o disattivato dal
 * sistema. Usare un tween da 1 ms continuava infatti a ricomporre la UI anche
 * quando il risultato disegnato era statico, con consumo e frame persi inutili.
 */
@Composable
private fun nexusLoopFloat(
    enabled: Boolean,
    initialValue: Float,
    targetValue: Float,
    durationMillis: Int,
    repeatMode: RepeatMode,
    label: String,
    disabledValue: Float = initialValue,
    linear: Boolean = false
): Float {
    if (!enabled) return disabledValue
    val transition = rememberInfiniteTransition(label = label)
    val value by transition.animateFloat(
        initialValue = initialValue,
        targetValue = targetValue,
        animationSpec = infiniteRepeatable(
            tween(durationMillis, easing = if (linear) LinearEasing else NexusFlow.standard),
            repeatMode = repeatMode
        ),
        label = label
    )
    return value
}

/** Firma percettiva comune a ogni comparsa, scomparsa e sostituzione di superficie. */
private fun nexusEnter(reduced: Boolean = false) =
    fadeIn(tween(if (reduced) NexusFlow.REDUCED else NexusFlow.ENTER, delayMillis = if (reduced) 0 else NexusFlow.FADE_DELAY, easing = NexusFlow.standard))

private fun nexusExit(reduced: Boolean = false) =
    fadeOut(tween(if (reduced) NexusFlow.REDUCED else NexusFlow.EXIT, easing = NexusFlow.standard))

private fun nexusTransform(reduced: Boolean = false) =
    ContentTransform(nexusEnter(reduced), nexusExit(reduced), sizeTransform = SizeTransform(clip = false))

/** Un nuovo turno sale dal composer mentre il precedente si dissolve verso l'alto. */
private fun nexusExchangeTransform(reduced: Boolean = false): ContentTransform {
    if (reduced) return nexusTransform(true)
    return ContentTransform(
        fadeIn(tween(NexusFlow.ENTER, easing = NexusFlow.standard)) +
            slideInVertically(tween(NexusFlow.ENTER, easing = NexusFlow.emphasized)) { height -> height / 7 },
        fadeOut(tween(NexusFlow.EXIT, easing = NexusFlow.standard)) +
            slideOutVertically(tween(NexusFlow.EXIT, easing = NexusFlow.standard)) { height -> -height / 10 },
        sizeTransform = SizeTransform(clip = false)
    )
}

/**
 * Navigazione Android completa: avanzamento da destra e ritorno speculare.
 * La distanza rimane breve per sostenere 60 Hz, mentre Android conserva il
 * controllo globale tramite la propria scala animazioni e Riduci animazioni.
 */
private fun nexusScreenTransform(back: Boolean, reduced: Boolean = false): ContentTransform {
    if (reduced) return nexusTransform(true)
    val enterOffset: (Int) -> Int = { width -> if (back) -width / 9 else width / 9 }
    val exitOffset: (Int) -> Int = { width -> if (back) width / 12 else -width / 12 }
    return ContentTransform(
        fadeIn(tween(NexusFlow.ENTER, delayMillis = NexusFlow.FADE_DELAY, easing = NexusFlow.standard)) +
            slideInHorizontally(tween(NexusFlow.ENTER, easing = NexusFlow.emphasized), initialOffsetX = enterOffset),
        fadeOut(tween(NexusFlow.EXIT, easing = NexusFlow.standard)) +
            slideOutHorizontally(tween(NexusFlow.EXIT, easing = NexusFlow.standard), targetOffsetX = exitOffset),
        sizeTransform = SizeTransform(clip = false)
    )
}

private enum class NexusWidthClass { COMPACT, MEDIUM, EXPANDED }
@Immutable
private data class NexusMetrics(
    val widthClass: NexusWidthClass,
    val landscape: Boolean,
    val fontScale: Float,
    val contentMaxWidth: androidx.compose.ui.unit.Dp,
    val horizontalPadding: androidx.compose.ui.unit.Dp,
    val topBarHeight: androidx.compose.ui.unit.Dp,
    val drawerWidth: androidx.compose.ui.unit.Dp,
    val particleBudget: Int,
    val adaptiveReducedMotion: Boolean
)
private val LocalNexusMetrics = staticCompositionLocalOf { NexusMetrics(NexusWidthClass.COMPACT, false, 1f, 680.dp, 16.dp, 64.dp, 340.dp, 64, false) }
private val NEXUS_COSMIC_CONTINUUM_ID = NexusInteractionStates.CONTINUUM_ID

@Composable private fun rememberNexusMetrics(): NexusMetrics {
    val context = LocalContext.current
    val density = LocalDensity.current
    val windowSize = LocalWindowInfo.current.containerSize
    val fontScale = density.fontScale
    val display = (context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager)?.getDisplay(Display.DEFAULT_DISPLAY)
    val refreshRate = display?.supportedModes?.maxOfOrNull { it.refreshRate } ?: display?.refreshRate ?: 60f
    val health = context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE)
    val slowRatio by produceState(initialValue = health.getFloat("frameHealth.recentSlowRatio", 0f), health) {
        while (true) {
            value = health.getFloat("frameHealth.recentSlowRatio", 0f)
            kotlinx.coroutines.delay(2_000)
        }
    }
    val frameConstrained by produceState(initialValue = health.getBoolean("frameHealth.constrained", false), health) {
        while (true) {
            value = health.getBoolean("frameHealth.constrained", false)
            kotlinx.coroutines.delay(2_000)
        }
    }
    val frameScale = when { frameConstrained -> .52f; slowRatio >= .06f -> .72f; else -> 1f }
    val width = with(density) { windowSize.width.toDp().value.toInt() }
    val landscape = windowSize.width > windowSize.height
    val widthClass = when { width < 600 -> NexusWidthClass.COMPACT; width < 840 -> NexusWidthClass.MEDIUM; else -> NexusWidthClass.EXPANDED }
    return remember(width, landscape, fontScale, refreshRate, frameScale) {
        NexusMetrics(
            widthClass = widthClass,
            landscape = landscape,
            fontScale = fontScale,
            contentMaxWidth = when (widthClass) { NexusWidthClass.COMPACT -> 680.dp; NexusWidthClass.MEDIUM -> 760.dp; NexusWidthClass.EXPANDED -> 840.dp },
            horizontalPadding = when { width < 360 -> 10.dp; widthClass == NexusWidthClass.COMPACT -> 14.dp; else -> 20.dp },
            topBarHeight = if (fontScale > 1.2f) 72.dp else 64.dp,
            drawerWidth = when (widthClass) { NexusWidthClass.COMPACT -> (width * .86f).coerceAtMost(360f).dp; NexusWidthClass.MEDIUM -> 380.dp; NexusWidthClass.EXPANDED -> 420.dp },
            particleBudget = (when (widthClass) { NexusWidthClass.COMPACT -> 64; NexusWidthClass.MEDIUM -> 82; NexusWidthClass.EXPANDED -> 104 } * (if (refreshRate >= 90f) 1f else .78f) * frameScale).toInt().coerceAtLeast(28),
            adaptiveReducedMotion = frameConstrained || slowRatio >= .16f
        )
    }
}

enum class NexusScreen { CHAT, LIBRARY, PROJECTS, ACTIVITY, REMOTE, SCHEDULED, SETTINGS }
enum class NexusPresence { IDLE, LISTENING, THINKING, RESPONDING, EXECUTING, CONNECTING, OFFLINE, ERROR }
enum class NexusConnection { CHECKING, ONLINE, OFFLINE }
private enum class NexusVoiceMode { IDLE, SINGLE_TURN, HANDS_FREE }
private enum class NexusAuthorizationKind { NONE, WORK, WAKE }
@Immutable data class ChatRow(val id: String, val title: String, val preview: String, val updatedAt: Long, val pinned: Boolean = false)
@Immutable data class DeviceRow(val id: String, val name: String, val scope: String, val lastSeenAt: Long, val current: Boolean)
@Immutable data class WakeTargetRow(val id: String, val label: String)
@Immutable data class WorkArtifact(val title: String, val subtitle: String, val language: String, val content: String, val added: Int, val removed: Int)
@Immutable data class Turn(val role: String, val content: String, val artifacts: List<WorkArtifact> = emptyList())
@Immutable data class ModelRow(val id: String, val name: String, val size: Long = 0L, val available: Boolean = true)
@Immutable data class SlashCommandRow(val name: String, val label: String, val description: String, val template: String, val custom: Boolean = false)
private data class SlashResolution(val text: String = "", val handled: Boolean = false, val message: String = "", val commands: List<SlashCommandRow>? = null)

private fun builtinSlashCommands() = listOf(
    SlashCommandRow("web", slashCopy("Ricerca web", "Web search"), slashCopy("Informazioni aggiornate con fonti", "Current information with sources"), "Cerca sul web informazioni aggiornate e cita fonti affidabili: {testo}"),
    SlashCommandRow("ragiona", slashCopy("Ragionamento profondo", "Deep reasoning"), slashCopy("Analizza e verifica i passaggi", "Analyze and verify each step"), "Analizza in modo approfondito, verifica i passaggi importanti e proponi la soluzione migliore: {testo}"),
    SlashCommandRow("immagine", slashCopy("Genera immagine", "Generate image"), slashCopy("Crea un’immagine dalla descrizione", "Create an image from the description"), "Genera un’immagine di alta qualità seguendo questa descrizione: {testo}"),
    SlashCommandRow("riassumi", slashCopy("Riassumi", "Summarize"), slashCopy("Riduce ai punti essenziali", "Reduce to the essential points"), "Riassumi in modo chiaro, fedele e ben strutturato: {testo}"),
    SlashCommandRow("traduci", slashCopy("Traduci", "Translate"), slashCopy("Traduzione naturale e fedele", "Natural and faithful translation"), "Traduci il seguente contenuto nella lingua che indico, conservando tono e significato: {testo}"),
    SlashCommandRow("codice", slashCopy("Scrivi o correggi codice", "Write or fix code"), slashCopy("Codice completo e verificabile", "Complete, verifiable code"), "Affronta questa richiesta di programmazione. Fornisci codice completo, controlli e istruzioni d’uso: {testo}"),
    SlashCommandRow("nuovo", slashCopy("Nuovo comando", "New command"), "/nuovo brief = Riassumi in 5 punti {testo}", ""),
    SlashCommandRow("rimuovi", slashCopy("Rimuovi comando", "Remove command"), "/rimuovi brief", "")
)
private data class WakeRelayDescriptor(val endpoint: String, val pairing: Boolean)
private class NexusHttpException(val statusCode: Int, message: String) : IllegalStateException(message)
@Immutable data class NexusUiState(
    val screen: NexusScreen = NexusScreen.CHAT,
    val work: Boolean = false,
    val drawer: Boolean = false,
    val modelSheet: Boolean = false,
    val model: String = "NexusNXS Rapido",
    val models: List<ModelRow> = listOf(ModelRow("nexus-fast", "NexusNXS Rapido"), ModelRow("nexus-deep", "NexusNXS Pro")),
    val conversationId: String = "",
    val chats: List<ChatRow> = emptyList(),
    val chatQuery: String = "",
    val conversationSearchOpen: Boolean = false,
    val conversationSearch: String = "",
    val turns: List<Turn> = emptyList(),
    val draft: String = "",
    val attachment: String? = null,
    val attachmentUri: String = "",
    val attachmentMime: String = "",
    val attachmentData: String = "",
    val busy: Boolean = false,
    val streaming: String = "",
    val activity: String = "",
    val error: String? = null,
    val status: String = "Riconnessione automatica",
    val connection: NexusConnection = NexusConnection.CHECKING,
    val pairing: Boolean = false,
    val temporary: Boolean = false,
    val devices: List<DeviceRow> = emptyList(),
    val profileUri: String = "",
    val reduceMotion: Boolean = false,
    val pendingCount: Int = 0,
    val workTicketId: String = "",
    val workPreview: String = "",
    val workRisk: String = "",
    val diagnosticsOpen: Boolean = false,
    val privacyMode: Boolean = false,
    val hapticsEnabled: Boolean = true,
    val remoteWorkAvailable: Boolean = false,
    val pairingAvailable: Boolean = false,
    val capabilitiesChecked: Boolean = false,
    val wakePairingAvailable: Boolean = false,
    val wakeAvailable: Boolean = false,
    val wakeConnected: Boolean = false,
    val wakeTargets: List<WakeTargetRow> = emptyList(),
    val wakeSelectedTarget: String = "",
    val wakeTicketId: String = "",
    val wakePreview: String = "",
    val wakeRisk: String = "",
    val wakeStatus: String = "",
    val wakeBusy: Boolean = false,
    val wakeAwaiting: Boolean = false,
    val assistantInvocation: Long = 0L,
    val slashCommands: List<SlashCommandRow> = emptyList()
)

/**
 * Chrome e composer ricevono soltanto lo stato che disegnano. Durante lo
 * streaming il testo cambia a ogni frame, ma barra superiore e campo di input
 * restano quindi skippabili dal runtime Compose invece di essere ricostruiti.
 */
@Immutable
private data class NexusTopBarState(
    val active: Boolean,
    val temporary: Boolean,
    val temporaryHasContent: Boolean,
    val headerTitle: String,
    val pinned: Boolean,
    val conversationId: String,
    val work: Boolean,
    val remoteWorkAvailable: Boolean,
    val pairingAvailable: Boolean,
    val hapticsEnabled: Boolean,
    val reduceMotion: Boolean
)

private fun NexusUiState.topBarState() = NexusTopBarState(
    active = turns.isNotEmpty() || busy || temporary,
    temporary = temporary,
    temporaryHasContent = draft.isNotBlank() || turns.isNotEmpty() || attachment != null,
    headerTitle = chats.firstOrNull { it.id == conversationId }?.title.orEmpty(),
    pinned = chats.firstOrNull { it.id == conversationId }?.pinned == true,
    conversationId = conversationId,
    work = work,
    remoteWorkAvailable = remoteWorkAvailable,
    pairingAvailable = pairingAvailable,
    hapticsEnabled = hapticsEnabled,
    reduceMotion = reduceMotion
)

@Immutable
private data class NexusComposerState(
    val work: Boolean,
    val temporary: Boolean,
    val draft: String,
    val attachment: String?,
    val attachmentUri: String,
    val attachmentMime: String,
    val attachmentData: String,
    val busy: Boolean,
    val connection: NexusConnection,
    val pendingCount: Int,
    val model: String,
    val remoteWorkAvailable: Boolean,
    val reduceMotion: Boolean,
    val hapticsEnabled: Boolean,
    val slashCommands: List<SlashCommandRow>
)

private fun NexusUiState.composerState() = NexusComposerState(
    work = work,
    temporary = temporary,
    draft = draft,
    attachment = attachment,
    attachmentUri = attachmentUri,
    attachmentMime = attachmentMime,
    attachmentData = attachmentData,
    busy = busy,
    connection = connection,
    pendingCount = pendingCount,
    model = model,
    remoteWorkAvailable = remoteWorkAvailable,
    reduceMotion = reduceMotion,
    hapticsEnabled = hapticsEnabled,
    slashCommands = slashCommands
)

private fun NexusUiState.presence(): NexusPresence = when {
    connection == NexusConnection.OFFLINE || error?.isTransportFailure() == true -> NexusPresence.OFFLINE
    error != null -> NexusPresence.ERROR
    busy && work -> NexusPresence.EXECUTING
    busy && streaming.isNotBlank() -> NexusPresence.RESPONDING
    busy -> NexusPresence.THINKING
    connection == NexusConnection.CHECKING -> NexusPresence.CONNECTING
    else -> NexusPresence.IDLE
}

/**
 * Conta soltanto elementi operativi gia presenti nello stato locale. Nessuna
 * sorgente aggiuntiva e nessun endpoint vengono interrogati dalla Inbox.
 */
private fun NexusUiState.attentionCount(): Int {
    var count = pendingCount.coerceAtLeast(0)
    if (connection == NexusConnection.OFFLINE) count++
    if (busy) count++
    if (workTicketId.isNotBlank()) count++
    if (wakeTicketId.isNotBlank()) count++
    if (error?.isTransportFailure() == false) count++
    return count.coerceAtMost(99)
}

@Composable private fun NexusPresence.label() = when (this) {
    NexusPresence.IDLE -> nexusCopy("Pronto", "Ready")
    NexusPresence.LISTENING -> nexusCopy("In ascolto", "Listening")
    NexusPresence.THINKING -> nexusCopy("Comprensione", "Understanding")
    NexusPresence.RESPONDING -> nexusCopy("Risposta", "Responding")
    NexusPresence.EXECUTING -> nexusCopy("Cuore in azione", "Core in progress")
    NexusPresence.CONNECTING -> nexusCopy("Connessione ai server NexusNXS", "Connecting to NexusNXS servers")
    NexusPresence.OFFLINE -> nexusCopy("Offline · riconnessione automatica", "Offline · automatic reconnection")
    NexusPresence.ERROR -> nexusCopy("Richiede attenzione", "Needs attention")
}

private fun String.isTransportFailure(): Boolean =
    contains("non è raggiungibile", ignoreCase = true) ||
        contains("non raggiungibile", ignoreCase = true) ||
        contains("connessione interrotta", ignoreCase = true) ||
        contains("trasferimento non riuscito", ignoreCase = true) ||
        contains("not reachable", ignoreCase = true) ||
        contains("connection interrupted", ignoreCase = true) ||
        contains("transfer failed", ignoreCase = true)

class NexusMainActivity : ComponentActivity() {
    companion object {
        private const val SESSION_RESUME_WINDOW_MS = 30L * 60L * 1000L
        private const val MAX_ATTACHMENT_BYTES = 1_500_000
        private const val MAX_BACKUP_BYTES = 16 * 1024 * 1024
        private const val WAKE_RELAY_PROTOCOL_VERSION = 1
        private const val WAKE_TOKEN_ROTATION_MS = 24L * 60L * 60L * 1000L
    }
    private lateinit var store: LocalChatStore
    private lateinit var secureTokens: SecureTokenStore
    private var state by mutableStateOf(NexusUiState())
    private var temporaryReturnConversationId = ""
    private var temporaryReturnDraft = ""
    private var temporaryReturnWork = false
    private var pendingAuthorizationTicket = ""
    private var pendingAuthorizationKind = NexusAuthorizationKind.NONE
    private var deviceCredentialInProgress = false
    private val prefs by lazy { getSharedPreferences("nexus_compose", MODE_PRIVATE) }
    private val uiHandler = Handler(Looper.getMainLooper())
    private var pendingDraftConversationId = ""
    private var pendingDraftValue = ""
    private val persistDraftRunnable = Runnable {
        val id = pendingDraftConversationId
        val value = pendingDraftValue
        pendingDraftConversationId = ""
        pendingDraftValue = ""
        if (id.isNotBlank()) prefs.edit { putString("draft:$id", value) }
    }

    private fun queueDraftPersistence(conversationId: String, value: String) {
        if (conversationId.isBlank()) return
        pendingDraftConversationId = conversationId
        pendingDraftValue = value
        uiHandler.removeCallbacks(persistDraftRunnable)
        uiHandler.postDelayed(persistDraftRunnable, 220L)
    }

    private fun flushDraftPersistence() {
        if (pendingDraftConversationId.isBlank()) return
        uiHandler.removeCallbacks(persistDraftRunnable)
        persistDraftRunnable.run()
    }

    private fun discardDraftPersistence(conversationId: String) {
        if (pendingDraftConversationId == conversationId) {
            uiHandler.removeCallbacks(persistDraftRunnable)
            pendingDraftConversationId = ""
            pendingDraftValue = ""
        }
        if (conversationId.isNotBlank()) prefs.edit { remove("draft:$conversationId") }
    }

    private data class StreamUiUpdate(
        val conversationId: String,
        val temporary: Boolean,
        val generation: Long,
        val text: String
    )

    private val pendingStreamUpdate = AtomicReference<StreamUiUpdate?>(null)
    private val streamUiScheduled = AtomicBoolean(false)
    private val streamUiDrain = object : Runnable {
        override fun run() {
            streamUiScheduled.set(false)
            val update = pendingStreamUpdate.getAndSet(null) ?: return
            if (!destroyed && state.busy && streamMatchesUi(update.conversationId, update.temporary, update.generation)) {
                state = state.copy(streaming = update.text)
            }
            if (pendingStreamUpdate.get() != null && streamUiScheduled.compareAndSet(false, true)) {
                uiHandler.post(this)
            }
        }
    }

    /** Mantiene al massimo un aggiornamento streaming in coda sul main thread. */
    private fun publishStreamUi(conversationId: String, temporary: Boolean, generation: Long, text: String) {
        pendingStreamUpdate.set(StreamUiUpdate(conversationId, temporary, generation, text))
        if (streamUiScheduled.compareAndSet(false, true)) uiHandler.post(streamUiDrain)
    }

    private fun clearPendingStreamUi() {
        pendingStreamUpdate.set(null)
        streamUiScheduled.set(false)
        uiHandler.removeCallbacks(streamUiDrain)
    }
    private fun normalizeHttpsEndpoint(value: String): String? = runCatching {
        val parsed = java.net.URI(value.trim())
        require(parsed.scheme.equals("https", ignoreCase = true))
        require(!parsed.host.isNullOrBlank() && parsed.rawUserInfo == null && parsed.rawQuery == null && parsed.rawFragment == null)
        require(parsed.rawPath.isNullOrEmpty() || parsed.rawPath == "/")
        require(parsed.port == -1 || parsed.port in 1..65535)
        val host = parsed.host.lowercase(Locale.ROOT).let { if (':' in it) "[$it]" else it }
        val authority = if (parsed.port == -1 || parsed.port == 443) host else "$host:${parsed.port}"
        "https://$authority"
    }.getOrNull()
    private fun configuredEndpoints(): List<String> =
        listOf(BuildConfig.NEXUS_URL, BuildConfig.NEXUS_FALLBACK_URL, BuildConfig.NEXUS_LAN_URL)
            .mapNotNull(::normalizeHttpsEndpoint).distinct()
    private fun trustedEndpoint(value: String): String? =
        normalizeHttpsEndpoint(value)?.takeIf { it in configuredEndpoints() }
    /**
     * Il relay di accensione non e un endpoint pubblico configurabile a mano.
     * Accettiamo soltanto un origin HTTPS Tailscale Serve, senza percorso,
     * credenziali, query o porte alternative, pubblicato dallo status autenticato.
     */
    private fun trustedWakeRelayEndpoint(value: String): String? = runCatching {
        val parsed = java.net.URI(value.trim())
        require(parsed.scheme.equals("https", ignoreCase = true))
        require(parsed.rawUserInfo == null && parsed.rawQuery == null && parsed.rawFragment == null)
        require(parsed.rawPath.isNullOrEmpty() || parsed.rawPath == "/")
        require(parsed.port == -1 || parsed.port == 443)
        val host = parsed.host?.lowercase(Locale.ROOT).orEmpty()
        val labels = host.split('.')
        require(host.length in 8..253 && host.endsWith(".ts.net") && labels.all { it.length in 1..63 && it.matches(Regex("[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")) })
        "https://$host"
    }.getOrNull()
    private val server get() = trustedEndpoint(prefs.getString("preferredServer", "").orEmpty())
        ?: trustedEndpoint(BuildConfig.NEXUS_URL).orEmpty()
    private val wakeRelayEndpoint get() = trustedWakeRelayEndpoint(secureTokens.read("wakeRelayEndpoint")).orEmpty()
    @Volatile private var reachableEndpoint = ""
    private fun endpointCandidates(): List<String> =
        listOf(reachableEndpoint, server, BuildConfig.NEXUS_URL, BuildConfig.NEXUS_FALLBACK_URL, BuildConfig.NEXUS_LAN_URL)
            .mapNotNull(::trustedEndpoint).distinct()
    private fun rememberReachable(endpoint: String) {
        trustedEndpoint(endpoint)?.let {
            reachableEndpoint = it
            prefs.edit { putString("preferredServer", it) }
        }
    }
    @Volatile private var activeConnection: HttpURLConnection? = null
    @Volatile private var activeWorkConnection: HttpURLConnection? = null
    @Volatile private var activeWorkOperationId = ""
    @Volatile private var activeWorkToken = ""
    @Volatile private var workCancellationRequested = false
    private val backgroundExecutor = Executors.newFixedThreadPool(6)
    private val cancellationExecutor = Executors.newSingleThreadExecutor()
    private val activeConnections = ConcurrentHashMap.newKeySet<HttpURLConnection>()
    @Volatile private var destroyed = false
    @Volatile private var retryingPending = false
    @Volatile private var connectionProbeRunning = false
    @Volatile private var capabilityProbeRunning = false
    @Volatile private var capabilityProbeCompleted = false
    @Volatile private var wakeProbeRunning = false
    @Volatile private var chatGeneration = 0L
    private var textToSpeech: TextToSpeech? = null
    @Volatile private var speechConnection: HttpURLConnection? = null
    private var neuralSpeechPlayer: MediaPlayer? = null
    private var neuralSpeechFile: File? = null
    private var speakNextAnswer = false
    private lateinit var frameHealth: FrameHealthMonitor
    @Volatile private var appVisible = false
    private fun runTask(block: () -> Unit) {
        if (destroyed || backgroundExecutor.isShutdown) return
        try {
            backgroundExecutor.execute {
                if (!destroyed && !Thread.currentThread().isInterrupted) block()
            }
        } catch (_: RejectedExecutionException) {
            // La chiusura dell'activity ha precedenza su un callback di rete tardivo.
        }
    }
    private fun postUi(block: () -> Unit) {
        if (destroyed) return
        runOnUiThread { if (!destroyed) block() }
    }
    private fun openTrackedConnection(value: String): HttpURLConnection =
        (URL(value).openConnection() as HttpURLConnection).also(activeConnections::add)
    private fun closeTrackedConnection(connection: HttpURLConnection) {
        activeConnections.remove(connection)
        connection.disconnect()
    }
    private fun probeStatus(base: String, path: String): Int {
        val connection = openTrackedConnection(base.trimEnd('/') + path)
        return try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 1_800
            connection.readTimeout = 1_800
            connection.requestMethod = "GET"
            connection.responseCode
        } finally { closeTrackedConnection(connection) }
    }
    private fun probeReady(base: String): Boolean {
        val readiness = probeStatus(base, "/readyz")
        // Compatibilità con gateway precedenti: un 503 significa non pronto e
        // non deve essere trasformato in Online dal solo endpoint di liveness.
        return readiness in 200..299 || readiness == 404 && probeStatus(base, "/healthz") in 200..299
    }
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            // Il debounce naturale di retryingPending impedisce invii doppi quando
            // Android segnala insieme Wi-Fi, VPN e rete mobile.
            probeConnection()
            if (::secureTokens.isInitialized) loadWakeCapabilities()
        }
        override fun onLost(network: Network) {
            if (hasValidatedInternet()) probeConnection() else postUi {
                val pending = store.pendingCount()
                if (!state.temporary) state = state.copy(
                    connection = NexusConnection.OFFLINE,
                    status = if (pending > 0) "Server NexusNXS non raggiungibili · $pending in coda" else "Server NexusNXS non raggiungibili",
                    pendingCount = pending
                )
            }
        }
    }

    private fun hasValidatedInternet(): Boolean {
        val connectivity = getSystemService(ConnectivityManager::class.java)
        val network = connectivity.activeNetwork ?: return false
        val capabilities = connectivity.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
    private fun readBoundedContent(uri: Uri, limit: Int): ByteArray {
        require(uri.scheme.equals("content", ignoreCase = true)) { "Sono ammessi soltanto contenuti Android autorizzati." }
        return contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream(minOf(limit, 64 * 1024))
            val buffer = ByteArray(8 * 1024)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count == 0) continue
                total += count
                require(total <= limit) { "Il contenuto supera il limite consentito." }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("Contenuto non disponibile")
    }
    private val backupExporter = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri -> uri?.let { runCatching { contentResolver.openOutputStream(it)?.bufferedWriter()?.use { writer -> writer.write(store.exportEncryptedArchive()) } }.onFailure { state = state.copy(error = nexusCopy("Esportazione non riuscita.", "Export failed.")) } } }
    private val backupImporter = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { runCatching { val archive = String(readBoundedContent(it, MAX_BACKUP_BYTES), StandardCharsets.UTF_8); store.importEncryptedArchive(archive) }.onSuccess { count -> refreshChats(true); state = state.copy(activity = nexusCopy("$count conversazioni ripristinate", "$count conversations restored")) }.onFailure { state = state.copy(error = nexusCopy("Questo backup non è valido o appartiene a un altro dispositivo.", "This backup is invalid or belongs to another device.")) } } }
    private val deviceCredentialConfirmation = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val ticket = pendingAuthorizationTicket
        deviceCredentialInProgress = false
        if (result.resultCode == RESULT_OK && ticket.isNotBlank()) completeProtectedAuthorization(ticket)
        else if (ticket.isNotBlank()) {
            val kind = pendingAuthorizationKind
            pendingAuthorizationTicket = ""
            pendingAuthorizationKind = NexusAuthorizationKind.NONE
            state = if (kind == NexusAuthorizationKind.WAKE) state.copy(wakeStatus = nexusCopy("Risveglio non autorizzato", "Wake not authorized")) else state.copy(activity = nexusCopy("Autorizzazione annullata", "Authorization cancelled"))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidCrashStore.install(this)
        NexusSystemBars.apply(window)
        store = LocalChatStore(this)
        store.reconcileAnsweredPendingRequests()
        secureTokens = SecureTokenStore(this)
        frameHealth = FrameHealthMonitor(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(NEXUS_ACTIVITY_CHANNEL, "Attività NexusNXS", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Avvisi privati quando NexusNXS completa un’attività"; lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE })
        listOf("remoteToken", "guestToken").forEach { name -> prefs.getString(name, "").orEmpty().takeIf(String::isNotBlank)?.let { secureTokens.write(name, it); prefs.edit { remove(name) } } }
        textToSpeech = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val deviceLocale = resources.configuration.locales[0]
                val result = textToSpeech?.setLanguage(deviceLocale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    textToSpeech?.language = Locale.ENGLISH
                }
            }
        }
        if (!prefs.getBoolean("legacyTransportErrorsCleaned", false)) {
            store.deleteLegacyTransportFailureConversations()
            prefs.edit { putBoolean("legacyTransportErrorsCleaned", true) }
        }
        val savedConversationId = prefs.getString("currentConversationId", "").orEmpty()
        // La conversazione scelta dall'utente non e una sessione di sicurezza:
        // resta selezionata anche dopo una lunga permanenza in background. La
        // finestra temporale continua a proteggere soltanto proposte Work e token.
        val canResume = store.get(savedConversationId) != null
        val powerSaver = (getSystemService(POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true
        val initialConversationId = if (canResume) savedConversationId else store.createConversation()
        val savedModel = when (prefs.getString("model", "NexusNXS Rapido").orEmpty()) { "Automatico", "Qwen3 8B", "nexus-fast" -> "NexusNXS Rapido"; "Qwen3 14B", "nexus-deep" -> "NexusNXS Pro"; else -> prefs.getString("model", "NexusNXS Rapido").orEmpty() }
        val privacyMode = prefs.getBoolean("privacyMode", false)
        applyWindowPrivacy(temporary = false, privacyMode = privacyMode)
        val restoredWork = runCatching { JSONObject(secureTokens.read("workProposal")) }.getOrNull()
            ?.takeIf { System.currentTimeMillis() - it.optLong("savedAt") <= SESSION_RESUME_WINDOW_MS }
        if (restoredWork == null) secureTokens.clear("workProposal")
        // Work resta chiuso finché il server autenticato non pubblica una
        // capability esplicita. Una preferenza salvata non può riattivarlo da sola.
        state = state.copy(model = savedModel, work = false, profileUri = prefs.getString("profileUri", "").orEmpty(), reduceMotion = prefs.getBoolean("reduceMotion", false) || powerSaver, draft = prefs.getString("draft:$initialConversationId", "").orEmpty(), conversationId = initialConversationId, pendingCount = store.pendingCount(), privacyMode = privacyMode, hapticsEnabled = prefs.getBoolean("hapticsEnabled", true), workTicketId = "", workPreview = "", workRisk = "", slashCommands = loadCustomSlashCommands())
        runCatching {
            getSystemService(ConnectivityManager::class.java).registerNetworkCallback(
                NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
                networkCallback
            )
        }
        refreshChats(openIfEmpty = true)
        setContent { NexusTheme { NexusInstantApp(state, ::dispatch) } }
        handleIncomingIntent(intent)
        probeConnection()
    }

    override fun onResume() {
        super.onResume()
        appVisible = true
        if (::frameHealth.isInitialized) frameHealth.start()
        if (::store.isInitialized) {
            probeConnection()
            loadWakeCapabilities()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    override fun onStop() {
        appVisible = false
        flushDraftPersistence()
        if (::frameHealth.isInitialized) frameHealth.stop()
        if (!isChangingConfigurations) {
            prefs.edit {
                putString("currentConversationId", if (state.temporary) "" else state.conversationId)
            }
        }
        super.onStop()
    }

    /**
     * Keep temporary chats out of the system overview without replacing the app Surface.
     * Toggling FLAG_SECURE while Compose is drawing produces a visible black frame on some
     * Samsung devices, so that flag is reserved for the explicit, persistent privacy mode.
     */
    private fun applyWindowPrivacy(temporary: Boolean, privacyMode: Boolean) {
        if (privacyMode) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(!temporary && !privacyMode)
        }
    }

    private fun protectTemporaryConversation(enabled: Boolean) {
        applyWindowPrivacy(temporary = enabled, privacyMode = state.privacyMode)
    }

    private fun clearTemporaryReturnState() {
        temporaryReturnConversationId = ""
        temporaryReturnDraft = ""
        temporaryReturnWork = false
    }

    /** Evita che token o fasi tardive di una chat compaiano in un'altra schermata. */
    private fun streamMatchesUi(conversationId: String, temporary: Boolean, generation: Long): Boolean =
        generation != 0L && generation == chatGeneration &&
            if (temporary) state.temporary else conversationId.isNotBlank() && !state.temporary && state.conversationId == conversationId

    private fun dispatch(action: String, value: String = "") {
        when (action) {
            "drawer" -> state = state.copy(drawer = !state.drawer)
            "closeDrawer" -> state = state.copy(drawer = false)
            "chat" -> { prefs.edit { putBoolean("workMode", false) }; state = state.copy(screen = NexusScreen.CHAT, work = false, drawer = false) }
            "work" -> if (state.remoteWorkAvailable) { prefs.edit { putBoolean("workMode", true) }; state = state.copy(screen = NexusScreen.CHAT, work = true, drawer = false) }
            "library" -> state = state.copy(screen = NexusScreen.LIBRARY, drawer = false)
            "projects" -> if (state.remoteWorkAvailable) state = state.copy(screen = NexusScreen.PROJECTS, drawer = false)
            "activity" -> state = state.copy(screen = NexusScreen.ACTIVITY, drawer = false)
            "remote" -> if (state.pairingAvailable || state.wakePairingAvailable || state.wakeAvailable) state = state.copy(screen = NexusScreen.REMOTE, drawer = false)
            "scheduled" -> if (state.remoteWorkAvailable) state = state.copy(screen = NexusScreen.SCHEDULED, drawer = false)
            "settings" -> state = state.copy(screen = NexusScreen.SETTINGS, drawer = false)
            "back" -> state = state.copy(screen = NexusScreen.CHAT)
            "modelSheet" -> state = state.copy(modelSheet = true)
            "closeModel" -> state = state.copy(modelSheet = false)
            "model" -> { prefs.edit { putString("model", value) }; state = state.copy(model = value, modelSheet = false) }
            "draft" -> {
                if (state.connection != NexusConnection.ONLINE) return
                if (!state.temporary && state.conversationId.isNotBlank()) queueDraftPersistence(state.conversationId, value)
                state = state.copy(draft = value)
            }
            "chatQuery" -> state = state.copy(chatQuery = value, chats = (if (value.isBlank()) store.list() else store.search(value)).toChatRows())
            "conversationSearchOpen" -> state = state.copy(conversationSearchOpen = !state.conversationSearchOpen, conversationSearch = "")
            "conversationSearch" -> state = state.copy(conversationSearch = value)
            "attach" -> if (value.isBlank()) state = state.copy(attachment = null, attachmentUri = "", attachmentMime = "", attachmentData = "") else if (state.connection == NexusConnection.ONLINE) runCatching { JSONObject(value) }.fold(
                onSuccess = { state = state.copy(attachment = it.optString("name"), attachmentUri = it.optString("uri"), attachmentMime = it.optString("mime"), attachmentData = it.optString("data")) },
                onFailure = { state = state.copy(attachment = value) }
            )
            "profilePhoto" -> { prefs.edit { putString("profileUri", value) }; state = state.copy(profileUri = value) }
            "reduceMotion" -> { val enabled = !state.reduceMotion; prefs.edit { putBoolean("reduceMotion", enabled) }; state = state.copy(reduceMotion = enabled) }
            "haptics" -> { val enabled = !state.hapticsEnabled; prefs.edit { putBoolean("hapticsEnabled", enabled) }; state = state.copy(hapticsEnabled = enabled) }
            "privacyMode" -> { val enabled = !state.privacyMode; prefs.edit { putBoolean("privacyMode", enabled) }; applyWindowPrivacy(state.temporary, enabled); state = state.copy(privacyMode = enabled) }
            "exportBackup" -> backupExporter.launch("NexusNXS-backup-${System.currentTimeMillis()}.nexus")
            "importBackup" -> backupImporter.launch(arrayOf("application/octet-stream", "application/json", "text/plain"))
            "diagnostics" -> state = state.copy(diagnosticsOpen = !state.diagnosticsOpen)
            "new" -> openConversation(store.createConversation())
            "open" -> openConversation(value)
            "deleteChat" -> { val deletingCurrent = value == state.conversationId; store.deleteConversation(value); if (deletingCurrent) openConversation(store.createConversation()) else refreshChats(true) }
            "renameChat" -> { val parts = value.split('\n', limit = 2); if (parts.size == 2) { store.renameConversation(parts[0], parts[1]); refreshChats() } }
            "editTurn" -> { val parts = value.split('\n', limit = 2); val index = parts.firstOrNull()?.toIntOrNull(); if (index != null && parts.size == 2 && state.conversationId.isNotBlank()) { val branch = store.branchConversation(state.conversationId, index); openConversation(branch); prefs.edit { putString("draft:$branch", parts[1]) }; state = state.copy(draft = parts[1]); refreshChats() } }
            "pinChat" -> { store.togglePinned(value); refreshChats() }
            "archiveChat" -> { store.archiveConversation(value); openConversation(store.createConversation()); refreshChats(true) }
            "restoreChat" -> { store.restoreConversation(value); refreshChats(true) }
            "send" -> sendMessage()
            "voiceSend" -> {
                val spoken = value.trim()
                if (spoken.isNotBlank() && !state.busy && state.connection == NexusConnection.ONLINE) {
                    state = state.copy(draft = spoken)
                    speakNextAnswer = true
                    sendMessage()
                }
            }
            "retryQueue" -> retryPendingRequests()
            "approveWork" -> authorizeWorkProposal()
            "cancelWork" -> {
                requestActiveWorkCancellation()
                clearWorkProposal()
                state = state.copy(busy = false, workTicketId = "", workPreview = "", workRisk = "", activity = nexusCopy("Operazione annullata", "Operation cancelled"))
            }
            "share" -> shareConversation()
            "continueOnPc" -> continueConversationOnPc()
            "speak" -> speakOrStop(value)
            "stopSpeech" -> stopAllSpeech()
            "regenerate" -> regenerateLastResponse()
            "approveTraining" -> submitApprovedFeedback(value)
            "dismissError" -> state = state.copy(error = null)
            "temporary" -> if (state.temporary) {
                val returnId = temporaryReturnConversationId.takeIf { it.isNotBlank() && store.get(it) != null } ?: store.createConversation()
                val returnWork = temporaryReturnWork
                val returnDraft = temporaryReturnDraft
                activeConnection?.disconnect()
                activeConnection = null
                protectTemporaryConversation(false)
                openConversation(returnId)
                prefs.edit {
                    putBoolean("workMode", returnWork)
                    putString("draft:$returnId", returnDraft)
                }
                state = state.copy(work = returnWork, draft = returnDraft, busy = false, streaming = "", activity = "")
                clearTemporaryReturnState()
            } else {
                temporaryReturnConversationId = state.conversationId
                temporaryReturnDraft = state.draft
                temporaryReturnWork = state.work
                protectTemporaryConversation(true)
                state = state.copy(temporary = true, work = false, screen = NexusScreen.CHAT, conversationId = "", turns = emptyList(), draft = "", attachment = null, attachmentUri = "", attachmentMime = "", attachmentData = "", error = null)
            }
            "saveTemporary" -> if (state.temporary) {
                val savedTurns = state.turns
                val id = store.createConversation()
                savedTurns.forEach { store.addTurn(id, it.role, it.content) }
                protectTemporaryConversation(false)
                openConversation(id)
                clearTemporaryReturnState()
                refreshChats()
            }
            "stop" -> {
                chatGeneration++
                clearPendingStreamUi()
                if (activeWorkOperationId.isNotBlank()) requestActiveWorkCancellation()
                else { activeConnection?.disconnect(); activeConnection = null }
                state = state.copy(busy = false, activity = nexusCopy("Interrotta", "Stopped"))
            }
            "pairing" -> if (state.pairingAvailable) state = state.copy(pairing = !state.pairing)
            "pair" -> if (state.pairingAvailable) pair(value)
            "pairWake" -> if (state.wakePairingAvailable) pairWakeRelay(value)
            "selectWake" -> if (state.wakeAvailable && state.wakeTargets.any { it.id == value }) state = state.copy(wakeSelectedTarget = value)
            "planWake" -> if (state.wakeAvailable) planWake(value.ifBlank { state.wakeSelectedTarget })
            "approveWake" -> authorizeWakeProposal()
            "cancelWake" -> cancelWakeProposal()
            "probeWake" -> if (appVisible) loadWakeCapabilities(force = true)
            // Le coroutine Compose possono restare vive mentre l'activity e in
            // background: i refresh periodici non devono quindi generare rete.
            // Streaming e richieste gia avviate restano invece intatti e possono
            // completarsi con la relativa notifica privata.
            "probe" -> if (appVisible) probeConnection()
            "models" -> if (appVisible) refreshModels()
            "clear" -> { uiHandler.removeCallbacks(persistDraftRunnable); pendingDraftConversationId = ""; pendingDraftValue = ""; store.clearAll(); refreshChats(true); state = state.copy(screen = NexusScreen.CHAT) }
        }
    }

    private fun refreshChats(openIfEmpty: Boolean = false) {
        store.deleteEmptyConversationsExcept(state.conversationId)
        var rows = store.list().toChatRows()
        if (rows.isEmpty() && openIfEmpty) { store.createConversation(); rows = store.list().toChatRows() }
        val id = state.conversationId.ifBlank { rows.firstOrNull()?.id.orEmpty() }
        state = state.copy(chats = rows)
        if (id.isNotBlank()) openConversation(id)
    }

    private fun openConversation(id: String) {
        flushDraftPersistence()
        val row = store.get(id)
        val turns = row?.optJSONArray("turns")?.toTurns() ?: emptyList()
        prefs.edit { putString("currentConversationId", id) }
        state = state.copy(screen = NexusScreen.CHAT, drawer = false, temporary = false, conversationId = id, turns = turns, draft = prefs.getString("draft:$id", "").orEmpty(), streaming = "", error = null, conversationSearchOpen = false, conversationSearch = "")
    }

    private fun loadCustomSlashCommands(): List<SlashCommandRow> = runCatching {
        val values = JSONArray(prefs.getString("slashCommands", "[]").orEmpty())
        buildList {
            for (index in 0 until values.length()) {
                val item = values.optJSONObject(index) ?: continue
                val name = item.optString("name").lowercase(Locale.ROOT)
                val template = item.optString("template").trim()
                if (!Regex("^[a-z0-9][a-z0-9-]{0,23}$").matches(name) || template.isBlank() || builtinSlashCommands().any { it.name == name }) continue
                add(SlashCommandRow(name, item.optString("label", name).take(48), nexusCopy("Comando personale", "Personal command"), template.take(2_000), true))
                if (size == 24) break
            }
        }
    }.getOrDefault(emptyList())

    private fun persistCustomSlashCommands(commands: List<SlashCommandRow>) {
        val values = JSONArray()
        commands.filter { it.custom }.take(24).forEach { command ->
            values.put(JSONObject().put("name", command.name).put("label", command.label).put("template", command.template))
        }
        prefs.edit { putString("slashCommands", values.toString()) }
    }

    private fun resolveSlashInput(value: String): SlashResolution {
        val raw = value.trim()
        val definition = Regex("^(?:/nuovo\\s+|(?:crea|aggiungi|salva|imposta)\\s+(?:il\\s+)?comando\\s+/?)([a-z0-9][a-z0-9-]{0,23})\\s*(?:=|:|come\\s+)\\s*([\\s\\S]+)$", RegexOption.IGNORE_CASE).find(raw)
        if (definition != null) {
            val name = definition.groupValues[1].lowercase(Locale.ROOT)
            if (builtinSlashCommands().any { it.name == name }) return SlashResolution(handled = true, message = nexusCopy("/$name è un comando integrato e non può essere sostituito.", "/$name is built in and cannot be replaced."))
            val command = SlashCommandRow(name, name, nexusCopy("Comando personale", "Personal command"), definition.groupValues[2].trim().take(2_000), true)
            val commands = listOf(command) + state.slashCommands.filterNot { it.name == name }
            persistCustomSlashCommands(commands)
            return SlashResolution(handled = true, message = nexusCopy("Comando /$name salvato su questo dispositivo.", "Command /$name saved on this device."), commands = commands)
        }
        val removal = Regex("^(?:/rimuovi\\s+|(?:rimuovi|elimina|cancella)\\s+(?:il\\s+)?comando\\s+/?)([a-z0-9][a-z0-9-]{0,23})\\s*$", RegexOption.IGNORE_CASE).find(raw)
        if (removal != null) {
            val name = removal.groupValues[1].lowercase(Locale.ROOT)
            val commands = state.slashCommands.filterNot { it.name == name }
            if (commands.size == state.slashCommands.size) return SlashResolution(handled = true, message = nexusCopy("Il comando /$name non esiste.", "Command /$name does not exist."))
            persistCustomSlashCommands(commands)
            return SlashResolution(handled = true, message = nexusCopy("Comando /$name rimosso.", "Command /$name removed."), commands = commands)
        }
        val invocation = Regex("^/([a-z0-9][a-z0-9-]{0,23})(?:\\s+([\\s\\S]*))?$", RegexOption.IGNORE_CASE).find(raw) ?: return SlashResolution(text = raw)
        val name = invocation.groupValues[1].lowercase(Locale.ROOT)
        val command = (state.slashCommands + builtinSlashCommands()).firstOrNull { it.name == name }
            ?: return SlashResolution(handled = true, message = nexusCopy("Comando /$name non riconosciuto. Scrivi / per vedere quelli disponibili.", "Unknown command /$name. Type / to see available commands."))
        if (command.template.isBlank()) return SlashResolution(handled = true, message = command.description)
        val argument = invocation.groupValues.getOrNull(2).orEmpty().trim().ifBlank { nexusCopy("il contenuto della richiesta precedente", "the content of the previous request") }
        return SlashResolution(text = if (command.template.contains("{testo}")) command.template.replace("{testo}", argument) else listOf(command.template, argument).filter(String::isNotBlank).joinToString(" "))
    }

    private fun sendMessage() {
        if (state.connection != NexusConnection.ONLINE) {
            state = state.copy(
                status = nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable"),
                error = nexusCopy("Riconnessione automatica in corso.", "Automatic reconnection in progress.")
            )
            if (appVisible) probeConnection()
            return
        }
        val enteredText = state.draft.trim().replace(Regex("%20", RegexOption.IGNORE_CASE), " ")
        if ((enteredText.isBlank() && state.attachment == null) || state.busy) return
        val inputText = enteredText.ifBlank { nexusCopy("Analizza questo allegato.", "Analyze this attachment.") }
        val slashResolution = resolveSlashInput(inputText)
        if (slashResolution.handled) {
            val id = state.conversationId
            if (!state.temporary && id.isNotBlank()) discardDraftPersistence(id)
            state = state.copy(draft = "", activity = slashResolution.message, slashCommands = slashResolution.commands ?: state.slashCommands)
            return
        }
        ensureNotificationPermission()
        val text = slashResolution.text
        val speakReply = speakNextAnswer.also { speakNextAnswer = false }
        val inferredWork = state.remoteWorkAvailable && explicitDesktopIntent(text)
        if ((state.work || inferredWork) && !state.temporary) { planWork(text); return }
        val generation = ++chatGeneration
        val attachment = encodedAttachment()
        val effectiveText = compatibleAttachmentText(text, attachment)
        if (state.temporary) {
            val previous = state.turns
            val pendingTurns = previous + Turn("user", text)
            state = state.copy(draft = "", attachment = null, turns = pendingTurns, busy = true, streaming = "", activity = nexusCopy("Comprendo la richiesta…", "Understanding your request…"), error = null, status = nexusCopy("Chat temporanea", "Temporary chat"))
            runTask {
                var failure: String? = null
                val answer = try { guestStream(effectiveText, state.model, previous, attachment, uiTemporary = true, uiGeneration = generation) } catch (_: Exception) { failure = nexusCopy("I server NexusNXS non sono raggiungibili. In modalità temporanea il messaggio non viene archiviato.", "NexusNXS servers are unreachable. Temporary-chat messages are not stored."); "" }
                if (destroyed) return@runTask
                postUi {
                    if (!state.temporary || generation != chatGeneration) return@postUi
                    state = state.copy(turns = if (answer.isBlank()) pendingTurns else pendingTurns + Turn("assistant", answer), streaming = "", activity = "", busy = false, error = failure, status = if (failure != null) nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable") else nexusCopy("Chat temporanea", "Temporary chat"), connection = if (failure != null) NexusConnection.OFFLINE else NexusConnection.ONLINE)
                    if (answer.isNotBlank()) {
                        if (speakReply) speakOrStop(answer)
                        notifyCompletion()
                    }
                }
            }
            return
        }
        val id = state.conversationId.ifBlank { store.createConversation() }
        val previousTurns = state.turns
        store.addTurn(id, "user", text + (state.attachment?.let { "\n\nAllegato: $it" } ?: ""))
        val clientMessageId = store.queueRequest(id, effectiveText, state.model, attachment?.toString().orEmpty())
        discardDraftPersistence(id)
        state = state.copy(conversationId = id, chats = store.list().toChatRows(), draft = "", attachment = null, busy = true, streaming = "", activity = nexusCopy("Comprendo la richiesta…", "Understanding your request…"), error = null, turns = store.get(id).optJSONArray("turns").toTurns(), status = nexusCopy("NexusNXS sta lavorando…", "NexusNXS is working…"), pendingCount = store.pendingCount())
        runTask {
            var failed = false
            val answer = try { guestStream(effectiveText, state.model, contextTurns = previousTurns, attachment = attachment, clientMessageId = clientMessageId, uiConversationId = id, uiGeneration = generation) } catch (_: Exception) { failed = true; "" }
            if (destroyed) return@runTask
            if (answer.isNotBlank()) { store.addTurn(id, "assistant", answer); store.completePendingRequest(clientMessageId) }
            postUi {
                if (generation != chatGeneration) { state = state.copy(chats = store.list().toChatRows(), pendingCount = store.pendingCount()); return@postUi }
                val showingConversation = state.conversationId == id && !state.temporary
                state = state.copy(turns = if (showingConversation) store.get(id).optJSONArray("turns").toTurns() else state.turns, streaming = if (showingConversation) "" else state.streaming, activity = if (showingConversation) "" else state.activity, busy = false, error = if (showingConversation) null else state.error, status = if (failed) nexusCopy("Server NexusNXS non raggiungibili · ${store.pendingCount()} in coda", "NexusNXS servers unreachable · ${store.pendingCount()} queued") else "Online", connection = if (failed) NexusConnection.OFFLINE else NexusConnection.ONLINE, pendingCount = store.pendingCount())
                refreshChats()
                if (failed) probeConnection() else {
                    if (speakReply && answer.isNotBlank()) speakOrStop(answer)
                    notifyCompletion()
                }
            }
        }
    }

    /**
     * Promuove automaticamente soltanto richieste inequivocabili rivolte al PC.
     * Una frase generica resta sempre conversazione: nessuna euristica può
     * ampliare silenziosamente l'autorizzazione dell'utente.
     */
    private fun explicitDesktopIntent(text: String): Boolean {
        val target = Regex("\\b(?:pc|computer|workstation|desktop|windows)\\b", RegexOption.IGNORE_CASE)
        val operation = Regex("\\b(?:apri|chiudi|avvia|esegui|crea|modifica|sposta|rinomina|elimina|installa|disinstalla|open|close|start|run|create|edit|move|rename|delete|install|uninstall)\\b", RegexOption.IGNORE_CASE)
        return target.containsMatchIn(text) && operation.containsMatchIn(text)
    }

    private fun notifyCompletion() {
        if (appVisible || android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        val open = PendingIntent.getActivity(this, 17, Intent(this, NexusMainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = android.app.Notification.Builder(this, NEXUS_ACTIVITY_CHANNEL).setSmallIcon(R.drawable.ic_nexus_notification)
            .setContentTitle(nexusCopy("NexusNXS ha terminato", "NexusNXS has finished")).setContentText(nexusCopy("La risposta è pronta nell’app.", "Your response is ready in the app.")).setContentIntent(open).setAutoCancel(true)
            .setVisibility(if (state.privacyMode) android.app.Notification.VISIBILITY_SECRET else android.app.Notification.VISIBILITY_PRIVATE).build()
        getSystemService(NotificationManager::class.java).notify(17, notification)
    }

    /**
     * Invia soltanto la coppia domanda/risposta scelta dall'utente. Il click
     * sulla voce esplicita nel foglio azioni costituisce consenso per questo
     * singolo contributo; cronologia, allegati e dati del dispositivo restano
     * esclusi. Il server conserva il record in quarantena fino alla review.
     */
    private fun submitApprovedFeedback(response: String) {
        if (state.temporary || response.isBlank() || state.connection != NexusConnection.ONLINE) return
        val answerIndex = state.turns.indexOfLast { it.role == "assistant" && it.content == response }
        val prompt = state.turns.take(answerIndex.coerceAtLeast(0)).lastOrNull { it.role == "user" }?.content
            ?.substringBefore("\n\nAllegato:")?.trim().orEmpty()
        if (prompt.isBlank()) {
            state = state.copy(status = nexusCopy("Domanda originale non disponibile", "Original prompt unavailable"))
            return
        }
        state = state.copy(status = nexusCopy("Invio contributo volontario…", "Sending voluntary contribution…"))
        runTask {
            val message = try {
                val token = ensureGuestToken()
                val result = http("/api/guest/feedback", JSONObject()
                    .put("prompt", prompt)
                    .put("response", response)
                    .put("model", publicModelId(state.model))
                    .put("mode", routedMode(prompt, state.model))
                    .put("consent", true), token)
                if (result.optString("status") == "received") nexusCopy("Contributo inviato in revisione", "Contribution sent for review")
                else result.optString("error", nexusCopy("Contributo non accettato", "Contribution not accepted"))
            } catch (_: Exception) {
                nexusCopy("Contributo non inviato: riprova più tardi", "Contribution not sent: try again later")
            }
            if (!destroyed) postUi { state = state.copy(status = message) }
        }
    }

    private fun ensureNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 170)
    }

    private fun planWork(instruction: String) {
        if (!state.remoteWorkAvailable || state.wakeTicketId.isNotBlank() || pendingAuthorizationKind != NexusAuthorizationKind.NONE) return
        val token = secureTokens.read("remoteToken")
        if (token.isBlank()) {
            state = state.copy(error = nexusCopy("Associa prima la workstation NexusNXS dalla sezione Remote.", "Pair your NexusNXS workstation from Remote first."))
            return
        }
        val generation = ++chatGeneration
        val id = state.conversationId.ifBlank { store.createConversation() }
        store.addTurn(id, "user", instruction)
        discardDraftPersistence(id)
        state = state.copy(conversationId = id, draft = "", busy = true, activity = nexusCopy("Creo un piano verificabile…", "Creating a verifiable plan…"), error = null, turns = store.get(id)?.optJSONArray("turns")?.toTurns().orEmpty())
        runTask {
            val result = try { http("/api/actions/plan", JSONObject().put("instruction", instruction), token) } catch (_: Exception) { JSONObject().put("error", nexusCopy("La workstation non è raggiungibile. Il lavoro resta nella cronologia.", "The workstation is unreachable. This work remains in history.")) }
            if (destroyed) return@runTask
            val proposal = result.optJSONObject("proposal")
            val message = result.optString("message").ifBlank { result.optString("error", nexusCopy("Nessun piano disponibile.", "No plan is available.")) }
            store.addTurn(id, "assistant", message)
            postUi {
                if (generation != chatGeneration) { state = state.copy(chats = store.list().toChatRows()); return@postUi }
                if (proposal != null && proposal.optString("id").isNotBlank()) persistWorkProposal(proposal.optString("id"), proposal.optString("preview"), proposal.optString("risk"))
                val showingConversation = state.conversationId == id && !state.temporary
                state = state.copy(
                    turns = if (showingConversation) store.get(id)?.optJSONArray("turns")?.toTurns().orEmpty() else state.turns, busy = false, activity = if (showingConversation) "" else state.activity,
                    error = if (showingConversation) result.optString("error").takeIf(String::isNotBlank) else state.error,
                    workTicketId = proposal?.optString("id").orEmpty(), workPreview = proposal?.optString("preview").orEmpty(), workRisk = proposal?.optString("risk").orEmpty()
                )
                refreshChats()
            }
        }
    }

    private fun authorizeWorkProposal() {
        if (!state.remoteWorkAvailable || state.busy || !appVisible || state.wakeTicketId.isNotBlank() || pendingAuthorizationKind != NexusAuthorizationKind.NONE) return
        val ticket = state.workTicketId
        if (ticket.isBlank() || secureTokens.read("remoteToken").isBlank()) return
        pendingAuthorizationTicket = ticket
        pendingAuthorizationKind = NexusAuthorizationKind.WORK
        state = state.copy(activity = nexusCopy("Conferma la tua identità…", "Confirm your identity…"))
        requestProtectedAuthorization(ticket)
    }

    private fun authorizeWakeProposal() {
        if (!state.wakeAvailable || state.wakeBusy || !appVisible) return
        val ticket = state.wakeTicketId
        if (ticket.isBlank() || secureTokens.read("wakeToken").isBlank()) return
        pendingAuthorizationTicket = ticket
        pendingAuthorizationKind = NexusAuthorizationKind.WAKE
        state = state.copy(wakeStatus = nexusCopy("Conferma la tua identità…", "Confirm your identity…"))
        requestProtectedAuthorization(ticket)
    }

    private fun requestProtectedAuthorization(ticket: String) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.P) {
            launchDeviceCredentialConfirmation(ticket)
            return
        }
        val callback = object : android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: android.hardware.biometrics.BiometricPrompt.AuthenticationResult?) {
                completeProtectedAuthorization(ticket)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                if (destroyed || deviceCredentialInProgress && pendingAuthorizationTicket == ticket) return
                val credentialFallback = errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE ||
                    errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS ||
                    errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT ||
                    errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT
                if (android.os.Build.VERSION.SDK_INT == android.os.Build.VERSION_CODES.P && credentialFallback) {
                    launchDeviceCredentialConfirmation(ticket)
                } else if (pendingAuthorizationTicket == ticket) {
                    val kind = pendingAuthorizationKind
                    pendingAuthorizationTicket = ""
                    pendingAuthorizationKind = NexusAuthorizationKind.NONE
                    state = if (kind == NexusAuthorizationKind.WAKE) state.copy(wakeStatus = nexusCopy("Risveglio non autorizzato", "Wake not authorized")) else state.copy(activity = nexusCopy("Autorizzazione annullata", "Authorization cancelled"))
                }
            }
        }
        val wake = pendingAuthorizationKind == NexusAuthorizationKind.WAKE
        val builder = android.hardware.biometrics.BiometricPrompt.Builder(this)
            .setTitle(if (wake) nexusCopy("Autorizza risveglio", "Authorize wake") else nexusCopy("Autorizza Cuore", "Authorize Core"))
            .setSubtitle(if (wake) nexusCopy("Conferma prima di inviare il segnale", "Confirm before sending the signal") else nexusCopy("Conferma prima di eseguire il piano", "Confirm before running the plan"))
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            builder.setAllowedAuthenticators(
                android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
        } else if (android.os.Build.VERSION.SDK_INT == android.os.Build.VERSION_CODES.Q) {
            builder.setDeviceCredentialAllowed(true)
        } else {
            builder.setNegativeButton(
                nexusCopy("Usa PIN", "Use PIN"),
                mainExecutor
            ) { _, _ -> launchDeviceCredentialConfirmation(ticket) }
        }
        builder.build().authenticate(android.os.CancellationSignal(), mainExecutor, callback)
    }

    private fun launchDeviceCredentialConfirmation(ticket: String) {
        if (destroyed || pendingAuthorizationTicket != ticket || deviceCredentialInProgress) return
        val wake = pendingAuthorizationKind == NexusAuthorizationKind.WAKE
        val keyguard = getSystemService(KeyguardManager::class.java)
        val intent = keyguard?.takeIf { it.isDeviceSecure }?.createConfirmDeviceCredentialIntent(
            if (wake) nexusCopy("Autorizza risveglio", "Authorize wake") else nexusCopy("Autorizza Cuore", "Authorize Core"),
            if (wake) nexusCopy("Sblocca il dispositivo per inviare il segnale", "Unlock your device to send the signal") else nexusCopy("Sblocca il dispositivo per eseguire il piano", "Unlock your device to run the plan")
        )
        if (intent == null) {
            pendingAuthorizationTicket = ""
            pendingAuthorizationKind = NexusAuthorizationKind.NONE
            state = state.copy(
                activity = "",
                error = nexusCopy(
                    if (wake) "Configura un blocco schermo sicuro per autorizzare il risveglio." else "Configura un blocco schermo sicuro per autorizzare le operazioni Cuore.",
                    if (wake) "Set up a secure screen lock to authorize wake." else "Set up a secure screen lock to authorize Core actions."
                ),
                wakeStatus = if (wake) nexusCopy("Blocco schermo sicuro richiesto", "Secure screen lock required") else state.wakeStatus
            )
        } else {
            deviceCredentialInProgress = true
            deviceCredentialConfirmation.launch(intent)
        }
    }

    private fun completeProtectedAuthorization(ticket: String) {
        when (pendingAuthorizationKind) {
            NexusAuthorizationKind.WORK -> completeWorkAuthorization(ticket)
            NexusAuthorizationKind.WAKE -> completeWakeAuthorization(ticket)
            NexusAuthorizationKind.NONE -> Unit
        }
    }

    private fun completeWorkAuthorization(ticket: String) {
        if (destroyed || pendingAuthorizationKind != NexusAuthorizationKind.WORK || pendingAuthorizationTicket != ticket) return
        pendingAuthorizationTicket = ""
        pendingAuthorizationKind = NexusAuthorizationKind.NONE
        if (!appVisible || state.workTicketId != ticket || !state.remoteWorkAvailable || state.busy) {
            state = state.copy(activity = "", error = nexusCopy("Il piano non è più autorizzabile.", "This plan can no longer be authorized."))
            return
        }
        executeAuthorizedWorkProposal(ticket)
    }

    private fun executeAuthorizedWorkProposal(authorizedTicket: String) {
        if (!state.remoteWorkAvailable) return
        val ticket = state.workTicketId
        val token = secureTokens.read("remoteToken")
        val conversationId = state.conversationId
        if (ticket.isBlank() || ticket != authorizedTicket || token.isBlank() || state.busy) return
        val operationId = java.util.UUID.randomUUID().toString()
        activeWorkOperationId = operationId
        activeWorkToken = token
        workCancellationRequested = false
        // Il ticket resta cifrato finché il gateway conferma il risultato: una
        // chiusura dell'app o un cambio rete non può perdere un piano approvabile.
        state = state.copy(busy = true, activity = nexusCopy("Eseguo e verifico…", "Running and verifying…"))
        runTask {
            val result = try {
                httpWork(
                    JSONObject().put("ticketId", ticket).put("approved", true).put("operationId", operationId),
                    token,
                    operationId
                )
            } catch (_: Exception) {
                if (workCancellationRequested && activeWorkOperationId == operationId) {
                    JSONObject().put("error", nexusCopy("Operazione annullata.", "Operation cancelled.")).put("code", "ACTION_CANCELLED")
                } else JSONObject().put("error", nexusCopy("Connessione interrotta prima della conferma del risultato.", "Connection interrupted before the result was confirmed."))
            }
            // Una risposta completata vince su un annullamento arrivato troppo
            // tardi: ACTION_CANCELLED viene sintetizzato soltanto se la richiesta
            // execute è davvero fallita mentre l'annullamento era in corso.
            val cancelled = result.optString("code") == "ACTION_CANCELLED"
            if (activeWorkOperationId == operationId) {
                activeWorkOperationId = ""
                activeWorkToken = ""
                activeWorkConnection = null
                workCancellationRequested = false
            }
            if (destroyed) return@runTask
            val message = if (cancelled) "Operazione annullata." else listOf(result.optString("message"), result.optString("stdout"), result.optString("stderr")).filter(String::isNotBlank).joinToString("\n\n").ifBlank { result.optString("error", "Operazione completata.") }
            store.addTurn(conversationId, "assistant", message, result.optJSONArray("artifacts")?.toString().orEmpty())
            postUi {
                val failure = result.optString("error").takeIf { it.isNotBlank() && !cancelled }
                if (failure == null) clearWorkProposal()
                state = state.copy(turns = if (state.conversationId == conversationId) store.get(conversationId)?.optJSONArray("turns")?.toTurns().orEmpty() else state.turns, busy = false, activity = if (cancelled) "Operazione annullata" else "", workTicketId = if (failure == null) "" else ticket, workPreview = if (failure == null) "" else state.workPreview, workRisk = if (failure == null) "" else state.workRisk, error = failure)
                refreshChats()
            }
        }
    }

    /**
     * Il relay riceve sempre il solo ID di un target gia pubblicato dalla sua
     * allowlist. MAC, broadcast e primitive UDP non entrano mai nel client.
     */
    private fun planWake(targetId: String) {
        if (!appVisible || state.wakeBusy || !state.wakeAvailable || !state.wakeConnected || state.workTicketId.isNotBlank() || pendingAuthorizationKind != NexusAuthorizationKind.NONE) return
        val target = state.wakeTargets.firstOrNull { it.id == targetId } ?: return
        val token = secureTokens.read("wakeToken")
        if (token.isBlank()) return
        state = state.copy(wakeBusy = true, wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Preparo il risveglio…", "Preparing wake…"))
        runTask {
            val result = runCatching { wakePost("/api/wake/plan", JSONObject().put("targetId", target.id), token) }
            if (destroyed) return@runTask
            postUi {
                val proposal = result.getOrNull()?.optJSONObject("proposal")
                val ticket = proposal?.optString("id").orEmpty()
                val proposalTarget = proposal?.optString("targetId").orEmpty()
                val preview = proposal?.optString("preview").orEmpty().replace(Regex("[\\p{Cntrl}]"), " ").trim().take(160)
                val risk = proposal?.optString("risk").orEmpty()
                val expiresAt = proposal?.optLong("expiresAt") ?: 0L
                val valid = ticket.matches(Regex("[A-Za-z0-9_-]{8,128}")) && proposalTarget == target.id && preview.isNotBlank() && risk == "high" && expiresAt > System.currentTimeMillis() && expiresAt <= System.currentTimeMillis() + 120_000L
                if (valid) {
                    state = state.copy(wakeBusy = false, wakeTicketId = ticket, wakePreview = preview, wakeRisk = risk, wakeStatus = nexusCopy("Piano pronto · conferma richiesta", "Plan ready · approval required"))
                } else {
                    val message = result.exceptionOrNull()?.message?.take(160) ?: nexusCopy("Il relay ha restituito un piano non valido.", "The relay returned an invalid plan.")
                    state = state.copy(wakeBusy = false, wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeConnected = result.isSuccess, wakeStatus = message)
                }
            }
        }
    }

    private fun cancelWakeProposal() {
        if (pendingAuthorizationKind == NexusAuthorizationKind.WAKE) {
            pendingAuthorizationTicket = ""
            pendingAuthorizationKind = NexusAuthorizationKind.NONE
            deviceCredentialInProgress = false
        }
        state = state.copy(wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeBusy = false, wakeStatus = nexusCopy("Risveglio annullato", "Wake cancelled"))
    }

    private fun completeWakeAuthorization(ticket: String) {
        if (destroyed || pendingAuthorizationKind != NexusAuthorizationKind.WAKE || pendingAuthorizationTicket != ticket) return
        pendingAuthorizationTicket = ""
        pendingAuthorizationKind = NexusAuthorizationKind.NONE
        if (!appVisible || state.wakeTicketId != ticket || !state.wakeAvailable || state.wakeBusy) {
            state = state.copy(wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Il piano di risveglio non è più autorizzabile.", "The wake plan can no longer be authorized."))
            return
        }
        executeAuthorizedWakeProposal(ticket)
    }

    private fun executeAuthorizedWakeProposal(authorizedTicket: String) {
        val token = secureTokens.read("wakeToken")
        if (authorizedTicket.isBlank() || authorizedTicket != state.wakeTicketId || token.isBlank() || state.wakeBusy) return
        state = state.copy(wakeBusy = true, wakeStatus = nexusCopy("Invio il segnale verificato…", "Sending verified signal…"))
        runTask {
            val result = runCatching { wakePost("/api/wake/execute", JSONObject().put("ticketId", authorizedTicket).put("approved", true), token) }
            if (destroyed) return@runTask
            postUi {
                // Il ticket del relay e monouso anche in caso di errore. Non lo
                // riutilizziamo mai dopo una risposta incerta o una rete interrotta.
                if (result.isSuccess) {
                    capabilityProbeCompleted = false
                    state = state.copy(
                        wakeBusy = false,
                        wakeTicketId = "",
                        wakePreview = "",
                        wakeRisk = "",
                        wakeAwaiting = true,
                        wakeConnected = true,
                        wakeStatus = nexusCopy("Segnale inviato · attendo la workstation", "Signal sent · waiting for workstation")
                    )
                    scheduleWorkstationReconnectChecks()
                } else {
                    val error = result.exceptionOrNull()
                    if (error is NexusHttpException && error.statusCode == 401) clearWakeSession()
                    state = state.copy(
                        wakeBusy = false,
                        wakeTicketId = "",
                        wakePreview = "",
                        wakeRisk = "",
                        wakeConnected = error !is java.io.IOException,
                        wakeStatus = error?.message?.take(160) ?: nexusCopy("Segnale non inviato", "Signal not sent")
                    )
                }
            }
        }
    }

    private fun scheduleWorkstationReconnectChecks() {
        listOf(5_000L, 12_000L, 25_000L, 45_000L).forEach { delay ->
            uiHandler.postDelayed({
                if (!destroyed && appVisible && state.wakeAwaiting) {
                    probeConnection()
                    refreshRemoteCapabilities()
                    loadDevices()
                }
            }, delay)
        }
    }

    /**
     * Chiede al gateway di interrompere l'operazione prima di chiudere il socket
     * locale. La richiesta è best effort: una rete già interrotta può impedire al
     * server di riceverla e non implica rollback dei cambiamenti già completati.
     */
    private fun requestActiveWorkCancellation(waitMillis: Long = 0L) {
        val operationId = activeWorkOperationId
        val token = activeWorkToken
        val executionConnection = activeWorkConnection
        if (operationId.isBlank() || token.isBlank()) {
            executionConnection?.disconnect()
            return
        }
        if (workCancellationRequested) {
            executionConnection?.disconnect()
            return
        }
        workCancellationRequested = true
        try {
            val future = cancellationExecutor.submit {
                try { postWorkCancellation(operationId, token) }
                finally {
                    if (activeWorkConnection === executionConnection) activeWorkConnection = null
                    executionConnection?.disconnect()
                }
            }
            if (waitMillis > 0L) runCatching { future.get(waitMillis, TimeUnit.MILLISECONDS) }
                .onFailure { executionConnection?.disconnect() }
        } catch (_: RejectedExecutionException) {
            executionConnection?.disconnect()
        }
    }

    private fun postWorkCancellation(operationId: String, token: String) {
        val payload = JSONObject().put("operationId", operationId).toString().toByteArray(StandardCharsets.UTF_8)
        for (endpoint in endpointCandidates()) {
            val connection = openTrackedConnection(endpoint.trimEnd('/') + "/api/actions/cancel")
            try {
                connection.instanceFollowRedirects = false
                connection.requestMethod = "POST"
                connection.connectTimeout = 800
                connection.readTimeout = 800
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.outputStream.use { it.write(payload) }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                stream?.use { it.readBytes() }
                if (status in 200..299) return
            } catch (_: Exception) {
                // Il disconnect della richiesta execute resta comunque il fallback.
            } finally { closeTrackedConnection(connection) }
        }
    }

    private fun httpWork(body: JSONObject, token: String, operationId: String): JSONObject {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            if (workCancellationRequested && activeWorkOperationId == operationId) break
            try {
                return httpWorkAt(endpoint, body, token, operationId).also { rememberReachable(endpoint) }
            } catch (error: Exception) { failure = error }
        }
        throw failure ?: IllegalStateException("Operazione annullata.")
    }

    private fun httpWorkAt(base: String, body: JSONObject, token: String, operationId: String): JSONObject {
        val connection = openTrackedConnection(base.trimEnd('/') + "/api/actions/execute")
        activeWorkConnection = connection
        try {
            if (workCancellationRequested && activeWorkOperationId == operationId) throw IllegalStateException("Operazione annullata.")
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.connectTimeout = 3_500
            connection.readTimeout = 240_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val result = JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            if (status !in 200..299) throw IllegalStateException(result.optString("error", "HTTP $status"))
            return result
        } finally {
            if (activeWorkConnection === connection) activeWorkConnection = null
            closeTrackedConnection(connection)
        }
    }

    private fun persistWorkProposal(ticket: String, preview: String, risk: String) {
        secureTokens.write("workProposal", JSONObject().put("ticket", ticket).put("preview", preview).put("risk", risk).put("savedAt", System.currentTimeMillis()).toString())
    }

    private fun clearWorkProposal() = secureTokens.clear("workProposal")

    private fun shareConversation() {
        val title = state.chats.firstOrNull { it.id == state.conversationId }?.title ?: "Conversazione NexusNXS"
        val transcript = state.turns.joinToString("\n\n") { "${if (it.role == "user") "Tu" else "NexusNXS"}: ${it.content}" }
        if (transcript.isBlank()) return
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, transcript), nexusCopy("Condividi conversazione", "Share conversation")))
    }

    private fun continueConversationOnPc() {
        if (!state.pairingAvailable) return
        if (state.temporary || state.conversationId.isBlank() || state.turns.isEmpty()) return
        val token = secureTokens.read("remoteToken")
        if (token.isBlank()) { state = state.copy(error = nexusCopy("Associa la workstation dalla sezione Dispositivi per continuare sul PC.", "Pair the workstation from Devices to continue on PC.")); return }
        val conversation = store.get(state.conversationId) ?: return
        state = state.copy(busy = true, activity = nexusCopy("Trasferisco la conversazione al PC…", "Transferring the conversation to PC…"), error = null)
        runTask {
            val result = runCatching {
                http("/api/conversations/import", JSONObject().put("sourceId", state.conversationId).put("title", conversation.optString("title", "Conversazione NexusNXS")).put("turns", conversation.optJSONArray("turns")), token)
            }
            if (destroyed) return@runTask
            postUi { state = state.copy(busy = false, activity = if (result.isSuccess) nexusCopy("Pronta sul PC", "Ready on PC") else "", error = result.exceptionOrNull()?.let { nexusCopy("Trasferimento non riuscito. NexusNXS riproverà quando la workstation sarà raggiungibile.", "Transfer failed. NexusNXS will retry when the workstation is reachable.") }) }
        }
    }

    private fun speakOrStop(text: String) {
        if (neuralSpeechPlayer?.isPlaying == true || textToSpeech?.isSpeaking == true) {
            stopAllSpeech()
            return
        }
        val token = secureTokens.read("guestToken")
        if (token.isBlank() || state.connection == NexusConnection.OFFLINE) {
            speakWithDeviceVoice(text)
            return
        }
        stopAllSpeech()
        runTask {
            val audio = runCatching { requestNeuralSpeech(text, token) }.getOrNull()
            if (destroyed) return@runTask
            if (audio == null) postUi { speakWithDeviceVoice(text) }
            else postUi { playNeuralSpeech(audio) }
        }
    }

    private fun requestNeuralSpeech(text: String, token: String): File {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            var connection: HttpURLConnection? = null
            try {
                connection = openTrackedConnection(endpoint.trimEnd('/') + "/api/guest/voice/synthesize")
                speechConnection = connection
                connection.instanceFollowRedirects = false
                connection.requestMethod = "POST"
                connection.connectTimeout = 3_500
                connection.readTimeout = 90_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Accept", "audio/wav")
                connection.setRequestProperty("Authorization", "Bearer $token")
                val language = spokenLocale(text, resources.configuration.locales[0]).toLanguageTag().ifBlank { "it" }
                val payload = JSONObject().put("text", text.take(4_000)).put("language", language).put("gender", "male")
                connection.outputStream.use { it.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
                if (connection.responseCode !in 200..299) throw IllegalStateException("Voce server non disponibile")
                val output = ByteArrayOutputStream(256 * 1024)
                connection.inputStream.use { input ->
                    val buffer = ByteArray(16 * 1024)
                    var total = 0
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= 16 * 1024 * 1024) { "Risposta vocale troppo grande" }
                        output.write(buffer, 0, count)
                    }
                }
                rememberReachable(endpoint)
                return File.createTempFile("nexus-voice-", ".wav", cacheDir).apply { writeBytes(output.toByteArray()) }
            } catch (error: Exception) {
                failure = error
            } finally {
                if (speechConnection === connection) speechConnection = null
                connection?.let(::closeTrackedConnection)
            }
        }
        throw failure ?: IllegalStateException("Voce server non raggiungibile")
    }

    private fun playNeuralSpeech(file: File) {
        stopAllSpeech()
        neuralSpeechFile = file
        neuralSpeechPlayer = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            setDataSource(file.absolutePath)
            setOnCompletionListener { stopAllSpeech() }
            setOnErrorListener { _, _, _ -> stopAllSpeech(); true }
            setOnPreparedListener { it.start() }
            prepareAsync()
        }
    }

    private fun speakWithDeviceVoice(text: String) {
        textToSpeech?.language = spokenLocale(text, resources.configuration.locales[0])
        textToSpeech?.speak(text.take(12_000), TextToSpeech.QUEUE_FLUSH, Bundle(), "nexus-${System.currentTimeMillis()}")
    }

    private fun stopAllSpeech() {
        speechConnection?.disconnect()
        speechConnection = null
        textToSpeech?.stop()
        neuralSpeechPlayer?.let { player -> runCatching { player.stop() }; player.reset(); player.release() }
        neuralSpeechPlayer = null
        neuralSpeechFile?.delete()
        neuralSpeechFile = null
    }

    override fun onDestroy() {
        flushDraftPersistence()
        destroyed = true
        pendingAuthorizationTicket = ""
        pendingAuthorizationKind = NexusAuthorizationKind.NONE
        deviceCredentialInProgress = false
        clearPendingStreamUi()
        if (::frameHealth.isInitialized) frameHealth.stop()
        runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) }
        requestActiveWorkCancellation(900L)
        activeConnection?.disconnect()
        activeConnection = null
        activeConnections.toList().forEach(HttpURLConnection::disconnect)
        activeConnections.clear()
        backgroundExecutor.shutdownNow()
        cancellationExecutor.shutdownNow()
        stopAllSpeech()
        textToSpeech?.shutdown()
        if (::store.isInitialized) store.close()
        super.onDestroy()
    }

    private fun regenerateLastResponse() {
        if (state.busy) return
        val id = state.conversationId
        val lastUserIndex = state.turns.indexOfLast { it.role == "user" }
        if (id.isBlank() || lastUserIndex < 0) return
        val generation = ++chatGeneration
        val prompt = state.turns[lastUserIndex].content.substringBefore("\n\nAllegato:")
        store.deleteLastAssistantTurn(id)
        val history = store.get(id)?.optJSONArray("turns")?.toTurns().orEmpty().dropLast(1)
        state = state.copy(turns = store.get(id).optJSONArray("turns").toTurns(), busy = true, streaming = "", activity = nexusCopy("Rigenero la risposta…", "Regenerating the response…"), error = null)
        runTask {
            var failure: String? = null
            val answer = try { guestStream(prompt, state.model, history, uiConversationId = id, uiGeneration = generation) } catch (_: Exception) { failure = nexusCopy("Connessione interrotta. La richiesta è rimasta sul telefono.", "Connection interrupted. The request remains on this phone."); "" }
            if (destroyed) return@runTask
            if (answer.isNotBlank()) store.addTurn(id, "assistant", answer)
            postUi {
                if (generation != chatGeneration) { state = state.copy(chats = store.list().toChatRows()); return@postUi }
                val showingConversation = state.conversationId == id && !state.temporary
                state = state.copy(turns = if (showingConversation) store.get(id).optJSONArray("turns").toTurns() else state.turns, streaming = if (showingConversation) "" else state.streaming, activity = if (showingConversation) "" else state.activity, busy = false, error = if (showingConversation) failure else state.error, status = if (failure != null) nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable") else "Online", connection = if (failure != null) NexusConnection.OFFLINE else NexusConnection.ONLINE)
                refreshChats()
            }
        }
    }

    private fun encodedAttachment(): JSONObject? {
        val name = state.attachment ?: return null
        val bytes = when {
            state.attachmentData.isNotBlank() -> runCatching { Base64.decode(state.attachmentData, Base64.DEFAULT) }.getOrNull()
            state.attachmentUri.isNotBlank() -> runCatching { readBoundedContent(state.attachmentUri.toUri(), MAX_ATTACHMENT_BYTES) }.getOrNull()
            else -> null
        } ?: return null
        if (bytes.size > MAX_ATTACHMENT_BYTES) throw IllegalArgumentException("L’allegato supera il limite di 1,5 MB.")
        return JSONObject().put("name", name.take(120)).put("mime", state.attachmentMime.take(80)).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }

    private fun compatibleAttachmentText(text: String, attachment: JSONObject?): String {
        if (attachment == null) return text
        val mime = attachment.optString("mime")
        if (!(mime.startsWith("text/") || mime in setOf("application/json", "application/xml"))) return text
        val decoded = runCatching { String(Base64.decode(attachment.optString("data"), Base64.DEFAULT), StandardCharsets.UTF_8) }.getOrDefault("").replace("\u0000", "").take(80_000)
        return "$text\n\n<MATERIALE_ALLEGATO_NON_FIDATO nome=\"${attachment.optString("name").replace("\"", "")}\">\n$decoded\n</MATERIALE_ALLEGATO_NON_FIDATO>"
    }

    private fun guestStream(
        text: String,
        model: String,
        contextTurns: List<Turn> = state.turns,
        attachment: JSONObject? = null,
        clientMessageId: String = java.util.UUID.randomUUID().toString(),
        uiConversationId: String = "",
        uiTemporary: Boolean = false,
        uiGeneration: Long = 0L
    ): String {
        val requestStartedAt = SystemClock.elapsedRealtime()
        val history = JSONArray().also { a -> contextTurns.takeLast(20).forEach { a.put(JSONObject().put("role", it.role).put("content", it.content)) } }
        val body = JSONObject().put("text", text).put("history", history).put("mode", routedMode(text, model)).put("model", publicModelId(model)).put("clientMessageId", clientMessageId).also { if (attachment != null) it.put("attachments", JSONArray().put(attachment)) }
        var failure: Exception? = null
        var token = secureTokens.read("guestToken")
        var tokenEndpoint = prefs.getString("guestTokenEndpoint", "").orEmpty()
        val candidates = listOf(tokenEndpoint).plus(endpointCandidates()).mapNotNull(::trustedEndpoint).distinct()
        for (endpoint in candidates) {
            try {
                if (token.isBlank() || tokenEndpoint != endpoint) {
                    token = bootstrapGuestAt(endpoint)
                    tokenEndpoint = endpoint
                }
                return streamAt(endpoint, body, token, uiConversationId, uiTemporary, uiGeneration, requestStartedAt).also { rememberReachable(endpoint) }
            } catch (error: NexusHttpException) {
                failure = error
                if (BuildConfig.DEBUG) android.util.Log.w("NexusConnection", "Stream HTTP ${error.statusCode}")
                val occupiedSession = error.statusCode == 429 && error.message.orEmpty().contains("impegnato", ignoreCase = true)
                if (error.statusCode == 401 || occupiedSession) {
                    try {
                        token = bootstrapGuestAt(endpoint)
                        tokenEndpoint = endpoint
                        return streamAt(endpoint, body, token, uiConversationId, uiTemporary, uiGeneration, requestStartedAt).also { rememberReachable(endpoint) }
                    } catch (retryError: Exception) { failure = retryError; if (BuildConfig.DEBUG) android.util.Log.w("NexusConnection", "Session refresh failed: ${retryError.javaClass.simpleName}") }
                }
            } catch (error: Exception) { failure = error; if (BuildConfig.DEBUG) android.util.Log.w("NexusConnection", "Stream failed: ${error.javaClass.simpleName}") }
        }
        persistStreamDiagnostics(requestStartedAt, 0L, 0, 0, false)
        throw failure ?: IllegalStateException("Nessun endpoint NexusNXS configurato.")
    }

    private fun bootstrapGuestAt(endpoint: String): String {
        var installationId = prefs.getString("installationId", "").orEmpty()
        if (installationId.isBlank()) {
            installationId = java.util.UUID.randomUUID().toString()
            prefs.edit { putString("installationId", installationId) }
        }
        val boot = httpAt(endpoint, "/api/guest/bootstrap", JSONObject().put("installationId", installationId).put("deviceName", android.os.Build.MODEL), "")
        explicitRemoteCapabilities(boot)?.let { (remoteWork, pairing) ->
            applyRemoteCapabilities(remoteWork, pairing)
        }
        val token = boot.optString("token")
        if (token.isBlank()) throw IllegalStateException(boot.optString("error", "Sessione NexusNXS non disponibile."))
        secureTokens.write("guestToken", token)
        prefs.edit { putString("guestTokenEndpoint", endpoint) }
        return token
    }

    private fun explicitRemoteCapabilities(payload: JSONObject): Pair<Boolean, Boolean>? {
        val source = payload.optJSONObject("capabilities") ?: payload
        if (!source.has("remoteWork") && !source.has("pairing")) return null
        return source.optBoolean("remoteWork", false) to source.optBoolean("pairing", false)
    }

    /**
     * Il servizio NexusNXS autenticato pubblica soltanto l'origin Tailscale del
     * relay e la versione del contratto. Il relay deve poi autenticare a sua
     * volta il dispositivo prima che qualsiasi controllo compaia nell'app.
     */
    private fun explicitWakeRelayDescriptor(payload: JSONObject): WakeRelayDescriptor? {
        val source = payload.optJSONObject("capabilities") ?: return null
        val wake = source.optJSONObject("wakeRelay") ?: return null
        if (wake.optInt("protocolVersion", 0) != WAKE_RELAY_PROTOCOL_VERSION) return null
        val endpoint = trustedWakeRelayEndpoint(wake.optString("endpoint")) ?: return null
        return WakeRelayDescriptor(endpoint = endpoint, pairing = wake.optBoolean("pairing", false))
    }

    private fun applyWakeRelayDescriptor(descriptor: WakeRelayDescriptor) {
        val previous = wakeRelayEndpoint
        if (previous.isNotBlank() && previous != descriptor.endpoint) {
            secureTokens.clear("wakeToken")
            prefs.edit { remove("wakeTokenRotatedAt") }
        }
        secureTokens.write("wakeRelayEndpoint", descriptor.endpoint)
        prefs.edit { putBoolean("wakeRelayPairing", descriptor.pairing) }
        val paired = secureTokens.read("wakeToken").isNotBlank()
        postUi {
            state = state.copy(
                wakePairingAvailable = descriptor.pairing && !paired,
                wakeStatus = if (paired) state.wakeStatus else nexusCopy("Relay privato disponibile", "Private relay available")
            )
        }
        if (paired) loadWakeCapabilities(force = true)
    }

    /**
     * Uno status autenticato che non pubblica piu la capability revoca anche la
     * superficie locale. Token e origin non restano utilizzabili in modo stale.
     */
    private fun clearWakeRelayAdvertisement() {
        secureTokens.clear("wakeToken")
        secureTokens.clear("wakeRelayEndpoint")
        prefs.edit {
            remove("wakeTokenRotatedAt")
            remove("wakeRelayPairing")
        }
        postUi {
            state = state.copy(
                wakePairingAvailable = false,
                wakeAvailable = false,
                wakeConnected = false,
                wakeTargets = emptyList(),
                wakeSelectedTarget = "",
                wakeTicketId = "",
                wakePreview = "",
                wakeRisk = "",
                wakeBusy = false,
                wakeAwaiting = false,
                wakeStatus = ""
            )
        }
    }

    private fun applyRemoteCapabilities(remoteWork: Boolean, pairing: Boolean) {
        if (!remoteWork && activeWorkOperationId.isNotBlank()) requestActiveWorkCancellation()
        if (!remoteWork) prefs.edit { putBoolean("workMode", false) }
        val restored = if (remoteWork) runCatching { JSONObject(secureTokens.read("workProposal")) }.getOrNull()
            ?.takeIf { System.currentTimeMillis() - it.optLong("savedAt") <= SESSION_RESUME_WINDOW_MS } else null
        postUi {
            val nextScreen = when {
                !remoteWork && state.screen in setOf(NexusScreen.PROJECTS, NexusScreen.SCHEDULED) -> NexusScreen.CHAT
                !pairing && !state.wakePairingAvailable && !state.wakeAvailable && state.screen == NexusScreen.REMOTE -> NexusScreen.CHAT
                else -> state.screen
            }
            state = state.copy(
                screen = nextScreen,
                work = remoteWork && state.work,
                pairing = pairing && state.pairing,
                remoteWorkAvailable = remoteWork,
                pairingAvailable = pairing,
                capabilitiesChecked = true,
                workTicketId = restored?.optString("ticket").orEmpty(),
                workPreview = restored?.optString("preview").orEmpty(),
                workRisk = restored?.optString("risk").orEmpty()
            )
            // Un token remoto preesistente resta cifrato, ma non viene mai usato
            // finché il server autenticato non dichiara esplicitamente il pairing.
            if (pairing) loadDevices()
        }
    }

    private fun refreshRemoteCapabilities() {
        if (capabilityProbeRunning || capabilityProbeCompleted || destroyed) return
        capabilityProbeRunning = true
        runTask {
            var completed = false
            try {
                for (endpoint in endpointCandidates()) {
                    if (destroyed) return@runTask
                    try {
                        var token = secureTokens.read("guestToken")
                        if (token.isBlank() || prefs.getString("guestTokenEndpoint", "").orEmpty() != endpoint) token = bootstrapGuestAt(endpoint)
                        val status = getJsonAt(endpoint, "/api/status", token)
                        val (remoteWork, pairing) = explicitRemoteCapabilities(status) ?: (false to false)
                        explicitWakeRelayDescriptor(status)?.let(::applyWakeRelayDescriptor)
                            ?: clearWakeRelayAdvertisement()
                        applyRemoteCapabilities(remoteWork, pairing)
                        rememberReachable(endpoint)
                        completed = true
                        break
                    } catch (_: Exception) { /* Prova il successivo endpoint configurato. */ }
                }
            } finally {
                capabilityProbeRunning = false
                if (completed) capabilityProbeCompleted = true
            }
        }
    }

    private fun routedMode(text: String, model: String): String {
        val sensitive = Regex("(?i)\\b(password|segreto|credenzial|token|api.?key|prompt.?injection|sicurezza|privacy|permess|elimina|cancella|sposta|rinomina|esegui|installa|disinstalla|registro|firewall|rete)\\b")
        val workAction = Regex("(?i)\\b(apri|avvia|crea|modifica|scrivi|salva|chiudi|ferma|controlla|verifica|cerca|scarica|carica|collega|disconnetti|riavvia|spegni|accendi)\\b")
        if (sensitive.containsMatchIn(text) || (state.work && workAction.containsMatchIn(text))) return "deep"
        if (model == "NexusNXS Rapido" || model == "Qwen3 8B" || model == "nexus-fast") return "fast"
        val explicitDepth = Regex("(?i)\\b(approfondisci|dettagliat[oa]|ragiona(?:mento)?\\s+(?:a fondo|profondo)|analisi\\s+(?:completa|approfondita)|passo\\s+passo|step\\s+by\\s+step|deep\\s+(?:analysis|reasoning)|in\\s+depth)\\b")
        val complex = Regex("(?i)\\b(codice|debug|errore|bug|sicurezza|password|segreto|api.?key|prompt.?injection|file|progetto|analizza|confronta|verifica|piano|architettura|database|test)\\b")
        // "Pro" indica la massima capacità disponibile, non l'obbligo di usare
        // sempre il percorso più lento. Il router sceglie deep solo quando la
        // richiesta lo richiede davvero; saluti e domande brevi restano fast.
        return if (text.length > 600 || explicitDepth.containsMatchIn(text) || complex.containsMatchIn(text) || text.count { it == '?' } > 1) "deep" else "fast"
    }

    private fun publicModelId(model: String): String = when (model) {
        "NexusNXS Pro", "Qwen3 14B", "nexus-deep" -> "nexus-deep"
        else -> "nexus-fast"
    }

    private fun ensureGuestToken(): String {
        val existing = secureTokens.read("guestToken")
        if (existing.isNotBlank()) return existing
        var installationId = prefs.getString("installationId", "").orEmpty()
        if (installationId.isBlank()) { installationId = java.util.UUID.randomUUID().toString(); prefs.edit { putString("installationId", installationId) } }
        val boot = http("/api/guest/bootstrap", JSONObject().put("installationId", installationId).put("deviceName", android.os.Build.MODEL), "")
        return boot.optString("token").also { if (it.isBlank()) throw IllegalStateException(boot.optString("error")); secureTokens.write("guestToken", it) }
    }

    private fun streamAt(base: String, body: JSONObject, token: String, uiConversationId: String, uiTemporary: Boolean, uiGeneration: Long, requestStartedAt: Long): String {
        val connection = openTrackedConnection(base.trimEnd('/') + "/api/guest/messages/stream")
        connection.instanceFollowRedirects = false
        try {
            activeConnection = connection
            connection.requestMethod = "POST"; connection.connectTimeout = 3_500; connection.readTimeout = 240_000; connection.doOutput = true
            connection.setRequestProperty("Accept", "application/x-ndjson"); connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) throw NexusHttpException(responseCode, connection.errorStream?.bufferedReader()?.readText().orEmpty())
            val answer = StringBuilder()
            var lastUiUpdate = 0L
            var firstTokenAt = 0L
            var streamedTokenCount = 0
            val activeDisplay = getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
            // Una singola pubblicazione per frame evita di ricomporre tutto il Markdown
            // più spesso di quanto il display possa realmente mostrare.
            val uiFrameMs = if ((activeDisplay?.refreshRate ?: 60f) >= 90f) 11L else 16L
            connection.inputStream.bufferedReader().useLines { lines -> lines.forEach { line ->
                if (line.isBlank()) return@forEach
                val event = JSONObject(line)
                when (event.optString("type")) {
                    "token" -> {
                        answer.append(event.optString("token"))
                        streamedTokenCount++
                        val now = SystemClock.uptimeMillis()
                        if (firstTokenAt == 0L) firstTokenAt = SystemClock.elapsedRealtime()
                        // Mantiene la risposta agganciata al refresh del display: il vecchio
                        // limite a 25 fps faceva sembrare la battitura artificiosamente lenta.
                        if (now - lastUiUpdate >= uiFrameMs) {
                            lastUiUpdate = now
                            publishStreamUi(uiConversationId, uiTemporary, uiGeneration, answer.toString())
                        }
                    }
                    "phase" -> event.optJSONObject("activity")?.optString("text")?.let { phase ->
                        val localizedPhase = localizedServerActivity(phase)
                        postUi { if (streamMatchesUi(uiConversationId, uiTemporary, uiGeneration)) state = state.copy(activity = localizedPhase) }
                    }
                    "complete" -> {
                        val complete = event.optString("message")
                        if (complete.isNotBlank()) {
                            answer.clear()
                            answer.append(complete)
                            clearPendingStreamUi()
                            postUi {
                                if (streamMatchesUi(uiConversationId, uiTemporary, uiGeneration)) {
                                    state = state.copy(streaming = complete, activity = nexusCopy("Risposta verificata", "Response verified"))
                                }
                            }
                        }
                    }
                    "error" -> throw IllegalStateException(event.optString("error"))
                }
            } }
            persistStreamDiagnostics(requestStartedAt, firstTokenAt, answer.length, streamedTokenCount, true)
            return answer.toString()
        } finally {
            if (activeConnection === connection) activeConnection = null
            closeTrackedConnection(connection)
        }
    }

    private fun persistStreamDiagnostics(startedAt: Long, firstTokenAt: Long, characters: Int, tokenCount: Int, success: Boolean) {
        val completedAt = SystemClock.elapsedRealtime()
        val firstTextMs = if (firstTokenAt > 0L) firstTokenAt - startedAt else completedAt - startedAt
        val streamingMs = (completedAt - if (firstTokenAt > 0L) firstTokenAt else startedAt).coerceAtLeast(1L)
        prefs.edit {
            putLong("stream.lastFirstTextMs", firstTextMs)
            putLong("stream.lastDurationMs", completedAt - startedAt)
            putInt("stream.lastCharacters", characters)
            putFloat("stream.lastTokensPerSecond", tokenCount * 1_000f / streamingMs)
            putBoolean("stream.lastSuccess", success)
        }
    }

    private fun guestMessage(text: String, model: String): String {
        var token = secureTokens.read("guestToken")
        var installationId = prefs.getString("installationId", "").orEmpty()
        if (installationId.isBlank()) {
            installationId = java.util.UUID.randomUUID().toString()
            prefs.edit { putString("installationId", installationId) }
        }
        val bootstrapBody = JSONObject().put("installationId", installationId).put("deviceName", android.os.Build.MODEL)
        if (token.isBlank()) {
            val boot = http("/api/guest/bootstrap", bootstrapBody, "")
            token = boot.optString("token")
            if (token.isBlank()) return boot.optString("error", "Impossibile avviare la sessione locale.")
            secureTokens.write("guestToken", token)
        }
        val history = JSONArray().also { a -> state.turns.takeLast(20).forEach { a.put(JSONObject().put("role", it.role).put("content", it.content)) } }
        val body = JSONObject().put("text", text).put("history", history).put("mode", routedMode(text, model)).put("model", publicModelId(model))
        var result = http("/api/guest/messages", body, token)
        if (result.optString("error").contains("scaduta", true)) {
            prefs.edit { remove("guestToken") }
            val boot = http("/api/guest/bootstrap", bootstrapBody, "")
            token = boot.optString("token")
            if (token.isBlank()) return boot.optString("error", nexusCopy("Impossibile rinnovare la sessione locale.", "Unable to renew the local session."))
            secureTokens.write("guestToken", token)
            result = http("/api/guest/messages", body, token)
        }
        return result.optString("message").ifBlank { result.optString("error", nexusCopy("Nessuna risposta disponibile.", "No response is available.")) }
    }

    private fun pair(code: String) {
        if (!code.matches(Regex("\\d{6}"))) { state = state.copy(status = nexusCopy("Codice non valido", "Invalid code")); return }
        state = state.copy(busy = true, status = nexusCopy("Collegamento…", "Connecting…"))
        runTask {
            val result = try { http("/api/pair", JSONObject().put("code", code).put("deviceName", android.os.Build.MODEL).put("scope", "remote"), "") } catch (_: Exception) { JSONObject().put("error", nexusCopy("PC non raggiungibile", "PC unreachable")) }
            if (destroyed) return@runTask
            postUi {
                val token = result.optString("token")
                if (token.isNotBlank()) { secureTokens.write("remoteToken", token); prefs.edit { putLong("remoteTokenRotatedAt", System.currentTimeMillis()) }; loadDevices() }
                state = state.copy(busy = false, pairing = token.isBlank(), status = if (token.isBlank()) result.optString("error", nexusCopy("Errore", "Error")) else nexusCopy("Workstation associata", "Workstation paired"), connection = if (token.isBlank()) NexusConnection.OFFLINE else NexusConnection.ONLINE)
            }
        }
    }

    private fun probeConnection() {
        if (connectionProbeRunning) return
        connectionProbeRunning = true
        runTask {
            try {
                val endpoints = endpointCandidates()
                val probes = endpoints.associateWith { base -> CompletableFuture.supplyAsync({
                    try { probeReady(base) } catch (_: Exception) { false }
                }, backgroundExecutor) }
                val deadline = SystemClock.uptimeMillis() + 2_100L
                var winner: String? = null
                while (!destroyed && winner == null && SystemClock.uptimeMillis() < deadline) {
                    winner = endpoints.firstOrNull { probes.getValue(it).getNow(false) }
                    if (winner == null && probes.values.any { !it.isDone }) Thread.sleep(35)
                    else if (winner == null) break
                }
                probes.values.forEach { if (!it.isDone) it.cancel(true) }
                val reachable = winner != null
                if (winner != null) rememberReachable(winner)
                postUi {
                    if (!state.busy && !state.temporary) state = state.copy(
                        status = if (reachable) "Online" else if (store.pendingCount() > 0) nexusCopy("Server NexusNXS non raggiungibili · ${store.pendingCount()} in coda", "NexusNXS servers unreachable · ${store.pendingCount()} queued") else nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable"),
                        connection = if (reachable) NexusConnection.ONLINE else NexusConnection.OFFLINE,
                        pendingCount = store.pendingCount(),
                        // Un probe riuscito chiude soltanto errori di trasporto ormai
                        // obsoleti; errori di contenuto, sicurezza o autorizzazione restano.
                        error = if (reachable && state.error?.isTransportFailure() == true) null else state.error
                    )
                }
                // In primo piano una coda precedente non deve occupare la sessione
                // mentre l'utente invia un nuovo messaggio. Il recupero resta
                // automatico in background e manuale dal relativo pulsante.
                if (reachable) { refreshRemoteCapabilities(); if (!appVisible) retryPendingRequests() }
            } finally {
                connectionProbeRunning = false
            }
        }
    }

    private fun refreshModels() = runTask {
        var rows: JSONArray? = null
        for (endpoint in endpointCandidates()) {
            if (destroyed) return@runTask
            rows = runCatching {
                val connection = openTrackedConnection(endpoint.trimEnd('/') + "/api/models")
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 2_500; connection.readTimeout = 2_500
                try {
                    if (connection.responseCode !in 200..299) error("HTTP ${connection.responseCode}")
                    connection.inputStream.bufferedReader().use { JSONObject(it.readText()).optJSONArray("models") }
                } finally { closeTrackedConnection(connection) }
            }.getOrNull()
            if (rows != null) { rememberReachable(endpoint); break }
        }
        rows ?: return@runTask
        val models = buildList { for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { item ->
            val id = item.optString("id"); if (id.contains("embed", true)) return@let
            val size = item.optLong("size")
            val display = when {
                id.equals("nexus-deep", true) -> "NexusNXS Pro"
                id.equals("nexus-fast", true) -> "NexusNXS Rapido"
                id.contains("vision", true) || id.contains("vl", true) -> "NexusNXS Visione"
                id.contains("code", true) || id.contains("coder", true) -> "NexusNXS Codice"
                id.contains("14b", true) || size >= 10_000_000_000L -> "NexusNXS Pro"
                id.contains("8b", true) || size >= 5_000_000_000L -> "NexusNXS Rapido"
                else -> "NexusNXS Compatto"
            }
            add(ModelRow(id, display, size, item.optBoolean("available", true)))
        } }
        if (models.isNotEmpty()) postUi { state = state.copy(models = models.distinctBy { it.name }) }
    }

    private fun retryPendingRequests() {
        if (retryingPending || state.busy || state.temporary) return
        retryingPending = true
        postUi { if (store.pendingCount() > 0) state = state.copy(status = nexusCopy("Sincronizzazione…", "Syncing…"), connection = NexusConnection.ONLINE, pendingCount = store.pendingCount()) }
        runTask {
            try {
                while (!destroyed) {
                    val pending = store.nextPendingRequest() ?: break
                    val requestId = pending.optString("id")
                    val conversationId = pending.optString("conversationId")
                    val prompt = pending.optString("prompt")
                    val model = pending.optString("model", "NexusNXS Rapido")
                    val attachment = pending.optString("attachment").takeIf(String::isNotBlank)?.let { runCatching { JSONObject(it) }.getOrNull() }
                    store.markPendingAttempt(requestId)
                    val allTurns = store.get(conversationId)?.optJSONArray("turns")?.toTurns().orEmpty()
                    val history = allTurns.dropLastWhile { it.role != "user" }.dropLast(1)
                    val answer = try { guestStream(prompt, model, history, attachment, requestId) } catch (_: Exception) { break }
                    if (destroyed) break
                    if (answer.isBlank()) break
                    store.addTurn(conversationId, "assistant", answer)
                    store.completePendingRequest(requestId)
                    postUi {
                        if (state.conversationId == conversationId) state = state.copy(turns = store.get(conversationId)?.optJSONArray("turns")?.toTurns().orEmpty())
                        state = state.copy(pendingCount = store.pendingCount(), status = if (store.pendingCount() == 0) "Online" else "Sincronizzazione…", connection = NexusConnection.ONLINE)
                        refreshChats()
                    }
                }
            } finally { retryingPending = false }
        }
    }

    private fun loadDevices() {
        if (!state.pairingAvailable) return
        var token = secureTokens.read("remoteToken")
        if (token.isBlank()) return
        runTask {
            try {
                if (System.currentTimeMillis() - prefs.getLong("remoteTokenRotatedAt", 0L) > 86_400_000L) {
                    val rotated = http("/api/session/rotate", JSONObject(), token)
                    if (destroyed) return@runTask
                    rotated.optString("token").takeIf { it.isNotBlank() }?.let {
                        token = it
                        secureTokens.write("remoteToken", it); prefs.edit { putLong("remoteTokenRotatedAt", rotated.optLong("rotatedAt", System.currentTimeMillis())) }
                    }
                }
                val payload = getJson("/api/devices", token)
                if (destroyed) return@runTask
                val rows = payload.optJSONArray("devices") ?: JSONArray()
                val devices = buildList { for (i in 0 until rows.length()) rows.optJSONObject(i)?.let { add(DeviceRow(it.optString("id"), it.optString("name"), it.optString("scope"), it.optLong("lastSeenAt"), it.optBoolean("current"))) } }
                postUi {
                    state = state.copy(
                        devices = devices,
                        wakeAwaiting = false,
                        wakeStatus = if (state.wakeAwaiting) nexusCopy("Workstation raggiungibile", "Workstation reachable") else state.wakeStatus
                    )
                }
            } catch (_: Exception) { /* Il gateway precedente resta compatibile fino al prossimo riavvio naturale. */ }
        }
    }

    private fun clearWakeSession() {
        secureTokens.clear("wakeToken")
        prefs.edit { remove("wakeTokenRotatedAt") }
        val pairingAllowed = prefs.getBoolean("wakeRelayPairing", false) && wakeRelayEndpoint.isNotBlank()
        state = state.copy(
            wakePairingAvailable = pairingAllowed,
            wakeAvailable = false,
            wakeConnected = false,
            wakeTargets = emptyList(),
            wakeSelectedTarget = "",
            wakeTicketId = "",
            wakePreview = "",
            wakeRisk = "",
            wakeBusy = false,
            wakeAwaiting = false,
            wakeStatus = nexusCopy("Associazione del relay richiesta", "Relay pairing required")
        )
    }

    private fun pairWakeRelay(code: String) {
        if (!appVisible || !code.matches(Regex("\\d{6}")) || wakeRelayEndpoint.isBlank()) {
            state = state.copy(wakeStatus = nexusCopy("Codice non valido", "Invalid code"))
            return
        }
        state = state.copy(wakeBusy = true, wakeStatus = nexusCopy("Associo il relay privato…", "Pairing private relay…"))
        runTask {
            val result = runCatching {
                wakePost(
                    "/api/pair",
                    JSONObject().put("code", code).put("deviceName", android.os.Build.MODEL.take(80)).put("scope", "wake"),
                    ""
                )
            }
            if (destroyed) return@runTask
            postUi {
                val payload = result.getOrNull()
                val token = payload?.optString("token").orEmpty()
                val deviceScope = payload?.optJSONObject("device")?.optString("scope").orEmpty()
                val valid = token.matches(Regex("[A-Za-z0-9_-]{32,160}")) && deviceScope == "wake"
                if (valid) {
                    secureTokens.write("wakeToken", token)
                    prefs.edit { putLong("wakeTokenRotatedAt", System.currentTimeMillis()) }
                    state = state.copy(wakeBusy = false, wakePairingAvailable = false, wakeStatus = nexusCopy("Relay associato · verifico le capacità", "Relay paired · checking capabilities"))
                    loadWakeCapabilities(force = true)
                } else {
                    state = state.copy(wakeBusy = false, wakePairingAvailable = true, wakeStatus = result.exceptionOrNull()?.message?.take(160) ?: nexusCopy("Associazione non riuscita", "Pairing failed"))
                }
            }
        }
    }

    private fun parseWakeTargets(payload: JSONObject): List<WakeTargetRow>? {
        if (!payload.has("available") || !payload.has("requiresConfirmation") || !payload.has("arbitraryDestinations")) return null
        if (!payload.optBoolean("available", false)) return emptyList()
        if (!payload.optBoolean("requiresConfirmation", false) || payload.optBoolean("arbitraryDestinations", true)) return null
        val rows = payload.optJSONArray("targets") ?: return null
        if (rows.length() !in 1..8) return null
        val targets = buildList {
            for (index in 0 until rows.length()) {
                val item = rows.optJSONObject(index) ?: return null
                val id = item.optString("id").lowercase(Locale.ROOT)
                val label = item.optString("label").replace(Regex("[\\p{Cntrl}]"), " ").trim().take(80)
                if (!id.matches(Regex("[a-z0-9][a-z0-9_-]{1,47}")) || label.isBlank()) return null
                add(WakeTargetRow(id, label))
            }
        }
        return targets.takeIf { values -> values.distinctBy { it.id }.size == values.size }
    }

    private fun loadWakeCapabilities(force: Boolean = false) {
        if (destroyed || wakeProbeRunning || !::secureTokens.isInitialized || !appVisible && !force) return
        val endpoint = wakeRelayEndpoint
        var token = secureTokens.read("wakeToken")
        if (endpoint.isBlank() || token.isBlank()) return
        wakeProbeRunning = true
        runTask {
            try {
                if (System.currentTimeMillis() - prefs.getLong("wakeTokenRotatedAt", 0L) > WAKE_TOKEN_ROTATION_MS) {
                    val rotated = wakePost("/api/session/rotate", JSONObject(), token)
                    val nextToken = rotated.optString("token")
                    if (!nextToken.matches(Regex("[A-Za-z0-9_-]{32,160}"))) error("Rotazione sessione non valida.")
                    token = nextToken
                    secureTokens.write("wakeToken", nextToken)
                    prefs.edit { putLong("wakeTokenRotatedAt", rotated.optLong("rotatedAt", System.currentTimeMillis())) }
                }
                val payload = wakeGet("/api/wake/capabilities", token)
                val targets = parseWakeTargets(payload) ?: error("Contratto relay non compatibile.")
                postUi {
                    if (targets.isEmpty()) {
                        state = state.copy(wakeAvailable = false, wakeConnected = true, wakeTargets = emptyList(), wakeSelectedTarget = "", wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Nessuna workstation autorizzata sul relay", "No workstation is authorized on the relay"))
                    } else {
                        val selected = state.wakeSelectedTarget.takeIf { current -> targets.any { it.id == current } } ?: targets.first().id
                        state = state.copy(
                            wakePairingAvailable = false,
                            wakeAvailable = true,
                            wakeConnected = true,
                            wakeTargets = targets,
                            wakeSelectedTarget = selected,
                            wakeStatus = if (state.wakeAwaiting) state.wakeStatus else nexusCopy("Relay privato pronto", "Private relay ready")
                        )
                    }
                }
            } catch (error: Exception) {
                postUi {
                    when {
                        error is NexusHttpException && error.statusCode == 401 -> clearWakeSession()
                        error is java.io.IOException -> state = state.copy(wakeConnected = false, wakeStatus = nexusCopy("Relay privato non raggiungibile · riconnessione automatica", "Private relay unavailable · reconnecting automatically"))
                        else -> state = state.copy(wakeAvailable = false, wakeConnected = false, wakeTargets = emptyList(), wakeSelectedTarget = "", wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Relay privato non compatibile", "Private relay is incompatible"))
                    }
                }
            } finally {
                wakeProbeRunning = false
            }
        }
    }

    private fun wakeGet(path: String, token: String): JSONObject = wakeRequest("GET", path, null, token)

    private fun wakePost(path: String, body: JSONObject, token: String): JSONObject = wakeRequest("POST", path, body, token)

    private fun wakeRequest(method: String, path: String, body: JSONObject?, token: String): JSONObject {
        val endpoint = wakeRelayEndpoint.ifBlank { throw IllegalStateException("Relay privato non configurato.") }
        require(path in setOf("/api/pair", "/api/session/rotate", "/api/wake/capabilities", "/api/wake/plan", "/api/wake/execute"))
        val connection = openTrackedConnection(endpoint + path)
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.connectTimeout = 3_500
            connection.readTimeout = 8_000
            connection.setRequestProperty("Accept", "application/json")
            if (token.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val result = runCatching { JSONObject(payload) }.getOrElse { JSONObject().put("error", "HTTP $status") }
            if (status !in 200..299) throw NexusHttpException(status, result.optString("error", "HTTP $status"))
            return result
        } finally {
            closeTrackedConnection(connection)
        }
    }

    private fun getJson(path: String, token: String): JSONObject {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            try { return getJsonAt(endpoint, path, token).also { rememberReachable(endpoint) } }
            catch (error: Exception) { failure = error }
        }
        throw failure ?: IllegalStateException("Nessun endpoint NexusNXS configurato.")
    }

    private fun getJsonAt(base: String, path: String, token: String): JSONObject {
        val connection = openTrackedConnection(base.trimEnd('/') + path)
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "GET"; connection.connectTimeout = 5_000; connection.readTimeout = 8_000
            connection.setRequestProperty("Accept", "application/json"); connection.setRequestProperty("Authorization", "Bearer $token")
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val value = JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            if (status !in 200..299) throw IllegalStateException(value.optString("error", "HTTP $status"))
            return value
        } finally { closeTrackedConnection(connection) }
    }

    private fun http(path: String, body: JSONObject, token: String): JSONObject {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            try {
                return httpAt(endpoint, path, body, token).also {
                    rememberReachable(endpoint)
                    postUi { state = state.copy(status = if (endpoint == BuildConfig.NEXUS_LAN_URL) "Online · rete locale" else "Online", connection = NexusConnection.ONLINE) }
                }
            } catch (error: Exception) { failure = error }
        }
        throw failure ?: IllegalStateException("Nessun endpoint NexusNXS configurato.")
    }

    private fun httpAt(base: String, path: String, body: JSONObject, token: String): JSONObject {
        val connection = openTrackedConnection(base.trimEnd('/') + path)
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"; connection.connectTimeout = 3_500; connection.readTimeout = 240_000; connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            if (token.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val result = JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            if (status !in 200..299) throw IllegalStateException(result.optString("error", "HTTP $status"))
            return result
        } finally { closeTrackedConnection(connection) }
    }

    private fun isTrustedDeepLink(uri: Uri): Boolean = runCatching {
        if (!uri.isHierarchical || uri.userInfo != null || uri.fragment != null) return@runCatching false
        if (uri.queryParameterNames.any { it !in setOf("pair", "server") }) return@runCatching false
        if (uri.getQueryParameters("pair").size != 1 || !uri.getQueryParameter("pair").orEmpty().matches(Regex("\\d{6}"))) return@runCatching false
        if (uri.getQueryParameters("server").size > 1) return@runCatching false
        when {
            uri.scheme.equals("nexus", ignoreCase = true) ->
                uri.host.equals("remote", ignoreCase = true) && uri.port == -1 && (uri.path.isNullOrEmpty() || uri.path == "/")
            uri.scheme.equals("https", ignoreCase = true) -> {
                val incomingOrigin = normalizeHttpsEndpoint("https://${uri.encodedAuthority}")
                incomingOrigin != null && incomingOrigin == normalizeHttpsEndpoint(BuildConfig.NEXUS_URL) && (uri.path.isNullOrEmpty() || uri.path == "/")
            }
            else -> false
        }
    }.getOrDefault(false)

    private fun handleDeepLink(uri: Uri): Boolean {
        if (!isTrustedDeepLink(uri)) return false
        val requestedServer = uri.getQueryParameter("server")
        if (requestedServer != null) {
            val endpoint = trustedEndpoint(requestedServer) ?: return false
            prefs.edit { putString("preferredServer", endpoint) }
        }
        val code = uri.getQueryParameter("pair") ?: return false
        state = state.copy(screen = NexusScreen.REMOTE, pairing = true)
        pair(code)
        return true
    }

    private fun handleIncomingIntent(incoming: Intent?) {
        incoming ?: return
        if (incoming.action == Intent.ACTION_ASSIST) {
            state = state.copy(
                screen = NexusScreen.CHAT,
                work = false,
                assistantInvocation = System.currentTimeMillis()
            )
            incoming.replaceExtras(Bundle())
            incoming.data = null
            incoming.action = null
            return
        }
        if (incoming.action == Intent.ACTION_VIEW) {
            incoming.data?.let(::handleDeepLink)
            incoming.data = null
            incoming.action = null
            return
        }
        if (incoming.action != Intent.ACTION_SEND) return
        val declaredMime = incoming.type.orEmpty().lowercase(Locale.ROOT)
        fun allowedMime(value: String) = value.startsWith("text/") || value.startsWith("image/") || value == "application/pdf"
        if (!allowedMime(declaredMime)) { incoming.action = null; return }
        val sharedText = runCatching { incoming.getStringExtra(Intent.EXTRA_TEXT).orEmpty().trim() }.getOrDefault("")
        val extraStream = runCatching { if (android.os.Build.VERSION.SDK_INT >= 33) incoming.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) }.getOrNull()
        val clip = runCatching { incoming.clipData }.getOrNull()
        val stream = extraStream ?: clip?.takeIf { it.itemCount == 1 }?.getItemAt(0)?.uri
        if (stream != null && !stream.scheme.equals("content", ignoreCase = true)) { incoming.action = null; return }
        val detectedMime = stream?.let { runCatching { contentResolver.getType(it).orEmpty().lowercase(Locale.ROOT) }.getOrDefault("") }.orEmpty()
        if (stream != null && detectedMime.isNotBlank() && !allowedMime(detectedMime)) { incoming.action = null; return }
        val mime = detectedMime.ifBlank { declaredMime }
        state = state.copy(screen = NexusScreen.CHAT, work = false, temporary = false, draft = sharedText.take(80_000).ifBlank { if (stream != null) "Analizza questo contenuto" else state.draft })
        if (stream != null) {
            val name = stream.lastPathSegment?.substringAfterLast('/')?.replace(Regex("[\\p{Cntrl}]"), "")?.take(120).orEmpty().ifBlank { "Contenuto condiviso" }
            dispatch("attach", JSONObject().put("name", name).put("uri", stream.toString()).put("mime", mime).toString())
        }
        incoming.replaceExtras(Bundle())
        incoming.data = null
        incoming.action = null
    }
}

private fun String.normalizedExternalText() = replace(Regex("%20", RegexOption.IGNORE_CASE), " ")
private fun relativeTimeLabel(timestamp: Long, italian: Boolean = true): String {
    val minutes = ((System.currentTimeMillis() - timestamp).coerceAtLeast(0) / 60_000).toInt()
    return when { minutes < 1 -> if (italian) "ora" else "now"; minutes < 60 -> "${minutes}m"; minutes < 1_440 -> "${minutes / 60}h"; minutes < 10_080 -> "${minutes / 1_440}${if (italian) "g" else "d"}"; else -> "${minutes / 10_080}${if (italian) "sett" else "w"}" }
}

private fun chatGroupLabel(timestamp: Long, italian: Boolean = true): String {
    val days = ((System.currentTimeMillis() - timestamp).coerceAtLeast(0) / 86_400_000).toInt()
    return when { days == 0 -> if (italian) "Oggi" else "Today"; days == 1 -> if (italian) "Ieri" else "Yesterday"; days < 7 -> if (italian) "Ultimi 7 giorni" else "Last 7 days"; days < 30 -> if (italian) "Ultimi 30 giorni" else "Last 30 days"; else -> if (italian) "Precedenti" else "Earlier" }
}

private fun JSONArray.toChatRows() = buildList {
    for (i in 0 until length()) optJSONObject(i)?.let {
        val title = it.optString("title").normalizedExternalText()
        val preview = it.optString("preview").normalizedExternalText()
        if (preview.isNotBlank() || title != "Nuova conversazione") add(ChatRow(it.optString("id"), title, preview, it.optLong("updatedAt"), it.optBoolean("pinned")))
    }
}

private fun JSONArray?.toTurns() = buildList {
    if (this@toTurns != null) for (i in 0 until length()) optJSONObject(i)?.let {
        val artifacts = buildList { it.optJSONArray("artifacts")?.let { rows -> for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { artifact -> add(WorkArtifact(artifact.optString("title"), artifact.optString("subtitle"), artifact.optString("language", "text"), artifact.optString("content").take(48_000), artifact.optInt("added"), artifact.optInt("removed"))) } } }
        add(Turn(it.optString("role"), it.optString("content").normalizedExternalText(), artifacts))
    }
}

@Composable private fun NexusTheme(content: @Composable () -> Unit) {
    val metrics = rememberNexusMetrics()
    CompositionLocalProvider(LocalNexusMetrics provides metrics) { MaterialTheme(
    colorScheme = darkColorScheme(primary = Cyan, background = Ink, surface = Surface, surfaceVariant = Surface2, outline = Hairline, onPrimary = Color(0xFF002223), onBackground = Ice, onSurface = Ice, onSurfaceVariant = Mist),
    typography = Typography(
        displaySmall = TextStyle(fontFamily = NexusSans, fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.72).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        headlineMedium = TextStyle(fontFamily = NexusSans, fontSize = 27.sp, lineHeight = 33.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.52).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        titleLarge = TextStyle(fontFamily = NexusSans, fontSize = 23.sp, lineHeight = 29.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.34).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        titleMedium = TextStyle(fontFamily = NexusSans, fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.12).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        bodyLarge = TextStyle(fontFamily = NexusSans, fontSize = 16.sp, lineHeight = 25.sp, letterSpacing = 0.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        bodyMedium = TextStyle(fontFamily = NexusSans, fontSize = 14.sp, lineHeight = 21.sp, letterSpacing = 0.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        bodySmall = TextStyle(fontFamily = NexusSans, fontSize = 12.sp, lineHeight = 18.sp, letterSpacing = 0.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        labelLarge = TextStyle(fontFamily = NexusSans, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        labelMedium = TextStyle(fontFamily = NexusSans, fontSize = 12.sp, lineHeight = 17.sp, fontWeight = FontWeight.Medium, platformStyle = PlatformTextStyle(includeFontPadding = false))
    ),
    content = content
    ) }
}

/**
 * Superficie pubblica istantanea: nessuna navigazione, nessun pannello e
 * nessuna cronologia visibile. Il database cifrato continua a fornire memoria
 * conversazionale al Core senza trasformarsi in una sezione dell'interfaccia.
 */
@Composable private fun NexusInstantApp(state: NexusUiState, dispatch: (String, String) -> Unit) {
    val context = LocalContext.current
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var controlsAwake by remember { mutableStateOf(true) }
    var lastInteraction by remember { mutableStateOf(0L) }
    val accessibleControls = (context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? android.view.accessibility.AccessibilityManager)?.isTouchExplorationEnabled == true
    LaunchedEffect(lastInteraction, settingsOpen, accessibleControls) {
        controlsAwake = true
        if (!settingsOpen && !accessibleControls) {
            kotlinx.coroutines.delay(6_000)
            controlsAwake = false
        }
    }
    val metrics = LocalNexusMetrics.current
    val reduceMotion = state.reduceMotion || metrics.adaptiveReducedMotion || !ValueAnimator.areAnimatorsEnabled()
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val haptic = LocalHapticFeedback.current
    val focusRequester = remember { FocusRequester() }
    val composerBringIntoView = remember { BringIntoViewRequester() }
    val scrollState = rememberScrollState()
    var textMode by rememberSaveable { mutableStateOf(false) }
    var typedSession by rememberSaveable { mutableStateOf(false) }
    var voiceMode by rememberSaveable { mutableStateOf(false) }
    var attachmentSheet by rememberSaveable { mutableStateOf(false) }
    val interactionAvailable = state.connection == NexusConnection.ONLINE
    val latestAnswer = if (state.busy) state.streaming else state.streaming.ifBlank { state.turns.lastOrNull { it.role == "assistant" }?.content.orEmpty() }
    val latestPrompt = state.turns.lastOrNull { it.role == "user" }?.content.orEmpty()
    val exchangeGeneration = state.turns.count { it.role == "user" }
    val centeredExchange = !state.busy && state.error == null && (
        (latestPrompt.isBlank() && latestAnswer.isBlank()) ||
            (latestPrompt.length <= 180 && latestAnswer.isNotBlank() && latestAnswer.length <= 560)
        )
    val instantSlashSuggestions = remember(state.draft, state.slashCommands) {
        val match = Regex("^/([^\\s]*)$").find(state.draft.trim())
        if (match == null) emptyList() else {
            val query = match.groupValues[1].lowercase(Locale.ROOT)
            (state.slashCommands + builtinSlashCommands())
                .distinctBy { it.name }
                .filter { query.isBlank() || it.name.startsWith(query) || it.label.lowercase(Locale.getDefault()).contains(query) }
                .take(4)
        }
    }

    LaunchedEffect(state.assistantInvocation, interactionAvailable) {
        if (state.assistantInvocation <= 0L) return@LaunchedEffect
        keyboard?.hide()
        focusManager.clearFocus(force = true)
        textMode = false
        typedSession = false
        attachmentSheet = false
        if (interactionAvailable) voiceMode = true else dispatch("probe", "")
    }

    LaunchedEffect(state.connection) {
        if (!interactionAvailable) {
            keyboard?.hide()
            focusManager.clearFocus(force = true)
            textMode = false
            typedSession = false
            voiceMode = false
            attachmentSheet = false
        }
        while (true) {
            dispatch("probe", "")
            kotlinx.coroutines.delay(if (state.connection == NexusConnection.OFFLINE) 4_000 else 15_000)
        }
    }
    LaunchedEffect(textMode) {
        if (textMode) {
            kotlinx.coroutines.delay(70)
            focusRequester.requestFocus()
            keyboard?.show()
            kotlinx.coroutines.delay(140)
            composerBringIntoView.bringIntoView()
        }
    }
    LaunchedEffect(latestAnswer, state.streaming) {
        if (latestAnswer.isNotBlank() && !scrollState.isScrollInProgress) scrollState.scrollTo(scrollState.maxValue)
    }
    BackHandler(enabled = voiceMode || textMode || typedSession) {
        if (voiceMode) voiceMode = false
        else if (textMode) {
            keyboard?.hide()
            textMode = false
        } else typedSession = false
    }

    Surface(color = Ink, contentColor = Ice, modifier = Modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxSize().pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.any { it.pressed }) lastInteraction = System.nanoTime()
                    }
                }
            }.statusBarsPadding().navigationBarsPadding().imePadding()
                .padding(horizontal = metrics.horizontalPadding, vertical = 12.dp)
        ) {
            InstantConnectionMark(state.connection, Modifier.align(Alignment.TopEnd))
            AnimatedVisibility(controlsAwake, modifier = Modifier.align(Alignment.TopStart), enter = fadeIn(), exit = fadeOut()) {
                IconButton(onClick = { keyboard?.hide(); settingsOpen = true }, modifier = Modifier.size(48.dp).clip(CircleShape).background(Surface.copy(alpha = .8f))) { PremiumMenuGlyph() }
            }
            Column(
                Modifier.fillMaxSize().widthIn(max = 760.dp).align(Alignment.Center).padding(top = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                AnimatedContent(
                    targetState = typedSession,
                    transitionSpec = { nexusTransform(reduceMotion) },
                    modifier = Modifier.fillMaxSize(),
                    label = "instantInteractionMode"
                ) { written ->
                    if (written) Column(Modifier.fillMaxSize()) {
                        AnimatedContent(
                            targetState = exchangeGeneration,
                            transitionSpec = { nexusExchangeTransform(reduceMotion) },
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            label = "instantExchange"
                        ) { generation ->
                            key(generation) { AnimatedContent(
                                targetState = centeredExchange,
                                transitionSpec = { nexusTransform(reduceMotion) },
                                modifier = Modifier.fillMaxSize(),
                                label = "instantExchangeAlignment"
                            ) { centered ->
                                if (centered) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    InstantWrittenExchange(
                                        latestPrompt = latestPrompt,
                                        latestAnswer = latestAnswer,
                                        error = state.error,
                                        centered = true,
                                        busy = state.busy,
                                        activity = state.activity,
                                        reduceMotion = reduceMotion,
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 24.dp)
                                    )
                                } else Column(
                                    Modifier.fillMaxSize().verticalScroll(scrollState).padding(top = 10.dp, bottom = 18.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    InstantWrittenExchange(
                                        latestPrompt = latestPrompt,
                                        latestAnswer = latestAnswer,
                                        error = state.error,
                                        centered = false,
                                        busy = state.busy,
                                        activity = state.activity,
                                        reduceMotion = reduceMotion,
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                }
                            } }
                        }
                        AnimatedVisibility(state.attachment != null, enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
                            AttachmentPreview(state.composerState(), { dispatch("attach", "") })
                        }
                        AnimatedContent(textMode, transitionSpec = { nexusTransform(reduceMotion) }, label = "instantComposer") { typing ->
                            if (typing) Column(Modifier.fillMaxWidth()) {
                        AnimatedVisibility(instantSlashSuggestions.isNotEmpty(), enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
                            Surface(
                                color = Surface.copy(alpha = .985f),
                                shape = RoundedCornerShape(20.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .14f)),
                                shadowElevation = 10.dp,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                            ) {
                                Column(Modifier.padding(7.dp)) {
                                    Row(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(nexusCopy("COMANDI NEXUSNXS", "NEXUSNXS COMMANDS"), color = Mist, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.1.sp, modifier = Modifier.weight(1f))
                                        Text(nexusCopy("Tocca per inserire", "Tap to insert"), color = Mist.copy(alpha = .62f), fontSize = 10.sp)
                                    }
                                    instantSlashSuggestions.forEach { command ->
                                        Row(
                                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { dispatch("draft", "/${command.name} ") }.padding(horizontal = 11.dp, vertical = 9.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("/${command.name}", color = Cyan, fontSize = 13.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, modifier = Modifier.widthIn(min = 88.dp))
                                            Column(Modifier.weight(1f)) {
                                                Text(command.label, color = Ice, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Text(command.description, color = Mist, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Surface(
                            color = Surface.copy(alpha = .96f),
                            shape = RoundedCornerShape(28.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .55f)),
                            modifier = Modifier.fillMaxWidth().bringIntoViewRequester(composerBringIntoView)
                                .animateContentSize(tween(NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized))
                        ) {
                            Row(Modifier.padding(horizontal = 7.dp, vertical = 7.dp), verticalAlignment = Alignment.Bottom) {
                                IconButton(
                                    onClick = { attachmentSheet = true },
                                    enabled = interactionAvailable,
                                    modifier = Modifier.size(42.dp)
                                ) { Icon(Icons.Rounded.Add, nexusCopy("Allega foto o documento", "Attach photo or document"), tint = Ice, modifier = Modifier.size(21.dp)) }
                                BasicTextField(
                                    value = state.draft,
                                    onValueChange = { dispatch("draft", it.take(12_000)) },
                                    enabled = interactionAvailable,
                                    modifier = Modifier.weight(1f).heightIn(min = 42.dp, max = 132.dp).focusRequester(focusRequester).padding(start = 8.dp, top = 10.dp, bottom = 10.dp),
                                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ice),
                                    cursorBrush = SolidColor(Cyan),
                                    decorationBox = { inner ->
                                        Box {
                                            if (state.draft.isBlank()) Text(nexusCopy("Scrivi a NexusNXS", "Write to NexusNXS"), color = Mist, style = MaterialTheme.typography.bodyLarge)
                                            inner()
                                        }
                                    }
                                )
                                FilledIconButton(
                                    onClick = {
                                        if (state.busy) dispatch("stop", "") else if (state.draft.isNotBlank()) {
                                            keyboard?.hide()
                                            textMode = false
                                            dispatch("send", "")
                                        }
                                    },
                                    enabled = state.busy || (interactionAvailable && state.draft.isNotBlank()),
                                    modifier = Modifier.size(42.dp),
                                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Cyan, contentColor = Color(0xFF002223), disabledContainerColor = Surface2, disabledContentColor = Mist)
                                ) { Icon(if (state.busy) Icons.Rounded.Stop else Icons.Rounded.ArrowUpward, if (state.busy) nexusCopy("Interrompi", "Stop") else nexusCopy("Invia", "Send"), Modifier.size(20.dp)) }
                            }
                        }
                            } else Box(Modifier.fillMaxWidth().height(54.dp)) {
                                IconButton(
                                    onClick = { textMode = true },
                                    enabled = interactionAvailable,
                                    modifier = Modifier.align(Alignment.CenterStart).size(50.dp).clip(CircleShape).background(Surface.copy(alpha = .9f))
                                ) { Icon(Icons.Rounded.Keyboard, nexusCopy("Scrivi", "Type"), tint = Ice, modifier = Modifier.size(22.dp)) }
                            }
                        }
                    } else Box(Modifier.fillMaxSize()) {
                        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                            NexusInstantCore(
                                active = state.busy,
                                offline = state.connection == NexusConnection.OFFLINE,
                                reduceMotion = reduceMotion,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    if (!interactionAvailable) {
                                        dispatch("probe", "")
                                        return@NexusInstantCore
                                    }
                                    keyboard?.hide()
                                    textMode = false
                                    if (state.busy) dispatch("stop", "")
                                    dispatch("stopSpeech", "")
                                    voiceMode = true
                                }
                            )
                            Spacer(Modifier.height(22.dp))
                            AnimatedContent(
                                targetState = when {
                                    state.connection == NexusConnection.OFFLINE -> nexusCopy("Server offline · tocca per riprovare", "Server offline · tap to retry")
                                    state.connection == NexusConnection.CHECKING -> nexusCopy("Connessione ai server…", "Connecting to servers…")
                                    state.busy -> state.activity.ifBlank { nexusCopy("Sto pensando…", "Thinking…") }
                                    else -> nexusCopy("Tocca il Core e parla", "Tap the Core and speak")
                                },
                                transitionSpec = { nexusTransform(reduceMotion) },
                                label = "instantStatus"
                            ) { label -> Text(label, color = if (state.connection == NexusConnection.OFFLINE) Color(0xFFFF9A91) else Mist, fontSize = 13.sp, fontWeight = FontWeight.Medium) }
                            if (state.connection != NexusConnection.OFFLINE) Text(
                                nexusCopy("Voce privata · rispondo quando hai concluso", "Private voice · I respond when you finish"),
                                color = Mist.copy(alpha = .72f), fontSize = 11.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                modifier = Modifier.padding(top = 8.dp).fillMaxWidth(.82f)
                            )
                            state.error?.let { error -> Text(error, color = Color(0xFFFF9A91), style = MaterialTheme.typography.bodySmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 14.dp)) }
                        }
                        IconButton(
                            onClick = { typedSession = true; textMode = true },
                            enabled = interactionAvailable,
                            modifier = Modifier.align(Alignment.BottomStart).size(52.dp).clip(CircleShape).background(Surface.copy(alpha = .9f))
                        ) { Icon(Icons.Rounded.Keyboard, nexusCopy("Scrivi", "Type"), tint = Ice, modifier = Modifier.size(23.dp)) }
                    }
                }
            }
        }
    }
    if (settingsOpen) AlertDialog(
        onDismissRequest = { settingsOpen = false; lastInteraction = System.nanoTime() },
        title = { Text(nexusCopy("Impostazioni", "Settings")) },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CompactSetting(Icons.Rounded.Animation, nexusCopy("Riduci movimento", "Reduce motion"), nexusCopy("Segue anche le preferenze del dispositivo", "Also respects device preferences"), { Switch(state.reduceMotion, { dispatch("reduceMotion", "") }) }) { dispatch("reduceMotion", "") }
            CompactSetting(Icons.Rounded.Vibration, nexusCopy("Feedback aptico", "Haptic feedback"), "", { Switch(state.hapticsEnabled, { dispatch("haptics", "") }) }) { dispatch("haptics", "") }
            TextButton(onClick = {
                val role = if (android.os.Build.VERSION.SDK_INT >= 29) context.getSystemService(android.app.role.RoleManager::class.java) else null
                val request = if (Build.VERSION.SDK_INT >= 29 && role?.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT) == true && !role.isRoleHeld(android.app.role.RoleManager.ROLE_ASSISTANT)) role.createRequestRoleIntent(android.app.role.RoleManager.ROLE_ASSISTANT) else Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS)
                runCatching { context.startActivity(request) }.onFailure { runCatching { context.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)) } }
            }) { Text(nexusCopy("Usa Nexus come assistente", "Use Nexus as assistant")) }
            Text(nexusCopy("Il richiamo con il tasto laterale dipende dalle impostazioni del telefono. Il microfono resta sotto il tuo controllo.", "Side-button activation depends on your phone settings. The microphone remains under your control."), style = MaterialTheme.typography.bodySmall, color = Mist)
        } },
        confirmButton = { TextButton({ settingsOpen = false; lastInteraction = System.nanoTime() }) { Text(nexusCopy("Chiudi", "Close")) } },
        containerColor = Surface, shape = RoundedCornerShape(26.dp)
    )
    if (voiceMode && interactionAvailable) ContinuousVoicePanel(
        reduceMotion = reduceMotion,
        connection = state.connection,
        currentDraft = "",
        bargeIn = { dispatch("stopSpeech", "") },
        close = { voiceMode = false },
        transcript = {},
        instantSubmit = { phrase ->
            voiceMode = false
            typedSession = false
            dispatch("voiceSend", phrase)
        }
    )
    NexusAttachmentFlow(
        visible = attachmentSheet && interactionAvailable,
        close = { attachmentSheet = false },
        dispatch = dispatch,
        remoteWorkAvailable = false,
        planMode = {}
    )
    if (state.remoteWorkAvailable && state.workTicketId.isNotBlank()) AlertDialog(
        onDismissRequest = { dispatch("cancelWork", "") },
        icon = { Icon(Icons.Outlined.VerifiedUser, null, tint = Cyan) },
        title = { Text(nexusCopy("Autorizza il Core", "Authorize Core")) },
        text = {
            Column {
                Text(state.workPreview.ifBlank { nexusCopy("NexusNXS ha preparato un’azione verificabile sul computer associato.", "NexusNXS prepared a verifiable action on your paired computer.") })
                if (state.workRisk.isNotBlank()) Text(
                    nexusCopy("Rischio: ${state.workRisk}", "Risk: ${state.workRisk}"),
                    color = Mist, style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 10.dp)
                )
            }
        },
        confirmButton = { Button({ dispatch("approveWork", "") }) { Text(nexusCopy("Autorizza", "Authorize")) } },
        dismissButton = { TextButton({ dispatch("cancelWork", "") }) { Text(nexusCopy("Annulla", "Cancel")) } },
        containerColor = Surface,
        shape = RoundedCornerShape(26.dp)
    )
}

@Composable private fun InstantWrittenExchange(
    latestPrompt: String,
    latestAnswer: String,
    error: String?,
    centered: Boolean,
    busy: Boolean,
    activity: String,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        if (latestPrompt.isNotBlank()) Surface(
            color = Surface.copy(alpha = .72f),
            shape = RoundedCornerShape(18.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .36f))
        ) {
            Text(
                latestPrompt,
                color = Mist,
                style = MaterialTheme.typography.bodySmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 520.dp).padding(horizontal = 14.dp, vertical = 8.dp)
            )
        }
        AnimatedVisibility(
            visible = busy,
            enter = nexusEnter(reduceMotion),
            exit = nexusExit(reduceMotion)
        ) {
            InstantReasoningPhase(
                label = activity.ifBlank { nexusCopy("Comprendo la richiesta…", "Understanding your request…") },
                reduceMotion = reduceMotion,
                modifier = Modifier.fillMaxWidth(if (centered) .92f else 1f).padding(top = 18.dp)
            )
        }
        if (latestAnswer.isNotBlank()) Box(Modifier.fillMaxWidth(if (centered) .92f else 1f).widthIn(max = 680.dp).padding(top = if (latestPrompt.isBlank()) 0.dp else 18.dp)) {
            MarkdownMessage(streamSafeMarkdown(latestAnswer), streamingTailChars = if (busy) 48 else 0, streamingAccent = if (busy) .65f else 0f)
        }
        if (latestPrompt.isBlank() && latestAnswer.isBlank()) Text(
            nexusCopy("Scrivi. Il Core seguirà la conversazione.", "Type. The Core will follow the conversation."),
            color = Mist,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.widthIn(max = 420.dp).padding(horizontal = 18.dp)
        )
        error?.let { message -> Text(
            message,
            color = Color(0xFFFF9A91),
            style = MaterialTheme.typography.bodySmall,
            textAlign = if (centered) androidx.compose.ui.text.style.TextAlign.Center else androidx.compose.ui.text.style.TextAlign.Start,
            modifier = Modifier.fillMaxWidth(if (centered) .92f else 1f).padding(top = 14.dp)
        ) }
    }
}

/** Rappresenta soltanto le fasi reali ricevute dal backend. */
@Composable private fun InstantReasoningPhase(label: String, reduceMotion: Boolean, modifier: Modifier = Modifier) {
    val phase = nexusLoopFloat(!reduceMotion, 0f, 1f, 920, RepeatMode.Restart, "instantReasoningParticles", linear = true)
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(width = 34.dp, height = 16.dp)) {
            repeat(7) { index ->
                val progress = (phase + index / 7f) % 1f
                val wave = kotlin.math.sin((progress * Math.PI).toFloat()).coerceAtLeast(0f)
                drawCircle(
                    color = Cyan.copy(alpha = .18f + wave * .72f),
                    radius = (1.2f + wave * 1.35f).dp.toPx(),
                    center = androidx.compose.ui.geometry.Offset(
                        size.width * progress,
                        size.height * (.5f + kotlin.math.sin((progress * 8f + index) * .55f) * .18f)
                    )
                )
            }
        }
        Spacer(Modifier.width(9.dp))
        AnimatedContent(label, transitionSpec = { nexusTransform(reduceMotion) }, label = "instantReasoningLabel") { value ->
            Text(value, color = Cyan.copy(alpha = .78f), style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable private fun InstantConnectionMark(connection: NexusConnection, modifier: Modifier = Modifier) {
    val color = when (connection) { NexusConnection.ONLINE -> Color(0xFF64E5B3); NexusConnection.CHECKING -> Mist; NexusConnection.OFFLINE -> Color(0xFFFF8A80) }
    Surface(
        color = Surface.copy(alpha = .76f),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .42f)),
        modifier = modifier
    ) {
        Row(Modifier.padding(horizontal = 11.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).background(color, CircleShape))
            Spacer(Modifier.width(7.dp))
            Text(when (connection) { NexusConnection.ONLINE -> nexusCopy("Online", "Online"); NexusConnection.CHECKING -> nexusCopy("Connessione", "Connecting"); NexusConnection.OFFLINE -> nexusCopy("Offline", "Offline") }, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable private fun NexusInstantCore(active: Boolean, offline: Boolean, reduceMotion: Boolean, energy: Float = 0f, onClick: () -> Unit) {
    val pulse = nexusLoopFloat(!reduceMotion && !offline, 0f, 1f, if (active) 620 else 1550, RepeatMode.Reverse, "instantCorePulse")
    val rotation = nexusLoopFloat(!reduceMotion && active, 0f, 360f, 2600, RepeatMode.Restart, "instantCoreRotation", linear = true)
    val smoothEnergy by animateFloatAsState(if (active) energy.coerceIn(0f, 1f) else 0f, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "instantCoreEnergy")
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) .94f else 1f + pulse * .018f, tween(NexusFlow.QUICK, easing = NexusFlow.emphasized), label = "instantCoreScale")
    val accent = if (offline) Color(0xFF627071) else Cyan
    Canvas(
        Modifier.size(214.dp).graphicsLayer { scaleX = scale; scaleY = scale; rotationZ = rotation }
            .clip(CircleShape).clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .semantics { contentDescription = if (offline) "NexusNXS offline" else "NexusNXS Core" }
    ) {
        val center = this.center
        val signal = smoothEnergy * .075f
        val outer = size.minDimension * (.43f + pulse * .018f + signal)
        drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = .18f + smoothEnergy * .12f), accent.copy(alpha = .045f), Color.Transparent)), radius = size.minDimension * .5f)
        val neuralRadius = size.minDimension * (.29f + smoothEnergy * .055f)
        val neuralNodes = 12
        repeat(neuralNodes) { index ->
            val response = .78f + smoothEnergy * (.18f + (index % 4) * .025f)
            val angle = (index.toFloat() / neuralNodes.toFloat()) * (Math.PI * 2.0).toFloat() + pulse * .16f
            val radius = neuralRadius * (if (index % 2 == 0) 1f else .72f) * response
            val node = androidx.compose.ui.geometry.Offset(
                center.x + kotlin.math.cos(angle) * radius,
                center.y + kotlin.math.sin(angle) * radius
            )
            val nextAngle = ((index + 2).toFloat() / neuralNodes.toFloat()) * (Math.PI * 2.0).toFloat() + pulse * .16f
            val nextRadius = neuralRadius * (if ((index + 2) % 2 == 0) 1f else .72f)
            val next = androidx.compose.ui.geometry.Offset(
                center.x + kotlin.math.cos(nextAngle) * nextRadius,
                center.y + kotlin.math.sin(nextAngle) * nextRadius
            )
            drawLine(accent.copy(alpha = .16f + pulse * .08f + smoothEnergy * .24f), node, center, (1f + smoothEnergy * .8f).dp.toPx())
            drawLine(accent.copy(alpha = .10f + smoothEnergy * .12f), node, next, (.7f + smoothEnergy * .45f).dp.toPx())
            drawCircle(accent.copy(alpha = .58f + pulse * .22f), radius = (if (index % 3 == 0) 3.2f + smoothEnergy * 2.2f else 2.1f + smoothEnergy * 1.4f).dp.toPx(), center = node)
        }
        drawCircle(accent.copy(alpha = .12f), radius = outer, style = Stroke(width = 1.dp.toPx()))
        drawArc(accent.copy(alpha = .92f), -72f, 112f, false, topLeft = androidx.compose.ui.geometry.Offset(center.x - outer, center.y - outer), size = androidx.compose.ui.geometry.Size(outer * 2, outer * 2), style = Stroke(width = 4.dp.toPx()))
        drawArc(accent.copy(alpha = .48f), 96f, 92f, false, topLeft = androidx.compose.ui.geometry.Offset(center.x - outer, center.y - outer), size = androidx.compose.ui.geometry.Size(outer * 2, outer * 2), style = Stroke(width = 2.dp.toPx()))
        drawArc(accent.copy(alpha = .72f), 204f, 104f, false, topLeft = androidx.compose.ui.geometry.Offset(center.x - outer, center.y - outer), size = androidx.compose.ui.geometry.Size(outer * 2, outer * 2), style = Stroke(width = 3.dp.toPx()))
        drawCircle(accent.copy(alpha = .14f + pulse * .08f), radius = size.minDimension * .235f)
        drawCircle(accent.copy(alpha = .94f), radius = size.minDimension * .082f)
        drawCircle(Ice.copy(alpha = .9f), radius = size.minDimension * .028f)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun NexusApp(state: NexusUiState, dispatch: (String, String) -> Unit) {
    val metrics = LocalNexusMetrics.current
    val effectiveReduceMotion = state.reduceMotion || metrics.adaptiveReducedMotion || !ValueAnimator.areAnimatorsEnabled()
    // Le riduzioni automatiche proteggono i frame senza falsare il valore dello
    // switch nelle impostazioni, che continua a rappresentare solo la scelta utente.
    val motionState = if (effectiveReduceMotion && !state.reduceMotion) state.copy(reduceMotion = true) else state
    val keyboard = LocalSoftwareKeyboardController.current
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var drawerProgress by remember { mutableFloatStateOf(if (state.drawer) 1f else 0f) }
    var drawerDragging by remember { mutableStateOf(false) }
    var drawerSettleRequest by remember { mutableIntStateOf(0) }
    var drawerSettleDuration by remember { mutableIntStateOf(NexusFlow.ENTER) }
    val settingsVisible = state.screen == NexusScreen.SETTINGS
    LaunchedEffect(state.connection) {
        while (true) {
            dispatch("probe", "")
            if (state.connection == NexusConnection.ONLINE) dispatch("models", "")
            kotlinx.coroutines.delay(if (state.connection == NexusConnection.OFFLINE) 5_000 else 15_000)
        }
    }
    LaunchedEffect(state.drawer, drawerDragging, drawerSettleRequest) {
        if (state.drawer) keyboard?.hide()
        if (!drawerDragging) {
            val target = if (state.drawer) 1f else 0f
            animate(drawerProgress, target, animationSpec = tween(drawerSettleDuration, easing = NexusFlow.emphasized)) { value, _ -> drawerProgress = value.coerceIn(0f, 1f) }
        }
    }
    // Gerarchia Back: superficie transitoria, dettaglio, schermata, quindi la
    // chat. Soltanto dalla chat libera Android puo tornare alla Home di sistema.
    PredictiveBackHandler(enabled = state.drawer && !state.modelSheet) { progress ->
        drawerDragging = true
        try {
            progress.collect { event -> drawerProgress = (1f - event.progress).coerceIn(0f, 1f) }
            drawerDragging = false
            drawerSettleDuration = NexusFlow.EXIT
            dispatch("closeDrawer", "")
        } catch (_: CancellationException) {
            drawerDragging = false
            drawerSettleDuration = NexusFlow.ENTER
            drawerSettleRequest++
        }
    }
    val detailBackAction = when {
        state.diagnosticsOpen -> "diagnostics"
        state.workTicketId.isNotBlank() -> "cancelWork"
        state.wakeTicketId.isNotBlank() -> "cancelWake"
        else -> ""
    }
    PredictiveBackHandler(enabled = !state.drawer && !state.modelSheet && detailBackAction.isNotBlank()) { progress ->
        progress.collect { /* Il dialog governa la propria superficie. */ }
        dispatch(detailBackAction, "")
    }
    PredictiveBackHandler(enabled = !state.drawer && !state.modelSheet && detailBackAction.isBlank() && state.conversationSearchOpen) { progress ->
        progress.collect { /* La ricerca resta sopra la conversazione. */ }
        dispatch("conversationSearchOpen", "")
    }
    PredictiveBackHandler(enabled = !state.drawer && !state.modelSheet && detailBackAction.isBlank() && !state.conversationSearchOpen && state.screen != NexusScreen.CHAT) { progress ->
        progress.collect { /* Android governa direttamente il gesto predittivo. */ }
        dispatch("back", "")
    }
    val drawerDispatch: (String, String) -> Unit = { action, value ->
        dispatch("closeDrawer", "")
        scope.launch {
            kotlinx.coroutines.delay(if (effectiveReduceMotion) 1L else NexusFlow.EXIT.toLong())
            dispatch(action, value)
        }
    }
      Box(Modifier.fillMaxSize().pointerInput(state.drawer, state.modelSheet, state.hapticsEnabled) {
        val drawerWidthPx = with(density) { metrics.drawerWidth.toPx() }
        val touchSlop = with(density) { 8.dp.toPx() }
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            // Il gesto resta disponibile su tutta la scena, non soltanto in una
            // fascia laterale. Viene rivendicato solo dopo aver riconosciuto una
            // direzione nettamente orizzontale, così testo, codice e scroll
            // verticale continuano a ricevere normalmente il tocco iniziale.
            if (state.modelSheet) return@awaitEachGesture
            var lastX = down.position.x
            var totalX = 0f
            var totalY = 0f
            var claimed = false
            var thresholdHapticSent = false
            val velocityTracker = VelocityTracker().also { it.addPosition(down.uptimeMillis, down.position) }
            var pressed = true
            while (pressed) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                val delta = change.position.x - lastX
                val deltaY = change.position.y - change.previousPosition.y
                lastX = change.position.x
                totalX += delta
                totalY += deltaY
                velocityTracker.addPosition(change.uptimeMillis, change.position)
                if (!claimed && kotlin.math.abs(totalX) > touchSlop) {
                    val horizontalIntent = kotlin.math.abs(totalX) > kotlin.math.abs(totalY) * 1.2f
                    val validDirection = state.drawer || totalX > 0f
                    if (horizontalIntent && validDirection) {
                        claimed = true
                        drawerDragging = true
                        keyboard?.hide()
                    } else if (!horizontalIntent) return@awaitEachGesture
                }
                if (claimed) {
                    drawerProgress = (drawerProgress + delta / drawerWidthPx).coerceIn(0f, 1f)
                    val crossedSettleThreshold = if (state.drawer) drawerProgress <= .42f else drawerProgress >= .42f
                    if (crossedSettleThreshold && !thresholdHapticSent) {
                        thresholdHapticSent = true
                        if (state.hapticsEnabled) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    }
                    change.consume()
                }
                pressed = change.pressed
            }
            if (!claimed) return@awaitEachGesture
            val velocityX = velocityTracker.calculateVelocity().x
            val shouldOpen = when { velocityX >= 900f -> true; velocityX <= -900f -> false; else -> drawerProgress >= .42f }
            drawerSettleDuration = (185 - kotlin.math.abs(velocityX).div(18f).toInt()).coerceIn(95, 185)
            drawerDragging = false
            drawerSettleRequest++
            if (shouldOpen != state.drawer) dispatch(if (shouldOpen) "drawer" else "closeDrawer", "")
        }
      }) {
        Surface(color = Ink, contentColor = Ice, modifier = Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize()) {
        AnimatedContent(state.screen, modifier = Modifier.fillMaxSize(), transitionSpec = { nexusScreenTransform(targetState == NexusScreen.CHAT && initialState != NexusScreen.CHAT, effectiveReduceMotion) }, label = "screen") { screen ->
                when (screen) {
                    NexusScreen.CHAT -> Scaffold(containerColor = Ink, contentWindowInsets = WindowInsets(0), topBar = { NexusTopBar(motionState.topBarState(), dispatch) }, bottomBar = { NexusComposer(motionState.composerState(), dispatch) }) { padding -> ConversationScreen(motionState, dispatch, Modifier.padding(padding), drawerProgress > .001f) }
                    NexusScreen.LIBRARY -> LibraryScreen(motionState, dispatch)
                    NexusScreen.PROJECTS -> SimpleHub(nexusCopy("Progetti", "Projects"), nexusCopy("Spazi di lavoro con conversazioni, file e istruzioni condivise.", "Workspaces with shared conversations, files, and instructions."), Icons.Rounded.Folder, "NexusNXS", nexusCopy("Workstation personale · contesto locale", "Personal workstation · local context"), dispatch)
                    NexusScreen.ACTIVITY -> AttentionInboxScreen(motionState, dispatch)
                    NexusScreen.REMOTE -> RemoteScreen(motionState, dispatch)
                    NexusScreen.SCHEDULED -> ScheduledScreen(dispatch)
                    NexusScreen.SETTINGS -> Box(Modifier.fillMaxSize())
                }
        }
        // Le impostazioni vengono smontate al termine dell'uscita: mantenerle
        // precomposte faceva ricomporre anche gruppi e switch a ogni token.
        AnimatedVisibility(
            visible = settingsVisible,
            modifier = Modifier.fillMaxSize().zIndex(1f),
            enter = nexusEnter(effectiveReduceMotion),
            exit = nexusExit(effectiveReduceMotion)
        ) { SettingsScreen(state, dispatch) }
        }
        }
        if (drawerProgress > .001f) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .58f * drawerProgress)).clickable { dispatch("closeDrawer", "") })
            Box(Modifier.fillMaxHeight().width(metrics.drawerWidth).graphicsLayer { translationX = -size.width * (1f - drawerProgress) }) {
                NexusDrawer(motionState, drawerDispatch)
            }
        }
      }
    if (state.modelSheet) ModelPicker(state.model, state.models, dispatch)
    if (state.diagnosticsOpen) DiagnosticsDialog(state) { dispatch("diagnostics", "") }
    if (state.remoteWorkAvailable && state.workTicketId.isNotBlank()) AlertDialog(
        onDismissRequest = { dispatch("cancelWork", "") },
        icon = { Icon(Icons.Outlined.VerifiedUser, null, tint = Cyan) },
        title = { Text(nexusCopy("Autorizza questa operazione?", "Authorize this action?")) },
        text = { Column { Text(state.workPreview, lineHeight = 21.sp); Spacer(Modifier.height(12.dp)); Text(if (state.workRisk == "high") nexusCopy("Rischio elevato · NexusNXS creerà un checkpoint quando previsto dallo strumento.", "High risk · NexusNXS will create a checkpoint when supported by the tool.") else nexusCopy("L’azione verrà registrata localmente.", "The action will be logged locally."), color = if (state.workRisk == "high") Color(0xFFFFC47A) else Mist, fontSize = 13.sp) } },
        confirmButton = { Button({ dispatch("approveWork", "") }) { Text(nexusCopy("Autorizza", "Authorize")) } },
        dismissButton = { TextButton({ dispatch("cancelWork", "") }) { Text(nexusCopy("Annulla", "Cancel")) } },
        containerColor = Surface
    )
    if (state.wakeAvailable && state.wakeTicketId.isNotBlank() && state.workTicketId.isBlank()) AlertDialog(
        onDismissRequest = { dispatch("cancelWake", "") },
        icon = { Icon(Icons.Rounded.PowerSettingsNew, null, tint = Cyan) },
        title = { Text(nexusCopy("Risvegliare la workstation?", "Wake the workstation?")) },
        text = { Column { Text(state.wakePreview, lineHeight = 21.sp); Spacer(Modifier.height(12.dp)); Text(nexusCopy("Operazione sensibile · il segnale verrà inviato una sola volta al target autorizzato dal relay privato.", "Sensitive action · the signal will be sent once to the target authorized by the private relay."), color = Color(0xFFFFC47A), fontSize = 13.sp, lineHeight = 18.sp) } },
        confirmButton = { Button({ dispatch("approveWake", "") }) { Text(nexusCopy("Conferma", "Confirm")) } },
        dismissButton = { TextButton({ dispatch("cancelWake", "") }) { Text(nexusCopy("Annulla", "Cancel")) } },
        containerColor = Surface
    )
}

@Composable private fun NexusTopBar(state: NexusTopBarState, dispatch: (String, String) -> Unit) {
    val metrics = LocalNexusMetrics.current
    val active = state.active
    val headerMode = when { state.temporary -> 2; active -> 1; else -> 0 }
    var menu by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var delete by remember { mutableStateOf(false) }
    var confirmTemporaryExit by remember { mutableStateOf(false) }
    val temporaryHasContent = state.temporaryHasContent
    val headerTitle = state.headerTitle
    var renameText by remember(state.conversationId) { mutableStateOf("") }
    val haptic = LocalHapticFeedback.current
    val keyboard = LocalSoftwareKeyboardController.current
    val temporaryButtonColor by animateColorAsState(if (state.temporary) Cyan.copy(alpha = .16f) else Color.Transparent, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "temporaryButtonColor")
    val actionWidth by animateDpAsState(if (active) 96.dp else 48.dp, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "topActionsWidth")
    Row(Modifier.fillMaxWidth().background(Ink).statusBarsPadding().height(metrics.topBarHeight).padding(horizontal = metrics.horizontalPadding.coerceAtMost(14.dp), vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(52.dp).fillMaxHeight(), contentAlignment = Alignment.CenterStart) {
          Box(Modifier.size(48.dp)) {
            Surface(color = Surface.copy(alpha = .88f), shape = CircleShape, border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .58f)), modifier = Modifier.fillMaxSize()) {
                IconButton({ keyboard?.hide(); dispatch("drawer", "") }) { PremiumMenuGlyph() }
            }
          }
        }
        Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
            AnimatedContent(headerMode, transitionSpec = { nexusTransform(state.reduceMotion) }, label = "topBarMode") { mode ->
                when (mode) {
                    0 -> AnimatedTitle(nexusCopy("NexusNXS", "NexusNXS"))
                    1 -> AnimatedTitle(headerTitle.ifBlank { nexusCopy("Nuova chat", "New chat") })
                    else -> TemporaryHeader()
                }
            }
        }
        Surface(color = Surface.copy(alpha = .88f), shape = RoundedCornerShape(24.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .55f)), modifier = Modifier.width(actionWidth).height(48.dp)) {
        Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            when {
              !active || state.temporary -> {
                IconButton({ if (state.hapticsEnabled) haptic.performHapticFeedback(if (state.temporary) HapticFeedbackType.TextHandleMove else HapticFeedbackType.LongPress); if (state.temporary && temporaryHasContent) confirmTemporaryExit = true else dispatch("temporary", "") }, Modifier.size(48.dp).clip(CircleShape).background(temporaryButtonColor)) { TemporaryChatGlyph(state.temporary) }
              }
              active && !state.temporary -> {
                IconButton({ dispatch("new", "") }, Modifier.size(48.dp)) { NewChatGlyph() }
              }
              else -> Spacer(Modifier.size(48.dp))
            }
            if (active) Box {
            IconButton({ menu = true }, Modifier.size(48.dp).clip(CircleShape)) { Icon(Icons.Rounded.MoreHoriz, nexusCopy("Azioni chat", "Chat actions"), tint = Ice, modifier = Modifier.size(24.dp)) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.widthIn(max = 310.dp), containerColor = Surface2, shape = RoundedCornerShape(22.dp)) {
                Text(nexusCopy("CONVERSAZIONE", "CONVERSATION"), color = Mist, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 20.dp, top = 14.dp, bottom = 5.dp))
                DropdownMenuItem(text = { Text(nexusCopy("Nuova chat", "New chat"), fontWeight = FontWeight.Medium) }, leadingIcon = { Icon(Icons.Outlined.Create, null, tint = Ice) }, onClick = { menu = false; dispatch("new", "") })
                if (state.temporary) {
                    DropdownMenuItem(text = { Text(nexusCopy("Salva questa conversazione", "Save this conversation")) }, leadingIcon = { Icon(Icons.Outlined.BookmarkAdd, null) }, onClick = { menu = false; dispatch("saveTemporary", "") })
                    DropdownMenuItem(text = { Text(nexusCopy("Esci dalla modalità temporanea", "Exit temporary mode")) }, leadingIcon = { Icon(Icons.Outlined.HistoryToggleOff, null) }, onClick = { menu = false; if (temporaryHasContent) confirmTemporaryExit = true else dispatch("temporary", "") })
                } else if (active) {
                    if (state.pairingAvailable) DropdownMenuItem(text = { Text(nexusCopy("Continua sul PC", "Continue on PC")) }, leadingIcon = { Icon(Icons.Outlined.Computer, null) }, onClick = { menu = false; dispatch("continueOnPc", "") })
                    DropdownMenuItem(text = { Text(nexusCopy("Cerca nella chat", "Search conversation")) }, leadingIcon = { Icon(Icons.Rounded.Search, null) }, onClick = { menu = false; dispatch("conversationSearchOpen", "") })
                    DropdownMenuItem(text = { Text(nexusCopy("Condividi", "Share")) }, leadingIcon = { Icon(Icons.Rounded.IosShare, null) }, onClick = { menu = false; dispatch("share", "") })
                    HorizontalDivider(Modifier.padding(horizontal = 14.dp, vertical = 4.dp), color = Hairline.copy(alpha = .35f))
                    DropdownMenuItem(text = { Text(nexusCopy("Rinomina", "Rename")) }, leadingIcon = { Icon(Icons.Rounded.Edit, null) }, onClick = { menu = false; renameText = headerTitle; rename = true })
                    val pinned = state.pinned
                    DropdownMenuItem(text = { Text(if (pinned) nexusCopy("Rimuovi dai fissati", "Unpin") else nexusCopy("Fissa", "Pin")) }, leadingIcon = { Icon(if (pinned) Icons.Rounded.PushPin else Icons.Outlined.PushPin, null) }, onClick = { menu = false; dispatch("pinChat", state.conversationId) })
                    DropdownMenuItem(text = { Text(nexusCopy("Archivia", "Archive")) }, leadingIcon = { Icon(Icons.Outlined.Archive, null) }, onClick = { menu = false; dispatch("archiveChat", state.conversationId) })
                    DropdownMenuItem(text = { Text(nexusCopy("Elimina", "Delete"), color = Color(0xFFFF8A80)) }, leadingIcon = { Icon(Icons.Rounded.DeleteOutline, null, tint = Color(0xFFFF8A80)) }, onClick = { menu = false; delete = true })
                }
            }
            }
        }
        }
    }
    if (rename) AlertDialog(onDismissRequest = { rename = false }, title = { Text(nexusCopy("Rinomina chat", "Rename chat")) }, text = { OutlinedTextField(renameText, { renameText = it.take(72) }, singleLine = true) }, confirmButton = { TextButton({ dispatch("renameChat", "${state.conversationId}\n$renameText"); rename = false }) { Text(nexusCopy("Salva", "Save")) } }, dismissButton = { TextButton({ rename = false }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface)
    if (delete) AlertDialog(onDismissRequest = { delete = false }, title = { Text(nexusCopy("Eliminare questa chat?", "Delete this chat?")) }, text = { Text(nexusCopy("La conversazione verrà rimossa da questo dispositivo.", "The conversation will be removed from this device.")) }, confirmButton = { TextButton({ dispatch("deleteChat", state.conversationId); delete = false }) { Text(nexusCopy("Elimina", "Delete"), color = Color(0xFFFF8A80)) } }, dismissButton = { TextButton({ delete = false }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface)
    if (confirmTemporaryExit) AlertDialog(onDismissRequest = { confirmTemporaryExit = false }, title = { Text(nexusCopy("Uscire dalla chat temporanea?", "Exit temporary chat?")) }, text = { Text(nexusCopy("Messaggi, bozze e allegati di questa sessione verranno eliminati.", "Messages, drafts, and attachments from this session will be deleted.")) }, confirmButton = { TextButton({ confirmTemporaryExit = false; dispatch("temporary", "") }) { Text(nexusCopy("Elimina ed esci", "Delete and exit"), color = Color(0xFFFFA39B)) } }, dismissButton = { TextButton({ confirmTemporaryExit = false }) { Text(nexusCopy("Continua", "Continue")) } }, containerColor = Surface)
}

@Composable private fun PremiumMenuGlyph() {
    val accessibilityLabel = nexusCopy("Apri menu", "Open menu")
    Column(
        Modifier.size(25.dp).semantics { contentDescription = accessibilityLabel },
        verticalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.Start
    ) {
        Box(Modifier.width(23.dp).height(2.dp).clip(CircleShape).background(Ice))
        Box(Modifier.width(15.dp).height(2.dp).clip(CircleShape).background(Ice))
        Box(Modifier.width(19.dp).height(2.dp).clip(CircleShape).background(Ice))
    }
}

@Composable private fun TemporaryHeader() {
    Column(Modifier.width(188.dp).height(48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            Box(Modifier.size(7.dp).background(Cyan, CircleShape))
            Spacer(Modifier.width(7.dp))
            Text(nexusCopy("Chat temporanea", "Temporary chat"), color = Ice, fontSize = 14.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Text(nexusCopy("Non verrà salvata", "Won't be saved"), color = Mist, fontSize = 11.sp, lineHeight = 13.sp, maxLines = 1)
    }
}

@Composable private fun TemporaryChatGlyph(active: Boolean = false) {
    val accessibilityLabel = if (active) nexusCopy("Esci dalla chat temporanea", "Exit temporary chat") else nexusCopy("Chat temporanea", "Temporary chat")
    Icon(Icons.Outlined.HistoryToggleOff, accessibilityLabel, tint = if (active) Cyan else Ice, modifier = Modifier.size(24.dp))
}

@Composable private fun NewChatGlyph() {
    val accessibilityLabel = nexusCopy("Nuova chat", "New chat")
    Icon(Icons.Outlined.Create, accessibilityLabel, tint = Ice, modifier = Modifier.size(25.dp))
}

@Composable private fun AnimatedTitle(value: String) {
    AnimatedContent(value, transitionSpec = { nexusTransform() }, label = "chatTitle") { title ->
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
    }
}

@Composable private fun ModeSwitcher(work: Boolean, remoteWorkAvailable: Boolean, hapticsEnabled: Boolean, dispatch: (String, String) -> Unit) {
    if (!remoteWorkAvailable) {
        Surface(color = Color(0xFF11191A).copy(alpha = .92f), shape = CircleShape, border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .58f)), modifier = Modifier.width(86.dp).height(44.dp)) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Chat", color = Ice, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
        }
        return
    }
    val metrics = LocalNexusMetrics.current
    val density = LocalDensity.current
    val haptic = LocalHapticFeedback.current
    val switchWidth = if (metrics.fontScale > 1.2f) 136.dp else 132.dp
    val segmentWidth = (switchWidth - 8.dp) / 2
    val indicatorOffset by animateDpAsState(if (work) segmentWidth else 0.dp, tween(NexusFlow.ENTER, easing = NexusFlow.emphasized), label = "modeIndicator")
    Surface(color = Color(0xFF11191A).copy(alpha = .92f), shape = CircleShape, border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .58f)), modifier = Modifier.width(switchWidth).height(44.dp)) {
        Box(Modifier.padding(4.dp)) {
            Box(Modifier.offset { IntOffset(with(density) { indicatorOffset.roundToPx() }, 0) }.width(segmentWidth).fillMaxHeight().background(Color(0xFF263334), CircleShape).border(1.dp, Cyan.copy(alpha = .24f), CircleShape))
            Row(Modifier.fillMaxSize()) {
                listOf("Chat" to false, nexusCopy("Cuore", "Core") to true).forEach { (label, isWork) ->
                    val selected = work == isWork
                    val foreground by animateColorAsState(if (selected) Ice else Color(0xFFD2D7D7), tween(NexusFlow.ENTER, easing = NexusFlow.standard), label = "modeText$label")
                    Box(Modifier.weight(1f).fillMaxHeight().clip(CircleShape).clickable { if (!selected) { if (hapticsEnabled) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); dispatch(if (isWork) "work" else "chat", "") } }, contentAlignment = Alignment.Center) { Text(label, color = foreground, fontSize = 15.sp, lineHeight = 19.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal) }
                }
            }
        }
    }
}

@Composable private fun ConversationScreen(state: NexusUiState, dispatch: (String, String) -> Unit, modifier: Modifier = Modifier, motionSuspended: Boolean = false) {
    val metrics = LocalNexusMetrics.current
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val itemCount = state.turns.size + if (state.busy) 1 else 0
    val bottomAnchor = remember { BringIntoViewRequester() }
    val nearBottom by remember { derivedStateOf { val info = listState.layoutInfo; info.totalItemsCount == 0 || info.visibleItemsInfo.lastOrNull()?.index.orEmptyIndex() >= info.totalItemsCount - 2 } }
    var autoFollow by remember(state.conversationId) { mutableStateOf(true) }
    var unseenStreamingCharacters by remember(state.conversationId) { mutableIntStateOf(0) }
    var previousStreamingLength by remember(state.conversationId) { mutableIntStateOf(0) }
    val latestStreamingLength = rememberUpdatedState(state.streaming.length)
    val userReadingHistory = !autoFollow
    // Lo streaming segue il fondo soltanto finche l'utente non scorre verso la
    // cronologia. BringIntoView ancora il bordo inferiore invece di riposizionare
    // l'ultimo messaggio in alto, che era la causa del salto visibile.
    LaunchedEffect(listState) {
        snapshotFlow { Triple(listState.isScrollInProgress, listState.lastScrolledBackward, nearBottom) }.collect { (scrolling, movingBack, atBottom) ->
            if (scrolling) {
                if (movingBack) autoFollow = false
                else if (atBottom) autoFollow = true
            }
        }
    }
    LaunchedEffect(itemCount, autoFollow) {
        snapshotFlow { latestStreamingLength.value }.collect { streamingLength ->
            if (itemCount > 0 && autoFollow) {
                unseenStreamingCharacters = 0
                withFrameNanos { }
                bottomAnchor.bringIntoView()
            } else if (streamingLength > previousStreamingLength) {
                unseenStreamingCharacters += streamingLength - previousStreamingLength
            }
            previousStreamingLength = streamingLength
        }
    }
    Box(modifier.fillMaxSize()) {
    if (state.turns.isEmpty() && !state.busy && state.error == null) {
        EmptyHome(state, dispatch, motionSuspended)
    } else LazyColumn(state = listState, modifier = Modifier.fillMaxHeight().fillMaxWidth().widthIn(max = metrics.contentMaxWidth).wrapContentWidth(Alignment.CenterHorizontally), contentPadding = PaddingValues(horizontal = metrics.horizontalPadding, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (state.conversationSearchOpen) item {
            OutlinedTextField(state.conversationSearch, { dispatch("conversationSearch", it) }, modifier = Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text(nexusCopy("Cerca in questa conversazione", "Search this conversation")) }, leadingIcon = { Icon(Icons.Rounded.Search, null) }, trailingIcon = { IconButton({ dispatch("conversationSearchOpen", "") }) { Icon(Icons.Rounded.Close, nexusCopy("Chiudi ricerca", "Close search")) } }, shape = RoundedCornerShape(18.dp))
        }
        if (state.work && (state.busy || state.workTicketId.isNotBlank() || state.workPreview.isNotBlank())) item { WorkProgressCard(state) }
        // La continuità resta visibile in Attività e nel badge del menu, senza
        // trasformarsi in un popup permanente sopra ogni conversazione.
        itemsIndexed(state.turns) { index, turn ->
            val matches = state.conversationSearch.isBlank() || turn.content.contains(state.conversationSearch, ignoreCase = true)
            AnimatedVisibility(visible = matches, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) { TurnCard(turn, index, !state.temporary && index == state.turns.lastIndex && turn.role == "assistant", dispatch, state.conversationSearch, state) }
        }
        if (state.busy) item { if (state.streaming.isBlank()) ThinkingIndicator(state.activity.ifBlank { nexusCopy("NexusNXS sta elaborando…", "NexusNXS is thinking…") }, state.reduceMotion) else StreamingMessage(state.streaming, state.reduceMotion) }
        state.error?.let { message ->
            if (!message.isTransportFailure()) item { ErrorNotice(message) { dispatch("dismissError", "") } }
            else if (state.pendingCount == 0) item {
                OfflineConnectionNotice(
                    temporary = state.temporary,
                    retry = { dispatch(if (state.temporary) "regenerate" else "probe", "") },
                    dismiss = { dispatch("dismissError", "") }
                )
            }
        }
        item(key = "conversation-bottom-anchor") { Spacer(Modifier.fillMaxWidth().height(1.dp).bringIntoViewRequester(bottomAnchor)) }
    }
    if (userReadingHistory && itemCount > 0 && !nearBottom) Box(Modifier.fillMaxSize().padding(bottom = 12.dp, end = 18.dp), contentAlignment = Alignment.BottomEnd) {
        SmallFloatingActionButton(onClick = { autoFollow = true; unseenStreamingCharacters = 0; scope.launch { bottomAnchor.bringIntoView() } }, containerColor = Surface2, contentColor = Ice) {
            BadgedBox(badge = { if (unseenStreamingCharacters > 0) Badge(containerColor = Cyan, contentColor = Color(0xFF002223)) { Text(if (unseenStreamingCharacters > 99) "99+" else unseenStreamingCharacters.toString()) } }) { Icon(Icons.Rounded.ArrowDownward, nexusCopy("Vai all’ultimo messaggio", "Jump to latest")) }
        }
    }
    }
}

private fun Int?.orEmptyIndex() = this ?: -1

@Composable private fun ConnectionStatusStrip(connection: NexusConnection, pendingCount: Int, retry: () -> Unit) {
    val checking = connection == NexusConnection.CHECKING
    Surface(
        color = Color(0xFF0B1415).copy(alpha = .96f),
        shape = RoundedCornerShape(17.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .52f)),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
    ) {
        Row(Modifier.padding(start = 13.dp, top = 7.dp, end = 5.dp, bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) {
                if (checking) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 1.8.dp, color = Cyan)
                else Icon(Icons.Rounded.CloudOff, null, tint = Color(0xFFFFA39B), modifier = Modifier.size(19.dp))
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (checking) nexusCopy("Connessione ai server NexusNXS…", "Connecting to NexusNXS servers…")
                    else nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers are unavailable"),
                    color = Ice,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    when {
                        checking -> nexusCopy("Verifica protetta in corso", "Secure connection check in progress")
                        pendingCount > 0 -> nexusCopy("$pendingCount in coda · invio automatico", "$pendingCount queued · automatic delivery")
                        else -> nexusCopy("Riconnessione automatica in background", "Automatic reconnection in the background")
                    },
                    color = Mist,
                    fontSize = 10.sp,
                    lineHeight = 14.sp
                )
            }
            if (!checking) IconButton(retry, Modifier.size(48.dp)) { Icon(Icons.Rounded.Refresh, nexusCopy("Riprova connessione", "Retry connection"), tint = Cyan, modifier = Modifier.size(19.dp)) }
        }
    }
}

@Composable private fun PendingQueueCard(count: Int, syncing: Boolean, retry: () -> Unit) {
    Surface(color = Color(0xFF0D2021), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .28f)), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 12.dp, top = 8.dp, end = 6.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(32.dp).background(Cyan.copy(alpha = .10f), CircleShape), contentAlignment = Alignment.Center) { if (syncing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 1.8.dp, color = Cyan) else Icon(Icons.Outlined.CloudSync, null, tint = Cyan.copy(alpha = .88f), modifier = Modifier.size(18.dp)) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(nexusCopy(if (count == 1) "1 messaggio in coda" else "$count messaggi in coda", if (count == 1) "1 message queued" else "$count messages queued"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(if (syncing) nexusCopy("Sincronizzazione protetta in corso", "Secure synchronization in progress") else nexusCopy("Invio automatico alla riconnessione", "Sent automatically after reconnecting"), color = Mist, fontSize = 11.sp, lineHeight = 15.sp)
            }
            if (!syncing) TextButton(retry, modifier = Modifier.heightIn(min = 48.dp), contentPadding = PaddingValues(horizontal = 9.dp, vertical = 0.dp)) { Text(nexusCopy("Riprova", "Retry"), color = Cyan.copy(alpha = .90f), fontWeight = FontWeight.SemiBold, fontSize = 12.sp) }
        }
    }
}

@Composable private fun OfflineConnectionNotice(temporary: Boolean, retry: () -> Unit, dismiss: () -> Unit) {
    Surface(
        color = Color(0xFF111B1C),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .72f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(Modifier.padding(start = 13.dp, top = 10.dp, end = 7.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(Cyan.copy(alpha = .09f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.CloudSync, null, tint = Cyan.copy(alpha = .84f), modifier = Modifier.size(19.dp))
            }
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Text(nexusCopy("Connessione in pausa", "Connection paused"), color = Ice, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    if (temporary) nexusCopy("Riconnettiti per inviare questa chat temporanea", "Reconnect to send this temporary chat")
                    else nexusCopy("NexusNXS riprova automaticamente in background", "NexusNXS retries automatically in the background"),
                    color = Mist,
                    fontSize = 11.sp,
                    lineHeight = 15.sp
                )
            }
            TextButton(retry, modifier = Modifier.heightIn(min = 48.dp), contentPadding = PaddingValues(horizontal = 8.dp)) {
                Text(nexusCopy("Riprova", "Retry"), color = Cyan, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            IconButton(dismiss, Modifier.size(48.dp)) { Icon(Icons.Rounded.Close, nexusCopy("Nascondi", "Dismiss"), tint = Mist, modifier = Modifier.size(18.dp)) }
        }
    }
}

@Composable private fun ErrorNotice(message: String, dismiss: () -> Unit) {
    Surface(color = Color(0xFF241B1B), shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFFA39B).copy(alpha = .24f)), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 14.dp, top = 10.dp, end = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.ErrorOutline, null, tint = Color(0xFFFFA39B), modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(message, modifier = Modifier.weight(1f), color = Ice, fontSize = 12.sp, lineHeight = 17.sp)
            IconButton(dismiss, Modifier.size(48.dp)) { Icon(Icons.Rounded.Close, nexusCopy("Chiudi", "Dismiss"), tint = Mist, modifier = Modifier.size(18.dp)) }
        }
    }
}

@Composable private fun WorkProgressCard(state: NexusUiState) {
    val planning = state.busy && state.workTicketId.isBlank()
    val ready = state.workTicketId.isNotBlank()
    Surface(color = Color(0xFF0C2021), shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .35f)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.AccountTree, null, tint = Cyan, modifier = Modifier.size(21.dp)); Spacer(Modifier.width(10.dp)); Text(if (ready) nexusCopy("Piano pronto per l’autorizzazione", "Plan ready for authorization") else state.activity.ifBlank { nexusCopy("Piano Cuore", "Core plan") }, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f)); if (planning) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Cyan) }
            if (state.workPreview.isNotBlank()) Text(state.workPreview, color = Color(0xFFD6E4E4), fontSize = 13.sp, lineHeight = 19.sp)
            Row(verticalAlignment = Alignment.CenterVertically) { Icon(if (ready) Icons.Rounded.VerifiedUser else Icons.Outlined.Schedule, null, tint = if (ready) Color(0xFF59D7A7) else Mist, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(7.dp)); Text(if (ready) nexusCopy("Nessuna azione parte senza conferma", "Nothing runs without confirmation") else nexusCopy("Analisi di strumenti, rischi e verifiche", "Reviewing tools, risks and checks"), color = Mist, fontSize = 12.sp) }
            WorkPhaseTimeline(planning = planning, ready = ready, executing = state.busy && !planning)
        }
    }
}

@Composable private fun WorkPhaseTimeline(planning: Boolean, ready: Boolean, executing: Boolean) {
    val active = when { executing -> 2; ready -> 1; planning -> 0; else -> 3 }
    Row(Modifier.fillMaxWidth().padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        listOf(nexusCopy("Piano", "Plan"), nexusCopy("Autorizza", "Approve"), nexusCopy("Esegui", "Run"), nexusCopy("Verifica", "Verify")).forEachIndexed { index, label ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Box(Modifier.size(9.dp).background(if (index <= active) Cyan else Hairline, CircleShape)); Text(label, color = if (index <= active) Color(0xFFBBD1D1) else Mist, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp)) }
            if (index < 3) Box(Modifier.weight(1f).height(1.dp).background(if (index < active) Cyan.copy(alpha = .55f) else Hairline.copy(alpha = .55f)))
        }
    }
}

@Composable private fun ThinkingIndicator(label: String, reduceMotion: Boolean) {
    val pulse = nexusLoopFloat(!reduceMotion, 0f, 1f, NexusFlow.THINKING_PULSE, RepeatMode.Reverse, "thinkingPulse", disabledValue = .42f)
    Row(
        Modifier
            .heightIn(min = 40.dp)
            .clearAndSetSemantics { contentDescription = label; liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Canvas(Modifier.size(28.dp)) {
            val center = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height / 2f)
            val energy = pulse
            drawCircle(Cyan.copy(alpha = .08f + energy * .10f), radius = (8.5f + energy * 2f).dp.toPx(), center = center)
            drawCircle(Cyan.copy(alpha = .48f + energy * .46f), radius = (5.2f + energy * 1.7f).dp.toPx(), center = center)
        }
        Spacer(Modifier.width(8.dp))
        AnimatedContent(label, transitionSpec = { nexusTransform(reduceMotion) }, label = "thinkingPhase") { phase ->
            Text(phase, color = Mist, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium)
        }
    }
}

private enum class ResponsePresentationKind { ANSWER, PLAN, RESEARCH, CODE }

private fun responsePresentationKind(value: String): ResponsePresentationKind = when {
    value.contains("```") || Regex("\\b(?:function|class|const|SELECT|CREATE TABLE|def )\\b", RegexOption.IGNORE_CASE).containsMatchIn(value) -> ResponsePresentationKind.CODE
    Regex("\\[[^]]+]\\(https://|\\b(?:fonti|sources|ricerca web)\\b", RegexOption.IGNORE_CASE).containsMatchIn(value) -> ResponsePresentationKind.RESEARCH
    Regex("(?:^|\\n)\\s*(?:#{1,4}\\s|[-*]\\s|\\d+[.)]\\s)").containsMatchIn(value) -> ResponsePresentationKind.PLAN
    else -> ResponsePresentationKind.ANSWER
}

private fun streamSafeMarkdown(value: String): String {
    var safe = value
    listOf("**", "`").forEach { token ->
        if ((safe.split(token).size - 1) % 2 != 0) {
            val at = safe.lastIndexOf(token)
            if (at >= 0) safe = safe.removeRange(at, at + token.length)
        }
    }
    val stars = Regex("(?<!\\*)\\*(?!\\*)").findAll(safe).toList()
    if (stars.size % 2 != 0) safe = safe.removeRange(stars.last().range)
    return safe
}

private fun readableMathNotation(value: String): String {
    val symbols = mapOf(
        "\\times" to "×", "\\cdot" to "·", "\\div" to "÷", "\\pm" to "±", "\\mp" to "∓",
        "\\neq" to "≠", "\\leq" to "≤", "\\le" to "≤", "\\geq" to "≥", "\\ge" to "≥", "\\approx" to "≈",
        "\\infty" to "∞", "\\sum" to "∑", "\\prod" to "∏", "\\int" to "∫", "\\partial" to "∂", "\\nabla" to "∇",
        "\\alpha" to "α", "\\beta" to "β", "\\gamma" to "γ", "\\delta" to "δ", "\\theta" to "θ", "\\lambda" to "λ",
        "\\mu" to "μ", "\\pi" to "π", "\\rho" to "ρ", "\\sigma" to "σ", "\\phi" to "φ", "\\omega" to "ω",
        "\\Delta" to "Δ", "\\Omega" to "Ω", "\\rightarrow" to "→", "\\to" to "→", "\\leftarrow" to "←",
        "\\in" to "∈", "\\notin" to "∉", "\\subset" to "⊂", "\\subseteq" to "⊆", "\\forall" to "∀", "\\exists" to "∃",
        "\\quad" to " ", "\\," to " ", "\\;" to " "
    )
    val superscripts = mapOf('0' to '⁰', '1' to '¹', '2' to '²', '3' to '³', '4' to '⁴', '5' to '⁵', '6' to '⁶', '7' to '⁷', '8' to '⁸', '9' to '⁹', '+' to '⁺', '-' to '⁻')
    val subscripts = mapOf('0' to '₀', '1' to '₁', '2' to '₂', '3' to '₃', '4' to '₄', '5' to '₅', '6' to '₆', '7' to '₇', '8' to '₈', '9' to '₉', '+' to '₊', '-' to '₋')
    var result = value.trim()
    repeat(4) {
        result = Regex("\\\\frac\\s*\\{([^{}]+)}\\s*\\{([^{}]+)}").replace(result, "($1)/($2)")
        result = Regex("\\\\sqrt\\s*\\{([^{}]+)}").replace(result, "√($1)")
    }
    symbols.entries.sortedByDescending { it.key.length }.forEach { (source, symbol) -> result = result.replace(source, symbol) }
    return result
        .replace(Regex("\\^\\{?([0-9+-]+)}?")) { match -> match.groupValues[1].map { superscripts[it] ?: it }.joinToString("") }
        .replace(Regex("_\\{?([0-9+-]+)}?")) { match -> match.groupValues[1].map { subscripts[it] ?: it }.joinToString("") }
        .replace(Regex("\\\\(?:left|right|mathrm|text|operatorname)\\b"), "")
        .replace(Regex("[{}]"), "")
        .replace(Regex("\\s+"), " ")
        .trim()
}

private fun normalizeInlineMath(value: String): String = Regex("\\x24([^\\x24\\n]+)\\x24|\\\\\\(([^\\n]+?)\\\\\\)")
    .replace(value) { match -> readableMathNotation(match.groups[1]?.value ?: match.groups[2]?.value.orEmpty()) }

private fun normalizeMathBlocks(value: String): String = Regex("(?s)\\x24\\x24(.+?)\\x24\\x24|\\\\\\[(.+?)\\\\\\]")
    .replace(value) { match -> "\n§NEXUS_MATH§${readableMathNotation(match.groups[1]?.value ?: match.groups[2]?.value.orEmpty())}\n" }

@Composable private fun ResponseContextHeader(value: String, streaming: Boolean, reduceMotion: Boolean = false) {
    if (value.isBlank()) return
    val kind = remember(value) { responsePresentationKind(value) }
    val accent = when (kind) {
        ResponsePresentationKind.CODE -> Color(0xFF9CB5FF)
        ResponsePresentationKind.RESEARCH -> Color(0xFF6FE0AE)
        ResponsePresentationKind.PLAN -> Color(0xFFC6AAFA)
        ResponsePresentationKind.ANSWER -> Cyan
    }
    val label = when (kind) {
        ResponsePresentationKind.CODE -> nexusCopy("Codice", "Code")
        ResponsePresentationKind.RESEARCH -> nexusCopy("Ricerca", "Research")
        ResponsePresentationKind.PLAN -> nexusCopy("Percorso", "Plan")
        ResponsePresentationKind.ANSWER -> nexusCopy("Risposta", "Answer")
    }
    val pulse = nexusLoopFloat(streaming && !reduceMotion, .72f, 1f, 1050, RepeatMode.Reverse, "responseContextPulse", disabledValue = 1f)
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(19.dp)
                .graphicsLayer { alpha = pulse; scaleX = .92f + pulse * .08f; scaleY = scaleX }
                .background(accent.copy(alpha = .12f), CircleShape)
                .border(1.dp, accent.copy(alpha = .42f), CircleShape),
            contentAlignment = Alignment.Center
        ) { Box(Modifier.size(5.dp).background(accent, CircleShape)) }
        Spacer(Modifier.width(9.dp))
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(label.uppercase(), color = accent, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.1.sp)
            Text(if (streaming) nexusCopy("In composizione", "Composing") else nexusCopy("Risposta pronta", "Response ready"), color = Mist, fontSize = 10.sp)
        }
    }
}

@Composable private fun StreamingMessage(value: String, reduceMotion: Boolean) {
    val accessibilityLabel = nexusCopy("NexusNXS sta rispondendo", "NexusNXS is responding")
    val accent = remember { Animatable(0f) }
    val splitter = remember { StreamingMarkdownAccumulator() }
    val (stablePrefix, liveTail) = splitter.update(value)
    // Un impulso per piccolo gruppo di caratteri conserva la sensazione viva
    // senza cancellare e ricreare una coroutine a ogni singolo frame/token.
    LaunchedEffect(value.length / 18) {
        if (reduceMotion) accent.snapTo(0f)
        else {
            accent.snapTo(1f)
            accent.animateTo(0f, tween(NexusFlow.STREAM_FADE, easing = NexusFlow.standard))
        }
    }
    Column(Modifier.clearAndSetSemantics { contentDescription = accessibilityLabel; liveRegion = LiveRegionMode.Polite }) {
        Row(Modifier.padding(start = 2.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(5.dp).background(Cyan.copy(alpha = .88f), CircleShape))
            Text("NEXUSNXS", color = Color(0xFF648485), fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp, modifier = Modifier.padding(start = 7.dp))
        }
        ResponseContextHeader(value, streaming = true, reduceMotion = reduceMotion)
        if (stablePrefix.isNotBlank()) key(stablePrefix.hashCode()) { MarkdownMessage(stablePrefix) }
        if (stablePrefix.isNotBlank() && liveTail.isNotBlank()) Spacer(Modifier.height(6.dp))
        if (liveTail.isNotBlank()) MarkdownMessage(liveTail, streamingTailChars = 10, streamingAccent = accent.value)
    }
}

/** Parser incrementale: i blocchi conclusi non vengono riletti a ogni token. */
private class StreamingMarkdownAccumulator {
    private var previous = ""
    private var lineStart = 0
    private var lastSafeBoundary = 0
    private var inFence = false

    fun update(value: String): Pair<String, String> {
        if (!isAppendOfPrevious(value)) reset()
        var newline = value.indexOf('\n', lineStart)
        while (newline >= 0) {
            val line = value.substring(lineStart, newline)
            if (line.trimStart().startsWith("```")) inFence = !inFence
            else if (!inFence && line.isBlank()) lastSafeBoundary = newline + 1
            lineStart = newline + 1
            newline = value.indexOf('\n', lineStart)
        }
        previous = value
        if (value.length < 240 || lastSafeBoundary <= 0 || lastSafeBoundary >= value.length) return "" to streamSafeMarkdown(value)
        return value.substring(0, lastSafeBoundary).trimEnd() to streamSafeMarkdown(value.substring(lastSafeBoundary).trimStart())
    }

    private fun reset() {
        previous = ""
        lineStart = 0
        lastSafeBoundary = 0
        inFence = false
    }

    private fun isAppendOfPrevious(value: String): Boolean {
        if (previous.isEmpty()) return true
        if (value.length < previous.length) return false
        val probe = minOf(32, previous.length)
        return value.regionMatches(0, previous, 0, probe) &&
            value.regionMatches(previous.length - probe, previous, previous.length - probe, probe)
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable private fun EmptyHome(state: NexusUiState, dispatch: (String, String) -> Unit, motionSuspended: Boolean = false) {
  val metrics = LocalNexusMetrics.current
  val imeVisible = WindowInsets.isImeVisible
  val work = state.work
  val temporary = state.temporary
  val hour = remember { java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY) }
  val contextualSuggestion = when (hour) { in 5..11 -> nexusCopy("Organizza la mia giornata", "Plan my day") to Icons.AutoMirrored.Outlined.EventNote; in 12..17 -> nexusCopy("Riassumi ciò che devo completare", "Summarize what I need to finish") to Icons.Outlined.Checklist; else -> nexusCopy("Prepara le priorità di domani", "Plan tomorrow's priorities") to Icons.Outlined.Schedule }
  val suggestionPool = buildList {
      add(contextualSuggestion)
      if (state.pairingAvailable && state.connection == NexusConnection.ONLINE) add(nexusCopy("Continua un’attività dal mio PC", "Continue a task from my PC") to Icons.Outlined.Computer)
      if (state.pairingAvailable && state.devices.isNotEmpty()) add(nexusCopy("Riepiloga il lavoro tra i miei dispositivi", "Summarize work across my devices") to Icons.Outlined.Devices)
      if (state.pendingCount > 0) add(nexusCopy("Rivedi ciò che è rimasto in coda", "Review what's still queued") to Icons.Outlined.CloudSync)
      add(nexusCopy("Analizza un documento", "Analyze a document") to Icons.Outlined.Description)
      add(nexusCopy("Cerca e confronta informazioni", "Research and compare information") to Icons.Outlined.Language)
      add(nexusCopy("Aiutami a programmare", "Help me code") to Icons.Outlined.Code)
      add(nexusCopy("Trasforma un’idea in un piano", "Turn an idea into a plan") to Icons.Outlined.AutoAwesome)
      add(nexusCopy("Scrivi o modifica un testo", "Write or edit text") to Icons.Outlined.Edit)
  }
  val suggestionSeed = remember(state.conversationId) { (state.conversationId.hashCode() xor (System.currentTimeMillis() / 86_400_000L).toInt()) and Int.MAX_VALUE }
  val suggestions = remember(suggestionSeed, state.status, state.devices.size, state.pendingCount, imeVisible) {
      val contextual = suggestionPool.first()
      listOf(contextual, suggestionPool[(suggestionSeed % (suggestionPool.size - 1)) + 1], suggestionPool[((suggestionSeed / 7 + 2) % (suggestionPool.size - 1)) + 1]).distinctBy { it.first }.take(if (imeVisible) 2 else 3)
  }
  var visible by remember { mutableStateOf(false) }
  val haptic = LocalHapticFeedback.current
  LaunchedEffect(Unit) { kotlinx.coroutines.delay(55); visible = true }
  Box(Modifier.fillMaxSize().padding(horizontal = metrics.horizontalPadding)) {
    NexusParticlePresence(state, Modifier.fillMaxSize(), motionSuspended)
    AnimatedVisibility(!temporary && !work && visible && !imeVisible, modifier = Modifier.align(Alignment.Center), enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
      Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(bottom = 118.dp)) {
        NexusAmbientMark(state.reduceMotion)
        Spacer(Modifier.height(18.dp))
        Text(nexusCopy("Dove iniziamo?", "Where should we start?"), color = Ice, fontSize = 25.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium, letterSpacing = (-.55).sp)
        Text(if (state.remoteWorkAvailable || state.pairingAvailable) nexusCopy("Una conversazione, un’idea o un lavoro sul tuo PC.", "A conversation, an idea, or work on your PC.") else nexusCopy("Una conversazione, un’idea o un obiettivo.", "A conversation, an idea, or a goal."), color = Mist, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
      }
    }
    AnimatedVisibility(temporary && visible, modifier = Modifier.align(if (imeVisible) Alignment.TopCenter else Alignment.Center), enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
      Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 520.dp).padding(top = if (imeVisible) 24.dp else 0.dp, bottom = if (imeVisible) 0.dp else if (metrics.landscape) 18.dp else 80.dp)) { Box(Modifier.size(if (imeVisible) 48.dp else 58.dp).background(Cyan.copy(alpha = .14f), CircleShape).border(1.dp, Cyan.copy(alpha = .72f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.LockClock, null, tint = Cyan, modifier = Modifier.size(if (imeVisible) 24.dp else 29.dp)) }; Spacer(Modifier.height(if (imeVisible) 12.dp else 18.dp)); Text(nexusCopy("Chat temporanea", "Temporary chat"), fontSize = if (imeVisible) 22.sp else 24.sp, fontWeight = FontWeight.SemiBold); Text(if (imeVisible) nexusCopy("Non verrà salvata", "Won't be saved") else nexusCopy("Questa conversazione non viene salvata.\nTocca di nuovo l’icona in alto per tornare indietro.", "This conversation won't be saved.\nTap the icon above again to go back."), color = Mist, fontSize = if (imeVisible) 14.sp else 15.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 7.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
    }
    // Quando compare l'IME lo spazio verticale cambia drasticamente: smontare il
    // pannello evita collisioni e lascia al composer Work una superficie pulita.
    AnimatedVisibility(work && !temporary && visible && !imeVisible, modifier = Modifier.align(Alignment.Center), enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) { WorkIdentityPanel(state, dispatch) }
    Column(Modifier.fillMaxSize().widthIn(max = 620.dp).wrapContentWidth(Alignment.CenterHorizontally).padding(top = 18.dp, bottom = 5.dp), verticalArrangement = Arrangement.Bottom) {
    AnimatedVisibility(!temporary && !work && visible, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
      Column {
        suggestions.forEach { suggestion -> Surface(color = Color.Transparent, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().clickable { if (state.hapticsEnabled) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); dispatch("draft", suggestion.first) }) { Row(Modifier.padding(horizontal = 12.dp, vertical = if (imeVisible) 7.dp else 10.dp), verticalAlignment = Alignment.CenterVertically) { Icon(suggestion.second, null, tint = Cyan.copy(alpha = .74f), modifier = Modifier.size(if (imeVisible) 19.dp else 21.dp)); Spacer(Modifier.width(15.dp)); Text(suggestion.first, color = Color(0xFFE8EEEE), style = if (imeVisible) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis) } } }
      }
    }
    }
  }
}

@Composable private fun NexusAmbientMark(reduceMotion: Boolean) {
    val rotation = nexusLoopFloat(!reduceMotion, 0f, 360f, 5200, RepeatMode.Restart, "presenceOrbit")
    val breath = nexusLoopFloat(!reduceMotion, .82f, 1f, 1400, RepeatMode.Reverse, "presenceBreath", disabledValue = 1f)
    val accessibilityLabel = nexusCopy("NexusNXS pronto", "NexusNXS ready")
    Canvas(Modifier.size(66.dp).graphicsLayer { rotationZ = if (reduceMotion) 0f else rotation; alpha = if (reduceMotion) 1f else .86f + breath * .14f }.semantics { contentDescription = accessibilityLabel }) {
        val center = center
        val radius = size.minDimension * .30f
        drawCircle(Brush.radialGradient(listOf(Cyan.copy(alpha = .15f), Color.Transparent), center, size.minDimension * .5f), size.minDimension * .5f, center)
        drawArc(Cyan.copy(alpha = .72f), -68f, 244f, false, androidx.compose.ui.geometry.Offset(center.x - radius, center.y - radius), androidx.compose.ui.geometry.Size(radius * 2f, radius * 2f), style = androidx.compose.ui.graphics.drawscope.Stroke(1.5.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round))
        drawArc(Ice.copy(alpha = .48f), 108f, 72f, false, androidx.compose.ui.geometry.Offset(center.x - radius * .72f, center.y - radius * .72f), androidx.compose.ui.geometry.Size(radius * 1.44f, radius * 1.44f), style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round))
        repeat(3) { index ->
            val angle = .42f + index * 2.094f
            drawCircle(Cyan.copy(alpha = .42f + index * .12f), (1.25f + index * .18f).dp.toPx(), androidx.compose.ui.geometry.Offset(center.x + kotlin.math.cos(angle) * radius, center.y + kotlin.math.sin(angle) * radius))
        }
        drawCircle(Cyan.copy(alpha = .16f), radius * .34f, center)
        drawCircle(Ice.copy(alpha = .88f), 2.15.dp.toPx(), center)
    }
}

private data class MobileParticle(val x: Float, val y: Float, val depth: Float, val phase: Float, val size: Float)

/** Versione mobile del tessuto particellare desktop: identità, stato e profondità con un solo Canvas. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable private fun NexusParticlePresence(state: NexusUiState, modifier: Modifier = Modifier, motionSuspended: Boolean = false) {
    val metrics = LocalNexusMetrics.current
    val imeVisible = WindowInsets.isImeVisible
    // Il drawer copre quasi completamente la scena: sospendere il Canvas evita
    // ricomposizioni inutili proprio durante la gesture più sensibile ai frame.
    if (state.drawer || motionSuspended) return
    val particleCount = if (state.reduceMotion || imeVisible) (metrics.particleBudget / 2).coerceAtLeast(28) else metrics.particleBudget
    val allParticles = remember {
        val seed = 73L
        val random = java.util.Random(seed)
        List(104) {
            MobileParticle(random.nextFloat(), random.nextFloat(), random.nextFloat(), random.nextFloat() * 6.283f, .65f + random.nextFloat() * 1.65f)
        }
    }
    val positionX = remember { FloatArray(104) }
    val positionY = remember { FloatArray(104) }
    val visibleParticleCount by animateFloatAsState(particleCount.toFloat(), tween(NexusFlow.PARTICLE_BUDGET, easing = NexusFlow.standard), label = "particleBudget")
    val tick = nexusLoopFloat(!state.reduceMotion, 0f, 1f, NexusFlow.PARTICLE_TICK, RepeatMode.Restart, "particleTick", linear = true)
    // L'uptime è un orologio assoluto: ricomposizione, tastiera, rotazione e cambio
    // del budget non possono riportare il campo alla fase iniziale.
    val time = if (state.reduceMotion) 0f else (SystemClock.uptimeMillis() % 1_800_000L).toFloat() / 14_000f + tick * .0001f
    val presence = state.presence()
    val targetEnergy = when {
        state.error != null -> .46f
        state.busy && state.work -> .82f
        state.busy -> .68f
        state.work -> .34f
        else -> .22f
    }
    val energy = targetEnergy
    // Palette generata dal contratto condiviso con Core desktop, Presence e NexusNXS AI.
    val accent = when (presence) {
        NexusPresence.ERROR -> Color(NexusInteractionStates.ERROR)
        NexusPresence.EXECUTING -> Color(NexusInteractionStates.EXECUTING)
        NexusPresence.THINKING -> Color(NexusInteractionStates.THINKING)
        NexusPresence.RESPONDING -> Color(NexusInteractionStates.RESPONDING)
        NexusPresence.LISTENING -> Color(NexusInteractionStates.LISTENING)
        NexusPresence.CONNECTING -> Color(NexusInteractionStates.BOOTING)
        NexusPresence.OFFLINE -> Color(NexusInteractionStates.OFFLINE)
        else -> Color(if (state.work) NexusInteractionStates.LISTENING else NexusInteractionStates.IDLE)
    }
    val visibility = if (imeVisible) .12f else if (state.turns.isEmpty()) .72f else .08f
    val accessibilityLabel = nexusCopy("Presenza NexusNXS", "NexusNXS presence") + " · ${presence.label()}"
    Canvas(modifier.alpha(visibility).semantics { contentDescription = accessibilityLabel }) {
        val centerY = size.height * when { imeVisible -> .28f; metrics.landscape -> .38f; else -> .44f }
        val bandHeight = size.height * when { metrics.landscape -> .34f; state.work -> .28f; else -> .23f }
        val path = Path()
        allParticles.forEachIndexed { index, particle ->
            val horizontalDrift = sin(time * (.16f + particle.depth * .12f) + particle.phase) * (5f + particle.depth * 12f)
            val px = (particle.x * size.width + horizontalDrift).coerceIn(0f, size.width)
            val normalizedX = particle.x * 2f - 1f
            val fold = kotlin.math.exp(-(normalizedX * normalizedX) * 2.3f)
            val longWave = sin(normalizedX * 5.2f + time * (.32f + energy) + particle.phase)
            val cross = cos(particle.y * 7.4f - time * .38f + particle.phase)
            val py = centerY + (particle.y - .5f) * bandHeight + longWave * (8f + energy * 20f) + cross * 5f - fold * (18f + energy * 26f)
            positionX[index] = px
            positionY[index] = py
        }
        // Filamenti radi collegano solo vicini della stessa profondità: nessuna rete pesante o caotica.
        if (!state.reduceMotion) for (index in 1 until kotlin.math.ceil(visibleParticleCount).toInt().coerceAtMost(allParticles.size) step 9) {
            val fromX = positionX[index - 1]; val fromY = positionY[index - 1]
            val toX = positionX[index]; val toY = positionY[index]
            path.reset(); path.moveTo(fromX, fromY); path.quadraticTo((fromX + toX) * .5f, (fromY + toY) * .5f - 8f * energy, toX, toY)
            drawPath(path, accent.copy(alpha = (if (imeVisible) .018f else .035f) + energy * .025f), style = Stroke(width = .7f))
        }
        allParticles.forEachIndexed { index, particle ->
            val activation = (visibleParticleCount - index).coerceIn(0f, 1f)
            if (activation <= 0f) return@forEachIndexed
            val focus = 1f - kotlin.math.abs(particle.x - .52f)
            val alpha = (.06f + particle.depth * .20f + focus * energy * .12f).coerceAtMost(.38f) * activation
            drawCircle(color = accent.copy(alpha = alpha), radius = particle.size * density * (.72f + energy * .34f), center = androidx.compose.ui.geometry.Offset(positionX[index], positionY[index]))
        }
        drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = .11f * energy), Color.Transparent)), radius = size.minDimension * .34f, center = androidx.compose.ui.geometry.Offset(size.width * .54f, centerY - 8f))
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable private fun WorkIdentityPanel(state: NexusUiState, dispatch: (String, String) -> Unit) {
    val metrics = LocalNexusMetrics.current
    val compactHeight = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() } < 700.dp || metrics.landscape
    var detailsVisible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(85); detailsVisible = true }
    Column(Modifier.fillMaxWidth().widthIn(max = 520.dp).padding(bottom = if (compactHeight) 8.dp else 42.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(if (compactHeight) 62.dp else 72.dp).background(Brush.radialGradient(listOf(Cyan.copy(alpha = .14f), Cyan.copy(alpha = .035f))), CircleShape).border(1.dp, Cyan.copy(alpha = .34f), CircleShape), contentAlignment = Alignment.Center) {
            NexusAmbientMark(state.reduceMotion)
        }
        Spacer(Modifier.height(if (compactHeight) 14.dp else 20.dp))
        Text(nexusCopy("Cuore NexusNXS", "NexusNXS Core"), color = Ice, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Medium, letterSpacing = (-.45).sp)
        Text(nexusCopy("Descrivi il risultato. NexusNXS prepara il piano e chiede conferma prima di agire.", "Describe the outcome. NexusNXS prepares a plan and asks before taking action."), color = Mist, fontSize = 14.sp, lineHeight = 21.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(start = 18.dp, top = 7.dp, end = 18.dp))
        Row(Modifier.padding(top = if (compactHeight) 12.dp else 18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.VerifiedUser, null, tint = Color(0xFF69DCAE), modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(7.dp))
            Text(nexusCopy("Checkpoint e autorizzazioni verificabili", "Verifiable checkpoints and permissions"), color = Color(0xFF9DB6B6), fontSize = 12.sp)
        }
        AnimatedVisibility(detailsVisible, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
            FlowRow(Modifier.fillMaxWidth().padding(top = 15.dp), horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(7.dp), maxItemsInEachRow = 3) {
                WorkCapability(nexusCopy("Piano", "Plan"), Icons.Outlined.Checklist)
                WorkCapability(nexusCopy("Conferma", "Approval"), Icons.Outlined.VerifiedUser)
                WorkCapability(if (state.connection == NexusConnection.ONLINE) nexusCopy("PC pronto", "PC ready") else nexusCopy("Connessione automatica", "Auto-connect"), Icons.Outlined.Computer)
            }
        }
        if (state.wakeAvailable) TextButton({ dispatch("remote", "") }, modifier = Modifier.padding(top = 9.dp)) { Icon(Icons.Rounded.PowerSettingsNew, null, Modifier.size(17.dp)); Spacer(Modifier.width(7.dp)); Text(nexusCopy("Accensione privata", "Private wake")) }
    }
}

@Composable private fun WorkCapability(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(18.dp)).background(Surface.copy(alpha = .82f)).border(1.dp, Hairline.copy(alpha = .54f), RoundedCornerShape(18.dp)).padding(horizontal = 11.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = Cyan.copy(alpha = .88f), modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color(0xFFDCE6E6), style = MaterialTheme.typography.labelMedium)
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable private fun TurnCard(turn: Turn, turnIndex: Int, canRegenerate: Boolean, dispatch: (String, String) -> Unit, search: String = "", state: NexusUiState = NexusUiState()) {
    val user = turn.role == "user"
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    var actionsOpen by remember { mutableStateOf(false) }
    var transparencyOpen by remember { mutableStateOf(false) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
      val messageMaxWidth = this.maxWidth * if (user) .84f else 1f
      Column(Modifier.fillMaxWidth(), horizontalAlignment = if (user) Alignment.End else Alignment.Start) {
        Row(Modifier.padding(start = if (user) 0.dp else 2.dp, end = if (user) 10.dp else 0.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!user) Box(Modifier.size(5.dp).background(Cyan.copy(alpha = .88f), CircleShape))
            Text(if (user) nexusCopy("TU", "YOU") else "NEXUSNXS", color = Color(0xFF648485), fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp, modifier = Modifier.padding(start = if (user) 0.dp else 7.dp, end = if (user) 7.dp else 0.dp))
            if (user) Box(Modifier.size(5.dp).background(Color(0xFFAFC4C5).copy(alpha = .72f), CircleShape))
        }
        Surface(color = when { search.isNotBlank() && turn.content.contains(search, true) -> Cyan.copy(alpha = .09f); user -> Surface2; else -> Color.Transparent }, shape = RoundedCornerShape(20.dp), modifier = Modifier.widthIn(max = messageMaxWidth).then(if (user) Modifier.border(1.dp, Hairline.copy(alpha = .48f), RoundedCornerShape(20.dp)) else Modifier).combinedClickable(onClick = {}, onLongClick = { haptic.performHapticFeedback(HapticFeedbackType.LongPress); actionsOpen = true })) {
            if (user) Text(turn.content, color = Ice, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp))
            else Column(Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 2.dp)) {
                ResponseContextHeader(turn.content, streaming = false)
                MarkdownMessage(turn.content)
            }
        }
        if (!user && turn.artifacts.isNotEmpty()) Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { turn.artifacts.forEach { WorkArtifactCard(it, state.reduceMotion) } }
        if (!user) Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            ResponseAction(Icons.Outlined.ContentCopy, nexusCopy("Copia risposta", "Copy response")) { context.copyToClipboard(turn.content); haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
            ResponseAction(Icons.AutoMirrored.Outlined.VolumeUp, nexusCopy("Ascolta risposta", "Read aloud")) { dispatch("speak", turn.content) }
            if (canRegenerate) ResponseAction(Icons.Outlined.Refresh, nexusCopy("Rigenera risposta", "Regenerate response")) { dispatch("regenerate", "") }
            ResponseAction(Icons.Rounded.MoreHoriz, nexusCopy("Altre azioni", "More actions")) { actionsOpen = true }
        }
      }
    }
    if (actionsOpen) ModalBottomSheet(onDismissRequest = { actionsOpen = false }, containerColor = Surface, shape = NexusSheetShape, dragHandle = { BottomSheetDefaults.DragHandle(color = Mist) }) {
        Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 26.dp)) {
            Text(if (user) nexusCopy("Il tuo messaggio", "Your message") else nexusCopy("Risposta NexusNXS", "NexusNXS response"), color = Mist, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
            SheetAction(Icons.Outlined.ContentCopy, nexusCopy("Copia", "Copy"), nexusCopy("Copia il testo negli appunti", "Copy text to clipboard")) { context.copyToClipboard(turn.content); actionsOpen = false }
            if (user) SheetAction(Icons.AutoMirrored.Outlined.CallSplit, nexusCopy("Modifica e continua", "Edit and continue"), nexusCopy("Crea una diramazione senza perdere l’originale", "Create a branch without losing the original")) { dispatch("editTurn", "$turnIndex\n${turn.content.substringBefore("\n\nAllegato:")}"); actionsOpen = false }
            if (!user) SheetAction(Icons.AutoMirrored.Outlined.VolumeUp, nexusCopy("Ascolta", "Read aloud"), nexusCopy("Leggi la risposta; tocca di nuovo per interrompere", "Read the response; tap again to stop")) { dispatch("speak", turn.content); actionsOpen = false }
            if (!user && !state.temporary && canRegenerate && state.pairingAvailable) SheetAction(Icons.Outlined.Computer, nexusCopy("Continua sul PC", "Continue on PC"), nexusCopy("Apri questa conversazione sulla workstation", "Open this conversation on your workstation")) { dispatch("continueOnPc", ""); actionsOpen = false }
            if (!user && !state.temporary) SheetAction(Icons.Outlined.ThumbUp, nexusCopy("Migliora NexusNXS", "Improve NexusNXS"), nexusCopy("Invia questa domanda e risposta in quarantena per revisione", "Send this prompt and response to quarantine for review")) { dispatch("approveTraining", turn.content); actionsOpen = false }
            if (!user) SheetAction(Icons.Outlined.Info, nexusCopy("Dettagli risposta", "Response details"), nexusCopy("Modello, memoria e strumenti utilizzati", "Model, memory, and tools used")) { transparencyOpen = true; actionsOpen = false }
            SheetAction(Icons.Outlined.Share, nexusCopy("Condividi", "Share"), nexusCopy("Invia il contenuto a un’altra app", "Send the content to another app")) { context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, turn.content), context.nexusCopy("Condividi messaggio", "Share message"))); actionsOpen = false }
            if (canRegenerate) SheetAction(Icons.Outlined.Refresh, nexusCopy("Rigenera", "Regenerate"), nexusCopy("Crea una nuova versione della risposta", "Create a new version of the response")) { actionsOpen = false; dispatch("regenerate", "") }
        }
    }
    if (transparencyOpen) ModalBottomSheet(onDismissRequest = { transparencyOpen = false }, containerColor = Surface, shape = NexusSheetShape, dragHandle = { BottomSheetDefaults.DragHandle(color = Mist) }) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(nexusCopy("Dettagli risposta", "Response details"), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 10.dp))
            TransparencyLine(nexusCopy("Modello", "Model"), state.model)
            TransparencyLine(nexusCopy("Elaborazione", "Processing"), when { state.pairingAvailable && state.connection == NexusConnection.ONLINE -> "Workstation NexusNXS"; state.connection == NexusConnection.ONLINE -> nexusCopy("Server NexusNXS", "NexusNXS servers"); else -> nexusCopy("Coda locale protetta", "Protected local queue") })
            TransparencyLine(nexusCopy("Memoria", "Memory"), nexusCopy("Contesto della conversazione", "Conversation context"))
            TransparencyLine(nexusCopy("Strumenti", "Tools"), if (state.remoteWorkAvailable && state.work) nexusCopy("Azioni Cuore autorizzate", "Authorized Core actions") else nexusCopy("Nessuna azione di sistema", "No system actions"))
        }
    }
}

@Composable private fun ResponseAction(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, click: () -> Unit) {
    IconButton(click, Modifier.size(40.dp)) { Icon(icon, description, tint = Color(0xFFAEBABB), modifier = Modifier.size(20.dp)) }
}

@Composable private fun WorkArtifactCard(artifact: WorkArtifact, reduceMotion: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    Surface(color = Color(0xFF091516), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .65f)), modifier = Modifier.fillMaxWidth().animateContentSize(tween(if (reduceMotion) NexusFlow.REDUCED else NexusFlow.ENTER, easing = NexusFlow.emphasized))) {
        Column {
            Row(Modifier.fillMaxWidth().clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); expanded = !expanded }.padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text(artifact.title, color = Ice, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(artifact.subtitle.ifBlank { "Risultato operativo" }, color = Mist, fontSize = 10.sp) }
                if (artifact.added > 0) Text("+${artifact.added}", color = Color(0xFF69DCAE), fontSize = 11.sp, modifier = Modifier.padding(start = 8.dp))
                if (artifact.removed > 0) Text("−${artifact.removed}", color = Color(0xFFFF8E9A), fontSize = 11.sp, modifier = Modifier.padding(start = 6.dp))
                Icon(if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, if (expanded) "Chiudi dettaglio" else "Apri dettaglio", tint = Mist, modifier = Modifier.padding(start = 8.dp).size(18.dp))
            }
            AnimatedVisibility(expanded, enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
                Column(Modifier.fillMaxWidth().background(Color(0xFF050B0C)).padding(12.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(artifact.language.ifBlank { nexusCopy("testo", "text") }, color = Mist, fontSize = 10.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f)); IconButton({ context.copyToClipboard(artifact.content) }, Modifier.size(30.dp)) { Icon(Icons.Rounded.ContentCopy, nexusCopy("Copia codice", "Copy code"), tint = Mist, modifier = Modifier.size(15.dp)) } }
                    Text(artifact.content.ifBlank { nexusCopy("Nessun output.", "No output.") }, color = Color(0xFFD4E7E7), fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 18.sp, maxLines = 42, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable private fun TransparencyLine(label: String, value: String) = Row(Modifier.fillMaxWidth()) { Text(label.uppercase(), color = Color(0xFF557879), fontSize = 9.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.width(84.dp)); Text(value, color = Color(0xFFB6C7C7), fontSize = 11.sp, modifier = Modifier.weight(1f)) }

@Composable private fun MarkdownMessage(value: String, streamingTailChars: Int = 0, streamingAccent: Float = 0f) {
    val context = LocalContext.current
    val sections = value.split("```")
    val lastContentLine = value.lineSequence().lastOrNull { it.isNotBlank() }
    val tailColor = androidx.compose.ui.graphics.lerp(Ice, Cyan, streamingAccent.coerceIn(0f, 1f) * .72f)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        sections.forEachIndexed { index, raw ->
            if (raw.isBlank()) return@forEachIndexed
            if (index % 2 == 1) {
                val code = raw.substringAfter('\n', raw).trimEnd()
                Surface(color = Color(0xFF0B1217), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF9CB5FF).copy(alpha = .14f)), modifier = Modifier.fillMaxWidth()) {
                    Column { Row(Modifier.fillMaxWidth().background(Color(0xFF141D25)).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) { Text(raw.lineSequence().firstOrNull()?.takeIf { !it.contains(' ') }.orEmpty().ifBlank { nexusCopy("codice", "code") }.uppercase(), color = Color(0xFF8298B2), fontSize = 9.sp, letterSpacing = 1.sp, modifier = Modifier.weight(1f)); IconButton({ context.copyToClipboard(code) }, Modifier.size(32.dp)) { Icon(Icons.Rounded.ContentCopy, nexusCopy("Copia codice", "Copy code"), tint = Color(0xFFA8B8C8), modifier = Modifier.size(15.dp)) } }; HighlightedCodeText(code, Modifier.padding(13.dp)) }
                }
            } else normalizeMathBlocks(raw).lines().forEach { line ->
                when {
                    line.startsWith("§NEXUS_MATH§") -> Surface(color = Color(0xFF071415), shape = RoundedCornerShape(15.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .14f)), modifier = Modifier.fillMaxWidth()) {
                        Text(line.removePrefix("§NEXUS_MATH§"), color = Color(0xFFE7FEFF), fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 27.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp))
                    }
                    line.startsWith("### ") -> InlineMarkdownText(line.removePrefix("### "), MaterialTheme.typography.titleMedium, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                    line.startsWith("## ") -> InlineMarkdownText(line.removePrefix("## "), MaterialTheme.typography.titleLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                    line.startsWith("# ") -> InlineMarkdownText(line.removePrefix("# "), MaterialTheme.typography.headlineMedium, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                    line.startsWith("- ") || line.startsWith("* ") -> Row(Modifier.fillMaxWidth()) { Text("•", color = Ice, style = MaterialTheme.typography.bodyLarge); Spacer(Modifier.width(10.dp)); Box(Modifier.weight(1f)) { InlineMarkdownText(line.drop(2), MaterialTheme.typography.bodyLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor) } }
                    Regex("^>\\s*\\[!(NOTE|TIP|WARNING|RESULT)]", RegexOption.IGNORE_CASE).containsMatchIn(line) -> {
                        val tone = Regex("^>\\s*\\[!(NOTE|TIP|WARNING|RESULT)]", RegexOption.IGNORE_CASE).find(line)?.groupValues?.get(1)?.uppercase().orEmpty()
                        val accent = when (tone) { "TIP" -> Color(0xFF67DCA9); "WARNING" -> Color(0xFFEBB066); "RESULT" -> Color(0xFF8CB2FA); else -> Cyan }
                        val fallback = when (tone) { "TIP" -> nexusCopy("Suggerimento", "Tip"); "WARNING" -> nexusCopy("Attenzione", "Warning"); "RESULT" -> nexusCopy("Risultato", "Result"); else -> nexusCopy("Nota", "Note") }
                        val title = line.substringAfter(']').trim().ifBlank { fallback }
                        Surface(color = accent.copy(alpha = .065f), shape = RoundedCornerShape(4.dp, 15.dp, 15.dp, 4.dp), border = androidx.compose.foundation.BorderStroke(1.dp, accent.copy(alpha = .16f)), modifier = Modifier.fillMaxWidth()) { Text(title, color = accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp)) }
                    }
                    line.startsWith("> ") -> Row(Modifier.fillMaxWidth()) { Box(Modifier.width(3.dp).heightIn(min = 24.dp).background(Cyan.copy(alpha = .58f), CircleShape)); Spacer(Modifier.width(12.dp)); Box(Modifier.weight(1f)) { InlineMarkdownText(line.drop(2), MaterialTheme.typography.bodyMedium, Color(0xFFD2DEDE)) } }
                    line.matches(Regex("^\\d+\\.\\s+.*")) -> Row(Modifier.fillMaxWidth()) { Text(line.substringBefore('.') + ".", color = Ice, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold)); Spacer(Modifier.width(10.dp)); Box(Modifier.weight(1f)) { InlineMarkdownText(line.substringAfter('.').trim(), MaterialTheme.typography.bodyLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor) } }
                    line.count { it == '|' } >= 2 && line.trim('|', ' ', ':', '-').isBlank() -> Unit
                    line.count { it == '|' } >= 2 -> Surface(color = Surface, shape = RoundedCornerShape(10.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .55f)), modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 9.dp)) {
                            line.trim('|').split('|').forEach { cell ->
                                InlineMarkdownText(cell.trim(), MaterialTheme.typography.bodyMedium, Ice, modifier = Modifier.widthIn(min = 112.dp, max = 220.dp).padding(horizontal = 6.dp))
                            }
                        }
                    }
                    line.isNotBlank() -> InlineMarkdownText(line, MaterialTheme.typography.bodyLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                }
            }
        }
    }
}

@Composable private fun HighlightedCodeText(value: String, modifier: Modifier = Modifier) {
    val highlighted = remember(value) {
        buildAnnotatedString {
            val tokenPattern = Regex("(//.*$|#.*$|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|\\b(?:const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|async|await|try|catch|throw|new|true|false|null|undefined|def|self|elif|except|with|as|SELECT|FROM|WHERE|JOIN|CREATE|TABLE|INSERT|UPDATE|DELETE)\\b|\\b\\d+(?:\\.\\d+)?\\b)", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE))
            var cursor = 0
            tokenPattern.findAll(value).forEach { match ->
                append(value.substring(cursor, match.range.first))
                val token = match.value
                val tokenColor = when {
                    token.startsWith("//") || token.startsWith("#") -> Color(0xFF657C80)
                    token.startsWith('"') || token.startsWith('\'') -> Color(0xFF9AD8BD)
                    token.firstOrNull()?.isDigit() == true -> Color(0xFFDEB98A)
                    else -> Color(0xFFA7BAFF)
                }
                pushStyle(SpanStyle(color = tokenColor)); append(token); pop()
                cursor = match.range.last + 1
            }
            append(value.substring(cursor))
        }
    }
    Text(highlighted, color = Color(0xFFBEDCDB), fontFamily = FontFamily.Monospace, fontSize = 12.5.sp, lineHeight = 19.sp, modifier = modifier)
}

@Composable private fun InlineMarkdownText(value: String, style: TextStyle, color: Color, accentTailChars: Int = 0, accentColor: Color = color, modifier: Modifier = Modifier) {
    val displayValue = remember(value) { normalizeInlineMath(value) }
    val annotated = remember(displayValue, color, accentTailChars, accentColor) {
        buildAnnotatedString {
            var cursor = 0
            Regex("(\\*\\*[^*]+\\*\\*|`[^`]+`|\\*[^*\\n]+\\*|\\[[^]]+]\\(https://[^)\\s]+\\))").findAll(displayValue).forEach { match ->
                append(displayValue.substring(cursor, match.range.first))
                val raw = match.value
                if (raw.startsWith("**")) {
                    pushStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = color)); append(raw.removeSurrounding("**")); pop()
                } else if (raw.startsWith("`")) {
                    pushStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Surface2, color = Color(0xFFD9E8E8))); append(raw.removeSurrounding("`")); pop()
                } else if (raw.startsWith("[")) {
                    val label = raw.substringAfter('[').substringBefore("](")
                    val url = raw.substringAfter("](").removeSuffix(")")
                    withLink(LinkAnnotation.Url(url, TextLinkStyles(style = SpanStyle(color = Cyan, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline)))) { append(label) }
                } else {
                    pushStyle(SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, color = color.copy(alpha = .92f))); append(raw.removeSurrounding("*")); pop()
                }
                cursor = match.range.last + 1
            }
            append(displayValue.substring(cursor))
            if (accentTailChars > 0 && length > 0) addStyle(SpanStyle(color = accentColor), (length - accentTailChars).coerceAtLeast(0), length)
        }
    }
    Text(annotated, color = color, style = style, modifier = modifier)
}

/** Un solo flusso nativo per foto, fotocamera e documenti in ogni superficie Android. */
@Composable private fun NexusAttachmentFlow(
    visible: Boolean,
    close: () -> Unit,
    dispatch: (String, String) -> Unit,
    remoteWorkAvailable: Boolean,
    planMode: () -> Unit
) {
    val context = LocalContext.current
    fun selectUri(uri: Uri?) {
        uri?.takeIf { it.scheme.equals("content", ignoreCase = true) } ?: return
        val mime = context.contentResolver.getType(uri).orEmpty().lowercase(Locale.ROOT)
        val supported = mime.startsWith("text/") || mime in setOf("image/jpeg", "image/png", "image/webp", "application/pdf", "application/json", "application/xml")
        if (!supported) {
            android.widget.Toast.makeText(context, context.nexusCopy("Formato non supportato.", "Unsupported format."), android.widget.Toast.LENGTH_SHORT).show()
            close()
            return
        }
        dispatch("attach", JSONObject()
            .put("name", uri.lastPathSegment?.substringAfterLast('/')?.replace(Regex("[\\p{Cntrl}]"), "")?.take(120) ?: "Allegato")
            .put("uri", uri.toString())
            .put("mime", mime.take(80))
            .toString())
        close()
    }
    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument(), ::selectUri)
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent(), ::selectUri)
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val uri = pendingCameraUri
        if (captured && uri != null) selectUri(uri)
        else uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
        pendingCameraUri = null
    }
    fun launchCamera() {
        val directory = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(directory, "Foto-${System.currentTimeMillis()}.jpg")
        val captureUri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        pendingCameraUri = captureUri
        camera.launch(captureUri)
    }
    if (visible) AttachmentPicker(
        close = close,
        gallery = { photoPicker.launch("image/*") },
        camera = ::launchCamera,
        document = { documentPicker.launch(arrayOf("application/pdf", "text/*", "application/json", "application/xml")) },
        remoteWorkAvailable = remoteWorkAvailable,
        planMode = planMode
    )
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable private fun NexusComposer(state: NexusComposerState, dispatch: (String, String) -> Unit) {
    val metrics = LocalNexusMetrics.current
    val density = LocalDensity.current
    var attachmentSheet by remember { mutableStateOf(false) }
    var voicePanel by remember { mutableStateOf(false) }
    var fullScreenDraft by remember { mutableStateOf(false) }
    var composerFocused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val interactionAvailable = state.connection == NexusConnection.ONLINE
    val imeVisible = WindowInsets.isImeVisible
    var imeWasVisible by remember { mutableStateOf(false) }
    val windowHeight = with(density) { LocalWindowInfo.current.containerSize.height.toDp() }
    BackHandler(imeVisible) {
        keyboard?.hide()
        focusManager.clearFocus(force = true)
    }
    LaunchedEffect(imeVisible) {
        if (imeVisible) {
            imeWasVisible = true
        } else if (imeWasVisible) {
            // Alcune tastiere (in particolare Samsung Keyboard) nascondono l'IME
            // senza togliere il focus al campo Compose. Allineiamo i due stati per
            // riportare Work alla barra compatta nello stesso frame di Back o swipe.
            // Il precedente ritardo creava un secondo assestamento visibile.
            focusManager.clearFocus(force = true)
            imeWasVisible = false
        }
    }
    LaunchedEffect(state.connection) {
        if (!interactionAvailable) {
            keyboard?.hide()
            focusManager.clearFocus(force = true)
            attachmentSheet = false
            voicePanel = false
            fullScreenDraft = false
        }
    }
    val composerDispatch: (String, String) -> Unit = { action, value ->
        if (action == "send") {
            // Il messaggio entra nello stato prima della chiamata di rete; togliere
            // subito focus e IME lascia visibile la conversazione e il suo streaming.
            keyboard?.hide()
            focusManager.clearFocus(force = true)
        }
        dispatch(action, value)
    }
    val composerBorder by animateColorAsState(when { state.temporary -> Cyan.copy(alpha = .58f); state.work && (composerFocused || imeVisible) -> Cyan.copy(alpha = .46f); state.draft.isNotBlank() || state.busy -> Cyan.copy(alpha = .36f); state.work -> Cyan.copy(alpha = .24f); else -> Hairline }, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "composerBorder")
    val composerSurface by animateColorAsState(when { state.temporary -> Color(0xFF102526); state.work && (composerFocused || imeVisible) -> Color(0xFF132324); else -> Surface }, tween(NexusFlow.ENTER, easing = NexusFlow.standard), label = "composerSurface")
    val composerElevation = if (composerFocused || state.draft.isNotBlank() || state.busy) 8.dp else 3.dp
    val composerShape = RoundedCornerShape(28.dp)
    // Come nelle chat mobile più curate, a tastiera chiusa il composer torna sempre
    // alla barra essenziale. Work rivela modello e seconda riga solo durante la scrittura.
    var layoutDraftLines by remember { mutableIntStateOf(1) }
    var measuredDraftLines by remember { mutableIntStateOf(1) }
    LaunchedEffect(state.draft, layoutDraftLines) {
        if (state.draft.isBlank()) {
            layoutDraftLines = 1
            measuredDraftLines = 1
        } else if (layoutDraftLines > measuredDraftLines) {
            // Crescita immediata: la nuova riga non deve mai restare compressa.
            measuredDraftLines = layoutDraftLines
        } else if (layoutDraftLines < measuredDraftLines) {
            // Una breve isteresi evita il rimbalzo tra due altezze vicino al wrap.
            kotlinx.coroutines.delay(90)
            if (layoutDraftLines < measuredDraftLines) measuredDraftLines = layoutDraftLines
        }
    }
    // Focus e IME possono divergere per un frame (specie con Samsung Keyboard).
    // Una sola sorgente visiva evita il doppio assestamento alla chiusura.
    val workExpanded = state.work && imeVisible
    val composerExpanded = workExpanded || measuredDraftLines > 1
    val availableComposerHeight = remember(windowHeight, metrics.landscape, imeVisible) {
        val fraction = if (metrics.landscape) .36f else .34f
        (windowHeight * fraction).coerceIn(90.dp, 286.dp)
    }
    val requestedComposerHeight = when {
        workExpanded -> 112.dp + ((measuredDraftLines - 1) * 22).dp
        composerExpanded -> 60.dp + ((measuredDraftLines - 1) * 22).dp
        else -> 60.dp
    }
    val targetComposerHeight = requestedComposerHeight.coerceAtMost(availableComposerHeight)
    val showDraftExpander = measuredDraftLines >= 5 || state.draft.length >= 280
    val composerViewportHeight by animateDpAsState(
        targetComposerHeight,
        tween(if (state.reduceMotion) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized),
        label = "composerHeight"
    )
    val composerTextStart by animateDpAsState(if (composerExpanded) 14.dp else 16.dp, tween(if (state.reduceMotion) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized), label = "composerTextStart")
    val composerTextEnd by animateDpAsState(if (composerExpanded) 14.dp else 56.dp, tween(if (state.reduceMotion) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized), label = "composerTextEnd")
    val composerTextTop by animateDpAsState(when { workExpanded -> 18.dp; composerExpanded -> 10.dp; else -> 18.dp }, tween(if (state.reduceMotion) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized), label = "composerTextTop")
    val composerTextBottom by animateDpAsState(if (composerExpanded) 52.dp else 6.dp, tween(if (state.reduceMotion) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized), label = "composerTextBottom")
    val composerTrailingOffset by animateDpAsState(if (composerExpanded) (-4).dp else (-6).dp, tween(if (state.reduceMotion) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized), label = "composerTrailingOffset")
    val slashSuggestions = remember(state.draft, state.slashCommands) {
        val match = Regex("^/([^\\s]*)$").find(state.draft.trim())
        if (match == null) emptyList() else {
            val query = match.groupValues[1].lowercase(Locale.ROOT)
            (state.slashCommands + builtinSlashCommands())
                .distinctBy { it.name }
                .filter { query.isBlank() || it.name.startsWith(query) || it.label.lowercase(Locale.getDefault()).contains(query) }
                .take(6)
        }
    }
    Box(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Ink.copy(alpha = .96f)), startY = 0f, endY = 34f))) {
    Column(Modifier.fillMaxWidth().widthIn(max = metrics.contentMaxWidth).wrapContentWidth(Alignment.CenterHorizontally).navigationBarsPadding().imePadding().padding(start = metrics.horizontalPadding, end = metrics.horizontalPadding, top = 13.dp, bottom = 10.dp)) {
        AnimatedVisibility(visible = state.connection != NexusConnection.ONLINE && !state.temporary, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
            ConnectionStatusStrip(state.connection, state.pendingCount) { dispatch("probe", "") }
        }
        AnimatedVisibility(state.attachment != null, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) { AttachmentPreview(state, { dispatch("attach", "") }) }
        AnimatedVisibility(slashSuggestions.isNotEmpty(), enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
            Surface(
                color = Surface.copy(alpha = .985f),
                shape = RoundedCornerShape(22.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .14f)),
                shadowElevation = 12.dp,
                modifier = Modifier.fillMaxWidth().padding(bottom = 9.dp)
            ) {
                Column(Modifier.padding(7.dp)) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(nexusCopy("COMANDI NEXUSNXS", "NEXUSNXS COMMANDS"), color = Mist, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.1.sp, modifier = Modifier.weight(1f))
                        Text(nexusCopy("Tocca per inserire", "Tap to insert"), color = Mist.copy(alpha = .62f), fontSize = 10.sp)
                    }
                    slashSuggestions.forEach { command ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).clickable { dispatch("draft", "/${command.name} ") }.padding(horizontal = 11.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("/${command.name}", color = Cyan, fontSize = 13.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, modifier = Modifier.widthIn(min = 92.dp))
                            Column(Modifier.weight(1f)) {
                                Text(command.label, color = Ice, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(command.description, color = Mist, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (command.custom) Text(nexusCopy("TUO", "YOURS"), color = Mist.copy(alpha = .66f), fontSize = 9.sp, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().height(composerViewportHeight), verticalAlignment = Alignment.Bottom) {
        Surface(color = Surface.copy(alpha = .94f), shape = CircleShape, shadowElevation = 3.dp, border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .68f)), modifier = Modifier.size(56.dp)) {
            IconButton({ attachmentSheet = true }, Modifier.fillMaxSize(), enabled = interactionAvailable) { Icon(Icons.Rounded.Add, nexusCopy("Allega", "Attach"), tint = if (interactionAvailable) Ice else Mist.copy(alpha = .52f), modifier = Modifier.size(30.dp)) }
        }
        Spacer(Modifier.width(10.dp))
        Surface(color = composerSurface, shape = composerShape, shadowElevation = composerElevation, tonalElevation = 1.dp, modifier = Modifier.weight(1f).height(composerViewportHeight).border(1.dp, composerBorder, composerShape)) {
                Box(Modifier.height(composerViewportHeight).padding(horizontal = 4.dp)) {
                    BasicTextField(
                        value = state.draft,
                        onValueChange = { dispatch("draft", it) },
                        enabled = interactionAvailable,
                        modifier = Modifier.onFocusChanged { composerFocused = it.isFocused }.fillMaxSize().padding(start = composerTextStart, end = composerTextEnd, top = composerTextTop, bottom = composerTextBottom),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ice),
                        cursorBrush = SolidColor(Cyan),
                        maxLines = 10,
                        onTextLayout = { layoutDraftLines = it.lineCount.coerceIn(1, 10) },
                        decorationBox = { inner ->
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
                                if (state.draft.isBlank()) Text(
                                    when {
                                        state.connection == NexusConnection.OFFLINE -> nexusCopy("Server offline", "Server offline")
                                        state.connection == NexusConnection.CHECKING -> nexusCopy("Connessione…", "Connecting…")
                                        state.work -> nexusCopy("Chiedi a Cuore", "Ask Core")
                                        else -> nexusCopy("Chiedi a NexusNXS", "Ask NexusNXS")
                                    },
                                    color = Mist,
                                    style = MaterialTheme.typography.bodyLarge,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Start,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                inner()
                            }
                        }
                    )
                    Box(Modifier.align(Alignment.BottomCenter)) { androidx.compose.animation.AnimatedVisibility(visible = workExpanded, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
                        TextButton({ dispatch("modelSheet", "") }, modifier = Modifier.height(48.dp).widthIn(max = if (showDraftExpander) 118.dp else 170.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) { Text(state.model, color = Ice, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis); Spacer(Modifier.width(2.dp)); Icon(Icons.Rounded.ExpandMore, null, tint = Mist, modifier = Modifier.size(17.dp)) }
                    } }
                    androidx.compose.animation.AnimatedVisibility(showDraftExpander, modifier = Modifier.align(Alignment.BottomEnd).offset(x = (-52).dp, y = (-4).dp), enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) {
                        IconButton({ fullScreenDraft = true }, Modifier.size(48.dp)) { Icon(Icons.Rounded.OpenInFull, nexusCopy("Espandi editor", "Expand editor"), tint = Mist, modifier = Modifier.size(20.dp)) }
                    }
                    Box(Modifier.align(Alignment.BottomEnd).offset { IntOffset(0, with(density) { composerTrailingOffset.roundToPx() }) }) { ComposerTrailing(state.busy, state.draft.isNotBlank(), interactionAvailable, state.reduceMotion, state.hapticsEnabled, { voicePanel = true }, composerDispatch) }
                }
        }
        }
    } }
    NexusAttachmentFlow(attachmentSheet && interactionAvailable, { attachmentSheet = false }, dispatch, state.remoteWorkAvailable, { attachmentSheet = false; dispatch("work", "") })
    if (voicePanel && interactionAvailable) ContinuousVoicePanel(state.reduceMotion, state.connection, state.draft, { dispatch("stopSpeech", "") }, { voicePanel = false }, { dispatch("draft", it) })
    if (fullScreenDraft && interactionAvailable) FullScreenDraftEditor(state, { fullScreenDraft = false }, dispatch)
}

@Composable private fun FullScreenDraftEditor(state: NexusComposerState, close: () -> Unit, dispatch: (String, String) -> Unit) {
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val reveal = remember { Animatable(.94f) }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(color = Ink, contentColor = Ice, modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = reveal.value; scaleY = reveal.value; alpha = ((reveal.value - .94f) / .06f).coerceIn(0f, 1f) }) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
                Row(Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(close, Modifier.size(48.dp)) { Icon(Icons.Rounded.CloseFullscreen, nexusCopy("Riduci editor", "Collapse editor"), modifier = Modifier.size(22.dp)) }
                    Text(if (state.work) nexusCopy("Istruzione Cuore", "Core instruction") else nexusCopy("Nuovo messaggio", "New message"), modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    TextButton(close, modifier = Modifier.heightIn(min = 48.dp)) { Text(nexusCopy("Fine", "Done"), color = Cyan, fontWeight = FontWeight.SemiBold) }
                }
                HorizontalDivider(color = Hairline.copy(alpha = .42f))
                BasicTextField(
                    value = state.draft,
                    onValueChange = { dispatch("draft", it) },
                    enabled = state.connection == NexusConnection.ONLINE,
                    modifier = Modifier.weight(1f).fillMaxWidth().focusRequester(focusRequester).padding(horizontal = 22.dp, vertical = 18.dp),
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ice, lineHeight = 25.sp),
                    cursorBrush = SolidColor(Cyan),
                    decorationBox = { inner -> Box(Modifier.fillMaxSize()) { if (state.draft.isBlank()) Text(if (state.work) nexusCopy("Descrivi il risultato che vuoi ottenere", "Describe the outcome you want") else nexusCopy("Chiedi a NexusNXS", "Ask NexusNXS"), color = Mist, style = MaterialTheme.typography.bodyLarge); inner() } }
                )
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(nexusCopy("La bozza viene salvata automaticamente", "Draft saved automatically"), color = Mist, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    FilledIconButton({ if (state.busy) dispatch("stop", "") else if (state.draft.isNotBlank()) { keyboard?.hide(); dispatch("send", ""); close() } }, enabled = state.busy || (state.connection == NexusConnection.ONLINE && state.draft.isNotBlank()), modifier = Modifier.size(44.dp), colors = IconButtonDefaults.filledIconButtonColors(containerColor = Cyan, contentColor = Color(0xFF002223), disabledContainerColor = Surface2, disabledContentColor = Mist)) { Icon(if (state.busy) Icons.Rounded.Stop else Icons.Rounded.ArrowUpward, null, modifier = Modifier.size(21.dp)) }
                }
            }
        }
    }
    LaunchedEffect(Unit) {
        reveal.animateTo(1f, tween(NexusFlow.QUICK, easing = NexusFlow.emphasized))
        focusRequester.requestFocus()
        keyboard?.show()
    }
}

@Composable private fun ComposerTrailing(busy: Boolean, hasDraft: Boolean, online: Boolean, reduceMotion: Boolean, hapticsEnabled: Boolean, voice: () -> Unit, dispatch: (String, String) -> Unit) {
    val voiceInteraction = remember { MutableInteractionSource() }
    val voicePressed by voiceInteraction.collectIsPressedAsState()
    val breath = nexusLoopFloat(!reduceMotion, 0f, 1f, 1380, RepeatMode.Reverse, "composerVoiceBreath")
    val voiceScale by animateFloatAsState(when { voicePressed -> .90f; reduceMotion -> 1f; else -> 1f + breath * .025f }, tween(NexusFlow.QUICK, easing = NexusFlow.emphasized), label = "composerVoiceScale")
    val voiceBackground by animateColorAsState(if (voicePressed) Cyan.copy(alpha = .20f) else Surface2.copy(alpha = .72f + if (reduceMotion) 0f else breath * .10f), tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "composerVoiceBackground")
    Box(Modifier.height(48.dp).width(52.dp), contentAlignment = Alignment.Center) {
        AnimatedVisibility(!busy && !hasDraft, enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
            IconButton(voice, Modifier.size(48.dp), enabled = online, interactionSource = voiceInteraction) { Box(Modifier.size(42.dp).graphicsLayer { scaleX = voiceScale; scaleY = voiceScale }.background(voiceBackground, CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Mic, nexusCopy("Avvia conversazione vocale", "Start voice conversation"), tint = if (online) Ice else Mist.copy(alpha = .52f), modifier = Modifier.size(21.dp)) } }
        }
        AnimatedVisibility(busy || hasDraft, enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
            ComposerSend(busy, hasDraft, online, reduceMotion, hapticsEnabled, dispatch)
        }
    }
}

@Composable private fun AttachmentPreview(state: NexusComposerState, remove: () -> Unit) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val bitmap = remember(state.attachmentUri, state.attachmentData, state.attachmentMime) {
        if (!state.attachmentMime.startsWith("image/")) null else runCatching {
            when {
                state.attachmentData.isNotBlank() -> BitmapFactory.decodeByteArray(Base64.decode(state.attachmentData, Base64.DEFAULT), 0, Base64.decode(state.attachmentData, Base64.DEFAULT).size)
                state.attachmentUri.isNotBlank() -> context.contentResolver.openInputStream(state.attachmentUri.toUri())?.use(BitmapFactory::decodeStream)
                else -> null
            }?.asImageBitmap()
        }.getOrNull()
    }
    Surface(color = Surface, shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline), modifier = Modifier.padding(bottom = 8.dp).widthIn(max = 260.dp).then(if (bitmap != null) Modifier.clickable { expanded = true } else Modifier)) {
        Row(Modifier.padding(7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(54.dp).clip(RoundedCornerShape(13.dp)).background(Surface2), contentAlignment = Alignment.Center) { if (bitmap != null) Image(bitmap, state.attachment.orEmpty(), Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Icon(Icons.Outlined.Description, null, tint = Cyan, modifier = Modifier.size(25.dp)) }
            Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(state.attachment.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(if (bitmap != null) nexusCopy("Immagine pronta", "Image ready") else nexusCopy("Documento pronto", "Document ready"), color = Mist, fontSize = 12.sp) }
            IconButton(remove, Modifier.size(48.dp)) { Icon(Icons.Rounded.Close, nexusCopy("Rimuovi allegato", "Remove attachment"), modifier = Modifier.size(19.dp)) }
        }
    }
    if (expanded && bitmap != null) Dialog(onDismissRequest = { expanded = false }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) { Box(Modifier.fillMaxSize().background(Ink).statusBarsPadding().navigationBarsPadding()) { Image(bitmap, state.attachment.orEmpty(), Modifier.fillMaxSize().padding(18.dp), contentScale = ContentScale.Fit); IconButton({ expanded = false }, Modifier.align(Alignment.TopEnd).padding(16.dp).size(50.dp).background(Surface.copy(alpha = .92f), CircleShape)) { Icon(Icons.Rounded.Close, "Chiudi anteprima", modifier = Modifier.size(26.dp)) } } }
}

@Composable private fun ComposerSend(busy: Boolean, hasDraft: Boolean, online: Boolean, reduceMotion: Boolean, hapticsEnabled: Boolean, dispatch: (String, String) -> Unit) {
    val haptic = LocalHapticFeedback.current
    FilledIconButton({ if (hapticsEnabled) haptic.performHapticFeedback(if (busy) HapticFeedbackType.LongPress else HapticFeedbackType.TextHandleMove); dispatch(if (busy) "stop" else "send", "") }, modifier = Modifier.size(40.dp), enabled = busy || (online && hasDraft), colors = IconButtonDefaults.filledIconButtonColors(containerColor = Cyan, contentColor = Color(0xFF002223), disabledContainerColor = Surface2, disabledContentColor = Mist)) {
        AnimatedContent(busy, transitionSpec = { nexusTransform(reduceMotion) }, label = "sendState") { active -> Icon(if (active) Icons.Rounded.Stop else Icons.Rounded.ArrowUpward, if (active) nexusCopy("Interrompi", "Stop") else nexusCopy("Invia", "Send"), modifier = Modifier.size(20.dp)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun AttachmentPicker(close: () -> Unit, gallery: () -> Unit, camera: () -> Unit, document: () -> Unit, remoteWorkAvailable: Boolean, planMode: () -> Unit) = ModalBottomSheet(onDismissRequest = close, containerColor = Surface, shape = NexusSheetShape, dragHandle = { BottomSheetDefaults.DragHandle(color = Mist) }) {
    Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 28.dp)) {
        Text(nexusCopy("Aggiungi alla conversazione", "Add to conversation"), fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 12.dp))
        SheetAction(Icons.Rounded.PhotoLibrary, nexusCopy("Carica foto", "Upload photo"), nexusCopy("Scegli un’immagine dalla galleria", "Choose an image from your gallery"), gallery)
        SheetAction(Icons.Rounded.PhotoCamera, nexusCopy("Fotocamera", "Camera"), nexusCopy("Scatta una foto adesso", "Take a photo now"), camera)
        if (remoteWorkAvailable) SheetAction(Icons.Outlined.Checklist, nexusCopy("Modalità Cuore", "Core mode"), nexusCopy("Pianifica, verifica e autorizza ogni azione", "Plan, review, and authorize every action"), planMode)
        HorizontalDivider(Modifier.padding(vertical = 8.dp), color = Hairline.copy(alpha = .55f))
        Text(nexusCopy("File", "Files"), color = Mist, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
        SheetAction(Icons.Rounded.Description, nexusCopy("Documento", "Document"), nexusCopy("PDF o file di testo", "PDF or text file"), document)
    }
}

@Composable private fun SheetAction(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = click).padding(horizontal = 10.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Color(0xFFD7E0E0), modifier = Modifier.size(21.dp)) }; Spacer(Modifier.width(11.dp)); Column { Text(title, style = MaterialTheme.typography.labelLarge); Text(detail, color = Mist, style = MaterialTheme.typography.bodySmall) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ContinuousVoicePanel(reduceMotion: Boolean, connection: NexusConnection, currentDraft: String, bargeIn: () -> Unit, close: () -> Unit, transcript: (String) -> Unit, instantSubmit: ((String) -> Unit)? = null) {
    val context = LocalContext.current
    val activity = context as? ComponentActivity
    val configuration = LocalConfiguration.current
    val haptic = LocalHapticFeedback.current
    var listening by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf(NexusVoiceMode.IDLE) }
    var pendingMode by remember { mutableStateOf(NexusVoiceMode.IDLE) }
    var partial by remember { mutableStateOf("") }
    var voiceMessage by remember { mutableStateOf("") }
    var restart by remember { mutableIntStateOf(0) }
    var sessionGeneration by remember { mutableIntStateOf(0) }
    var recognitionErrors by remember { mutableIntStateOf(0) }
    var lastCommittedPhrase by remember { mutableStateOf("") }
    var lastCommittedAt by remember { mutableLongStateOf(0L) }
    var voiceEnergy by remember { mutableFloatStateOf(0f) }
    val latestDraft by rememberUpdatedState(currentDraft)
    val handler = remember { Handler(Looper.getMainLooper()) }
    val recognizerAvailable = remember(context) { SpeechRecognizer.isRecognitionAvailable(context) }
    val onDeviceAvailable = remember(context) { Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context) }
    val recognizer = remember(context, recognizerAvailable, onDeviceAvailable) {
        if (!recognizerAvailable) null
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && onDeviceAvailable) SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        else SpeechRecognizer.createSpeechRecognizer(context)
    }
    val voiceLocale = remember(configuration) {
        configuration.locales[0].toLanguageTag().ifBlank { Locale.getDefault().toLanguageTag() }
    }
    val voiceLocaleObject = remember(voiceLocale) { runCatching { Locale.forLanguageTag(voiceLocale) }.getOrDefault(Locale.getDefault()) }
    val intent = remember(voiceLocale, onDeviceAvailable) {
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, voiceLocale)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, voiceLocale)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, onDeviceAvailable)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 250L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 520L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 760L)
    }
    val activateCapture: (NexusVoiceMode) -> Unit = { requestedMode ->
        if (recognizer == null) {
            pendingMode = NexusVoiceMode.IDLE
            mode = NexusVoiceMode.IDLE
            voiceMessage = context.nexusCopy("Il riconoscimento vocale non è disponibile su questo dispositivo.", "Voice recognition is not available on this device.")
        } else {
            bargeIn()
            handler.removeCallbacksAndMessages(null)
            sessionGeneration++
            recognitionErrors = 0
            voiceMessage = ""
            mode = requestedMode
            pendingMode = NexusVoiceMode.IDLE
            listening = true
            restart++
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val requestedMode = pendingMode
        pendingMode = NexusVoiceMode.IDLE
        if (granted && requestedMode != NexusVoiceMode.IDLE) activateCapture(requestedMode)
        else if (!granted) voiceMessage = context.nexusCopy("Consenti il microfono per usare la voce. Puoi continuare scrivendo.", "Allow microphone access to use voice. You can continue by typing.")
    }
    val beginCapture: (NexusVoiceMode) -> Unit = { requestedMode ->
        if (recognizer == null) {
            voiceMessage = context.nexusCopy("Il riconoscimento vocale non è disponibile su questo dispositivo.", "Voice recognition is not available on this device.")
        } else if (androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            activateCapture(requestedMode)
        } else {
            pendingMode = requestedMode
            permission.launch(android.Manifest.permission.RECORD_AUDIO)
        }
    }
    val haltCapture: (Boolean, Boolean) -> Unit = { commitPending, tactile ->
        if (tactile) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        sessionGeneration++
        pendingMode = NexusVoiceMode.IDLE
        mode = NexusVoiceMode.IDLE
        handler.removeCallbacksAndMessages(null)
        if (commitPending) runCatching { recognizer?.stopListening() } else runCatching { recognizer?.cancel() }
        listening = false
        voiceEnergy = 0f
        partial = ""
    }
    val scheduleHandsFreeRestart: (Long) -> Unit = { delayMs ->
        val expectedGeneration = sessionGeneration
        handler.postDelayed({
            if (mode == NexusVoiceMode.HANDS_FREE && sessionGeneration == expectedGeneration) restart++
        }, delayMs)
    }
    DisposableEffect(recognizer) {
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { listening = true; recognitionErrors = 0 }
            override fun onBeginningOfSpeech() { listening = true; recognitionErrors = 0; voiceMessage = "" }
            override fun onRmsChanged(rmsdB: Float) { voiceEnergy = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f) }
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() { listening = false }
            override fun onError(error: Int) {
                listening = false
                voiceEnergy = 0f
                if (mode == NexusVoiceMode.IDLE || error == SpeechRecognizer.ERROR_CLIENT) return
                val networkFailure = error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                val permissionFailure = error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                val languageFailure = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
                if (permissionFailure || languageFailure || (networkFailure && !onDeviceAvailable)) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                    handler.removeCallbacksAndMessages(null)
                    voiceMessage = when {
                        permissionFailure -> context.nexusCopy("Il permesso del microfono è stato revocato.", "Microphone permission was revoked.")
                        languageFailure -> context.nexusCopy("La lingua del dispositivo non è supportata dal riconoscimento installato.", "The device language is not supported by the installed recognizer.")
                        else -> context.nexusCopy("La dettatura richiede rete su questo dispositivo. Puoi continuare scrivendo.", "Dictation needs a network connection on this device. You can continue by typing.")
                    }
                    return
                }
                if (mode != NexusVoiceMode.HANDS_FREE) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                    voiceMessage = if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) context.nexusCopy("Non ho rilevato una frase. Tocca per riprovare.", "I didn't detect a phrase. Tap to try again.") else context.nexusCopy("La dettatura si è interrotta. Tocca per riprovare.", "Dictation stopped. Tap to try again.")
                    return
                }
                val quietInput = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                recognitionErrors = if (quietInput) 0 else (recognitionErrors + 1).coerceAtMost(4)
                if (!quietInput && recognitionErrors >= 4) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                    voiceMessage = context.nexusCopy("La modalità continua è in pausa. Tocca per riprendere.", "Hands-free mode is paused. Tap to resume.")
                    return
                }
                val delayMs = if (quietInput) 420L else (320L shl (recognitionErrors - 1)).coerceAtMost(2_400L)
                scheduleHandsFreeRestart(delayMs)
            }
            override fun onResults(results: Bundle?) {
                val value = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
                val normalized = value.lowercase(voiceLocaleObject).replace(Regex("[\\p{Punct}\\s]+"), " ").trim()
                val now = SystemClock.elapsedRealtime()
                val draftNormalized = latestDraft.trim().lowercase(voiceLocaleObject).replace(Regex("[\\p{Punct}\\s]+"), " ").trim()
                val recentlyCommitted = now - lastCommittedAt < 4_000L
                val duplicate = normalized.isNotBlank() && recentlyCommitted && (normalized == lastCommittedPhrase || draftNormalized.endsWith(normalized))
                if (normalized.isNotBlank() && !duplicate) {
                    if (instantSubmit != null) instantSubmit(value)
                    else transcript(listOf(latestDraft.trim(), value).filter(String::isNotBlank).joinToString(" "))
                    lastCommittedPhrase = normalized
                    lastCommittedAt = now
                }
                recognitionErrors = 0
                partial = ""
                listening = false
                if (instantSubmit != null && normalized.isNotBlank() && !duplicate) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                } else if (mode == NexusVoiceMode.HANDS_FREE) scheduleHandsFreeRestart(280L)
                else {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                if (mode != NexusVoiceMode.IDLE) partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            }
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        onDispose {
            handler.removeCallbacksAndMessages(null)
            runCatching { recognizer?.cancel() }
            runCatching { recognizer?.destroy() }
        }
    }
    DisposableEffect(activity, recognizer) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) haltCapture(false, false)
        }
        activity?.lifecycle?.addObserver(observer)
        onDispose { activity?.lifecycle?.removeObserver(observer) }
    }
    LaunchedEffect(restart) {
        if (restart > 0 && mode != NexusVoiceMode.IDLE) {
            runCatching { recognizer?.startListening(intent) }.onFailure {
                listening = false
                mode = NexusVoiceMode.IDLE
                voiceMessage = context.nexusCopy("La dettatura non è disponibile. Puoi continuare scrivendo.", "Dictation is unavailable. You can continue by typing.")
            }
        }
    }
    LaunchedEffect(instantSubmit) {
        if (instantSubmit != null) beginCapture(NexusVoiceMode.SINGLE_TURN)
    }
    Dialog(onDismissRequest = { haltCapture(false, false); close() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(color = Color(0xFF030809), modifier = Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(20.dp)) {
                IconButton(
                    onClick = { haltCapture(false, false); close() },
                    modifier = Modifier.align(Alignment.TopEnd).size(48.dp).clip(CircleShape).background(Surface.copy(alpha = .72f))
                ) { Icon(Icons.Rounded.Close, nexusCopy("Chiudi", "Close"), modifier = Modifier.size(23.dp)) }
                Column(Modifier.align(Alignment.Center).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.fillMaxWidth().height(238.dp), contentAlignment = Alignment.Center) {
                        VoiceAura(listening, voiceEnergy, reduceMotion)
                        NexusInstantCore(
                            active = listening,
                            offline = connection == NexusConnection.OFFLINE,
                            reduceMotion = reduceMotion,
                            energy = voiceEnergy,
                            onClick = {
                                if (mode != NexusVoiceMode.IDLE || listening) {
                                    haltCapture(false, true)
                                    close()
                                } else beginCapture(NexusVoiceMode.SINGLE_TURN)
                            }
                        )
                    }
                    AnimatedContent(
                        targetState = when {
                            connection == NexusConnection.OFFLINE -> nexusCopy("Server offline", "Server offline")
                            listening -> nexusCopy("Ti ascolto", "I'm listening")
                            mode != NexusVoiceMode.IDLE -> nexusCopy("Elaboro la voce", "Processing voice")
                            else -> nexusCopy("Parla con NexusNXS", "Talk to NexusNXS")
                        },
                        transitionSpec = { nexusTransform(reduceMotion) }, label = "instantVoiceTitle"
                    ) { title ->
                        Text(title, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    val message = when {
                        partial.isNotBlank() -> partial
                        voiceMessage.isNotBlank() -> voiceMessage
                        connection == NexusConnection.OFFLINE -> nexusCopy("Il server è offline. Riconnessione automatica in corso.", "The server is offline. Automatic reconnection is in progress.")
                        listening -> nexusCopy("Parla naturalmente.", "Speak naturally.")
                        else -> nexusCopy("Tocca il Core per riprovare.", "Tap the Core to try again.")
                    }
                    Text(message, color = if (partial.isNotBlank()) Ice else Mist, style = MaterialTheme.typography.bodyLarge, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp), maxLines = 4, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    when {
                        connection == NexusConnection.OFFLINE -> nexusCopy("Torna al Core e riprova la connessione", "Return to the Core and retry the connection")
                        recognizerAvailable -> nexusCopy("Tocca di nuovo il Core per tornare indietro", "Tap the Core again to go back")
                        else -> nexusCopy("Usa la tastiera per continuare", "Use the keyboard to continue")
                    },
                    color = Mist, fontSize = 12.sp,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp)
                )
            }
        }
    }
}

@Composable private fun VoiceAura(active: Boolean, energy: Float, reduceMotion: Boolean) {
    val pulse = nexusLoopFloat(!reduceMotion, 0f, 1f, 1350, RepeatMode.Reverse, "voiceAuraPulse")
    val smoothEnergy by animateFloatAsState(if (active) energy else 0f, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "voiceEnergy")
    Canvas(Modifier.size(188.dp)) {
        val signal = if (reduceMotion) smoothEnergy else smoothEnergy + pulse * .12f
        drawCircle(Brush.radialGradient(listOf(Cyan.copy(alpha = .13f + signal * .10f), Cyan.copy(alpha = .025f), Color.Transparent)), radius = size.minDimension * (.42f + signal * .08f))
        repeat(3) { ring ->
            val radius = size.minDimension * (.22f + ring * .105f + signal * (.018f + ring * .008f))
            drawCircle(Cyan.copy(alpha = (if (active) .28f else .10f) / (ring + 1)), radius = radius, style = Stroke(width = (1.4f - ring * .2f).dp.toPx()))
        }
    }
}

@Composable private fun VoiceWaveform(active: Boolean, energy: Float, reduceMotion: Boolean) {
    val phase = nexusLoopFloat(!reduceMotion, 0f, 6.28f, NexusFlow.VOICE_WAVE, RepeatMode.Restart, "wavePhase")
    Canvas(Modifier.fillMaxWidth(.62f).height(92.dp)) {
        val bars = 23
        val gap = size.width / bars
        repeat(bars) { index ->
            val normalized = kotlin.math.sin((index / bars.toFloat()) * 3.14f).coerceAtLeast(.12f)
            val motion = if (active && !reduceMotion) (.5f + .5f * kotlin.math.sin(phase + index * .72f)) else .18f
            val height = size.height * normalized * (.18f + motion * (.30f + energy * .52f))
            drawLine(if (active) Cyan else Mist.copy(alpha = .72f), androidx.compose.ui.geometry.Offset(gap * index + gap / 2, size.height / 2 - height / 2), androidx.compose.ui.geometry.Offset(gap * index + gap / 2, size.height / 2 + height / 2), strokeWidth = 3.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round)
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable private fun NexusDrawer(state: NexusUiState, dispatch: (String, String) -> Unit) {
    val metrics = LocalNexusMetrics.current
    var selected by remember { mutableStateOf<ChatRow?>(null) }
    var editing by remember { mutableStateOf<ChatRow?>(null) }
    var deleting by remember { mutableStateOf<ChatRow?>(null) }
    var rename by remember { mutableStateOf("") }
    val haptic = LocalHapticFeedback.current
    val italian = nexusIsItalian()
    ModalDrawerSheet(drawerContainerColor = Color(0xFF090D0E), drawerContentColor = Ice, modifier = Modifier.width(metrics.drawerWidth).fillMaxHeight()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("NexusNXS", fontSize = 25.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f)); Surface(color = Surface, shape = CircleShape, border = androidx.compose.foundation.BorderStroke(1.dp, Hairline), modifier = Modifier.size(46.dp)) { IconButton({ dispatch("library", "") }) { Icon(Icons.Rounded.Search, nexusCopy("Cerca nelle chat", "Search chats"), modifier = Modifier.size(23.dp)) } } }
            Spacer(Modifier.height(8.dp))
            DrawerItem(Icons.Outlined.Edit, "Chat") { dispatch("new", "") }
            DrawerItem(Icons.Outlined.PhotoLibrary, nexusCopy("Cronologia", "History")) { dispatch("library", "") }
            if (state.remoteWorkAvailable) DrawerItem(Icons.Outlined.Folder, nexusCopy("Progetti", "Projects")) { dispatch("projects", "") }
            AttentionDrawerItem(state.attentionCount(), state.reduceMotion) { dispatch("activity", "") }
            if (state.pairingAvailable || state.wakePairingAvailable || state.wakeAvailable) RemoteDrawerItem(nexusCopy("Dispositivi", "Devices")) { dispatch("remote", "") }
            if (state.remoteWorkAvailable) DrawerItem(Icons.Outlined.Schedule, nexusCopy("Programmate", "Scheduled")) { dispatch("scheduled", "") }
            HorizontalDivider(Modifier.padding(vertical = 12.dp), color = Color(0xFF253031))
            LazyColumn(Modifier.weight(1f)) {
                state.chats.groupBy { chatGroupLabel(it.updatedAt, italian) }.forEach { (group, chats) ->
                    item("group-$group") { Text(group, color = Mist, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 5.dp)) }
                    items(chats, key = { it.id }) { chat -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (chat.id == state.conversationId) Surface else Color.Transparent).combinedClickable(onClick = { dispatch("open", chat.id) }, onLongClick = { haptic.performHapticFeedback(HapticFeedbackType.LongPress); selected = chat }).padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Text(chat.title, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)); AnimatedVisibility(chat.pinned, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) { Icon(Icons.Rounded.PushPin, nexusCopy("Fissata", "Pinned"), tint = Cyan, modifier = Modifier.size(14.dp)) } } }
                }
            }
            val connected = state.connection == NexusConnection.ONLINE
            Surface(color = Surface, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().clickable { dispatch("settings", "") }) { Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) { UserAvatar(state.profileUri, 44.dp, nexusCopy("Profilo e impostazioni", "Profile and settings"), online = connected); Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(nexusCopy("NexusNXS personale", "Personal NexusNXS"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold); Text(when { connected -> nexusCopy("Connesso e privato", "Connected and private"); state.pendingCount > 0 -> nexusCopy("${state.pendingCount} in coda · invio automatico", "${state.pendingCount} queued · automatic delivery"); else -> nexusCopy("Connessione automatica", "Auto-connect") }, color = Mist, fontSize = 11.sp) }; Icon(Icons.Rounded.ChevronRight, null, tint = Mist, modifier = Modifier.size(18.dp)) } }
        }
    }
    selected?.let { chat -> ModalBottomSheet(onDismissRequest = { selected = null }, containerColor = Surface, shape = NexusSheetShape, dragHandle = { BottomSheetDefaults.DragHandle(color = Mist) }) { Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 26.dp)) { Text(chat.title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(10.dp)); SheetAction(Icons.Rounded.PushPin, if (chat.pinned) nexusCopy("Rimuovi dai fissati", "Unpin") else nexusCopy("Fissa", "Pin"), nexusCopy("Mantieni la chat in cima", "Keep this chat at the top"), { dispatch("pinChat", chat.id); selected = null }); SheetAction(Icons.Rounded.Edit, nexusCopy("Rinomina", "Rename"), nexusCopy("Cambia il titolo della conversazione", "Change the conversation title"), { rename = chat.title; editing = chat; selected = null }); SheetAction(Icons.Rounded.DeleteOutline, nexusCopy("Elimina", "Delete"), nexusCopy("Rimuovi la chat dal dispositivo", "Remove this chat from the device"), { deleting = chat; selected = null }) } } }
    editing?.let { chat -> AlertDialog(onDismissRequest = { editing = null }, title = { Text(nexusCopy("Rinomina chat", "Rename chat")) }, text = { OutlinedTextField(rename, { rename = it.take(72) }, singleLine = true) }, confirmButton = { TextButton({ dispatch("renameChat", "${chat.id}\n$rename"); editing = null }) { Text(nexusCopy("Salva", "Save")) } }, dismissButton = { TextButton({ editing = null }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface) }
    deleting?.let { chat -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text(nexusCopy("Eliminare questa chat?", "Delete this chat?")) }, text = { Text(if (italian) "“${chat.title}” verrà rimossa da questo dispositivo." else "“${chat.title}” will be removed from this device.") }, confirmButton = { TextButton({ dispatch("deleteChat", chat.id); deleting = null }) { Text(nexusCopy("Elimina", "Delete"), color = Color(0xFFFF8A80)) } }, dismissButton = { TextButton({ deleting = null }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface) }
}

@Composable private fun DrawerItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).clickable(onClick = click).padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = Color(0xFFC4CECE), modifier = Modifier.size(20.dp)); Spacer(Modifier.width(12.dp)); Text(label, style = MaterialTheme.typography.bodyMedium) }

@Composable private fun AttentionDrawerItem(count: Int, reduceMotion: Boolean, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).clickable(onClick = click).padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
    Icon(Icons.Outlined.NotificationsNone, null, tint = Color(0xFFC4CECE), modifier = Modifier.size(20.dp))
    Spacer(Modifier.width(12.dp))
    Text(nexusCopy("Attenzioni", "Attention"), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    AnimatedVisibility(count > 0, enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
        Surface(color = Cyan.copy(alpha = .14f), contentColor = Cyan, shape = CircleShape) {
            Text(if (count > 9) "9+" else count.toString(), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
        }
    }
}

@Composable private fun RemoteDrawerItem(label: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).clickable(onClick = click).padding(horizontal = 11.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) { RemoteGlyph(); Spacer(Modifier.width(13.dp)); Text(label, fontSize = 15.sp) }

@Composable private fun RemoteGlyph() = Canvas(Modifier.size(22.dp).semantics { contentDescription = "Remote" }) {
    val stroke = 1.8.dp.toPx()
    drawRoundRect(Mist, androidx.compose.ui.geometry.Offset(size.width * .14f, size.height * .08f), androidx.compose.ui.geometry.Size(size.width * .72f, size.height * .52f), androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()), style = androidx.compose.ui.graphics.drawscope.Stroke(stroke))
    drawLine(Mist, androidx.compose.ui.geometry.Offset(size.width * .05f, size.height * .70f), androidx.compose.ui.geometry.Offset(size.width * .95f, size.height * .70f), stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
    listOf(.18f, .39f, .61f, .82f).forEach { x -> drawCircle(Mist, radius = 1.1.dp.toPx(), center = androidx.compose.ui.geometry.Offset(size.width * x, size.height * .91f)) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ModelPicker(selected: String, models: List<ModelRow>, dispatch: (String, String) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var closing by remember { mutableStateOf(false) }
    fun close(after: (() -> Unit)? = null) {
        if (closing) return
        closing = true
        scope.launch {
            runCatching { sheetState.hide() }
            after?.invoke()
            dispatch("closeModel", "")
        }
    }
    ModalBottomSheet(onDismissRequest = { close() }, sheetState = sheetState, containerColor = Color(0xFF171B1C), contentColor = Ice, shape = NexusSheetShape, dragHandle = { BottomSheetDefaults.DragHandle(color = Mist) }) {
        Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 22.dp)) { Text(nexusCopy("Scegli un modello", "Choose a model"), color = Ice, fontSize = 23.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp)); models.forEach { model -> val detail = listOf(if (model.name == "NexusNXS Pro") nexusCopy("Più profondo · codice e analisi", "Deeper · code and analysis") else if (model.name == "NexusNXS Rapido") nexusCopy("Veloce · chat e sintesi", "Fast · chat and summaries") else nexusCopy("Modello NexusNXS", "NexusNXS model"), if (model.available) nexusCopy("Disponibile", "Available") else nexusCopy("Non disponibile", "Unavailable")).joinToString(" · "); Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(if (model.name == selected) Color(0xFF103234) else Color.Transparent).clickable(enabled = model.available && !closing) { close { dispatch("model", model.name) } }.padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(model.name, color = if (model.available) Ice else Mist, fontSize = 17.sp, fontWeight = FontWeight.SemiBold); Text(detail, color = Mist, fontSize = 13.sp, modifier = Modifier.padding(top = 3.dp)) }; if (model.name == selected) Icon(Icons.Rounded.Check, nexusCopy("Selezionato", "Selected"), tint = Cyan, modifier = Modifier.size(23.dp)) } } }
    }
}

@Composable private fun Page(title: String, dispatch: (String, String) -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val metrics = LocalNexusMetrics.current
    val scrollState = rememberSaveable(title, saver = androidx.compose.foundation.ScrollState.Saver) { androidx.compose.foundation.ScrollState(0) }
    Column(Modifier.fillMaxHeight().fillMaxWidth().widthIn(max = metrics.contentMaxWidth).wrapContentWidth(Alignment.CenterHorizontally).statusBarsPadding().verticalScroll(scrollState).padding(horizontal = metrics.horizontalPadding, vertical = 8.dp)) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { IconButton({ dispatch("back", "") }, Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, nexusCopy("Torna alla chat", "Back to chat"), tint = Ice) }; Text(title, fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp)) }; Spacer(Modifier.height(18.dp)); content() }
}

@Composable private fun LibraryScreen(state: NexusUiState, dispatch: (String, String) -> Unit) = Page(nexusCopy("Cronologia", "History"), dispatch) {
    var editing by remember { mutableStateOf<ChatRow?>(null) }
    var pendingDelete by remember { mutableStateOf<ChatRow?>(null) }
    var expandedId by remember { mutableStateOf<String?>(null) }
    var rename by remember { mutableStateOf("") }
    var archived by remember { mutableStateOf<ChatRow?>(null) }
    val italian = nexusIsItalian()
    OutlinedTextField(state.chatQuery, { dispatch("chatQuery", it) }, modifier = Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text(nexusCopy("Cerca nelle conversazioni", "Search conversations")) }, leadingIcon = { Icon(Icons.Rounded.Search, null) }, trailingIcon = { if (state.chatQuery.isNotBlank()) IconButton({ dispatch("chatQuery", "") }) { Icon(Icons.Rounded.Close, nexusCopy("Azzera ricerca", "Clear search")) } }, shape = RoundedCornerShape(18.dp))
    Spacer(Modifier.height(14.dp))
    val query = state.chatQuery.trim()
    val rows = state.chats.filter { query.isBlank() || it.title.contains(query, true) || it.preview.contains(query, true) }
    var hydrated by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(260); hydrated = true }
    if (rows.isEmpty() && !hydrated) LibrarySkeleton(state.reduceMotion)
    else if (rows.isEmpty()) EmptyLibrary(query) { dispatch("new", "") }
    var previousGroup = ""
    rows.forEach { chat ->
        val group = historyGroupLabel(chat.updatedAt, italian)
        if (group != previousGroup) { Text(group, color = Mist, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp, top = 14.dp, bottom = 5.dp)); previousGroup = group }
        SwipeChatRow(chat, expandedId == chat.id, { expandedId = if (expandedId == chat.id) null else chat.id }, { expandedId = null }, { dispatch("pinChat", chat.id) }, { dispatch("archiveChat", chat.id); archived = chat }, { rename = chat.title; editing = chat }, { pendingDelete = chat }, { dispatch("open", chat.id) })
    }
    AnimatedVisibility(archived != null, enter = nexusEnter(state.reduceMotion), exit = nexusExit(state.reduceMotion)) { Surface(color = Surface2, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Text(nexusCopy("Conversazione archiviata", "Conversation archived"), modifier = Modifier.weight(1f), fontSize = 14.sp); TextButton({ archived?.let { dispatch("restoreChat", it.id) }; archived = null }) { Text(nexusCopy("Annulla", "Undo"), color = Cyan) } } } }
    editing?.let { chat -> AlertDialog(onDismissRequest = { editing = null }, title = { Text(nexusCopy("Rinomina conversazione", "Rename conversation")) }, text = { OutlinedTextField(rename, { rename = it.take(72) }, singleLine = true) }, confirmButton = { TextButton({ dispatch("renameChat", "${chat.id}\n$rename"); editing = null }) { Text(nexusCopy("Salva", "Save")) } }, dismissButton = { TextButton({ editing = null }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface) }
    pendingDelete?.let { chat -> AlertDialog(onDismissRequest = { pendingDelete = null }, title = { Text(nexusCopy("Eliminare questa conversazione?", "Delete this conversation?")) }, text = { Text(if (italian) "“${chat.title}” verrà rimossa soltanto da questo dispositivo." else "“${chat.title}” will only be removed from this device.") }, confirmButton = { TextButton({ dispatch("deleteChat", chat.id); pendingDelete = null }) { Text(nexusCopy("Elimina", "Delete"), color = Color(0xFFFF8A80)) } }, dismissButton = { TextButton({ pendingDelete = null }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface) }
}

private fun historyGroupLabel(updatedAt: Long, italian: Boolean = true): String {
    val age = (System.currentTimeMillis() - updatedAt).coerceAtLeast(0L)
    return when {
        age < 24 * 60 * 60 * 1000L -> if (italian) "Oggi" else "Today"
        age < 48 * 60 * 60 * 1000L -> if (italian) "Ieri" else "Yesterday"
        age < 7 * 24 * 60 * 60 * 1000L -> if (italian) "Ultimi 7 giorni" else "Last 7 days"
        else -> if (italian) "Precedenti" else "Earlier"
    }
}

@Composable private fun EmptyLibrary(query: String, newChat: () -> Unit) = Column(Modifier.fillMaxWidth().padding(top = 70.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Box(Modifier.size(58.dp).background(Surface, CircleShape).border(1.dp, Hairline, CircleShape), contentAlignment = Alignment.Center) { Icon(if (query.isBlank()) Icons.Outlined.Forum else Icons.Rounded.SearchOff, null, tint = Cyan, modifier = Modifier.size(27.dp)) }
    Spacer(Modifier.height(16.dp)); Text(if (query.isBlank()) nexusCopy("La tua cronologia è vuota", "Your history is empty") else nexusCopy("Nessun risultato", "No results"), color = Ice, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    Text(if (query.isBlank()) nexusCopy("Le conversazioni salvate compariranno qui.", "Saved conversations will appear here.") else nexusCopy("Prova con parole diverse.", "Try different words."), color = Mist, fontSize = 14.sp, modifier = Modifier.padding(top = 6.dp))
    if (query.isBlank()) TextButton(newChat, modifier = Modifier.padding(top = 10.dp)) { Icon(Icons.Rounded.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(7.dp)); Text(nexusCopy("Inizia una chat", "Start a chat")) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun SwipeChatRow(chat: ChatRow, menuOpen: Boolean, toggleMenu: () -> Unit, closeMenu: () -> Unit, pin: () -> Unit, archive: () -> Unit, rename: () -> Unit, delete: () -> Unit, open: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val dismissState = rememberSwipeToDismissBoxState(confirmValueChange = { target ->
        when (target) { SwipeToDismissBoxValue.StartToEnd -> { haptic.performHapticFeedback(HapticFeedbackType.LongPress); pin() }; SwipeToDismissBoxValue.EndToStart -> { haptic.performHapticFeedback(HapticFeedbackType.LongPress); archive() }; else -> Unit }
        false
    })
    SwipeToDismissBox(state = dismissState, backgroundContent = { Row(Modifier.fillMaxSize().padding(horizontal = 22.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.PushPin, nexusCopy("Fissa", "Pin"), tint = Cyan); Icon(Icons.Outlined.Archive, nexusCopy("Archivia", "Archive"), tint = Color(0xFFF0C76A)) } }) {
        ListItem(headlineContent = { Row(verticalAlignment = Alignment.CenterVertically) { Text(chat.title, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)); Text(relativeTimeLabel(chat.updatedAt), color = Mist, fontSize = 11.sp) } }, supportingContent = { Text(chat.preview, maxLines = 1, overflow = TextOverflow.Ellipsis) }, leadingContent = { Icon(Icons.Rounded.ChatBubbleOutline, null) }, trailingContent = { Box { IconButton(toggleMenu) { Icon(Icons.Rounded.MoreVert, nexusCopy("Azioni conversazione", "Conversation actions"), tint = Mist) }; DropdownMenu(expanded = menuOpen, onDismissRequest = closeMenu) { DropdownMenuItem(text = { Text(if (chat.pinned) nexusCopy("Rimuovi dai fissati", "Unpin") else nexusCopy("Fissa", "Pin")) }, leadingIcon = { Icon(Icons.Rounded.PushPin, null) }, onClick = { closeMenu(); pin() }); DropdownMenuItem(text = { Text(nexusCopy("Archivia", "Archive")) }, leadingIcon = { Icon(Icons.Outlined.Archive, null) }, onClick = { closeMenu(); archive() }); DropdownMenuItem(text = { Text(nexusCopy("Rinomina", "Rename")) }, leadingIcon = { Icon(Icons.Rounded.Edit, null) }, onClick = { closeMenu(); rename() }); DropdownMenuItem(text = { Text(nexusCopy("Elimina", "Delete")) }, leadingIcon = { Icon(Icons.Rounded.DeleteOutline, null) }, onClick = { closeMenu(); delete() }) } } }, colors = ListItemDefaults.colors(containerColor = Ink), modifier = Modifier.clickable(onClick = open))
    }
}

@Composable private fun SimpleHub(title: String, detail: String, icon: androidx.compose.ui.graphics.vector.ImageVector, cardTitle: String, cardDetail: String, dispatch: (String, String) -> Unit) = Page(title, dispatch) { Text(detail, color = Mist); Spacer(Modifier.height(20.dp)); Surface(color = Surface, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().clickable { dispatch("work", "") }) { Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = Cyan); Spacer(Modifier.width(16.dp)); Column { Text(cardTitle, fontWeight = FontWeight.Bold); Text(cardDetail, color = Mist, fontSize = 13.sp) } } } }

@Composable private fun AttentionInboxScreen(state: NexusUiState, dispatch: (String, String) -> Unit) = Page(nexusCopy("Attenzioni", "Attention"), dispatch) {
    val online = state.connection == NexusConnection.ONLINE
    val checking = state.connection == NexusConnection.CHECKING
    val count = state.attentionCount()
    Surface(
        color = when { online -> Color(0xFF0B1818); checking -> Surface; else -> Color(0xFF251B1B) },
        shape = RoundedCornerShape(20.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (online) Cyan.copy(alpha = .18f) else Color(0xFFF0C76A).copy(alpha = .24f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            if (checking) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 1.8.dp, color = Cyan)
            else Icon(if (online) Icons.Rounded.CheckCircleOutline else Icons.Rounded.CloudOff, null, tint = if (online) Color(0xFF69DCAE) else Color(0xFFF0C76A), modifier = Modifier.size(23.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(when { online -> nexusCopy("NexusNXS è connesso", "NexusNXS is connected"); checking -> nexusCopy("Verifico la connessione…", "Checking connection…"); else -> nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers are unavailable") }, fontWeight = FontWeight.SemiBold)
                Text(when { online -> if (count == 0) nexusCopy("Nessuna attenzione richiesta", "Nothing needs your attention") else nexusCopy("$count elementi da rivedere", "$count items to review"); checking -> nexusCopy("Le attività locali restano disponibili", "Local activity remains available"); state.pendingCount > 0 -> nexusCopy("${state.pendingCount} richieste protette verranno inviate automaticamente", "${state.pendingCount} protected requests will be delivered automatically"); else -> nexusCopy("Riconnessione automatica attiva", "Automatic reconnection is active") }, color = Mist, fontSize = 12.sp, lineHeight = 17.sp)
            }
            if (!online && !checking) IconButton({ dispatch("probe", "") }) { Icon(Icons.Rounded.Refresh, nexusCopy("Riprova", "Retry"), tint = Cyan) }
        }
    }
    SectionLabel(nexusCopy("DA RIVEDERE", "TO REVIEW"))
    if (state.workTicketId.isNotBlank()) AttentionActionCard(Icons.Outlined.VerifiedUser, state.workPreview, nexusCopy("Consenso Cuore richiesto", "Core approval required"), Color(0xFF69DCAE), primary = nexusCopy("Autorizza", "Authorize") to { dispatch("approveWork", "") }, secondary = nexusCopy("Annulla", "Cancel") to { dispatch("cancelWork", "") })
    if (state.wakeTicketId.isNotBlank()) AttentionActionCard(Icons.Rounded.PowerSettingsNew, state.wakePreview, nexusCopy("Conferma di risveglio richiesta", "Wake confirmation required"), Color(0xFFF0C76A), primary = nexusCopy("Conferma", "Confirm") to { dispatch("approveWake", "") }, secondary = nexusCopy("Annulla", "Cancel") to { dispatch("cancelWake", "") })
    if (state.pendingCount > 0) AttentionActionCard(Icons.Outlined.CloudSync, if (state.pendingCount == 1) nexusCopy("1 richiesta protetta in coda", "1 protected request queued") else nexusCopy("${state.pendingCount} richieste protette in coda", "${state.pendingCount} protected requests queued"), nexusCopy("Invio automatico alla riconnessione", "Automatic delivery after reconnection"), Color(0xFFF0C76A), primary = nexusCopy("Riprova", "Retry") to { dispatch("retryQueue", "") })
    if (state.busy) AttentionActionCard(Icons.Rounded.AutoAwesome, state.activity.ifBlank { nexusCopy("NexusNXS sta elaborando", "NexusNXS is working") }, nexusCopy("Attività in corso", "Task in progress"), Cyan, primary = nexusCopy("Apri chat", "Open chat") to { dispatch("chat", "") })
    state.error?.takeIf { !it.isTransportFailure() }?.let { message -> AttentionActionCard(Icons.Rounded.ErrorOutline, message, nexusCopy("Richiede attenzione", "Needs attention"), Color(0xFFFFA39B), primary = nexusCopy("Chiudi", "Dismiss") to { dispatch("dismissError", "") }) }
    if (count == 0 && online) Column(Modifier.fillMaxWidth().padding(top = 44.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(54.dp).background(Cyan.copy(alpha = .10f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Check, null, tint = Cyan, modifier = Modifier.size(27.dp)) }
        Text(nexusCopy("Tutto sotto controllo", "All clear"), fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 13.dp))
        Text(nexusCopy("Consensi, notifiche e attività compariranno qui.", "Approvals, notifications, and tasks will appear here."), color = Mist, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable private fun AttentionActionCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    detail: String,
    tint: Color,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null
) = Surface(color = Surface, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
    Column(Modifier.padding(15.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(tint.copy(alpha = .13f), CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(21.dp)) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(detail, color = Mist, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp)) }
        }
        if (primary != null || secondary != null) Row(Modifier.fillMaxWidth().padding(top = 11.dp), horizontalArrangement = Arrangement.End) {
            secondary?.let { (label, action) -> TextButton(action) { Text(label) } }
            primary?.let { (label, action) -> TextButton(action) { Text(label, color = Cyan) } }
        }
    }
}

@Composable private fun RemoteScreen(state: NexusUiState, dispatch: (String, String) -> Unit) = Page(nexusCopy("Dispositivi", "Devices"), dispatch) {
    Text(nexusCopy("Continua le conversazioni, autorizza il lavoro e, se configurato, prepara il risveglio attraverso connessioni private.", "Continue conversations, approve workstation tasks, and, when configured, prepare wake through private connections."), color = Mist)
    Spacer(Modifier.height(18.dp))
    val online = state.connection == NexusConnection.ONLINE
    val checking = state.connection == NexusConnection.CHECKING
    Surface(color = if (!online && !checking) Color(0xFF2A1D1D) else Surface, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) { Row(Modifier.padding(17.dp), verticalAlignment = Alignment.CenterVertically) { if (checking) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 1.8.dp, color = Cyan) else Icon(if (online) Icons.Rounded.CloudDone else Icons.Rounded.CloudOff, null, tint = if (online) Cyan else Color(0xFFFFA39B)); Spacer(Modifier.width(13.dp)); Column { Text("Workstation NexusNXS", fontWeight = FontWeight.SemiBold); Text(when { online -> nexusCopy("Online", "Online"); checking -> nexusCopy("Connessione ai server NexusNXS…", "Connecting to NexusNXS servers…"); else -> nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers are unavailable") }, color = Mist, fontSize = 13.sp) } } }
    Spacer(Modifier.height(10.dp))
    Surface(color = Color(0xFF0C1516), shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .55f)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            RemoteStatusLine(Icons.Outlined.Security, nexusCopy("Trasporto privato", "Private transport"), if (online) nexusCopy("Connessione autenticata attiva", "Authenticated connection active") else nexusCopy("In attesa della workstation", "Waiting for workstation"), online)
            RemoteStatusLine(Icons.Outlined.Sync, nexusCopy("Continuità", "Continuity"), if (state.pendingCount > 0) nexusCopy("${state.pendingCount} richieste cifrate nel sandbox, in attesa", "${state.pendingCount} encrypted sandbox requests waiting") else nexusCopy("Coda locale sincronizzata", "Local queue synchronized"), state.pendingCount == 0)
            RemoteStatusLine(Icons.Outlined.Router, nexusCopy("Percorso", "Route"), if (state.status.contains("rete locale", ignoreCase = true)) nexusCopy("Rete locale diretta", "Direct local network") else nexusCopy("Gateway privato con fallback sicuro", "Private gateway with secure fallback"), online)
            OutlinedButton({ dispatch("probe", "") }, Modifier.fillMaxWidth().height(44.dp)) { Icon(Icons.Rounded.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(7.dp)); Text(nexusCopy("Verifica ora", "Check now")) }
        }
    }
    Spacer(Modifier.height(18.dp))
    if (state.pairingAvailable) {
        if (state.pairing) { var code by remember { mutableStateOf("") }; OutlinedTextField(code, { if (it.length <= 6) code = it.filter(Char::isDigit) }, label = { Text(nexusCopy("Codice a 6 cifre", "6-digit code")) }, singleLine = true, modifier = Modifier.fillMaxWidth()); Spacer(Modifier.height(12.dp)); Button({ dispatch("pair", code) }, Modifier.fillMaxWidth().height(52.dp), enabled = code.length == 6) { Text(nexusCopy("Associa workstation", "Pair workstation")) } } else OutlinedButton({ dispatch("pairing", "") }, Modifier.fillMaxWidth().height(50.dp)) { Icon(Icons.Rounded.AddLink, null); Spacer(Modifier.width(8.dp)); Text(nexusCopy("Associa un altro dispositivo", "Pair another device")) }
        SectionLabel(nexusCopy("DISPOSITIVI ASSOCIATI", "PAIRED DEVICES"))
        if (state.devices.isEmpty()) {
            if (checking) DeviceSkeleton(state.reduceMotion) else Text(nexusCopy("L’elenco sicuro sarà disponibile dopo la prossima sincronizzazione del gateway.", "The secure device list will appear after the next gateway sync."), color = Mist, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(vertical = 10.dp))
        }
        state.devices.forEach { device -> ListItem(headlineContent = { Text(device.name) }, supportingContent = { Text("${if (device.current) nexusCopy("Questo dispositivo · ", "This device · ") else ""}${relativeTimeLabel(device.lastSeenAt)}") }, leadingContent = { Icon(if (device.scope == "console") Icons.Rounded.Computer else Icons.Rounded.PhoneAndroid, null, tint = if (device.current) Cyan else Mist) }, trailingContent = { if (device.current) AssistChip(onClick = {}, label = { Text(nexusCopy("Attivo", "Active")) }) }, colors = ListItemDefaults.colors(containerColor = Color.Transparent)) }
    }
    if (state.wakePairingAvailable || state.wakeAvailable) WakeRelaySection(state, dispatch)
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable private fun WakeRelaySection(state: NexusUiState, dispatch: (String, String) -> Unit) {
    var code by rememberSaveable(state.wakePairingAvailable) { mutableStateOf("") }
    SectionLabel(nexusCopy("ACCENSIONE PRIVATA", "PRIVATE WAKE"))
    Surface(color = Color(0xFF0B1516), shape = RoundedCornerShape(20.dp), border = androidx.compose.foundation.BorderStroke(1.dp, if (state.wakeConnected) Cyan.copy(alpha = .28f) else Hairline.copy(alpha = .55f)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).background(Cyan.copy(alpha = .11f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.PowerSettingsNew, null, tint = Cyan, modifier = Modifier.size(21.dp)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(nexusCopy("Risveglio workstation", "Wake workstation"), fontWeight = FontWeight.SemiBold)
                    Text(state.wakeStatus.ifBlank { nexusCopy("Connessione privata", "Private connection") }, color = Mist, fontSize = 12.sp, lineHeight = 17.sp)
                }
                if (state.wakeBusy) CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 1.8.dp, color = Cyan)
                else Box(Modifier.size(9.dp).background(if (state.wakeConnected) Color(0xFF69DCAE) else Hairline, CircleShape))
            }
            when {
                state.wakePairingAvailable && !state.wakeAvailable -> {
                    Text(nexusCopy("Inserisci il codice creato sul relay privato. Nessun indirizzo di rete o dato hardware viene mostrato nell’app.", "Enter the code created on the private relay. No network address or hardware data is shown in the app."), color = Mist, fontSize = 12.sp, lineHeight = 17.sp)
                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, label = { Text(nexusCopy("Codice a 6 cifre", "6-digit code")) }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !state.wakeBusy)
                    Button({ dispatch("pairWake", code) }, Modifier.fillMaxWidth().height(48.dp), enabled = code.length == 6 && !state.wakeBusy) { Text(nexusCopy("Associa relay", "Pair relay")) }
                }
                state.wakeAvailable -> {
                    if (state.wakeTargets.size > 1) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        state.wakeTargets.forEach { target -> FilterChip(selected = state.wakeSelectedTarget == target.id, onClick = { dispatch("selectWake", target.id) }, label = { Text(target.label) }, enabled = state.wakeConnected && !state.wakeBusy) }
                    } else state.wakeTargets.firstOrNull()?.let { Text(it.label, color = Ice, fontSize = 13.sp, fontWeight = FontWeight.Medium) }
                    if (state.wakeAwaiting) {
                        Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 1.6.dp, color = Cyan); Spacer(Modifier.width(9.dp)); Text(nexusCopy("Riconnessione automatica in corso", "Automatic reconnection in progress"), color = Mist, fontSize = 12.sp) }
                    }
                    Button(
                        onClick = { dispatch(if (state.wakeConnected) "planWake" else "probeWake", state.wakeSelectedTarget) },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        enabled = !state.wakeBusy && !state.wakeAwaiting && state.wakeSelectedTarget.isNotBlank()
                    ) { Icon(if (state.wakeConnected) Icons.Rounded.PowerSettingsNew else Icons.Rounded.Refresh, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(if (state.wakeConnected) nexusCopy("Prepara risveglio", "Prepare wake") else nexusCopy("Riconnetti relay", "Reconnect relay")) }
                    Text(nexusCopy("Prima dell’invio vedrai un’anteprima e Android richiederà biometria o PIN.", "Before sending, you will see a preview and Android will require biometrics or PIN."), color = Mist, fontSize = 11.sp, lineHeight = 16.sp)
                }
            }
        }
    }
}

@Composable private fun RemoteStatusLine(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String, healthy: Boolean) = Row(verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(34.dp).background(if (healthy) Cyan.copy(alpha = .12f) else Surface2, CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = if (healthy) Cyan else Mist, modifier = Modifier.size(18.dp)) }
    Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(title, fontSize = 13.sp, fontWeight = FontWeight.Medium); Text(detail, color = Mist, fontSize = 11.sp, lineHeight = 15.sp) }
}

@Composable private fun LibrarySkeleton(reduceMotion: Boolean) {
    val shimmer = nexusLoopFloat(!reduceMotion, .24f, .64f, NexusFlow.SKELETON_PULSE, RepeatMode.Reverse, "libraryShimmer", disabledValue = .46f)
    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { repeat(4) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(44.dp).background(Surface2.copy(alpha = shimmer), CircleShape)); Spacer(Modifier.width(14.dp)); Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) { Box(Modifier.fillMaxWidth(.62f).height(13.dp).background(Surface2.copy(alpha = shimmer), CircleShape)); Box(Modifier.fillMaxWidth(.86f).height(10.dp).background(Surface2.copy(alpha = shimmer * .72f), CircleShape)) } } } }
}

@Composable private fun DeviceSkeleton(reduceMotion: Boolean) {
    val shimmer = nexusLoopFloat(!reduceMotion, .28f, .62f, NexusFlow.SKELETON_PULSE, RepeatMode.Reverse, "deviceShimmer", disabledValue = .5f)
    Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { repeat(2) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(42.dp).background(Surface2.copy(alpha = if (reduceMotion) .5f else shimmer), CircleShape)); Spacer(Modifier.width(12.dp)); Column(verticalArrangement = Arrangement.spacedBy(7.dp)) { Box(Modifier.width(150.dp).height(12.dp).background(Surface2.copy(alpha = if (reduceMotion) .5f else shimmer), CircleShape)); Box(Modifier.width(92.dp).height(9.dp).background(Surface2.copy(alpha = if (reduceMotion) .38f else shimmer * .8f), CircleShape)) } } } }
}

@Composable private fun ScheduledScreen(dispatch: (String, String) -> Unit) {
    val prompt = nexusCopy("Pianifica questa attività: ", "Schedule this task: ")
    Page(nexusCopy("Programmate", "Scheduled"), dispatch) { Text(nexusCopy("Prepara attività ricorrenti da eseguire sulla workstation NexusNXS.", "Prepare recurring tasks to run on your NexusNXS workstation."), color = Mist); Spacer(Modifier.height(22.dp)); Button({ dispatch("work", ""); dispatch("draft", prompt) }, Modifier.fillMaxWidth().height(52.dp)) { Icon(Icons.Rounded.AddAlarm, null); Spacer(Modifier.width(8.dp)); Text(nexusCopy("Crea attività", "Create task")) } }
}

@Composable private fun UserAvatar(uri: String, size: androidx.compose.ui.unit.Dp, description: String, modifier: Modifier = Modifier, online: Boolean = false) {
    val context = LocalContext.current
    val bitmap = remember(uri) { if (uri.isBlank()) null else runCatching { context.contentResolver.openInputStream(uri.toUri())?.use(BitmapFactory::decodeStream)?.asImageBitmap() }.getOrNull() }
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().clip(CircleShape).background(Surface2).border(1.dp, Hairline, CircleShape), contentAlignment = Alignment.Center) { if (bitmap != null) Image(bitmap, description, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Icon(Icons.Rounded.Person, description, tint = Ice, modifier = Modifier.fillMaxSize(.56f)) }
        if (online) Box(Modifier.align(Alignment.BottomEnd).size(size * .24f).background(Color(0xFF090D0E), CircleShape).padding(2.dp).background(Cyan, CircleShape))
    }
}

@Composable private fun SettingsScreen(state: NexusUiState, dispatch: (String, String) -> Unit) = Page(nexusCopy("Profilo", "Profile"), dispatch) {
    var confirmClear by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val largeText = LocalDensity.current.fontScale > 1.3f
    val profilePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.takeIf { it.scheme.equals("content", ignoreCase = true) }?.let { runCatching { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION) }; dispatch("profilePhoto", it.toString()) } }
    Surface(color = Surface, shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
        if (largeText) Column(Modifier.fillMaxWidth().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) { UserAvatar(state.profileUri, 64.dp, nexusCopy("Scegli foto profilo", "Choose profile photo"), Modifier.clickable { profilePicker.launch(arrayOf("image/*")) }); Spacer(Modifier.height(12.dp)); Text(nexusCopy("NexusNXS personale", "Personal NexusNXS"), fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center); Text(nexusCopy("Tocca la foto per cambiarla", "Tap the photo to change it"), color = Mist, fontSize = 13.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
        else Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { UserAvatar(state.profileUri, 64.dp, nexusCopy("Scegli foto profilo", "Choose profile photo"), Modifier.clickable { profilePicker.launch(arrayOf("image/*")) }); Spacer(Modifier.width(14.dp)); Column(Modifier.weight(1f)) { Text(nexusCopy("NexusNXS personale", "Personal NexusNXS"), fontWeight = FontWeight.Bold); Text(nexusCopy("Tocca la foto per cambiarla", "Tap the photo to change it"), color = Mist, fontSize = 13.sp) } }
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth >= 700.dp) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) { SettingsNexusGroup(state, dispatch); SettingsDevicesGroup(state, dispatch) }
            Column(Modifier.weight(1f)) { SettingsPrivacyGroup(state, dispatch) { confirmClear = true } }
        } else Column { SettingsNexusGroup(state, dispatch); SettingsPrivacyGroup(state, dispatch) { confirmClear = true }; SettingsDevicesGroup(state, dispatch) }
    }
    if (confirmClear) AlertDialog(onDismissRequest = { confirmClear = false }, title = { Text(nexusCopy("Cancellare tutte le chat?", "Delete all chats?")) }, text = { Text(nexusCopy("Questa operazione elimina la cronologia locale dal telefono e non può essere annullata.", "This removes local chat history from the phone and cannot be undone.")) }, confirmButton = { TextButton({ confirmClear = false; dispatch("clear", "") }) { Text(nexusCopy("Cancella", "Delete"), color = Color(0xFFFF8A80)) } }, dismissButton = { TextButton({ confirmClear = false }) { Text(nexusCopy("Annulla", "Cancel")) } }, containerColor = Surface)
}

@Composable private fun SettingsNexusGroup(state: NexusUiState, dispatch: (String, String) -> Unit) { SectionLabel("NEXUSNXS"); SettingsGroup { CompactSetting(Icons.Rounded.Memory, nexusCopy("Modello predefinito", "Default model"), state.model, { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("modelSheet", "") }; CompactSetting(Icons.Rounded.Animation, nexusCopy("Riduci animazioni", "Reduce motion"), nexusCopy("Transizioni e pulsazioni più discrete", "Subtler transitions and pulses"), { Switch(state.reduceMotion, { dispatch("reduceMotion", "") }) }) { dispatch("reduceMotion", "") }; if (android.os.Build.VERSION.SDK_INT >= 31) CompactSetting(Icons.Rounded.Vibration, nexusCopy("Feedback aptico", "Haptic feedback"), nexusCopy("Conferme discrete per gesture e cambi modalità", "Subtle feedback for gestures and mode changes"), { Switch(state.hapticsEnabled, { dispatch("haptics", "") }) }) { dispatch("haptics", "") } } }

@Composable private fun SettingsPrivacyGroup(state: NexusUiState, dispatch: (String, String) -> Unit, clear: () -> Unit) { SectionLabel(nexusCopy("PRIVACY E DATI", "PRIVACY AND DATA")); SettingsGroup { CompactSetting(Icons.Rounded.VisibilityOff, nexusCopy("Modalità privacy", "Privacy mode"), nexusCopy("Nasconde anteprime, schermate recenti e notifiche sensibili", "Hides previews, recent screens, and sensitive notifications"), { Switch(state.privacyMode, { dispatch("privacyMode", "") }) }) { dispatch("privacyMode", "") }; CompactSetting(Icons.Outlined.HealthAndSafety, nexusCopy("Diagnostica NexusNXS", "NexusNXS diagnostics"), nexusCopy("Connessione, sessione, coda e protezioni locali", "Connection, session, queue, and local protections"), { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("diagnostics", "") }; CompactSetting(Icons.Rounded.Backup, nexusCopy("Esporta backup cifrato", "Export encrypted backup"), nexusCopy("Archivio leggibile soltanto su questo dispositivo", "Archive readable only on this device"), { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("exportBackup", "") }; CompactSetting(Icons.Rounded.Restore, nexusCopy("Ripristina backup", "Restore backup"), nexusCopy("Importa conversazioni senza sovrascrivere quelle presenti", "Import conversations without replacing existing ones"), { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("importBackup", "") }; CompactSetting(Icons.Rounded.DeleteOutline, nexusCopy("Cancella chat locali", "Delete local chats"), nexusCopy("Rimuove la cronologia dal telefono", "Removes history from this phone"), {}, clear) } }

@Composable private fun SettingsDevicesGroup(state: NexusUiState, dispatch: (String, String) -> Unit) {
    SectionLabel(nexusCopy("DISPOSITIVI", "DEVICES"))
    SettingsGroup {
        CompactSetting(Icons.Rounded.PhoneAndroid, android.os.Build.MODEL, nexusCopy("Questo telefono", "This phone") + " · Android ${android.os.Build.VERSION.RELEASE}", {}) {}
        if (state.pairingAvailable || state.wakePairingAvailable || state.wakeAvailable) CompactSetting(Icons.Rounded.Computer, "Workstation NexusNXS", if (state.wakeAvailable) state.wakeStatus else state.status, { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("remote", "") }
    }
}

@Composable private fun DiagnosticsDialog(state: NexusUiState, close: () -> Unit) {
    val online = state.connection == NexusConnection.ONLINE
    val context = LocalContext.current
    val diagnostics = remember { context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE) }
    val firstTextMs = diagnostics.getLong("stream.lastFirstTextMs", 0L)
    val responseDurationMs = diagnostics.getLong("stream.lastDurationMs", 0L)
    val tokensPerSecond = diagnostics.getFloat("stream.lastTokensPerSecond", 0f)
    val recentSlowRatio = diagnostics.getFloat("frameHealth.recentSlowRatio", 0f)
    val smoothFrames = ((1f - recentSlowRatio).coerceIn(0f, 1f) * 100f).toInt()
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(color = Surface, shape = RoundedCornerShape(26.dp), modifier = Modifier.fillMaxWidth(.92f).widthIn(max = 560.dp)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.HealthAndSafety, null, tint = Cyan); Spacer(Modifier.width(10.dp)); Text(nexusCopy("Diagnostica NexusNXS", "NexusNXS diagnostics"), fontSize = 21.sp, fontWeight = FontWeight.SemiBold); Spacer(Modifier.weight(1f)); IconButton(close) { Icon(Icons.Rounded.Close, nexusCopy("Chiudi", "Close")) } }
                DiagnosticLine(nexusCopy("Servizio NexusNXS", "NexusNXS service"), if (online) nexusCopy("Raggiungibile", "Reachable") else nexusCopy("Riconnessione automatica", "Automatic reconnection"), online)
                DiagnosticLine(nexusCopy("Sessione", "Session"), if (state.pairingAvailable && state.devices.isNotEmpty()) nexusCopy("Dispositivo associato", "Paired device") else nexusCopy("Modalità locale", "Local mode"), true)
                DiagnosticLine(nexusCopy("Coda", "Queue"), if (state.pendingCount == 0) nexusCopy("Integra e sincronizzata", "Healthy and synchronized") else nexusCopy("${state.pendingCount} richieste protette", "${state.pendingCount} protected requests"), state.pendingCount == 0)
                DiagnosticLine(nexusCopy("Credenziali", "Credentials"), nexusCopy("Cifrate con Android Keystore", "Encrypted with Android Keystore"), true)
                DiagnosticLine(nexusCopy("Chat temporanea", "Temporary chat"), nexusCopy("Screenshot, recenti e salvataggio bloccati", "Screenshots, recents, and saving blocked"), true)
                if (firstTextMs > 0L) DiagnosticLine(nexusCopy("Prima risposta", "First response"), String.format(Locale.getDefault(), "%.2f s", firstTextMs / 1_000f), firstTextMs < 4_000L)
                if (tokensPerSecond > 0f) DiagnosticLine(nexusCopy("Velocità generazione", "Generation speed"), String.format(Locale.getDefault(), "%.1f token/s · %.1f s", tokensPerSecond, responseDurationMs / 1_000f), tokensPerSecond >= 8f)
                DiagnosticLine(nexusCopy("Fluidità interfaccia", "Interface smoothness"), "$smoothFrames%", smoothFrames >= 88)
                Text(nexusCopy("La diagnostica non legge né esporta il contenuto delle conversazioni.", "Diagnostics never reads or exports conversation content."), color = Mist, fontSize = 11.sp, lineHeight = 16.sp)
                Button(close, modifier = Modifier.fillMaxWidth()) { Text(nexusCopy("Fine", "Done")) }
            }
        }
    }
}

@Composable private fun DiagnosticLine(label: String, value: String, healthy: Boolean) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(9.dp).background(if (healthy) Color(0xFF69DCAE) else Color(0xFFF0C76A), CircleShape)); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(label, fontSize = 13.sp, fontWeight = FontWeight.Medium); Text(value, color = Mist, fontSize = 12.sp) } }

@Composable private fun SettingsGroup(content: @Composable ColumnScope.() -> Unit) = Surface(color = Surface, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) { Column(content = content) }

@Composable private fun CompactSetting(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String, trailing: @Composable () -> Unit, click: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val fontScale = LocalDensity.current.fontScale
    val background by animateColorAsState(if (pressed) Cyan.copy(alpha = .065f) else Color.Transparent, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "settingPress")
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(background).clickable(interactionSource = interaction, indication = null, onClick = click).padding(horizontal = 15.dp, vertical = if (fontScale > 1.3f) 16.dp else 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (pressed) Cyan else Mist, modifier = Modifier.size(21.dp)); Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) { Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(detail, color = Mist, fontSize = 12.sp, maxLines = if (fontScale > 1.3f) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis) }
        Box(Modifier.widthIn(min = 48.dp), contentAlignment = Alignment.CenterEnd) { trailing() }
    }
}

@Composable private fun SectionLabel(value: String) { Text(value, color = Mist, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.1.sp, modifier = Modifier.padding(start = 4.dp, top = 20.dp, bottom = 7.dp)) }
