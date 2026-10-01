import os
import sys
import json
import torch
import numpy as np

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "dataset", "raw")
NO_SIGN_DIR = os.path.join(DATASET_DIR, "NO_SIGN")

sys.path.insert(0, BASE_DIR)
from model import SignTemporalGRU
from dataset_loader import extract_frame_features, resample_sequence, FIXED_SEQ_LEN, FEATURE_DIM
import pickle

def analyze_motion(frames):
    l_vis = 0
    r_vis = 0
    hands_near_face = False
    
    for frame in frames:
        l = frame.get("leftHandLandmarks", [])
        r = frame.get("rightHandLandmarks", [])
        p = frame.get("poseLandmarks", [])
        
        if len(l) > 0: l_vis += 1
        if len(r) > 0: r_vis += 1
        
        if len(p) > 0:
            nose = p[0]
            if len(l) > 0:
                l_wrist = l[0]
                if abs(l_wrist["y"] - nose["y"]) < 0.2: hands_near_face = True
            if len(r) > 0:
                r_wrist = r[0]
                if abs(r_wrist["y"] - nose["y"]) < 0.2: hands_near_face = True

    total = len(frames)
    desc = []
    if l_vis/total > 0.3: desc.append("Left hand active")
    if r_vis/total > 0.3: desc.append("Right hand active")
    if l_vis/total <= 0.3 and r_vis/total <= 0.3: desc.append("No hands visibly active (body/face only)")
    if hands_near_face: desc.append("hands raised near face")
    
    return " | ".join(desc)

def main():
    model_path = os.path.join(BASE_DIR, "checkpoints", "sign_gru_v2.pth")
    scaler_path = os.path.join(BASE_DIR, "checkpoints", "scaler_v2.pkl")
    
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)
        
    class_names = ["NO_SIGN", "COME", "DEAF", "GO", "HE", "HOME", "LIKE", "NEVER", "PERFECT", "PLEASE", "WHERE", "WORK"]
    
    model = SignTemporalGRU(
        input_dim=FEATURE_DIM,
        hidden_dim=64,
        num_layers=2,
        num_classes=len(class_names),
        dropout=0.0
    )
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()
    
    files = [f for f in os.listdir(NO_SIGN_DIR) if f.endswith(".json")]
    results = []
    
    for filename in files:
        filepath = os.path.join(NO_SIGN_DIR, filename)
        with open(filepath, "r") as f:
            data = json.load(f)
            
        frames = data.get("frames", [])
        if len(frames) == 0: continue
        
        raw_seq = [extract_frame_features(frame) for frame in frames]
        raw_seq = np.array(raw_seq)
        resampled = resample_sequence(raw_seq, FIXED_SEQ_LEN)
        
        X = np.array(resampled).astype(np.float32)
        X_flat = X.reshape(-1, FEATURE_DIM)
        X_scaled = scaler.transform(X_flat).reshape(1, FIXED_SEQ_LEN, FEATURE_DIM).astype(np.float32)
        
        X_tensor = torch.tensor(X_scaled)
        
        with torch.no_grad():
            logits = model(X_tensor)
            probs = torch.softmax(logits, dim=-1).numpy()[0]
            
        pred_idx = np.argmax(probs)
        pred_class = class_names[pred_idx]
        pred_prob = probs[pred_idx]
        
        if pred_class != "NO_SIGN":
            motion_desc = analyze_motion(frames)
            results.append({
                "sampleId": filename,
                "predicted": pred_class,
                "confidence": pred_prob,
                "motion": motion_desc
            })
            
    for r in results:
        print(f"Sample: {r['sampleId']} | Pred: {r['predicted']} (Conf: {r['confidence']*100:.1f}%) | Motion: {r['motion']}")

if __name__ == "__main__":
    main()
