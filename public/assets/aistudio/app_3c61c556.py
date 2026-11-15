
"""Flask API for the DroneAI interface."""

import os
import base64
import io
import threading
from functools import lru_cache
from pathlib import Path

# Keep numerical libraries from creating many CPU threads on a 512 MB instance.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import cv2
import numpy as np
import torch
import segmentation_models_pytorch as smp

torch.set_num_threads(1)
try:
    torch.set_num_interop_threads(1)
except RuntimeError:
    pass

cv2.setNumThreads(1)

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "final_drone_model.pth"
MAX_INFERENCE_DIM = 1536
# The training dataset uses 256 px tiles with a 192 px stride (64 px overlap).
# Match that context at inference instead of making non-overlapping predictions.
INFERENCE_TILE_SIZE = 256
INFERENCE_TILE_STRIDE = int(os.getenv("INFERENCE_TILE_STRIDE", "192"))
if not 1 <= INFERENCE_TILE_STRIDE <= INFERENCE_TILE_SIZE:
    raise ValueError("INFERENCE_TILE_STRIDE must be between 1 and 256")
inference_lock = threading.Lock()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024

# This API is public and does not use cookie-based authentication.
# Allow browser requests from the deployed frontend and local development.
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=600,
)


@lru_cache(maxsize=1)
@torch.inference_mode()
def load_model():
    checkpoint = torch.load(
        MODEL_PATH,
        map_location="cpu",
        weights_only=True
    )

    model = smp.Unet(
        encoder_name="resnet18",
        encoder_weights=None,
        in_channels=3,
        classes=checkpoint["num_classes"]
    )

    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    return model, np.asarray(checkpoint["labels"], dtype=np.uint8)


def tile_starts(length, tile_size, stride):
    """Cover an axis fully and always include a tile aligned to its far edge."""
    if length <= tile_size:
        return [0]
    starts = list(range(0, length - tile_size + 1, stride))
    last = length - tile_size
    if starts[-1] != last:
        starts.append(last)
    return starts


@torch.inference_mode()
def predict(image, model, labels, tile_size=INFERENCE_TILE_SIZE, stride=INFERENCE_TILE_STRIDE):
    """Run overlap-tiled inference and average logits in shared regions.

    The deployed checkpoint was trained with 256 px tiles and 192 px stride.
    Averaging logits from overlapping tiles reduces hard seams and gives pixels
    near tile borders predictions that also have interior context in a neighbour.
    The model weights, RGB conversion, [0, 1] scaling and class decision stay unchanged.
    """
    original = np.asarray(image.convert("RGB"))
    h, w = original.shape[:2]

    pad_h = max(0, tile_size - h)
    pad_w = max(0, tile_size - w)
    padded = cv2.copyMakeBorder(
        original,
        0,
        pad_h,
        0,
        pad_w,
        cv2.BORDER_REPLICATE
    )
    padded_h, padded_w = padded.shape[:2]

    ys = tile_starts(padded_h, tile_size, stride)
    xs = tile_starts(padded_w, tile_size, stride)
    num_classes = len(labels)

    # Accumulate class logits rather than hard labels so overlapping predictions
    # can resolve uncertain road/background pixels without a road-specific bias.
    logit_sum = np.zeros((num_classes, padded_h, padded_w), dtype=np.float32)
    prediction_count = np.zeros((padded_h, padded_w), dtype=np.float32)

    for y in ys:
        for x in xs:
            tile = padded[y:y + tile_size, x:x + tile_size]
            tensor = (
                torch.from_numpy(tile.transpose(2, 0, 1).copy())
                .float()
                .unsqueeze(0) / 255.0
            )
            logits = model(tensor)[0].float().cpu().numpy()
            logit_sum[:, y:y + tile_size, x:x + tile_size] += logits
            prediction_count[y:y + tile_size, x:x + tile_size] += 1.0

    mean_logits = logit_sum / np.maximum(prediction_count[None, :, :], 1.0)
    class_indices = mean_logits.argmax(axis=0)
    classes = labels[class_indices].astype(np.uint8)[:h, :w]

    colors = {
        1: (255, 70, 70),
        2: (0, 180, 0),
        4: (255, 220, 0)
    }

    painted = np.zeros_like(original)
    for label, color in colors.items():
        painted[classes == label] = color

    overlay = original.copy()
    foreground = np.isin(classes, list(colors))
    blended = cv2.addWeighted(original, 0.55, painted, 0.45, 0)
    overlay[foreground] = blended[foreground]

    buildings = (classes == 1).astype(np.uint8) * 255
    roads = (classes == 4).astype(np.uint8) * 255
    class_mask = classes.astype(np.uint8)
    return overlay, buildings, roads, class_mask

def data_url(array):
    buf = io.BytesIO()
    Image.fromarray(array).save(buf, format="PNG")

    return (
        "data:image/png;base64,"
        + base64.b64encode(buf.getvalue()).decode("ascii")
    )


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "model_file": MODEL_PATH.is_file(),
        "tile_size": INFERENCE_TILE_SIZE,
        "tile_stride": INFERENCE_TILE_STRIDE,
        "overlap_pixels": INFERENCE_TILE_SIZE - INFERENCE_TILE_STRIDE
    })


@app.post("/api/analyze")
def analyze():
    upload = request.files.get("image")

    if not upload or not upload.filename:
        return jsonify({
            "error": "Choose a JPG or PNG orthophoto first."
        }), 400

    try:
        image = Image.open(upload.stream).convert("RGB")
        # Bound peak RAM for large orthophotos; the frontend scales masks to its map canvas.
        image.thumbnail(
            (MAX_INFERENCE_DIM, MAX_INFERENCE_DIM),
            Image.Resampling.LANCZOS
        )
    except Exception:
        return jsonify({
            "error": "Unable to open image. Try JPG or PNG."
        }), 400

    try:
        # Serialize inference so simultaneous uploads cannot exceed the free-instance RAM limit.
        with inference_lock:
            model, labels = load_model()
            overlay, buildings, roads, class_mask = predict(
                image, model, labels
            )

    except FileNotFoundError:
        return jsonify({
            "error": "Model checkpoint final_drone_model.pth is missing."
        }), 503

    except Exception as exc:
        app.logger.exception("Model inference failed")

        return jsonify({
            "error": f"Model inference failed: {str(exc)}"
        }), 500

    return jsonify({
        "source": "pytorch-flask",
        "filename": upload.filename,
        "width": image.width,
        "height": image.height,
        "overlay": data_url(overlay),
        "buildings": data_url(buildings),
        "roads": data_url(roads),
        "classes": data_url(class_mask)
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
