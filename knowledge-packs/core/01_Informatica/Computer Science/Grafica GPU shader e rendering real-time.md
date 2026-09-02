---
title: Grafica GPU, shader e rendering real-time
type: guide
area: computer-science
status: evergreen
level: intermediate
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [gpu, rendering, shader, webgpu]
aliases: [computer graphics, shaders]
---

# Grafica GPU, shader e rendering real-time

La grafica real-time trasforma una scena in pixel entro un budget temporale. Una pipeline moderna combina trasformazioni geometriche, rasterizzazione o ray tracing, materiali, illuminazione, compositing e presentazione.

## Modello della pipeline

- CPU: prepara scena, visibilità, risorse e comandi.
- Vertex stage: trasforma vertici tra spazi locali, world, view e clip.
- Rasterizer: genera frammenti dai primitivi.
- Fragment/pixel stage: valuta materiali, luce e texture.
- Compute shader: esegue lavoro parallelo generale, simulazioni e post-processing.
- Swap chain: sincronizza frame e display.

## Qualità percepita

Nitidezza deriva da risoluzione interna, antialiasing, contrasto locale e corretta gestione del colore, non da bloom e luminosità eccessivi. Usa illuminazione fisicamente plausibile, temporal stability e motion coerente. HDR richiede output, swap chain, tone mapping e metadati compatibili; deve degradare correttamente in SDR.

## Prestazioni

Misura frame time CPU e GPU separatamente. Riduci overdraw, cambi di stato, allocazioni per frame e bandwidth; applica level of detail, culling e risoluzione dinamica. Un frame stabile a 60 Hz ha circa 16,7 ms: la media non rivela stutter, quindi osserva percentili e picchi.

## Percorso pratico

Impara coordinate e algebra lineare, crea un triangolo, aggiungi camera e materiali, profila, poi introduci particelle GPU e compute. Per il web preferisci WebGPU con fallback esplicito; valida su GPU integrate, scaling DPI e refresh rate differenti.

## Fonti primarie

- WebGPU specification, https://www.w3.org/TR/webgpu/
- Khronos Vulkan Guide, https://docs.vulkan.org/guide/latest/
- Microsoft Direct3D 12 documentation, https://learn.microsoft.com/windows/win32/direct3d12/direct3d-12-graphics
