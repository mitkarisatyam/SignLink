# ml_experiment/dataset_loader.py
import os
import json
import glob
import numpy as np
from sklearn.preprocessing import StandardScaler

FIXED_SEQ_LEN = 20  # Resample each sample to 20 frames
FEATURE_DIM = 151

def extract_frame_features(frame_dict, prev_frame_dict=None):
    """
    Extracts a rich 151-dimensional feature vector from a single frame dictionary.
    """
    hands = frame_dict.get("hands", [])
    
    # Hand 0 and Hand 1
    h0 = hands[0] if len(hands) > 0 else {"isPresent": False}
    h1 = hands[1] if len(hands) > 1 else {"isPresent": False}
    
    # 1. Centered Landmarks (21 * 3 = 63 coords each)
    def get_centered(h):
        if not h.get("isPresent", False):
            return np.zeros(63, dtype=np.float32)
        lms = h.get("centeredLandmarks", [])
        vec = []
        for p in lms:
            vec.extend([p.get("x", 0.0), p.get("y", 0.0), p.get("z", 0.0)])
        return np.array(vec, dtype=np.float32)

    h0_centered = get_centered(h0)
    h1_centered = get_centered(h1)

    # 2. Wrist positions and inter-wrist vector (10 features)
    w0 = h0.get("wrist", {"x": 0.0, "y": 0.0, "z": 0.0}) if h0.get("isPresent") else {"x": 0.0, "y": 0.0, "z": 0.0}
    w1 = h1.get("wrist", {"x": 0.0, "y": 0.0, "z": 0.0}) if h1.get("isPresent") else {"x": 0.0, "y": 0.0, "z": 0.0}
    
    w0_vec = [w0["x"], w0["y"], w0["z"]]
    w1_vec = [w1["x"], w1["y"], w1["z"]]
    
    if h0.get("isPresent") and h1.get("isPresent"):
        inter_wrist = [w1["x"] - w0["x"], w1["y"] - w0["y"], w1["z"] - w0["z"]]
        inter_dist = float(np.linalg.norm(inter_wrist))
    else:
        inter_wrist = [0.0, 0.0, 0.0]
        inter_dist = 0.0
    
    wrist_feats = np.array(w0_vec + w1_vec + inter_wrist + [inter_dist], dtype=np.float32)

    # 3. Presence flags (2 features)
    presence = np.array([
        1.0 if h0.get("isPresent") else 0.0,
        1.0 if h1.get("isPresent") else 0.0
    ], dtype=np.float32)

    # 4. Finger key geometric distances (6 features)
    def get_finger_distances(h):
        if not h.get("isPresent"):
            return [0.0, 0.0, 0.0]
        raw = h.get("rawLandmarks", [])
        if len(raw) < 21:
            return [0.0, 0.0, 0.0]
        
        # thumb tip (4), index tip (8), middle tip (12), wrist (0)
        t_tip = np.array([raw[4]["x"], raw[4]["y"], raw[4]["z"]])
        i_tip = np.array([raw[8]["x"], raw[8]["y"], raw[8]["z"]])
        m_tip = np.array([raw[12]["x"], raw[12]["y"], raw[12]["z"]])
        wrist = np.array([raw[0]["x"], raw[0]["y"], raw[0]["z"]])
        
        thumb_index_dist = float(np.linalg.norm(t_tip - i_tip))
        index_middle_dist = float(np.linalg.norm(i_tip - m_tip))
        hand_openness = float(np.linalg.norm(m_tip - wrist))
        
        return [thumb_index_dist, index_middle_dist, hand_openness]

    h0_dist = get_finger_distances(h0)
    h1_dist = get_finger_distances(h1)
    geom_feats = np.array(h0_dist + h1_dist, dtype=np.float32)

    # 5. Velocity / delta features from previous frame (7 features)
    if prev_frame_dict is not None:
        p_hands = prev_frame_dict.get("hands", [])
        p_h0 = p_hands[0] if len(p_hands) > 0 else {"isPresent": False}
        p_h1 = p_hands[1] if len(p_hands) > 1 else {"isPresent": False}
        
        p_w0 = p_h0.get("wrist", {"x": 0.0, "y": 0.0, "z": 0.0}) if p_h0.get("isPresent") else {"x": 0.0, "y": 0.0, "z": 0.0}
        p_w1 = p_h1.get("wrist", {"x": 0.0, "y": 0.0, "z": 0.0}) if p_h1.get("isPresent") else {"x": 0.0, "y": 0.0, "z": 0.0}
        
        v0 = [w0["x"] - p_w0["x"], w0["y"] - p_w0["y"], w0["z"] - p_w0["z"]] if h0.get("isPresent") and p_h0.get("isPresent") else [0.0, 0.0, 0.0]
        v1 = [w1["x"] - p_w1["x"], w1["y"] - p_w1["y"], w1["z"] - p_w1["z"]] if h1.get("isPresent") and p_h1.get("isPresent") else [0.0, 0.0, 0.0]
        
        p_h0_dist = get_finger_distances(p_h0)
        d_open = h0_dist[2] - p_h0_dist[2] if h0.get("isPresent") and p_h0.get("isPresent") else 0.0
        
        vel_feats = np.array(v0 + v1 + [d_open], dtype=np.float32)
    else:
        vel_feats = np.zeros(7, dtype=np.float32)

    features = np.concatenate([h0_centered, h1_centered, wrist_feats, presence, geom_feats, vel_feats])
    return features


