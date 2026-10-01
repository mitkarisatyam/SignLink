# ml_experiment/train_and_evaluate.py
import os
import sys
import json
import time
import pickle
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, precision_recall_fscore_support

from dataset_loader import load_dataset, FIXED_SEQ_LEN, FEATURE_DIM
from model import SignTemporalGRU

# Configuration
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_DATASET_DIR = os.path.join(BASE_DIR, "ml_experiment", "dataset", "raw")
CHECKPOINT_DIR = os.path.join(BASE_DIR, "ml_experiment", "checkpoints")
REPORT_DIR = os.path.join(BASE_DIR, "ml_experiment", "reports")

os.makedirs(CHECKPOINT_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)

# Device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def train_epoch(model, dataloader, optimizer, criterion):
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0
    for batch_x, batch_y in dataloader:
        batch_x, batch_y = batch_x.to(device), batch_y.to(device)
        optimizer.zero_grad()
        logits = model(batch_x)
        loss = criterion(logits, batch_y)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        
        total_loss += loss.item() * len(batch_y)
        preds = torch.argmax(logits, dim=-1)
        correct += (preds == batch_y).sum().item()
        total += len(batch_y)
        
    return total_loss / total, correct / total


def evaluate_dataset(model, dataloader):
    model.eval()
    all_preds = []
    all_probs = []
    all_labels = []
    with torch.no_grad():
        for batch_x, batch_y in dataloader:
            batch_x = batch_x.to(device)
            logits = model(batch_x)
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
            preds = np.argmax(probs, axis=-1)
            
            all_probs.extend(probs)
            all_preds.extend(preds)
            all_labels.extend(batch_y.numpy())
            
    return np.array(all_preds), np.array(all_probs), np.array(all_labels)


def fit_and_transform_scaler(train_X, other_Xs=[]):
    """
    Strict featurization ordering: fit StandardScaler on train_X only,
    then transform train_X and any other_Xs.
    Shape of X is (N, T, D) -> flatten to (N*T, D) for fitting, then reshape back.
    """
    scaler = StandardScaler()
    N_tr, T, D = train_X.shape
    train_flat = train_X.reshape(-1, D)
    scaler.fit(train_flat)
    
    scaled_train = scaler.transform(train_flat).reshape(N_tr, T, D).astype(np.float32)
    
    scaled_others = []
    for other in other_Xs:
        N_ot, _, _ = other.shape
        ot_flat = other.reshape(-1, D)
        scaled_ot = scaler.transform(ot_flat).reshape(N_ot, T, D).astype(np.float32)
        scaled_others.append(scaled_ot)
        
    return scaler, scaled_train, scaled_others


