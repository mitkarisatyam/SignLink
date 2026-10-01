import os
import json
import numpy as np

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__)))
NO_SIGN_DIR = os.path.join(BASE_DIR, "dataset", "raw", "NO_SIGN")

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
    if total == 0:
        return "No frames"
    desc = []
    if l_vis/total > 0.3: desc.append(f"Left hand active ({l_vis/total*100:.0f}%)")
    if r_vis/total > 0.3: desc.append(f"Right hand active ({r_vis/total*100:.0f}%)")
    if l_vis/total <= 0.3 and r_vis/total <= 0.3: desc.append("No hands visibly active (body/face only)")
    if hands_near_face: desc.append("Hands raised near face")
    
    return " | ".join(desc)

samples = [
    ("sample_0031_1790847892709.json", "HE"),
    ("sample_0038_1790847958207.json", "COME"),
    ("sample_0040_1790847971157.json", "NEVER"),
    ("sample_0047_1790848067001.json", "GO")
]

for sample_id, predicted in samples:
    path = os.path.join(NO_SIGN_DIR, sample_id)
    if not os.path.exists(path):
        print(f"File not found: {sample_id}")
        continue
    with open(path, "r") as f:
        data = json.load(f)
        frames = data.get("frames", [])
        motion = analyze_motion(frames)
        print(f"Sample: {sample_id}\n Predicted: {predicted}\n Movement Detected: {motion}\n")
