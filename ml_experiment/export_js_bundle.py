# ml_experiment/export_js_bundle.py
import os
import sys
import json
import pickle
import numpy as np
import torch

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHECKPOINT_DIR = os.path.join(BASE_DIR, "ml_experiment", "checkpoints")
DEST_JSON = os.path.join(BASE_DIR, "src", "utils", "sign_gru_v2_bundle.json")
DEST_PUBLIC_JSON = os.path.join(BASE_DIR, "public", "models", "sign_gru_v2_bundle.json")

model_path = os.path.join(CHECKPOINT_DIR, "sign_gru_v2.pth")
scaler_path = os.path.join(CHECKPOINT_DIR, "scaler_v2.pkl")
meta_path = os.path.join(CHECKPOINT_DIR, "model_meta_v2.json")

print("Loading PyTorch model and scaler...")
with open(meta_path, "r", encoding="utf-8") as f:
    meta = json.load(f)

with open(scaler_path, "rb") as f:
    scaler = pickle.load(f)

state = torch.load(model_path, map_location="cpu")

# Convert PyTorch tensors to standard nested lists
bundle = {
    "version": "v2",
    "architecture": "SignTemporalGRU",
    "classNames": meta["classNames"],
    "fixedSeqLen": meta["fixedSeqLen"],
    "inputDim": meta["inputDim"],
    "hiddenDim": meta["hiddenDim"],
    "numLayers": meta["numLayers"],
    "rejectionThreshold": 0.95,
    "scaler": {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist()
    },
    "weights": {
        "gru_w_ih_l0": state["gru.weight_ih_l0"].numpy().tolist(),
        "gru_w_hh_l0": state["gru.weight_hh_l0"].numpy().tolist(),
        "gru_b_ih_l0": state["gru.bias_ih_l0"].numpy().tolist(),
        "gru_b_hh_l0": state["gru.bias_hh_l0"].numpy().tolist(),
        "gru_w_ih_l1": state["gru.weight_ih_l1"].numpy().tolist(),
        "gru_w_hh_l1": state["gru.weight_hh_l1"].numpy().tolist(),
        "gru_b_ih_l1": state["gru.bias_ih_l1"].numpy().tolist(),
        "gru_b_hh_l1": state["gru.bias_hh_l1"].numpy().tolist(),
        "fc1_w": state["classifier.0.weight"].numpy().tolist(),
        "fc1_b": state["classifier.0.bias"].numpy().tolist(),
        "bn_mean": state["classifier.1.running_mean"].numpy().tolist(),
        "bn_var": state["classifier.1.running_var"].numpy().tolist(),
        "bn_weight": state["classifier.1.weight"].numpy().tolist(),
        "bn_bias": state["classifier.1.bias"].numpy().tolist(),
        "fc2_w": state["classifier.4.weight"].numpy().tolist(),
        "fc2_b": state["classifier.4.bias"].numpy().tolist()
    }
}

os.makedirs(os.path.dirname(DEST_JSON), exist_ok=True)
os.makedirs(os.path.dirname(DEST_PUBLIC_JSON), exist_ok=True)

with open(DEST_JSON, "w", encoding="utf-8") as f:
    json.dump(bundle, f)

with open(DEST_PUBLIC_JSON, "w", encoding="utf-8") as f:
    json.dump(bundle, f)

file_sz_kb = os.path.getsize(DEST_JSON) / 1024
print(f"Exported bundle to {DEST_JSON} ({file_sz_kb:.1f} KB)")
print(f"Exported bundle to {DEST_PUBLIC_JSON} ({file_sz_kb:.1f} KB)")
