package local.nexus.remote

import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

/** Android owns invocation and permission; this service never records in the background. */
class NexusVoiceInteractionService : VoiceInteractionService()

class NexusVoiceSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = object : VoiceInteractionSession(this) {
        override fun onShow(args: Bundle?, showFlags: Int) {
            super.onShow(args, showFlags)
            setUiEnabled(false)
            // Reuse the real Core and its microphone/connection lifecycle, not a second client.
            startAssistantActivity(Intent(this@NexusVoiceSessionService, NexusAssistantActivity::class.java).apply {
                action = Intent.ACTION_ASSIST
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            })
            // Keep the session alive while its assistant task is active.
            // Finishing here can tear down the activity before voice starts.
        }
    }
}