def resample_sequence(feature_sequence, target_len=FIXED_SEQ_LEN):
    """
    Interpolates a sequence of shape (T_orig, D) to (target_len, D).
    """
    orig_len = len(feature_sequence)
    if orig_len == 0:
        return np.zeros((target_len, FEATURE_DIM), dtype=np.float32)
    if orig_len == 1:
        return np.repeat(feature_sequence, target_len, axis=0)
    
    orig_times = np.linspace(0.0, 1.0, orig_len)
    target_times = np.linspace(0.0, 1.0, target_len)
    
    resampled = np.zeros((target_len, feature_sequence.shape[1]), dtype=np.float32)
    for d in range(feature_sequence.shape[1]):
        resampled[:, d] = np.interp(target_times, orig_times, feature_sequence[:, d])
        
    return resampled


def load_dataset(dataset_raw_dir):
    """
    Loads all JSON samples from class folders, dynamically discovers classes,
    and returns (X, y, class_names, sample_ids).
    X shape: (N_samples, FIXED_SEQ_LEN, FEATURE_DIM)
    """
    # Scan class directories (ignore non-directories)
    entries = sorted([d for d in os.listdir(dataset_raw_dir) if os.path.isdir(os.path.join(dataset_raw_dir, d))])
    
    # Put NO_SIGN first (index 0) if present, then alphabetical
    class_names = []
    if "NO_SIGN" in entries:
        class_names.append("NO_SIGN")
        entries.remove("NO_SIGN")
    class_names.extend(sorted(entries))
    
    label_to_idx = {c: i for i, c in enumerate(class_names)}
    
    samples_X = []
    samples_y = []
    sample_ids = []
    
    for cls in class_names:
        cls_dir = os.path.join(dataset_raw_dir, cls)
        json_files = sorted(glob.glob(os.path.join(cls_dir, "*.json")))
        
        for fpath in json_files:
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                frames = data.get("frames", [])
                if len(frames) == 0:
                    continue
                
                # Filter out pure dead prefix frames if hand was not in frame yet
                # but keep at least 5 frames
                active_frames = [fr for fr in frames if fr.get("handCount", 0) > 0]
                use_frames = active_frames if len(active_frames) >= 8 else frames
                
                frame_vectors = []
                for i, fr in enumerate(use_frames):
                    prev_fr = use_frames[i - 1] if i > 0 else None
                    feat = extract_frame_features(fr, prev_fr)
                    frame_vectors.append(feat)
                
                feature_seq = np.array(frame_vectors, dtype=np.float32)
                resampled_seq = resample_sequence(feature_seq, FIXED_SEQ_LEN)
                
                samples_X.append(resampled_seq)
                samples_y.append(label_to_idx[cls])
                sample_ids.append(data.get("sampleId", os.path.basename(fpath)))
            except Exception as e:
                print(f"Warning: could not load {fpath}: {e}")
                
    X = np.array(samples_X, dtype=np.float32)
    y = np.array(samples_y, dtype=np.int64)
    
    return X, y, class_names, sample_ids
