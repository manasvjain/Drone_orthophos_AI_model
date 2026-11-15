
"""Flask API for the DroneAI interface."""

import os
import base64
import io
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
import torch
import segmentation_models_pytorch as smp

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "final_drone_model.pth"

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


def predict(image, model, labels, tile_size=256):
    original = np.asarray(image.convert("RGB"))
    h, w = original.shape[:2]

    padded = cv2.copyMakeBorder(
        original,
        0,
        (tile_size - h % tile_size) % tile_size,
        0,
        (tile_size - w % tile_size) % tile_size,
        cv2.BORDER_REPLICATE
    )

    classes = np.zeros(padded.shape[:2], dtype=np.uint8)

    for y in range(0, padded.shape[0], tile_size):
        for x in range(0, padded.shape[1], tile_size):
            tile = padded[y:y + tile_size, x:x + tile_size]

            tensor = (
                torch.from_numpy(tile.transpose(2, 0, 1).copy())
                .float()
                .unsqueeze(0) / 255.0
            )

            indices = model(tensor).argmax(1)[0].numpy()
            classes[y:y + tile_size, x:x + tile_size] = labels[indices]

    classes = classes[:h, :w]

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
        "model_file": MODEL_PATH.is_file()
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
    except Exception:
        return jsonify({
            "error": "Unable to open image. Try JPG or PNG."
        }), 400

    try:
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
