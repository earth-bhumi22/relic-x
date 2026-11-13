import numpy as np
import pytest
from PIL import Image


@pytest.fixture(scope="session")
def smooth_image() -> np.ndarray:
    """Non-periodic smooth colour field: every cut edge is unique."""
    rng = np.random.default_rng(1)
    small = (rng.random((24, 24, 3)) * 255).astype(np.uint8)
    return np.asarray(Image.fromarray(small).resize((360, 360), Image.BICUBIC))
