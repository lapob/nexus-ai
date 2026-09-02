package local.nexus.remote;

import android.content.Context;
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
    public LocalChatStore(Context context) { super(context, "nexusnxs-chats.db", null, 6); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE turns(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
        db.execSQL("CREATE INDEX turns_conversation ON turns(conversation_id,id)");
        db.execSQL("CREATE TABLE pending_requests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,prompt TEXT NOT NULL,model TEXT NOT NULL,attachment TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
        db.execSQL("CREATE INDEX pending_requests_due ON pending_requests(last_attempt_at,created_at)");
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

    public void deleteConversation(String id) {
        getWritableDatabase().delete("conversations", "id=?", new String[]{id});
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
        String targetId = createConversation();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try (Cursor cursor = db.rawQuery("SELECT role,content FROM turns WHERE conversation_id=? ORDER BY id LIMIT ?", new String[]{sourceId, String.valueOf(Math.max(0, beforeTurnIndex))})) {
            long now = System.currentTimeMillis();
            String firstUser = "";
            while (cursor.moveToNext()) {
                String role = cursor.getString(0), content = codec.decrypt(cursor.getString(1));
                db.execSQL("INSERT INTO turns(conversation_id,role,content,created_at) VALUES(?,?,?,?)", new Object[]{targetId, role, codec.encrypt(content), now});
                if (firstUser.isEmpty() && "user".equals(role)) firstUser = content;
            }
            if (!firstUser.isEmpty()) db.execSQL("UPDATE conversations SET title=?,updated_at=? WHERE id=?", new Object[]{codec.encrypt(firstUser.substring(0, Math.min(72, firstUser.length()))), now, targetId});
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return targetId;
    }

    public void deleteEmptyConversationsExcept(String keepId) {
        getWritableDatabase().delete(
            "conversations",
            "id<>? AND NOT EXISTS(SELECT 1 FROM turns WHERE turns.conversation_id=conversations.id)",
            new String[]{keepId == null ? "" : keepId}
        );
    }

    public void deleteLegacyTransportFailureConversations() {
        SQLiteDatabase db = getWritableDatabase();
        String failures = "SELECT conversation_id FROM turns WHERE role='assistant' AND (content LIKE 'Installazione non valida.%' OR content LIKE 'Sessione anonima scaduta.%' OR content LIKE 'Il computer non è raggiungibile.%')";
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM turns WHERE conversation_id IN (" + failures + ")");
            db.execSQL("DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM turns)");
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
        String sql = "SELECT id,conversation_id,prompt,model,attachment,attempts,last_attempt_at,created_at FROM pending_requests " +
            "WHERE last_attempt_at=0 OR last_attempt_at + MIN(60000,2000 * (1 << MIN(attempts,5))) <= ? ORDER BY created_at LIMIT 1";
        try (Cursor cursor = getReadableDatabase().rawQuery(sql, new String[]{String.valueOf(now)})) {
            if (!cursor.moveToFirst()) return null;
            return new JSONObject().put("id", cursor.getString(0)).put("conversationId", cursor.getString(1))
                .put("prompt", codec.decrypt(cursor.getString(2))).put("model", codec.decrypt(cursor.getString(3))).put("attachment", codec.decrypt(cursor.getString(4)))
                .put("attempts", cursor.getInt(5)).put("lastAttemptAt", cursor.getLong(6)).put("createdAt", cursor.getLong(7));
        } catch (Exception ignored) { return null; }
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

    public void clearAll() {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("turns", null, null);
            db.delete("conversations", null, null);
            db.delete("pending_requests", null, null);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    public String exportEncryptedArchive() throws Exception {
        JSONObject archive = new JSONObject(); JSONArray conversations = new JSONArray();
        JSONArray rows = list();
        for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); JSONObject conversation = row == null ? null : get(row.optString("id")); if (conversation != null) conversations.put(conversation); }
        archive.put("schema", 1).put("createdAt", System.currentTimeMillis()).put("conversations", conversations);
        return codec.encrypt(archive.toString());
    }

    public int importEncryptedArchive(String encrypted) throws Exception {
        JSONObject archive = new JSONObject(codec.decrypt(encrypted));
        if (archive.optInt("schema") != 1) throw new IllegalArgumentException("Archivio NexusNXS non supportato");
        JSONArray conversations = archive.optJSONArray("conversations"); int imported = 0;
        if (conversations == null) return 0;
        for (int i = 0; i < conversations.length(); i++) {
            JSONObject source = conversations.optJSONObject(i); if (source == null) continue;
            String id = createConversation(); renameConversation(id, source.optString("title", "Conversazione importata"));
            JSONArray turns = source.optJSONArray("turns");
            if (turns != null) for (int turn = 0; turn < turns.length(); turn++) { JSONObject value = turns.optJSONObject(turn); if (value != null) addTurn(id, value.optString("role"), value.optString("content")); }
            imported++;
        }
        return imported;
    }
}
