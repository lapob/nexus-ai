package local.nexus.remote

import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.SpeechRecognizer

/** Reuses an installed speech provider, never selecting itself recursively. */
class NexusRecognitionService : RecognitionService() {
    private var recognizer: SpeechRecognizer? = null

    override fun onStartListening(intent: Intent, listener: Callback) {
        if (recognizer != null) {
            listener.error(SpeechRecognizer.ERROR_RECOGNIZER_BUSY)
            return
        }
        val provider = packageManager.queryIntentServices(Intent(SERVICE_INTERFACE), 0)
            .firstOrNull { it.serviceInfo.packageName != packageName }?.serviceInfo
        if (provider == null) {
            listener.error(SpeechRecognizer.ERROR_CLIENT)
            return
        }
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this, ComponentName(provider.packageName, provider.name)).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) = listener.readyForSpeech(params ?: Bundle())
                    override fun onBeginningOfSpeech() = listener.beginningOfSpeech()
                    override fun onRmsChanged(rmsdB: Float) = listener.rmsChanged(rmsdB)
                    override fun onBufferReceived(buffer: ByteArray?) { if (buffer != null) listener.bufferReceived(buffer) }
                    override fun onEndOfSpeech() = listener.endOfSpeech()
                    override fun onError(error: Int) { listener.error(error); releaseRecognizer() }
                    override fun onResults(results: Bundle?) { listener.results(results ?: Bundle()); releaseRecognizer() }
                    override fun onPartialResults(partialResults: Bundle?) = listener.partialResults(partialResults ?: Bundle())
                    override fun onEvent(eventType: Int, params: Bundle?) { }
                })
                startListening(intent)
            }
        } catch (_: RuntimeException) {
            releaseRecognizer()
            listener.error(SpeechRecognizer.ERROR_CLIENT)
        }
    }

    override fun onStopListening(listener: Callback) { recognizer?.stopListening() }
    override fun onCancel(listener: Callback) { releaseRecognizer() }
    private fun releaseRecognizer() { recognizer?.destroy(); recognizer = null }
    override fun onDestroy() { releaseRecognizer(); super.onDestroy() }
}