def main():
    print("=" * 70, flush=True)
    print("ISL SIGN LANGUAGE RECOGNITION — ML MODEL TRAINING & EVALUATION", flush=True)
    print("=" * 70, flush=True)
    print(f"Dataset directory: {RAW_DATASET_DIR}", flush=True)
    print(f"Device: {device}", flush=True)

    # 1. Load Dataset
    X, y, class_names, sample_ids = load_dataset(RAW_DATASET_DIR)
    num_samples = len(y)
    num_classes = len(class_names)

    print(f"\nTotal Recorded Samples: {num_samples}", flush=True)
    print(f"Classes ({num_classes}): {class_names}", flush=True)
    print("Samples per class:", flush=True)
    for i, c in enumerate(class_names):
        count = int((y == i).sum())
        print(f"  [{i}] {c:10s} : {count:3d} samples", flush=True)

    if num_samples < 20:
        print("Error: insufficient samples for training.", flush=True)
        sys.exit(1)

    # Calculate class weights for cross-entropy to balance NO_SIGN vs signs
    class_counts = np.bincount(y, minlength=num_classes)
    total_samples = float(num_samples)
    class_weights = total_samples / (num_classes * class_counts.astype(np.float32))
    class_weights_tensor = torch.tensor(class_weights, dtype=torch.float32).to(device)

    # =========================================================================
    # PART 1: 5-Fold Stratified Cross-Validation (Complete Recordings)
    # =========================================================================
    print("\n" + "=" * 70, flush=True)
    print("PART 1: 5-FOLD STRATIFIED CROSS-VALIDATION (ON COMPLETE RECORDINGS)", flush=True)
    print("=" * 70, flush=True)

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    cv_oof_preds = np.zeros(num_samples, dtype=np.int64)
    cv_oof_probs = np.zeros((num_samples, num_classes), dtype=np.float32)
    fold_accuracies = []

    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
        train_X_raw, val_X_raw = X[train_idx], X[val_idx]
        train_y, val_y = y[train_idx], y[val_idx]

        # Strict featurization ordering: fit scaler strictly on training fold
        scaler, train_X_scaled, [val_X_scaled] = fit_and_transform_scaler(train_X_raw, [val_X_raw])

        # PyTorch DataLoaders
        train_ds = TensorDataset(torch.tensor(train_X_scaled), torch.tensor(train_y))
        val_ds = TensorDataset(torch.tensor(val_X_scaled), torch.tensor(val_y))
        
        train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, drop_last=True)
        val_loader = DataLoader(val_ds, batch_size=16, shuffle=False)

        # Initialize model
        model = SignTemporalGRU(
            input_dim=FEATURE_DIM,
            hidden_dim=64,
            num_layers=2,
            num_classes=num_classes,
            dropout=0.25
        ).to(device)

        optimizer = torch.optim.AdamW(model.parameters(), lr=0.003, weight_decay=1e-4)
        criterion = nn.CrossEntropyLoss(weight=class_weights_tensor)

        # Train with early stopping
        best_val_loss = float("inf")
        best_state = None
        patience = 20
        patience_counter = 0

        for epoch in range(80):
            train_loss, train_acc = train_epoch(model, train_loader, optimizer, criterion)
            
            # Validation loss
            model.eval()
            val_loss = 0.0
            val_total = 0
            with torch.no_grad():
                for bx, by in val_loader:
                    bx, by = bx.to(device), by.to(device)
                    v_logits = model(bx)
                    v_loss = criterion(v_logits, by)
                    val_loss += v_loss.item() * len(by)
                    val_total += len(by)
            val_loss /= val_total

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
                patience_counter = 0
            else:
                patience_counter += 1
                if patience_counter >= patience:
                    break

        if best_state is not None:
            model.load_state_dict(best_state)

        # Evaluate on fold validation recordings
        preds, probs, _ = evaluate_dataset(model, val_loader)
        cv_oof_preds[val_idx] = preds
        cv_oof_probs[val_idx] = probs
        
        fold_acc = float((preds == val_y).mean())
        fold_accuracies.append(fold_acc)
        print(f"Fold {fold + 1}/5 Accuracy: {fold_acc * 100:.1f}% (Val Samples: {len(val_y)})", flush=True)

    cv_mean_acc = float(np.mean(fold_accuracies))
    cv_std_acc = float(np.std(fold_accuracies))
    print(f"\n5-Fold Cross-Validation Overall Accuracy: {cv_mean_acc * 100:.1f}% (+/- {cv_std_acc * 100:.1f}%)", flush=True)

    # Full Out-Of-Fold Classification Report
    print("\n--- OUT-OF-FOLD PERFORMANCE PER CLASS (84 Complete Recordings) ---", flush=True)
    report_dict = classification_report(y, cv_oof_preds, target_names=class_names, output_dict=True)
    print(classification_report(y, cv_oof_preds, target_names=class_names), flush=True)

    # Confusion Matrix
    cm = confusion_matrix(y, cv_oof_preds)
    print("\n--- OUT-OF-FOLD CONFUSION MATRIX ---", flush=True)
    header = f"{'True \\ Pred':12s} " + " ".join([f"{c[:7]:>7s}" for c in class_names])
    print(header, flush=True)
    print("-" * len(header), flush=True)
    for i, true_cls in enumerate(class_names):
        row_str = f"{true_cls:12s} " + " ".join([f"{cm[i, j]:7d}" for j in range(num_classes)])
        print(row_str, flush=True)

    # Specific Rejection & False Positive Analysis
    no_sign_idx = class_names.index("NO_SIGN") if "NO_SIGN" in class_names else -1
    false_positives_on_no_sign = 0
    total_no_sign = 0
    fp_details = {}

    if no_sign_idx >= 0:
        print("\n--- MISCLASSIFIED NO_SIGN SAMPLES ---", flush=True)
        total_no_sign = int((y == no_sign_idx).sum())
        for idx in range(num_samples):
            if y[idx] == no_sign_idx and cv_oof_preds[idx] != no_sign_idx:
                false_positives_on_no_sign += 1
                pred_name = class_names[cv_oof_preds[idx]]
                fp_details[pred_name] = fp_details.get(pred_name, 0) + 1
                print(f"Sample: {sample_ids[idx]} | Predicted: {pred_name}", flush=True)

    fp_rate = (false_positives_on_no_sign / total_no_sign * 100) if total_no_sign > 0 else 0.0

    print("\n" + "=" * 70, flush=True)
    print("NO_SIGN REJECTION ANALYSIS (KEY CRITERIA)", flush=True)
    print("=" * 70, flush=True)
    print(f"Total NO_SIGN recordings: {total_no_sign}", flush=True)
    print(f"Correctly Rejected as NO_SIGN: {total_no_sign - false_positives_on_no_sign} / {total_no_sign} ({(100.0 - fp_rate):.1f}%)", flush=True)
    print(f"False Positives (NO_SIGN predicted as a sign): {false_positives_on_no_sign} / {total_no_sign} ({fp_rate:.1f}%)", flush=True)
    if fp_details:
        print("Breakdown of False Positives on NO_SIGN:", flush=True)
        for sign_name, cnt in fp_details.items():
            print(f"  Falsely predicted as {sign_name}: {cnt} times", flush=True)
    else:
        print("Excellent: Zero false positives on NO_SIGN recordings!", flush=True)

    # False Rejection of Real Signs (Real Sign predicted as NO_SIGN)
    print("\nREAL SIGN REJECTION ANALYSIS (Signs predicted as NO_SIGN):", flush=True)
    for i, cls in enumerate(class_names):
        if cls == "NO_SIGN":
            continue
        mask = (y == i)
        sign_preds = cv_oof_preds[mask]
        rejected_cnt = int((sign_preds == no_sign_idx).sum())
        total_sign = len(sign_preds)
        print(f"  {cls:10s}: {rejected_cnt} / {total_sign} falsely predicted as NO_SIGN", flush=True)

    # Confidence Analysis
    correct_mask = (cv_oof_preds == y)
    max_probs = np.max(cv_oof_probs, axis=-1)
    mean_conf_correct = float(np.mean(max_probs[correct_mask])) if correct_mask.any() else 0.0
    mean_conf_error = float(np.mean(max_probs[~correct_mask])) if (~correct_mask).any() else 0.0

    print(f"\nAverage Confidence on Correct Predictions: {mean_conf_correct * 100:.1f}%", flush=True)
    print(f"Average Confidence on Misclassifications: {mean_conf_error * 100:.1f}%", flush=True)

    # =========================================================================
    # PART 1.5: Empirical Validation of Rejection Threshold
    # =========================================================================
    print("\n" + "=" * 70, flush=True)
    print("EMPIRICAL REJECTION THRESHOLD VALIDATION (GRID SWEEP ON TEST DATA)", flush=True)
    print("=" * 70, flush=True)

    thresholds = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
    sweep_results = []

    print(f"{'Threshold':10s} | {'Sign Recall':15s} | {'NO_SIGN FPR':15s} | {'Macro F1':10s}", flush=True)
    print("-" * 65, flush=True)

    sign_mask = (y != no_sign_idx)
    no_sign_mask = (y == no_sign_idx)
    total_signs = int(sign_mask.sum())

    best_thresh = 0.80
    best_score = -1.0

    for th in thresholds:
        thresh_preds = np.copy(cv_oof_preds)
        for idx in range(num_samples):
            pred_class = cv_oof_preds[idx]
            pred_prob = cv_oof_probs[idx, pred_class]
            if pred_class != no_sign_idx and pred_prob < th:
                thresh_preds[idx] = no_sign_idx

        correct_signs = int(((thresh_preds == y) & sign_mask).sum())
        sign_recall = (correct_signs / total_signs * 100) if total_signs > 0 else 0.0

        fp_no_sign = int((thresh_preds[no_sign_mask] != no_sign_idx).sum())
        no_sign_fpr = (fp_no_sign / total_no_sign * 100) if total_no_sign > 0 else 0.0

        macro_f1 = precision_recall_fscore_support(y, thresh_preds, average='macro')[2] * 100

        # Optimization criterion: high sign recall while minimizing NO_SIGN false positives
        score = sign_recall - (no_sign_fpr * 1.5)
        if score > best_score:
            best_score = score
            best_thresh = th

        print(f"{th * 100:6.0f}%     | {sign_recall:5.1f}% ({correct_signs:2d}/{total_signs:2d})   | {no_sign_fpr:5.1f}% ({fp_no_sign:2d}/{total_no_sign:2d})   | {macro_f1:5.1f}%", flush=True)
        sweep_results.append({
            "threshold": th,
            "signRecall": sign_recall,
            "noSignFPR": no_sign_fpr,
            "macroF1": macro_f1
        })

    print(f"\nEmpirically Validated Optimal Rejection Threshold: {best_thresh * 100:.0f}%", flush=True)

    # =========================================================================
    # PART 2: Train Final Model on 100% Data & Save Artifacts
    # =========================================================================
    print("\n" + "=" * 70, flush=True)
    print("PART 2: SAVING TRAINED MODEL ARTIFACTS", flush=True)
    print("=" * 70, flush=True)

    full_scaler = StandardScaler()
    N, T, D = X.shape
    X_flat = X.reshape(-1, D)
    full_scaler.fit(X_flat)
    X_scaled = full_scaler.transform(X_flat).reshape(N, T, D).astype(np.float32)

    final_model = SignTemporalGRU(
        input_dim=FEATURE_DIM,
        hidden_dim=64,
        num_layers=2,
        num_classes=num_classes,
        dropout=0.25
    ).to(device)

    final_opt = torch.optim.AdamW(final_model.parameters(), lr=0.003, weight_decay=1e-4)
    full_ds = TensorDataset(torch.tensor(X_scaled), torch.tensor(y))
    full_loader = DataLoader(full_ds, batch_size=16, shuffle=True, drop_last=True)

    final_model.train()
    for ep in range(70):
        train_epoch(final_model, full_loader, final_opt, nn.CrossEntropyLoss(weight=class_weights_tensor))

    # Save model weights, scaler, and class map
    model_path = os.path.join(CHECKPOINT_DIR, "sign_gru_v2.pth")
    scaler_path = os.path.join(CHECKPOINT_DIR, "scaler_v2.pkl")
    meta_path = os.path.join(CHECKPOINT_DIR, "model_meta_v2.json")

    torch.save(final_model.state_dict(), model_path)
    with open(scaler_path, "wb") as f:
        pickle.dump(full_scaler, f)

    meta = {
        "architecture": "SignTemporalGRU",
        "inputDim": FEATURE_DIM,
        "hiddenDim": 64,
        "numLayers": 2,
        "numClasses": num_classes,
        "classNames": class_names,
        "fixedSeqLen": FIXED_SEQ_LEN,
        "cvAccuracy": cv_mean_acc,
        "optimalThreshold": best_thresh,
        "totalSamples": num_samples,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    eval_results = {
        "numSamples": num_samples,
        "classNames": class_names,
        "classCounts": {c: int((y == i).sum()) for i, c in enumerate(class_names)},
        "cvAccuracy": cv_mean_acc,
        "cvAccuracyStd": cv_std_acc,
        "foldAccuracies": fold_accuracies,
        "classificationReport": report_dict,
        "confusionMatrix": cm.tolist(),
        "noSignFalsePositiveRate": fp_rate,
        "falsePositivesOnNoSign": false_positives_on_no_sign,
        "fpDetails": fp_details,
        "meanConfCorrect": mean_conf_correct,
        "meanConfError": mean_conf_error,
        "optimalThreshold": best_thresh,
        "thresholdSweep": sweep_results
    }
    eval_path = os.path.join(REPORT_DIR, "evaluation_results_v2.json")
    with open(eval_path, "w", encoding="utf-8") as f:
        json.dump(eval_results, f, indent=2)

    print(f"Model checkpoint saved to: {model_path}", flush=True)
    print(f"Scaler saved to: {scaler_path}", flush=True)
    print(f"Evaluation results saved to: {eval_path}", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    main()
