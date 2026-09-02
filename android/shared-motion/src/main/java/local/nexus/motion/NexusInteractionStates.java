/** Generated from config/nexus-interaction-states.json · 2bd84253e710af79. Do not edit. */
package local.nexus.motion;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public final class NexusInteractionStates {
    public static final String CONTRACT_ID = "nexusnxs-interaction-state";
    public static final String CONTINUUM_ID = "nexus-cosmic-continuum-v1";
    public static final int BOOTING = 0xFF527B80;
    public static final int IDLE = 0xFF3A9CA1;
    public static final int LISTENING = 0xFF45C89D;
    public static final int SPEAKING = 0xFF55DBE1;
    public static final int THINKING = 0xFF668FBD;
    public static final int RESPONDING = 0xFF8FD6E5;
    public static final int EXECUTING = 0xFFBD9F4F;
    public static final int PERMISSION = 0xFFC59458;
    public static final int OFFLINE = 0xFF53686A;
    public static final int ERROR = 0xFFD69A58;

    public static final class State {
        public final String id;
        public final int argb;
        public final float energy;
        public final String motion;
        State(String id, int argb, float energy, String motion) {
            this.id = id; this.argb = argb; this.energy = energy; this.motion = motion;
        }
    }

    private static final Map<String, State> STATES;
    private static final Map<String, String> ALIASES;
    static {
        Map<String, State> map = new LinkedHashMap<>();
        map.put("booting", new State("booting", 0xFF527B80, 0.08f, "materialize"));
        map.put("idle", new State("idle", 0xFF3A9CA1, 0.17f, "breathe"));
        map.put("listening", new State("listening", 0xFF45C89D, 0.42f, "listen-wave"));
        map.put("speaking", new State("speaking", 0xFF55DBE1, 0.76f, "voice-pulse"));
        map.put("thinking", new State("thinking", 0xFF668FBD, 0.58f, "reason-orbit"));
        map.put("responding", new State("responding", 0xFF8FD6E5, 0.68f, "stream"));
        map.put("executing", new State("executing", 0xFFBD9F4F, 0.76f, "execute-scan"));
        map.put("permission", new State("permission", 0xFFC59458, 0.46f, "consent-hold"));
        map.put("offline", new State("offline", 0xFF53686A, 0.04f, "quiet"));
        map.put("error", new State("error", 0xFFD69A58, 0.42f, "amber-contract"));
        STATES = Collections.unmodifiableMap(map);
        Map<String, String> aliases = new LinkedHashMap<>();
        aliases.put("connecting", "booting");
        aliases.put("understanding", "thinking");
        aliases.put("planning", "thinking");
        aliases.put("research", "thinking");
        aliases.put("researching", "thinking");
        aliases.put("searching", "thinking");
        aliases.put("reasoning", "thinking");
        aliases.put("verifying", "thinking");
        aliases.put("validating", "thinking");
        aliases.put("ready", "listening");
        aliases.put("consent", "permission");
        aliases.put("failed", "error");
        ALIASES = Collections.unmodifiableMap(aliases);
    }

    private NexusInteractionStates() {}
    public static State resolve(String value) {
        String key = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        String resolved = STATES.containsKey(key) ? key : ALIASES.getOrDefault(key, "idle");
        return STATES.get(resolved);
    }
    public static Map<String, State> all() { return STATES; }
}
