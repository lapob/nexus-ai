# NexusNXS interaction-state protocol

`config/nexus-interaction-states.json` is the single visual-state contract for
the desktop Core, the lightweight Windows Presence, the public Android client
and the public NexusNXS AI surface. A state communicates what NexusNXS is doing without
showing hidden reasoning, local model names, workstation details or private
telemetry.

Canonical states are `booting`, `idle`, `listening`, `speaking`, `thinking`,
`responding`, `executing`, `permission`, `offline` and `error`. Product phases
such as research and reasoning deliberately resolve to `thinking`; the UI may
show a concise activity label, but never private chain-of-thought.

Every client must preserve the shared color semantics, honor reduced-motion,
avoid decorative states without backend evidence and keep consent visually
distinct from execution. Changes to the contract require the interaction-state
test, desktop visual QA, Presence QA and both Android visual matrices.

Android motion has one code authority:
`android/shared-motion/src/main/java/local/nexus/motion/NexusMotion.java`.
Compose and native Views consume the same durations, cubic curves and adaptive
profile. Product code must not add literal animation durations: motion adapts to
the system animator setting, reduced motion, power saver, low-RAM devices and
the active display refresh rate.

Operational observability remains private and loopback-only. It exposes only
aggregate latency, queue/load counters and ephemeral pseudonymous access IDs;
prompts and responses are excluded.
