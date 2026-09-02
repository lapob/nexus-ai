package local.nexus.remote;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Credenziali NexusNXS cifrate con una chiave AES-GCM non esportabile. */
public final class SecureTokenStore {
    private static final String ALIAS = "nexus_ai_sessions_v1", PREFS = "nexus_ai_secure_sessions", CIPHER = "AES/GCM/NoPadding";
    private final Context context;
    public SecureTokenStore(Context context) { this.context = context.getApplicationContext(); }
    public String read(String name) {
        try { SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); String c=p.getString(name+".ciphertext", ""), iv=p.getString(name+".iv", ""); if(c.isEmpty()||iv.isEmpty()) return ""; Cipher cipher=Cipher.getInstance(CIPHER); cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP))); return new String(cipher.doFinal(Base64.decode(c,Base64.NO_WRAP)),StandardCharsets.UTF_8); } catch(Exception ignored){ clear(name); return ""; }
    }
    public void write(String name, String token) {
        if(token==null||token.isEmpty()){clear(name);return;} try { Cipher cipher=Cipher.getInstance(CIPHER); cipher.init(Cipher.ENCRYPT_MODE,key()); byte[] encrypted=cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)); context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(name+".ciphertext",Base64.encodeToString(encrypted,Base64.NO_WRAP)).putString(name+".iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).apply(); } catch(Exception error){throw new IllegalStateException("Impossibile proteggere la sessione NexusNXS",error);}
    }
    public void clear(String name){context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().remove(name+".ciphertext").remove(name+".iv").apply();}
    private SecretKey key() throws Exception { KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null); if(!store.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore"); generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()); generator.generateKey();} return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey(); }
}
