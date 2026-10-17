# FlyBrain

Interactive browser simulation of the *Drosophila melanogaster* (fruit fly) brain. 139,255 neurons and 2.7M connections from the [FlyWire FAFB v783](https://codex.flywire.ai) connectome run in real time via a leaky integrate-and-fire model in a Web Worker.

The fly is not scripted. Behavior emerges from signal propagation through weighted neural connections: place food and watch it seek, touch it and watch it startle, change the light and watch it navigate.

## Usage

From the repository root, serve the app over HTTP (for example, run `python3 -m http.server 8000` and open `http://localhost:8000/`), or visit the hosted version. Do not open `index.html` via `file://`: the Web Worker and connectome fetch require an HTTP origin. The fly loads the full connectome and begins exploring. Use the toolbar to interact:

- **Feed** -- click to place food. The fly seeks and eats it when hungry.
- **Touch** -- click on the fly. Head, thorax, abdomen, and legs trigger different responses.
- **Air** -- click and drag near the fly to blow wind.
- **Light** -- cycle through Bright, Dim, Dark. The fly exhibits phototaxis.
- **Temp** -- cycle through Neutral, Warm, Cool.

The bottom panel shows all 139K neurons firing in real time (WebGL), grouped by region: Sensory, Central, Drives, Motor.

## Visual Model

The fly uses transparent, photorealistic dorsal cutouts for its body and venated wings (`assets/drosophila-body.png` and `assets/drosophila-wing.png`). Position, orientation, wing spread, six articulated legs and antennae continue to use the existing canvas rig. The dark-chitin legs taper from thicker femurs to fine tarsi and stay behind the body during every behavior, including grooming; face and abdomen cleaning retain the original angle-driven motion. Antennae use slender, branched aristae rather than bright bulb tips. No separate leg overlay or custom solver is used. The wings remain translucent but are less transparent, and the photo cuticle stays intentionally darker while responding to the light control. A subtle world-anchored 50 px floor grid with 250 px reference marks helps track movement without obscuring the scene. The slim proboscis peeks out beneath the front of the head when the fly deliberately approaches nearby food, extends farther when it can reach the food, and retracts smoothly after feeding. Keep the `assets/` directory alongside the app when hosting or packaging it; the iOS build copies it into the app bundle.

## Data Source

Connectome data from the FlyWire Whole-Brain Connectome:

> Dorkenwald, S., Matsliah, A., Sterling, A.R. *et al.* Neuronal wiring diagram of an adult brain. *Nature* **634**, 124--138 (2024). https://doi.org/10.1038/s41586-024-07558-y

The binary connectome (`data/connectome.bin.gz`) and neuron metadata (`data/neuron_meta.json`) are derived from the [FlyWire Codex](https://codex.flywire.ai) public dataset (FAFB v783). Neurons are classified into functional groups (sensory, central, drives, motor) based on FlyWire cell type annotations.

## Origin

Forked from [heyseth/worm-sim](https://github.com/heyseth/worm-sim), which simulated the 302-neuron *C. elegans* connectome in the browser. FlyBrain replaces the worm with a fruit fly and scales from 302 neurons to 139,255.

## License

MIT License -- see [license.md](license.md) for details.

## Acknowledgments

- **FlyWire Consortium** -- for mapping the complete adult *Drosophila* brain connectome and making the data publicly available.
- **Timothy Busbice, Gabriel Garrett, Geoffrey Churchill** and contributors to the [GoPiGo Connectome](https://github.com/Connectome/GoPiGo) -- original connectome-driven robot concept.
- **[Zach Rispoli](https://github.com/zrispo)** -- porting the *C. elegans* connectome to JavaScript.
- **[Seth Miller](https://github.com/heyseth)** -- creating worm-sim, the browser simulation this project is forked from.
