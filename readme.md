# FlyBrain

Interactive browser simulation of the *Drosophila melanogaster* (fruit fly) brain. 139,255 neurons and 2.7M connections from the [FlyWire FAFB v783](https://codex.flywire.ai) connectome run in real time via a leaky integrate-and-fire model in a Web Worker.

The connectome simulation supplies live activity and part of the motor intent. Visible actions use a hybrid layer: explicit behavior-state rules and synthesized ventral-nerve-cord outputs bridge the incomplete brain graph to the animated fly. It is not yet a complete, biologically validated end-to-end brain simulation.

## Usage

From the repository root, serve the app over HTTP (for example, run `python3 -m http.server 8000` and open `http://localhost:8000/`), or visit the hosted version. Do not open `index.html` via `file://`: the Web Worker and connectome fetch require an HTTP origin. The fly loads the full connectome and begins exploring. Use the toolbar to interact:

- **Items** -- **Tocar** is selected on startup; open the menu for **Comida**, **Tocar**, and **Viento**. The menu shows the active tool; clicking the fly triggers touch/grooming even if Comida is selected.
- **Entorno** -- open the menu to cycle **Luz** (bright, dim, dark) and **Temp.** (neutral, warm, cool). Ambient light is uniform and never acts as a positioned target.

The connectome panel visualizes firing activity across the 139K loaded neurons (WebGL); the 3D brain aggregates activity by region. The source graph is large, but the behavior model uses coarse functional labels and a virtual motor layer, so this should not be read as a complete end-to-end fly brain.

## Visual Model

The fly uses transparent, photorealistic dorsal cutouts for its body and venated wings (`assets/drosophila-body.png` and `assets/drosophila-wing.png`). Position, orientation, wing spread, six articulated legs and antennae continue to use the existing canvas rig. Each leg now shows the *Drosophila* sequence from body to tip: coxa, trochanter, femur, tibia, five progressively shorter tarsomeres and a short pretarsus with paired claws. The cuticle stays dark brown, tapers to the foot, and remains behind the body in every behavior. During face washing the front legs fold at the knees so their tarsi reach the forehead and eye edges; thorax cleaning is assigned to the hind legs, which fold around the shell and brush its edge in alternating strokes; those same rear legs alternate short strokes along the abdomen, which flexes only subtly around an overlapping hinge and stays aligned with the thorax. The ankle and tarsal links preserve the established pose endpoints; subtle, low-contrast joints clarify the anatomy without an overlay or skeletal-dot style. These remain angle-driven poses on the original rig, with no custom solver. Antennae use slender, branched aristae rather than bright bulb tips. The wings remain translucent but are less transparent, and the photo cuticle stays intentionally darker while responding to the light control. A subtle world-anchored 50 px floor grid with 250 px reference marks helps track movement without obscuring the scene. The slim proboscis peeks out beneath the front of the head when the fly deliberately approaches nearby food, extends farther when it can reach the food, and retracts smoothly after feeding. Keep the `assets/` directory alongside the app when hosting or packaging it; the iOS build copies it into the app bundle.

The leg segment sequence and five-part tarsus follow adult *D. melanogaster* morphology described by [Natori & Kojima (2019)](https://doi.org/10.1508/cytologia.84.105); the distinction between proximal, muscle-bearing joints and distal tarsal joints is discussed by [Córdoba & Estella (2014)](https://doi.org/10.1371/journal.pgen.1004621). Front legs chiefly clean the head; thoracic grooming has been observed with back legs, although the dorsal notum may be cleaned by front or back legs depending on stimulus location ([Yoshikawa et al. (2024)](https://doi.org/10.1016/j.cub.2024.04.003)). This rig uses the hind pair for thorax and abdomen to avoid assigning the thoracic sweep to the middle pair. Flight steering uses a smoothed, rate-limited heading without random flight-turn jitter, and each flight burst is bounded so persistent wing output cannot keep the fly buzzing indefinitely. A single touch during flight or a startle escape interrupts it for a visible, body-part-targeted cleaning stroke; three taps within four seconds trigger a pain-driven escape even during the neural startle cooldown, without snapping the whole body around. Since fruit-fly wingbeats are around 200 Hz ([Zhao et al. (2015)](https://doi.org/10.1371/journal.pone.0116813)), above the canvas frame rate, the flying wings use a weighted translucent stroke envelope rather than an aliased slow flap. The canvas rig is a simplified 2D rendering, not a biomechanical reconstruction.

## Toolbar and Side Panel

The toolbar keeps interaction tools in a teal **Items** dropdown and light/temperature controls in an amber **Entorno** dropdown. Panel and learning controls (**Cerebro**, **Registro**, **Aprender**) remain violet. **Registro** and **Cerebro** share a drawer that opens from the left; switch between them using their toolbar buttons, with no duplicate tabs inside the drawer. Only one view is open at a time. On mobile, the drawer fills the available space above the bottom controls.

After changing frontend files, refresh the packaged `psycodelicmosca.html` with `python3 scripts/build_standalone.py`. The generated page embeds the app CSS and JavaScript but still expects the adjacent connectome data, worker, and visual assets when served over HTTP.

## Data Source

Connectome data from the FlyWire Whole-Brain Connectome:

> Dorkenwald, S., Matsliah, A., Sterling, A.R. *et al.* Neuronal wiring diagram of an adult brain. *Nature* **634**, 124--138 (2024). https://doi.org/10.1038/s41586-024-07558-y

The binary connectome (`data/connectome.bin.gz`) and neuron metadata (`data/neuron_meta.json`) are derived from the [FlyWire Codex](https://codex.flywire.ai) public dataset (FAFB v783). Neurons are classified into functional groups (sensory, central, drives, motor) based on FlyWire cell type annotations.

## Connectome Scope and Relationship to worm-sim

The original [heyseth/worm-sim](https://github.com/heyseth/worm-sim) models the 302-neuron *C. elegans* nervous system and its segmented worm body. Its named sensory and proprioceptive signals drive a linked body with 24 muscle rows. This is a different species and connectome, so its neural architecture and behaviors are not a direct equivalence target for the fly. Here, FlyWire group activity feeds a high-level behavior layer; absent VNC leg/wing neurons are synthesized and the visible fly uses a separate 2D rig, rather than a complete anatomical sensorimotor loop. Both projects visualize firing activity: worm-sim lights a neuron marker on a spike and fades it on later draws; this project colors worker-fired FlyWire neurons in the WebGL panel and aggregates activity by region in the 3D brain.

This project loads the complete available FAFB v783 brain graph (139,255 neurons and 2,698,236 edges), but maps it to 63 broad functional bins. The mapping is still incomplete: 28 bins are empty, 21,762 cells remain in `GENERIC_CENTRAL`, and several valence, visual-subtype, and nociception distinctions are not present in the exported labels. The dataset is brain-only and excludes the ventral nerve cord (VNC), so leg/wing motor outputs are synthesized in a virtual layer. Empty `NOCI` uses an explicitly documented tactile proxy and virtual fear drive for repeated-touch escape; it is not a real nociceptor population. Therefore “full graph loaded” does not mean a complete, validated, end-to-end fly brain.

The focused classification audit now assigns the labeled DN3, DN1p, LNv, and T4/T5 populations to walking, startle, clock, and visual-motion groups respectively. Further cell-type or valence splits should wait for verified FlyWire annotations rather than being guessed from unlabeled cells.

## Origin

This repository began as a fork of worm-sim, but replaces its *C. elegans* model with FlyWire *Drosophila* data and a distinct, coarser behavior/motor pipeline; the two models are not neuron-for-neuron or behaviorally equivalent.

## License

MIT License -- see [license.md](license.md) for details.

## Acknowledgments

- **FlyWire Consortium** -- for mapping the complete adult *Drosophila* brain connectome and making the data publicly available.
- **Timothy Busbice, Gabriel Garrett, Geoffrey Churchill** and contributors to the [GoPiGo Connectome](https://github.com/Connectome/GoPiGo) -- original connectome-driven robot concept.
- **[Zach Rispoli](https://github.com/zrispo)** -- porting the *C. elegans* connectome to JavaScript.
- **[Seth Miller](https://github.com/heyseth)** -- creating worm-sim, the browser simulation this project is forked from.
