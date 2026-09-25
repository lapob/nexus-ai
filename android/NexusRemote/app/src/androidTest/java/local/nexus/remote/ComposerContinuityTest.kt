package local.nexus.remote

import android.content.Context
import android.content.Intent
import android.util.Base64
import android.os.SystemClock
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Real Activity recreation in the QA sandbox, without sending messages or contacting the AI. */
@RunWith(AndroidJUnit4::class)
class ComposerContinuityTest {
    private lateinit var context: Context
    private var scenario: ActivityScenario<NexusMainActivity>? = null

    @Before fun resetSandbox() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        check(context.packageName.endsWith(".qa"))
        context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE).edit().clear().commit()
        LocalChatStore(context).use { it.clearAll() }
    }

    @After fun closeSandbox() {
        scenario?.close()
        LocalChatStore(context).use { it.clearAll() }
        context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun state(activity: NexusMainActivity): NexusUiState =
        NexusMainActivity::class.java.getDeclaredMethod("getState").apply { isAccessible = true }.invoke(activity) as NexusUiState

    private fun online(activity: NexusMainActivity) {
        NexusMainActivity::class.java.getDeclaredMethod("setState", NexusUiState::class.java).apply { isAccessible = true }
            .invoke(activity, state(activity).copy(connection = NexusConnection.ONLINE))
    }

    private fun dispatch(activity: NexusMainActivity, action: String, value: String = "") {
        NexusMainActivity::class.java.getDeclaredMethod("dispatch", String::class.java, String::class.java).apply { isAccessible = true }
            .invoke(activity, action, value)
    }

    private fun attachment(text: String) = JSONObject().put("name", "qa.txt").put("mime", "text/plain")
        .put("data", Base64.encodeToString(text.toByteArray(), Base64.NO_WRAP)).toString()

    private fun awaitAttachment(session: ActivityScenario<NexusMainActivity>) {
        val deadline = SystemClock.elapsedRealtime() + 10_000L
        var loading = true
        while (loading && SystemClock.elapsedRealtime() < deadline) {
            session.onActivity { loading = state(it).attachmentLoading }
            if (loading) SystemClock.sleep(25L)
        }
        assertFalse("Attachment import did not finish", loading)
        session.onActivity { assertNotNull(state(it).attachment) }
    }

    @Test fun switchingAndRecreationKeepEachComposerSeparate() {
        val session = ActivityScenario.launch<NexusMainActivity>(Intent(context, NexusMainActivity::class.java))
        scenario = session
        var first = ""
        var second = ""
        session.onActivity { activity ->
            online(activity)
            first = state(activity).conversationId
            dispatch(activity, "draft", "first draft")
            dispatch(activity, "attach", attachment("first file"))
        }
        awaitAttachment(session)
        session.onActivity { activity ->
            online(activity)
            dispatch(activity, "draft", "first draft")
            // Switch before the 220 ms debounce expires.
            dispatch(activity, "new")
            second = state(activity).conversationId
            assertNotEquals(first, second)
            assertNull(state(activity).attachment)
            assertEquals("", state(activity).attachmentData)
            dispatch(activity, "draft", "second draft")
            dispatch(activity, "open", first)
            assertEquals("first draft", state(activity).draft)
            assertEquals("first file", String(Base64.decode(state(activity).attachmentData, Base64.DEFAULT)))
        }
        session.moveToState(Lifecycle.State.CREATED)
        session.recreate()
        session.moveToState(Lifecycle.State.RESUMED)
        session.onActivity { activity ->
            assertEquals(first, state(activity).conversationId)
            assertEquals("first draft", state(activity).draft)
            assertEquals("first file", String(Base64.decode(state(activity).attachmentData, Base64.DEFAULT)))
            dispatch(activity, "open", second)
            assertEquals("second draft", state(activity).draft)
            assertNull(state(activity).attachment)
            assertEquals("", state(activity).attachmentData)
        }
    }

    @Test fun temporaryComposerNeverReachesPersistentStorage() {
        val session = ActivityScenario.launch<NexusMainActivity>(Intent(context, NexusMainActivity::class.java))
        scenario = session
        var permanentId = ""
        session.onActivity { activity ->
            online(activity)
            permanentId = state(activity).conversationId
            dispatch(activity, "draft", "normal draft")
            dispatch(activity, "attach", attachment("normal file"))
        }
        awaitAttachment(session)
        session.onActivity { activity ->
            online(activity)
            dispatch(activity, "temporary")
            dispatch(activity, "draft", "temporary draft")
            dispatch(activity, "attach", attachment("temporary file"))
            assertTrue(state(activity).temporary)
        }
        awaitAttachment(session)
        session.moveToState(Lifecycle.State.CREATED)
        session.recreate()
        session.moveToState(Lifecycle.State.RESUMED)
        session.onActivity { activity ->
            assertFalse(state(activity).temporary)
            dispatch(activity, "open", permanentId)
            assertEquals("normal draft", state(activity).draft)
            assertEquals("normal file", String(Base64.decode(state(activity).attachmentData, Base64.DEFAULT)))
        }
        LocalChatStore(context).use { store ->
            store.readableDatabase.rawQuery("SELECT COUNT(*) FROM conversation_composers", null).use { rows ->
                assertTrue(rows.moveToFirst())
                assertEquals(1, rows.getInt(0))
            }
        }
    }

    @Test fun failingDraftWriteKeepsTheCurrentTextAndConversationUntilRetry() {
        val session = ActivityScenario.launch<NexusMainActivity>(Intent(context, NexusMainActivity::class.java))
        scenario = session
        session.onActivity { activity ->
            online(activity)
            val first = state(activity).conversationId
            LocalChatStore(context).use { store ->
                store.saveDraft(first, "old saved draft")
                // A regular trigger also affects the Activity's separate SQLite connection.
                store.writableDatabase.execSQL("CREATE TRIGGER qa_reject_draft BEFORE UPDATE OF draft ON conversation_composers BEGIN SELECT RAISE(ABORT, 'qa write failure'); END")
                try {
                    dispatch(activity, "draft", "new unsaved draft")
                    dispatch(activity, "new")
                    assertEquals(first, state(activity).conversationId)
                    assertEquals("new unsaved draft", state(activity).draft)
                    assertNotNull(state(activity).error)
                    val conversations = store.list().length()
                    dispatch(activity, "editTurn", "0\nreplacement draft")
                    assertEquals(first, state(activity).conversationId)
                    assertEquals("new unsaved draft", state(activity).draft)
                    assertEquals(conversations, store.list().length())
                } finally { store.writableDatabase.execSQL("DROP TRIGGER qa_reject_draft") }
                dispatch(activity, "new")
                assertNotEquals(first, state(activity).conversationId)
                dispatch(activity, "open", first)
                assertEquals("new unsaved draft", state(activity).draft)
            }
        }
    }

    @Test fun interruptedLegacyMigrationRetainsPreferencesAndCanRetryOnRecreation() {
        val prefs = context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE)
        val id = LocalChatStore(context).use { store ->
            val created = store.createConversation()
            store.writableDatabase.execSQL("CREATE TRIGGER qa_reject_migration BEFORE UPDATE OF draft ON conversation_composers BEGIN SELECT RAISE(ABORT, 'qa migration failure'); END")
            created
        }
        prefs.edit().putString("currentConversationId", id).putString("draft:$id", "legacy draft").commit()
        val session = ActivityScenario.launch<NexusMainActivity>(Intent(context, NexusMainActivity::class.java))
        scenario = session
        try {
            session.onActivity { activity ->
                assertEquals(id, state(activity).conversationId)
                assertEquals("legacy draft", state(activity).draft)
                assertEquals("legacy draft", prefs.getString("draft:$id", ""))
            }
        } finally { LocalChatStore(context).use { it.writableDatabase.execSQL("DROP TRIGGER qa_reject_migration") } }
        session.recreate()
        session.onActivity { activity ->
            assertEquals("legacy draft", state(activity).draft)
            assertFalse(prefs.contains("draft:$id"))
        }
    }
}
