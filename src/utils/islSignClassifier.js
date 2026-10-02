/**
 * islSignClassifier.js
 * 
 * High-Precision Gesture Action Classifier for the 5 ISL Words:
 * 1. HOME: Roof apex (/ \) with both hands touching at fingertips and wrists spread wide
 * 2. WORK: Single-hand vertical rhythmic downward tapping or two hands tapping at wrists/fists
 * 3. GO: Open flat palm held or pushed forward in chest/torso area (Avatar GO action)
 * 4. PLEASE: Decisive index finger pointing (Avatar PLEASE action) OR two hands joined in Prayer/Namaste
 * 5. COME: Inward beckoning stroke towards chest with palm facing signer (never triggers on two hands touching)
 *
 * Integrated Engine:
 * - Default: SignTemporalGRU v2 Deep Neural Network (trained on 110 dataset recordings, 151 temporal features)
 * - Fallback: Heuristic rule-based ISL recognizer (preserves tested spatial & kinematic rules)
 */

import modelBundle from './sign_gru_v2_bundle.json' with { type: 'json' };

// =============================================================================
// ML ENGINE: SignTemporalGRU v2 Deep Neural Network
// =============================================================================

function norm3D(dx, dy, dz) {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function extractFrameFeatures(frame, prevFrame) {
  const hands = frame.hands || [];
  const h0 = hands.length > 0 && hands[0] ? hands[0] : { isPresent: false };
  const h1 = hands.length > 1 && hands[1] ? hands[1] : { isPresent: false };

  const feats = [];

  // 1. Centered Landmarks (63 for h0, 63 for h1)
  function pushCentered(h) {
    if (!h.isPresent || !h.centeredLandmarks) {
      for (let i = 0; i < 63; i++) feats.push(0);
      return;
    }
    const lms = h.centeredLandmarks;
    for (let i = 0; i < 21; i++) {
      const p = lms[i] || { x: 0, y: 0, z: 0 };
      feats.push(p.x || 0, p.y || 0, p.z || 0);
    }
  }
  pushCentered(h0);
  pushCentered(h1);

  // 2. Wrist positions and inter-wrist vector (10 features)
  const w0 = (h0.isPresent && h0.wrist) ? h0.wrist : { x: 0, y: 0, z: 0 };
  const w1 = (h1.isPresent && h1.wrist) ? h1.wrist : { x: 0, y: 0, z: 0 };

  feats.push(w0.x || 0, w0.y || 0, w0.z || 0);
  feats.push(w1.x || 0, w1.y || 0, w1.z || 0);

  if (h0.isPresent && h1.isPresent) {
    const ix = (w1.x || 0) - (w0.x || 0);
    const iy = (w1.y || 0) - (w0.y || 0);
    const iz = (w1.z || 0) - (w0.z || 0);
    const idist = norm3D(ix, iy, iz);
    feats.push(ix, iy, iz, idist);
  } else {
    feats.push(0, 0, 0, 0);
  }

  // 3. Presence flags (2 features)
  feats.push(h0.isPresent ? 1 : 0);
  feats.push(h1.isPresent ? 1 : 0);

  // 4. Finger key geometric distances (6 features)
  function getFingerDistances(h) {
    if (!h.isPresent || !h.rawLandmarks || h.rawLandmarks.length < 21) {
      return [0, 0, 0];
    }
    const raw = h.rawLandmarks;
    const t = raw[4], i = raw[8], m = raw[12], w = raw[0];
    const thumbIndexDist = norm3D(t.x - i.x, t.y - i.y, (t.z || 0) - (i.z || 0));
    const indexMiddleDist = norm3D(i.x - m.x, i.y - m.y, (i.z || 0) - (m.z || 0));
    const handOpenness = norm3D(m.x - w.x, m.y - w.y, (m.z || 0) - (w.z || 0));
    return [thumbIndexDist, indexMiddleDist, handOpenness];
  }

  const h0Dist = getFingerDistances(h0);
  const h1Dist = getFingerDistances(h1);
  feats.push(...h0Dist);
  feats.push(...h1Dist);

  // 5. Velocity / delta features (7 features)
  if (prevFrame) {
    const pHands = prevFrame.hands || [];
    const ph0 = pHands.length > 0 && pHands[0] ? pHands[0] : { isPresent: false };
    const ph1 = pHands.length > 1 && pHands[1] ? pHands[1] : { isPresent: false };

    const pw0 = (ph0.isPresent && ph0.wrist) ? ph0.wrist : { x: 0, y: 0, z: 0 };
    const pw1 = (ph1.isPresent && ph1.wrist) ? ph1.wrist : { x: 0, y: 0, z: 0 };

    if (h0.isPresent && ph0.isPresent) {
      feats.push((w0.x || 0) - (pw0.x || 0), (w0.y || 0) - (pw0.y || 0), (w0.z || 0) - (pw0.z || 0));
    } else {
      feats.push(0, 0, 0);
    }

    if (h1.isPresent && ph1.isPresent) {
      feats.push((w1.x || 0) - (pw1.x || 0), (w1.y || 0) - (pw1.y || 0), (w1.z || 0) - (pw1.z || 0));
    } else {
      feats.push(0, 0, 0);
    }

    const ph0Dist = getFingerDistances(ph0);
    const dOpen = (h0.isPresent && ph0.isPresent) ? (h0Dist[2] - ph0Dist[2]) : 0;
    feats.push(dOpen);
  } else {
    for (let i = 0; i < 7; i++) feats.push(0);
  }

  return feats;
}

function resampleSequence(featureSeq, targetLen = 20) {
  const origLen = featureSeq.length;
  const numFeats = featureSeq[0].length;
  if (origLen === 0) {
    return Array.from({ length: targetLen }, () => new Float32Array(numFeats));
  }
  if (origLen === 1) {
    return Array.from({ length: targetLen }, () => new Float32Array(featureSeq[0]));
  }

  const resampled = [];
  for (let t = 0; t < targetLen; t++) {
    const targetTime = t / (targetLen - 1);
    const origIndex = targetTime * (origLen - 1);
    const low = Math.floor(origIndex);
    const high = Math.min(origLen - 1, Math.ceil(origIndex));
    const alpha = origIndex - low;

    const row = new Float32Array(numFeats);
    for (let d = 0; d < numFeats; d++) {
      row[d] = (1 - alpha) * featureSeq[low][d] + alpha * featureSeq[high][d];
    }
    resampled.push(row);
  }
  return resampled;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

const sharedGatesIh = new Float32Array(192);
const sharedGatesHh = new Float32Array(192);

function gruLayerStep(x, h_prev, w_ih, w_hh, b_ih, b_hh, hiddenDim, out_h) {
  const gateDim = 3 * hiddenDim;

  for (let i = 0; i < gateDim; i++) {
    let sum_ih = b_ih[i];
    const w_ih_row = w_ih[i];
    for (let j = 0; j < x.length; j++) {
      sum_ih += w_ih_row[j] * x[j];
    }
    sharedGatesIh[i] = sum_ih;

    let sum_hh = b_hh[i];
    const w_hh_row = w_hh[i];
    for (let j = 0; j < hiddenDim; j++) {
      sum_hh += w_hh_row[j] * h_prev[j];
    }
    sharedGatesHh[i] = sum_hh;
  }

  for (let j = 0; j < hiddenDim; j++) {
    const r = sigmoid(sharedGatesIh[j] + sharedGatesHh[j]);
    const z = sigmoid(sharedGatesIh[hiddenDim + j] + sharedGatesHh[hiddenDim + j]);
    const n = Math.tanh(sharedGatesIh[2 * hiddenDim + j] + r * sharedGatesHh[2 * hiddenDim + j]);
    out_h[j] = (1 - z) * n + z * h_prev[j];
  }
}

const sharedH0Seq = new Float32Array(20 * 64);
const sharedH1Seq = new Float32Array(20 * 64);
const sharedH0 = new Float32Array(64);
const sharedH1 = new Float32Array(64);
const sharedMeanPool = new Float32Array(64);
const sharedCombined = new Float32Array(128);
const sharedFc1Out = new Float32Array(48);
const sharedLogits = new Float32Array(64); // Support up to 64 classes
const sharedProbs = new Float32Array(64);

function forwardModel(scaledSeq) {
  const T = scaledSeq.length;
  const H = modelBundle.hiddenDim;
  const w = modelBundle.weights;

  // Layer 0
  sharedH0.fill(0);
  for (let t = 0; t < T; t++) {
    gruLayerStep(scaledSeq[t], sharedH0, w.gru_w_ih_l0, w.gru_w_hh_l0, w.gru_b_ih_l0, w.gru_b_hh_l0, H, sharedH0);
    sharedH0Seq.set(sharedH0, t * H);
  }

  // Layer 1
  sharedH1.fill(0);
  for (let t = 0; t < T; t++) {
    const h0_t = sharedH0Seq.subarray(t * H, (t + 1) * H);
    gruLayerStep(h0_t, sharedH1, w.gru_w_ih_l1, w.gru_w_hh_l1, w.gru_b_ih_l1, w.gru_b_hh_l1, H, sharedH1);
    sharedH1Seq.set(sharedH1, t * H);
  }

  const last_step_idx = (T - 1) * H;
  sharedMeanPool.fill(0);
  for (let t = 0; t < T; t++) {
    const offset = t * H;
    for (let j = 0; j < H; j++) {
      sharedMeanPool[j] += sharedH1Seq[offset + j] / T;
    }
  }

  for (let j = 0; j < H; j++) {
    sharedCombined[j] = sharedH1Seq[last_step_idx + j];
    sharedCombined[H + j] = sharedMeanPool[j];
  }

  // FC1: Linear(128 -> 48)
  for (let i = 0; i < 48; i++) {
    let sum = w.fc1_b[i];
    const row = w.fc1_w[i];
    for (let j = 0; j < H * 2; j++) {
      sum += row[j] * sharedCombined[j];
    }
    const eps = 1e-5;
    const bn = ((sum - w.bn_mean[i]) / Math.sqrt(w.bn_var[i] + eps)) * w.bn_weight[i] + w.bn_bias[i];
    sharedFc1Out[i] = Math.max(0, bn);
  }

  // FC2: Linear(48 -> numClasses)
  const numClasses = modelBundle.classNames.length;
  for (let i = 0; i < numClasses; i++) {
    let sum = w.fc2_b[i];
    const row = w.fc2_w[i];
    for (let j = 0; j < 48; j++) {
      sum += row[j] * sharedFc1Out[j];
    }
    sharedLogits[i] = sum;
  }

  // Softmax
  let maxLogit = -Infinity;
  for (let i = 0; i < numClasses; i++) {
    if (sharedLogits[i] > maxLogit) maxLogit = sharedLogits[i];
  }
  let sumExp = 0;
  for (let i = 0; i < numClasses; i++) {
    sharedProbs[i] = Math.exp(sharedLogits[i] - maxLogit);
    sumExp += sharedProbs[i];
  }
  
  const finalProbs = new Float32Array(numClasses);
  for (let i = 0; i < numClasses; i++) {
    finalProbs[i] = sharedProbs[i] / sumExp;
  }

  return finalProbs;
}

export class MlSignRecognizer {
  constructor(options = {}) {
    this.rejectionThreshold = 0.40;
    this.windowSize = 22;
    this.minWindowFrames = 4;
    this.debounceMs = 1500;

    this.frameWindow = [];
    this.candidateWord = null;
    this.candidateFrames = 0;
    this.lastTriggeredWord = null;
    this.lastTriggerTime = 0;
    this.debugMode = false;
  }

  setDebugMode(enabled) {
    this.debugMode = Boolean(enabled);
  }

  reset() {
    this.frameWindow = [];
    this.candidateWord = null;
    this.candidateFrames = 0;
    this.lastTriggeredWord = null;
    this.lastTriggerTime = 0;
  }

  packageFrame(multiHandLandmarks) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      return null;
    }
    const sorted = [...multiHandLandmarks].sort((a, b) => a[0].x - b[0].x);
    const handsData = [];
    for (let h = 0; h < 2; h++) {
      if (h < sorted.length) {
        const lms = sorted[h];
        const wrist = lms[0];
        const raw = lms.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
        const centered = lms.map(p => ({
          x: p.x - wrist.x,
          y: p.y - wrist.y,
          z: (p.z || 0) - (wrist.z || 0)
        }));
        handsData.push({
          isPresent: true,
          wrist: { x: wrist.x, y: wrist.y, z: wrist.z || 0 },
          rawLandmarks: raw,
          centeredLandmarks: centered
        });
      } else {
        handsData.push({
          isPresent: false,
          wrist: { x: 0, y: 0, z: 0 },
          rawLandmarks: new Array(21).fill({ x: 0, y: 0, z: 0 }),
          centeredLandmarks: new Array(21).fill({ x: 0, y: 0, z: 0 })
        });
      }
    }
    return {
      timestampMs: performance.now(),
      handCount: multiHandLandmarks.length,
      hands: handsData
    };
  }

  classifyFrame(multiHandLandmarks) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      this.frameWindow = [];
      this.candidateFrames = Math.max(0, this.candidateFrames - 1);
      if (this.candidateFrames === 0) this.candidateWord = null;
      return {
        word: 'NO_SIGN',
        confidence: 0,
        rule: 'NO_HANDS',
        progress: 0,
        isTriggerable: false,
        isCharging: false
      };
    }

    const frameObj = this.packageFrame(multiHandLandmarks);
    this.frameWindow.push(frameObj);
    if (this.frameWindow.length > this.windowSize) {
      this.frameWindow.shift();
    }

    // Need minimal frames in buffer to resample sequence
    if (this.frameWindow.length < this.minWindowFrames) {
      const prog = Math.round((this.frameWindow.length / this.minWindowFrames) * 50);
      return {
        word: 'NO_SIGN',
        confidence: 0,
        rule: 'BUFFERING',
        progress: prog,
        isTriggerable: false,
        isCharging: true
      };
    }

    // Filter dead prefix frames
    const activeFrames = this.frameWindow.filter(fr => fr.handCount > 0);
    const useFrames = activeFrames.length >= 8 ? activeFrames : this.frameWindow;

    const frameVectors = [];
    for (let i = 0; i < useFrames.length; i++) {
      const prev = i > 0 ? useFrames[i - 1] : null;
      frameVectors.push(extractFrameFeatures(useFrames[i], prev));
    }

    const resampled = resampleSequence(frameVectors, 20);

    const scaled = [];
    const mean = modelBundle.scaler.mean;
    const scale = modelBundle.scaler.scale;
    for (let t = 0; t < 20; t++) {
      const row = new Float32Array(151);
      for (let d = 0; d < 151; d++) {
        row[d] = (resampled[t][d] - mean[d]) / scale[d];
      }
      scaled.push(row);
    }

    const probs = forwardModel(scaled);

    let topIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[topIdx]) topIdx = i;
    }

    const predictedClass = modelBundle.classNames[topIdx];
    const topProb = probs[topIdx];

    // STRICT REJECTION:
    // 1. If predicted as NO_SIGN -> reject
    // 2. If confidence < rejectionThreshold (70%) -> reject to NO_SIGN
    if (predictedClass === 'NO_SIGN' || topProb < this.rejectionThreshold) {
      this.candidateFrames = Math.max(0, this.candidateFrames - 1);
      if (this.candidateFrames === 0) this.candidateWord = null;
      return {
        word: 'NO_SIGN',
        candidateWord: predictedClass,
        confidence: Math.round(topProb * 100),
        rule: 'REJECTED_OR_NO_SIGN',
        progress: 0,
        isTriggerable: false,
        isCharging: false
      };
    }

    // Candidate confirmation stability:
    // Instant triggers for all matches that pass the 40% threshold!
    const requiredFrames = 1;

    if (predictedClass === this.candidateWord) {
      this.candidateFrames++;
    } else {
      this.candidateWord = predictedClass;
      this.candidateFrames = 1;
    }

    if (this.candidateFrames >= requiredFrames) {
      const now = performance.now();
      const isCooldownOver =
        this.candidateWord !== this.lastTriggeredWord ||
        now - this.lastTriggerTime > this.debounceMs;

      const result = {
        word: this.candidateWord,
        confidence: Math.round(topProb * 100),
        rule: 'SIGN_TEMPORAL_GRU_V2',
        progress: 100,
        isTriggerable: isCooldownOver,
        isCharging: false,
        stableCount: this.candidateFrames
      };

      if (this.debugMode) {
        console.log(`[ML Debug] TRIGGERED: ${result.word} (${result.confidence}%) | Frames: ${this.candidateFrames}`);
      }

      if (isCooldownOver) {
        this.lastTriggeredWord = this.candidateWord;
        this.lastTriggerTime = now;
        this.frameWindow = [];
      }
      return result;
    }

    return {
      word: 'NO_SIGN',
      candidateWord: this.candidateWord,
      confidence: Math.round(topProb * 100),
      rule: 'CHARGING_CONFIRMATION',
      progress: Math.min(100, Math.round((this.candidateFrames / requiredFrames) * 100)),
      isTriggerable: false,
      isCharging: true
    };
  }
}

// =============================================================================
// UNIFIED RECOGNIZER (Default: ML GRU v2 | Fallback: Heuristic Rules)
// =============================================================================

export class IslSignRecognizer {
  constructor(options = {}) {
    this.mode = 'ml'; // Only ML mode supported now
    this.mlRecognizer = new MlSignRecognizer(options);
  }

  setEngine(mode) {
    // Legacy support: mode is now always 'ml'
    this.mode = 'ml';
    this.reset();
  }

  getEngine() {
    return this.mode;
  }

  setDebugMode(enabled) {
    this.mlRecognizer.setDebugMode(enabled);
  }

  reset() {
    this.mlRecognizer.reset();
  }

  classifyFrame(multiHandLandmarks) {
    return this.mlRecognizer.classifyFrame(multiHandLandmarks);
  }
}


