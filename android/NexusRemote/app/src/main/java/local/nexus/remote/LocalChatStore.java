package local.nexus.remote;

import android.content.Context;
import android.util.Base64;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** Archivio privato delle conversazioni anonime, confinato nel sandbox Android. */
public final class LocalChatStore extends SQLiteOpenHelper {
    private final SecureChatCodec codec = new SecureChatCodec();
    public static final int MAX_COMPOSER_ATTACHMENT_BYTES = 1_500_000;
    private static final int MAX_COMPOSER_FILE_BYTES = 2_800_000;
    private final File composerDirectory;
    public LocalChatStore(Context context) { this(context, null); }
    LocalChatStore(Context context, SQLiteDatabase.CursorFactory cursorFactory) {
        super(context, "nexusnxs-chats.db", cursorFactory, 8);
        composerDirectory = new File(context.getNoBackupFilesDir(), "nexus-composer");
    }

    private void createComposerTable(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS conversation_composers(conversation_id TEXT PRIMARY KEY,draft TEXT NOT NULL DEFAULT '',attachment_file TEXT NOT NULL DEFAULT '',FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE turns(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
        db.execSQL("CREATE INDEX turns_conversation ON turns(conversation_id,id)");
        db.execSQL("CREATE TABLE pending_requests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,prompt TEXT NOT NULL,model TEXT NOT NULL,attachment TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
        db.execSQL("CREATE INDEX pending_requests_due ON pending_requests(last_attempt_at,created_at)");
        createComposerTable(db);
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) db.execSQL("ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
        if (oldVersion < 3) {
            db.execSQL("CREATE TABLE pending_requests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,prompt TEXT NOT NULL,model TEXT NOT NULL,attachment TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
            db.execSQL("CREATE INDEX pending_requests_due ON pending_requests(last_attempt_at,created_at)");
        }
        if (oldVersion < 4) db.execSQL("ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
        if (oldVersion < 5) encryptExistingHistory(db);
        if (oldVersion < 6) db.execSQL("ALTER TABLE turns ADD COLUMN metadata TEXT NOT NULL DEFAULT ''");
        if (oldVersion < 7) {
            // Earlier connections did not enforce CASCADE. Remove only children
            // whose conversation has already been deleted by the user.
            db.execSQL("DELETE FROM turns WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE conversations.id=turns.conversation_id)");
            db.execSQL("DELETE FROM pending_requests WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE conversations.id=pending_requests.conversation_id)");
        }
        if (oldVersion < 8) createComposerTable(db);
    }

    private void encryptExistingHistory(SQLiteDatabase db) {
        for (String table : new String[]{"conversations", "turns", "pending_requests"}) {
                String[] columns = table.equals("conversations") ? new String[]{"title"} : table.equals("turns") ? new String[]{"content"} : new String[]{"prompt", "model", "attachment"};
                try (Cursor rows = db.rawQuery("SELECT rowid," + String.join(",", columns) + " FROM " + table, null)) {
                    while (rows.moveToNext()) for (int i = 0; i < columns.length; i++)
                        db.execSQL("UPDATE " + table + " SET " + columns[i] + "=? WHERE rowid=?", new Object[]{codec.encrypt(rows.getString(i + 1)), rows.getLong(0)});
                }
        }
    }

    public boolean hasConversation(String id) {
        if (id == null || id.isEmpty()) return false;
        try (Cursor row = getReadableDatabase().rawQuery("SELECT 1 FROM conversations WHERE id=?", new String[]{id})) {
            return row.moveToFirst();
        }
    }

    public synchronized String getDraft(String id) {
        try (Cursor row = getReadableDatabase().rawQuery("SELECT draft FROM conversation_composers WHERE conversation_id=?", new String[]{id})) {
            return row.moveToFirst() ? codec.decrypt(row.getString(0)) : "";
        }
    }

    public synchronized boolean saveDraft(String id, String value) {
        String draft = value == null ? "" : value;
        if (draft.length() > 80_000) throw new IllegalArgumentException("Bozza troppo lunga");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            if (!hasConversation(id)) { db.setTransactionSuccessful(); return false; }
            db.execSQL("INSERT OR IGNORE INTO conversation_composers(conversation_id) VALUES(?)", new Object[]{id});
            db.execSQL("UPDATE conversation_composers SET draft=? WHERE conversation_id=?", new Object[]{codec.encrypt(draft), id});
            removeEmptyComposer(db, id);
            db.setTransactionSuccessful();
            return true;
        } finally { db.endTransaction(); }
    }

    private void removeEmptyComposer(SQLiteDatabase db, String id) {
        db.delete("conversation_composers", "conversation_id=? AND draft='' AND attachment_file=''", new String[]{id});
    }

    private String composerAttachmentName(String id) {
        try (Cursor row = getReadableDatabase().rawQuery("SELECT attachment_file FROM conversation_composers WHERE conversation_id=?", new String[]{id})) {
            return row.moveToFirst() ? row.getString(0) : "";
        }
    }

    private File composerFile(String name) {
        // Only store-generated basenames may address this private directory.
        if (!name.matches("[a-f0-9-]{36}\\.nxs")) throw new IllegalStateException("Allegato locale non valido");
        return new File(composerDirectory, name);
    }

    private JSONObject normalizedAttachment(JSONObject source) throws Exception {
        String data = source.optString("data");
        if (data.length() > ((MAX_COMPOSER_ATTACHMENT_BYTES + 2) / 3) * 4) throw new IllegalArgumentException("Allegato troppo grande");
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        if (bytes.length == 0 || bytes.length > MAX_COMPOSER_ATTACHMENT_BYTES) throw new IllegalArgumentException("Allegato vuoto o troppo grande");
        String name = source.optString("name"), mime = source.optString("mime");
        return new JSONObject().put("name", name.substring(0, Math.min(name.length(), 120)))
            .put("mime", mime.substring(0, Math.min(mime.length(), 80)))
            .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
    }

    public synchronized JSONObject getComposerAttachment(String id) {
        String name = composerAttachmentName(id);
        if (name.isEmpty()) return null;
        try {
            File file = composerFile(name);
            if (file.length() < 1 || file.length() > MAX_COMPOSER_FILE_BYTES) throw new IllegalStateException("Allegato locale non disponibile");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] bytes = new byte[(int) file.length()];
                int offset = 0, count;
                while (offset < bytes.length && (count = input.read(bytes, offset, bytes.length - offset)) != -1) offset += count;
                if (offset != bytes.length || input.read() != -1) throw new IllegalStateException("Allegato locale incompleto");
                String encrypted = new String(bytes, StandardCharsets.UTF_8);
                if (!encrypted.startsWith("nexus:v1:")) throw new IllegalStateException("Allegato locale non autenticato");
                return normalizedAttachment(new JSONObject(codec.decrypt(encrypted)));
            }
        } catch (Exception error) { throw new IllegalStateException("Impossibile recuperare l’allegato locale", error); }
    }

    public synchronized boolean saveComposerAttachment(String id, JSONObject attachment) {
        SQLiteDatabase db = getWritableDatabase();
        String previous = "", next = "";
        boolean written = false, committed = false, transactionEnded = false;
        db.beginTransaction();
        try {
            if (!hasConversation(id)) { db.setTransactionSuccessful(); return false; }
            previous = composerAttachmentName(id);
            if (attachment != null) {
                byte[] encrypted = codec.encrypt(normalizedAttachment(attachment).toString()).getBytes(StandardCharsets.UTF_8);
                if (encrypted.length > MAX_COMPOSER_FILE_BYTES) throw new IllegalArgumentException("Allegato troppo grande");
                if (!composerDirectory.isDirectory() && !composerDirectory.mkdirs()) throw new IllegalStateException("Archivio allegati non disponibile");
                next = UUID.randomUUID().toString() + ".nxs";
                try (FileOutputStream output = new FileOutputStream(composerFile(next))) {
                    output.write(encrypted);
                    output.getFD().sync();
                }
            }
            db.execSQL("INSERT OR IGNORE INTO conversation_composers(conversation_id) VALUES(?)", new Object[]{id});
            db.execSQL("UPDATE conversation_composers SET attachment_file=? WHERE conversation_id=?", new Object[]{next, id});
            removeEmptyComposer(db, id);
            db.setTransactionSuccessful();
            written = true;
        } catch (Exception error) { throw new IllegalStateException("Impossibile conservare l’allegato", error); }
        finally {
            try { db.endTransaction(); transactionEnded = true; committed = written; }
            finally {
                // An uncertain commit keeps both files; the next successful reopen
                // can reclaim the unreferenced one from the authoritative DB state.
                if (transactionEnded && !committed && !next.isEmpty()) composerFile(next).delete();
                if (transactionEnded && committed && !previous.isEmpty()) composerFile(previous).delete();
            }
        }
        return committed;
    }

    public synchronized void clearComposer(String id) {
        String name = composerAttachmentName(id);
        getWritableDatabase().delete("conversation_composers", "conversation_id=?", new String[]{id});
        if (!name.isEmpty()) composerFile(name).delete();
    }

    /** Accepts a user turn and consumes its composer in one durable transaction. */
    public synchronized String acceptUserMessage(String id, String content, String prompt, String model, String attachment, boolean queued) {
        SQLiteDatabase db = getWritableDatabase();
        String request = "";
        db.beginTransaction();
        try {
            if (!hasConversation(id)) throw new IllegalArgumentException("Conversazione non disponibile");
            addTurn(id, "user", content);
            if (queued) {
                request = queueRequest(id, prompt, model, attachment);
                db.delete("conversation_composers", "conversation_id=?", new String[]{id});
            } else saveDraft(id, "");
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        // File cleanup must never turn an accepted request into an apparent send failure.
        try { pruneComposerAttachments(); } catch (RuntimeException ignored) { }
        return request;
    }

    public synchronized String branchWithDraft(String sourceId, int beforeTurnIndex, String draft) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String id = branchConversation(sourceId, beforeTurnIndex);
            saveDraft(id, draft);
            db.setTransactionSuccessful();
            return id;
        } finally { db.endTransaction(); }
    }

    public synchronized String saveTemporaryConversation(JSONArray turns, String draft, JSONObject attachment) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String id = createConversation();
            for (int index = 0; index < turns.length(); index++) {
                JSONObject turn = turns.optJSONObject(index);
                if (turn != null) addTurn(id, turn.optString("role"), turn.optString("content"), turn.optJSONArray("artifacts") == null ? "" : turn.optJSONArray("artifacts").toString());
            }
            saveDraft(id, draft);
            saveComposerAttachment(id, attachment);
            db.setTransactionSuccessful();
            return id;
        } finally { db.endTransaction(); }
    }

    /** Reclaims only our unreferenced encrypted files, including an interrupted pre-commit write. */
    public synchronized void pruneComposerAttachments() {
        Set<String> retained = new HashSet<>();
        try (Cursor rows = getReadableDatabase().rawQuery("SELECT attachment_file FROM conversation_composers WHERE attachment_file<>''", null)) {
            while (rows.moveToNext()) retained.add(rows.getString(0));
        }
        File[] files = composerDirectory.listFiles();
        if (files != null) for (File file : files) {
            if (file.isFile() && file.getName().matches("[a-f0-9-]{36}\\.nxs") && !retained.contains(file.getName())) file.delete();
        }
    }

    public String createConversation() {
        String id = UUID.randomUUID().toString(); long now = System.currentTimeMillis();
        getWritableDatabase().execSQL("INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)", new Object[]{id, codec.encrypt("Nuova conversazione"), now, now});
        return id;
    }

    public void addTurn(String conversationId, String role, String content) {
        addTurn(conversationId, role, content, "");
    }

    public void addTurn(String conversationId, String role, String content, String metadata) {
        long now = System.currentTimeMillis();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            // A user may delete a chat while an asynchronous reply is arriving.
            // Keep deletion final; do not recreate the chat or crash the worker.
            try (Cursor parent = db.rawQuery("SELECT id FROM conversations WHERE id=?", new String[]{conversationId})) {
                if (!parent.moveToFirst()) { db.setTransactionSuccessful(); return; }
            }
            db.execSQL("INSERT INTO turns(conversation_id,role,content,metadata,created_at) VALUES(?,?,?,?,?)", new Object[]{conversationId, role, codec.encrypt(content), codec.encrypt(metadata == null ? "" : metadata), now});
            if ("user".equals(role)) {
                String title = ""; try (Cursor row = db.rawQuery("SELECT title FROM conversations WHERE id=?", new String[]{conversationId})) { if (row.moveToFirst()) title = codec.decrypt(row.getString(0)); }
                if ("Nuova conversazione".equals(title)) db.execSQL("UPDATE conversations SET title=?,updated_at=? WHERE id=?", new Object[]{codec.encrypt(content.substring(0, Math.min(72, content.length()))), now, conversationId});
                else db.execSQL("UPDATE conversations SET updated_at=? WHERE id=?", new Object[]{now, conversationId});
            }
            else db.execSQL("UPDATE conversations SET updated_at=? WHERE id=?", new Object[]{now, conversationId});
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    public JSONArray list() {
        JSONArray rows = new JSONArray();
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT c.id,c.title,c.updated_at,COALESCE((SELECT content FROM turns t WHERE t.conversation_id=c.id ORDER BY t.id DESC LIMIT 1),''),c.pinned FROM conversations c WHERE c.archived=0 ORDER BY c.pinned DESC,c.updated_at DESC", null)) {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0)); row.put("title", codec.decrypt(cursor.getString(1))); row.put("updatedAt", cursor.getLong(2)); row.put("preview", codec.decrypt(cursor.getString(3))); row.put("pinned", cursor.getInt(4) == 1); rows.put(row);
            }
        } catch (Exception ignored) { }
        return rows;
    }

    /** Ricerca locale anche nel corpo dei messaggi cifrati, senza inviare query o contenuti in rete. */
    public JSONArray search(String query) {
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) return list();
        String[] terms = normalized.split("\\s+");
        List<JSONObject> matches = new ArrayList<>();
        try (Cursor conversations = getReadableDatabase().rawQuery(
                "SELECT id,title,updated_at,pinned FROM conversations WHERE archived=0", null)) {
            while (conversations.moveToNext()) {
                String id = conversations.getString(0);
                String title = codec.decrypt(conversations.getString(1));
                StringBuilder searchable = new StringBuilder(title);
                String preview = "";
                try (Cursor turns = getReadableDatabase().rawQuery(
                        "SELECT content FROM turns WHERE conversation_id=? ORDER BY id DESC", new String[]{id})) {
                    while (turns.moveToNext()) {
                        String content = codec.decrypt(turns.getString(0));
                        if (preview.isEmpty()) preview = content;
                        searchable.append('\n').append(content);
                    }
                }
                String haystack = searchable.toString().toLowerCase(Locale.ROOT);
                int score = 0;
                boolean all = true;
                for (String term : terms) {
                    if (!haystack.contains(term)) { all = false; break; }
                    score += title.toLowerCase(Locale.ROOT).contains(term) ? 4 : 1;
                }
                if (all) {
                    JSONObject row = new JSONObject();
                    row.put("id", id); row.put("title", title); row.put("updatedAt", conversations.getLong(2));
                    row.put("preview", preview); row.put("pinned", conversations.getInt(3) == 1); row.put("score", score);
                    matches.add(row);
                }
            }
        } catch (Exception ignored) { }
        matches.sort(Comparator.<JSONObject>comparingInt(row -> row.optInt("score", 0)).reversed()
                .thenComparing(Comparator.comparingLong((JSONObject row) -> row.optLong("updatedAt", 0L)).reversed()));
        JSONArray result = new JSONArray();
        for (JSONObject row : matches) result.put(row);
        return result;
    }

    public JSONObject get(String id) {
        JSONObject row = new JSONObject(); JSONArray turns = new JSONArray();
        try (Cursor conversation = getReadableDatabase().rawQuery("SELECT title,created_at,updated_at FROM conversations WHERE id=?", new String[]{id})) {
            if (!conversation.moveToFirst()) return null;
            row.put("id", id); row.put("title", codec.decrypt(conversation.getString(0))); row.put("createdAt", conversation.getLong(1)); row.put("updatedAt", conversation.getLong(2));
        } catch (Exception error) { return null; }
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT role,content,metadata,created_at FROM turns WHERE conversation_id=? ORDER BY id", new String[]{id})) {
            while (cursor.moveToNext()) { JSONObject turn = new JSONObject(); turn.put("role", cursor.getString(0)); turn.put("content", codec.decrypt(cursor.getString(1))); String metadata = codec.decrypt(cursor.getString(2)); if (!metadata.isEmpty()) try { turn.put("artifacts", new JSONArray(metadata)); } catch (Exception ignored) { } turn.put("createdAt", cursor.getLong(3)); turns.put(turn); }
            row.put("turns", turns);
        } catch (Exception ignored) { }
        return row;
    }

    public synchronized void deleteConversation(String id) {
        getWritableDatabase().delete("conversations", "id=?", new String[]{id});
        try { pruneComposerAttachments(); } catch (RuntimeException ignored) { }
    }

    public void renameConversation(String id, String title) {
        String normalized = title == null ? "" : title.trim();
        if (normalized.isEmpty()) return;
        getWritableDatabase().execSQL(
            "UPDATE conversations SET title=?,updated_at=? WHERE id=?",
            new Object[]{codec.encrypt(normalized.substring(0, Math.min(72, normalized.length()))), System.currentTimeMillis(), id}
        );
    }

    public void togglePinned(String id) {
        getWritableDatabase().execSQL(
            "UPDATE conversations SET pinned=CASE pinned WHEN 1 THEN 0 ELSE 1 END,updated_at=? WHERE id=?",
            new Object[]{System.currentTimeMillis(), id}
        );
    }

    public void archiveConversation(String id) {
        getWritableDatabase().execSQL("UPDATE conversations SET archived=1,updated_at=? WHERE id=?", new Object[]{System.currentTimeMillis(), id});
    }

    public void restoreConversation(String id) {
        getWritableDatabase().execSQL("UPDATE conversations SET archived=0,updated_at=? WHERE id=?", new Object[]{System.currentTimeMillis(), id});
    }

    /** Crea una diramazione copiando i turni precedenti al messaggio che verrà modificato. */
    public String branchConversation(String sourceId, int beforeTurnIndex) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
          try (Cursor source = db.rawQuery("SELECT id FROM conversations WHERE id=?", new String[]{sourceId})) {
            if (!source.moveToFirst()) throw new IllegalArgumentException("Conversazione non disponibile");
          }
          String targetId = createConversation();
          try (Cursor cursor = db.rawQuery("SELECT role,content,metadata FROM turns WHERE conversation_id=? ORDER BY id LIMIT ?", new String[]{sourceId, String.valueOf(Math.max(0, beforeTurnIndex))})) {
            long now = System.currentTimeMillis();
            String firstUser = "";
            while (cursor.moveToNext()) {
                String role = cursor.getString(0), content = codec.decrypt(cursor.getString(1));
                db.execSQL("INSERT INTO turns(conversation_id,role,content,metadata,created_at) VALUES(?,?,?,?,?)", new Object[]{targetId, role, codec.encrypt(content), cursor.getString(2), now});
                if (firstUser.isEmpty() && "user".equals(role)) firstUser = content;
            }
            if (!firstUser.isEmpty()) db.execSQL("UPDATE conversations SET title=?,updated_at=? WHERE id=?", new Object[]{codec.encrypt(firstUser.substring(0, Math.min(72, firstUser.length()))), now, targetId});
            db.setTransactionSuccessful();
            return targetId;
          }
        } finally { db.endTransaction(); }
    }

    public void deleteEmptyConversationsExcept(String keepId) {
        getWritableDatabase().delete(
            "conversations",
            "id<>? AND NOT EXISTS(SELECT 1 FROM turns WHERE turns.conversation_id=conversations.id) AND NOT EXISTS(SELECT 1 FROM conversation_composers WHERE conversation_composers.conversation_id=conversations.id)",
            new String[]{keepId == null ? "" : keepId}
        );
    }

    public void deleteLegacyTransportFailureConversations() {
        SQLiteDatabase db = getWritableDatabase();
        String failures = "SELECT conversation_id FROM turns WHERE role='assistant' AND (content LIKE 'Installazione non valida.%' OR content LIKE 'Sessione anonima scaduta.%' OR content LIKE 'Il computer non è raggiungibile.%')";
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM turns WHERE conversation_id IN (" + failures + ")");
            db.execSQL("DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM turns) AND NOT EXISTS(SELECT 1 FROM conversation_composers WHERE conversation_composers.conversation_id=conversations.id)");
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    public boolean deleteLastAssistantTurn(String conversationId) {
        SQLiteDatabase db = getWritableDatabase();
        int deleted = db.delete(
            "turns",
            "id=(SELECT id FROM turns WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1)",
            new String[]{conversationId}
        );
        if (deleted > 0) db.execSQL(
            "UPDATE conversations SET updated_at=? WHERE id=?",
            new Object[]{System.currentTimeMillis(), conversationId}
        );
        return deleted > 0;
    }

    /** Salva una richiesta prima del trasporto: sopravvive a chiusura app, rete assente e riavvio. */
    public String queueRequest(String conversationId, String prompt, String model, String attachment) {
        String id = UUID.randomUUID().toString();
        getWritableDatabase().execSQL(
            "INSERT INTO pending_requests(id,conversation_id,prompt,model,attachment,created_at) VALUES(?,?,?,?,?,?)",
            new Object[]{id, conversationId, codec.encrypt(prompt), codec.encrypt(model), codec.encrypt(attachment == null ? "" : attachment), System.currentTimeMillis()}
        );
        return id;
    }

    public JSONObject nextPendingRequest() {
        // Backoff esponenziale limitato: 2, 4, 8, 16, 32, 60 secondi.
        long now = System.currentTimeMillis();
        String sql = "SELECT id,conversation_id,prompt,model,attempts,last_attempt_at,created_at,length(attachment) FROM pending_requests " +
            "WHERE last_attempt_at=0 OR last_attempt_at + MIN(60000,2000 * (1 << MIN(attempts,5))) <= ? ORDER BY created_at LIMIT 1";
        SQLiteDatabase db = getReadableDatabase();
        boolean reading = false;
        try {
            // A full encrypted 1.5 MB attachment exceeds a 2 MiB CursorWindow.
            // Read bounded slices under one snapshot so metadata and content
            // cannot come from different queue states during cancellation.
            db.beginTransactionNonExclusive();
            reading = true;
            try (Cursor cursor = db.rawQuery(sql, new String[]{String.valueOf(now)})) {
                if (!cursor.moveToFirst()) { db.setTransactionSuccessful(); return null; }
                String id = cursor.getString(0);
                int length = cursor.getInt(7);
                if (length < 0 || length > MAX_COMPOSER_FILE_BYTES) throw new IllegalStateException("Allegato in coda troppo grande");
                StringBuilder encrypted = new StringBuilder(length);
                for (int offset = 0; offset < length; offset += 64 * 1024) {
                    int count = Math.min(64 * 1024, length - offset);
                    try (Cursor chunk = db.rawQuery("SELECT substr(attachment,?,?) FROM pending_requests WHERE id=?", new String[]{String.valueOf(offset + 1), String.valueOf(count), id})) {
                        if (!chunk.moveToFirst()) throw new IllegalStateException("Richiesta in coda non disponibile");
                        String value = chunk.getString(0);
                        if (value.length() != count) throw new IllegalStateException("Allegato in coda incompleto");
                        encrypted.append(value);
                    }
                }
                JSONObject pending = new JSONObject().put("id", id).put("conversationId", cursor.getString(1))
                    .put("prompt", codec.decrypt(cursor.getString(2))).put("model", codec.decrypt(cursor.getString(3))).put("attachment", codec.decrypt(encrypted.toString()))
                    .put("attempts", cursor.getInt(4)).put("lastAttemptAt", cursor.getLong(5)).put("createdAt", cursor.getLong(6));
                db.setTransactionSuccessful();
                return pending;
            }
        } catch (Exception ignored) { return null; }
        finally { if (reading) db.endTransaction(); }
    }

    public void markPendingAttempt(String id) {
        getWritableDatabase().execSQL("UPDATE pending_requests SET attempts=attempts+1,last_attempt_at=? WHERE id=?", new Object[]{System.currentTimeMillis(), id});
    }

    public void completePendingRequest(String id) { getWritableDatabase().delete("pending_requests", "id=?", new String[]{id}); }

    public int pendingCount() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM pending_requests", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    /** Rimuove soltanto trasporti rimasti pendenti nonostante una risposta già salvata. */
    public int reconcileAnsweredPendingRequests() {
        return getWritableDatabase().delete(
            "pending_requests",
            "EXISTS (SELECT 1 FROM turns WHERE turns.conversation_id=pending_requests.conversation_id AND turns.role='assistant' AND turns.created_at>=pending_requests.created_at)",
            null
        );
    }

    public synchronized void clearAll() {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("turns", null, null);
            db.delete("conversations", null, null);
            db.delete("pending_requests", null, null);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        try { pruneComposerAttachments(); } catch (RuntimeException ignored) { }
    }

    public String exportEncryptedArchive() throws Exception {
        JSONObject archive = new JSONObject(); JSONArray conversations = new JSONArray();
        try (Cursor rows = getReadableDatabase().rawQuery("SELECT id,pinned,archived FROM conversations ORDER BY created_at,id", null)) {
            while (rows.moveToNext()) {
                JSONObject conversation = get(rows.getString(0));
                if (conversation == null) throw new IllegalStateException("Conversazione non esportabile");
                conversation.put("pinned", rows.getInt(1) == 1).put("archived", rows.getInt(2) == 1);
                conversations.put(conversation);
            }
        }
        archive.put("schema", 1).put("createdAt", System.currentTimeMillis()).put("conversations", conversations);
        return codec.encrypt(archive.toString());
    }

    public int importEncryptedArchive(String encrypted) throws Exception {
        JSONObject archive = new JSONObject(codec.decrypt(encrypted));
        if (archive.optInt("schema") != 1) throw new IllegalArgumentException("Archivio NexusNXS non supportato");
        JSONArray conversations = archive.optJSONArray("conversations"); int imported = 0;
        if (conversations == null) return 0;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
        for (int i = 0; i < conversations.length(); i++) {
            JSONObject source = conversations.optJSONObject(i); if (source == null) continue;
            String id = createConversation(); renameConversation(id, source.optString("title", "Conversazione importata"));
            JSONArray turns = source.optJSONArray("turns");
            if (turns != null) for (int turn = 0; turn < turns.length(); turn++) { JSONObject value = turns.optJSONObject(turn); if (value != null) addTurn(id, value.optString("role"), value.optString("content"), value.optJSONArray("artifacts") == null ? "" : value.getJSONArray("artifacts").toString()); }
            db.execSQL("UPDATE conversations SET pinned=?,archived=?,created_at=?,updated_at=? WHERE id=?", new Object[]{source.optBoolean("pinned") ? 1 : 0, source.optBoolean("archived") ? 1 : 0, source.optLong("createdAt", System.currentTimeMillis()), source.optLong("updatedAt", System.currentTimeMillis()), id});
            imported++;
        }
        db.setTransactionSuccessful();
        return imported;
        } finally { db.endTransaction(); }
    }
}
