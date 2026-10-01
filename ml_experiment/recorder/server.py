# ml_experiment/recorder/server.py
import os
import sys
import json
import time
import pickle
from glob import glob
import numpy as np
import torch
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPERIMENT_DIR = os.path.join(BASE_DIR, "ml_experiment")
DATASET_DIR = os.path.join(EXPERIMENT_DIR, "dataset", "raw")
CHECKPOINT_DIR = os.path.join(EXPERIMENT_DIR, "checkpoints")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

# Add ml_experiment to path to import model and loader
if EXPERIMENT_DIR not in sys.path:
    sys.path.insert(0, EXPERIMENT_DIR)

from model import SignTemporalGRU
from dataset_loader import extract_frame_features, resample_sequence, FIXED_SEQ_LEN, FEATURE_DIM

CLASSES = ["COME", "HOME", "PLEASE", "WORK", "GO", "WHERE", "DEAF", "LIKE", "NEVER", "PERFECT", "HE", "NO_SIGN"]
TARGETS = {
    "COME": 30,
    "HOME": 30,
    "PLEASE": 30,
    "WORK": 30,
    "GO": 30,
    "WHERE": 30,
    "DEAF": 30,
    "LIKE": 30,
    "NEVER": 30,
    "PERFECT": 30,
    "HE": 30,
    "NO_SIGN": 50
}

# Ensure class directories exist
for cls in CLASSES:
    os.makedirs(os.path.join(DATASET_DIR, cls), exist_ok=True)

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)

# Load trained PyTorch model and scaler if available
device = torch.device("cpu")
model = None
scaler = None
model_meta = None
class_names = ["NO_SIGN", "COME", "GO", "HOME", "PLEASE", "WORK"]
rejection_threshold = 0.70

def load_inference_artifacts():
    global model, scaler, model_meta, class_names, rejection_threshold
    model_path = os.path.join(CHECKPOINT_DIR, "sign_gru_v2.pth")
    scaler_path = os.path.join(CHECKPOINT_DIR, "scaler_v2.pkl")
    meta_path = os.path.join(CHECKPOINT_DIR, "model_meta_v2.json")

    # Fallback to v1 if v2 not yet saved
    if not os.path.exists(model_path):
        model_path = os.path.join(CHECKPOINT_DIR, "sign_gru_v1.pth")
        scaler_path = os.path.join(CHECKPOINT_DIR, "scaler_v1.pkl")
        meta_path = os.path.join(CHECKPOINT_DIR, "model_meta_v1.json")

    if os.path.exists(model_path) and os.path.exists(scaler_path) and os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                model_meta = json.load(f)
            class_names = model_meta.get("classNames", class_names)
            rejection_threshold = float(model_meta.get("optimalThreshold", 0.70))

            with open(scaler_path, "rb") as f:
                scaler = pickle.load(f)

            m = SignTemporalGRU(
                input_dim=FEATURE_DIM,
                hidden_dim=64,
                num_layers=2,
                num_classes=len(class_names),
                dropout=0.0
            ).to(device)
            m.load_state_dict(torch.load(model_path, map_location=device))
            m.eval()
            model = m
            print(f"[MODEL LOADED] Successfully loaded {os.path.basename(model_path)} ({len(class_names)} classes). Optimal threshold: {rejection_threshold * 100:.0f}%")
        except Exception as e:
            print(f"[MODEL LOAD ERROR] Could not load checkpoint: {e}")

load_inference_artifacts()

def get_class_counts():
    counts = {}
    total = 0
    for cls in CLASSES:
        cls_dir = os.path.join(DATASET_DIR, cls)
        files = glob(os.path.join(cls_dir, "*.json"))
        counts[cls] = len(files)
        total += len(files)
    return counts, total

@app.route("/")
def index():
    return send_from_directory(os.path.dirname(__file__), "index.html")

@app.route("/test")
def test_page():
    return send_from_directory(os.path.dirname(__file__), "test.html")

@app.route("/models/<path:filename>")
def serve_models(filename):
    return send_from_directory(os.path.join(PUBLIC_DIR, "models"), filename)

@app.route("/wasm/<path:filename>")
def serve_wasm(filename):
    return send_from_directory(os.path.join(PUBLIC_DIR, "wasm"), filename)

@app.route("/api/stats", methods=["GET"])
def api_stats():
    counts, total = get_class_counts()
    return jsonify({
        "status": "ok",
        "counts": counts,
        "targets": TARGETS,
        "total": total,
        "classes": CLASSES
    })

