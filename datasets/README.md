# Datasets

Owner: **B — Bhumi**

| File | What it is |
|---|---|
| `samples/mosaic-tile.png` | Glazed geometric tile panel with star rosettes (480×480) |
| `samples/pottery-band.png` | Painted pottery shard with wave and meander bands |
| `samples/manuscript.png` | Illuminated manuscript leaf with glyph rows and border |

All three are **synthetic**: drawn by code (`backend/src/relicx/samples.py`) with fixed seeds,
regenerated with `python datasets/generate_samples.py`. Each includes a low-frequency colour
field so no edge repeats exactly. A perfectly periodic image is genuinely ambiguous for *any*
reconstruction algorithm.

Real archaeological benchmarks (e.g. RePAIR, https://repairproject.github.io/) are listed as
future work in the synopsis. Check their licence before adding any of their files here.
