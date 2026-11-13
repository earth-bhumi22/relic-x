"""Write the bundled sample artifacts to datasets/samples/*.png.

Owner: B. The images are drawn procedurally (relicx/samples.py) with fixed seeds,
so nothing copyrighted is bundled and every run is reproducible.

    python datasets/generate_samples.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "src"))

from relicx.samples import SAMPLES, make_sample  # noqa: E402

out = Path(__file__).with_name("samples")
out.mkdir(exist_ok=True)
for name in SAMPLES:
    make_sample(name).save(out / f"{name}.png")
    print("wrote", out / f"{name}.png")