@app.route("/api/save_sample", methods=["POST"])
def api_save_sample():
    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "No JSON payload"}), 400

    label = data.get("label", "").strip()
    frames = data.get("frames", [])

    if label not in CLASSES:
        return jsonify({"error": f"Invalid label: {label}"}), 400

    if not frames or len(frames) < 10:
        return jsonify({"error": "Sample too short (less than 10 frames)"}), 400

    cls_dir = os.path.join(DATASET_DIR, label)
    existing_count = len(glob(os.path.join(cls_dir, "*.json")))
    sample_id = f"sample_{existing_count + 1:04d}_{int(time.time() * 1000)}"
    file_path = os.path.join(cls_dir, f"{sample_id}.json")

    record = {
        "sampleId": sample_id,
        "label": label,
        "frameCount": len(frames),
        "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "durationMs": data.get("durationMs", 0),
        "fps": round(len(frames) / (max(0.1, data.get("durationMs", 1000) / 1000)), 1),
        "frames": frames
    }

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2)

    counts, total = get_class_counts()
    return jsonify({
        "status": "saved",
        "sampleId": sample_id,
        "filePath": file_path,
        "classCount": counts[label],
        "target": TARGETS[label],
        "counts": counts,
        "total": total
    })

@app.route("/api/delete_last", methods=["POST"])
def api_delete_last():
    data = request.get_json(force=True) or {}
    label = data.get("label", "").strip()
    if label not in CLASSES:
        return jsonify({"error": f"Invalid label: {label}"}), 400

    cls_dir = os.path.join(DATASET_DIR, label)
    files = sorted(glob(os.path.join(cls_dir, "*.json")), key=os.path.getmtime)
    if not files:
        return jsonify({"status": "empty", "message": f"No samples in {label}"}), 200

    last_file = files[-1]
    os.remove(last_file)

    counts, total = get_class_counts()
    return jsonify({
        "status": "deleted",
        "deletedFile": os.path.basename(last_file),
        "classCount": counts[label],
        "counts": counts,
        "total": total
    })

@app.route("/api/predict_realtime", methods=["POST"])
def api_predict_realtime():
    global model, scaler
    if model is None or scaler is None:
        load_inference_artifacts()
        if model is None:
            return jsonify({"status": "error", "message": "Model not loaded"}), 503

    t0 = time.time()
    data = request.get_json(force=True) or {}
    frames = data.get("frames", [])

    if len(frames) < 5:
        return jsonify({
            "status": "ok",
            "predictedClass": "NO_SIGN",
            "confidence": 100.0,
            "isRejected": True,
            "rejectionReason": "INSUFFICIENT_FRAMES",
            "probabilities": {c: 0.0 for c in class_names}
        })

    # Extract features across frames (filter dead prefix frames if hands not in view yet)
    active_frames = [fr for fr in frames if fr.get("handCount", 0) > 0]
    use_frames = active_frames if len(active_frames) >= 8 else frames

    frame_vectors = []
    for i, fr in enumerate(use_frames):
        prev_fr = use_frames[i - 1] if i > 0 else None
        feat = extract_frame_features(fr, prev_fr)
        frame_vectors.append(feat)

    feature_seq = np.array(frame_vectors, dtype=np.float32)
    resampled_seq = resample_sequence(feature_seq, FIXED_SEQ_LEN)

    # Scale using training scaler
    T, D = resampled_seq.shape
    scaled_seq = scaler.transform(resampled_seq).reshape(1, T, D).astype(np.float32)

    # PyTorch inference
    with torch.no_grad():
        x_tensor = torch.tensor(scaled_seq, dtype=torch.float32).to(device)
        logits = model(x_tensor)
        probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]

    top_idx = int(np.argmax(probs))
    top_prob = float(probs[top_idx])
    predicted_class = class_names[top_idx]

    # Rejection criterion:
    # 1. If predicted as NO_SIGN -> rejected
    # 2. If predicted as a sign but confidence < rejection_threshold -> rejected to NO_SIGN
    is_rejected = False
    rejection_reason = None

    if predicted_class == "NO_SIGN":
        is_rejected = True
        rejection_reason = "CLASSIFIED_AS_NO_SIGN"
    elif top_prob < rejection_threshold:
        is_rejected = True
        rejection_reason = f"LOW_CONFIDENCE ({top_prob * 100:.1f}% < {rejection_threshold * 100:.0f}%)"

    prob_dict = {class_names[i]: float(probs[i]) for i in range(len(class_names))}
    inference_ms = round((time.time() - t0) * 1000, 2)

    return jsonify({
        "status": "ok",
        "predictedClass": predicted_class,
        "confidence": round(top_prob * 100, 1),
        "isRejected": is_rejected,
        "rejectionReason": rejection_reason,
        "probabilities": prob_dict,
        "inferenceTimeMs": inference_ms
    })

if __name__ == "__main__":
    print(f"Dataset root: {DATASET_DIR}")
    print(f"Starting isolated ISL Sign Recorder on http://localhost:5050 ...")
    app.run(host="127.0.0.1", port=5050, debug=False)
