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

function dist2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function dist3D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx, wristIdx = 0) {
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  const mcp = landmarks[mcpIdx];
  const wrist = landmarks[wristIdx];

  const tipDist = dist3D(tip, wrist);
  const pipDist = dist3D(pip, wrist);
  const mcpDist = dist3D(mcp, wrist);

  return tipDist > pipDist * 1.05 && tipDist > mcpDist * 1.15;
}

export function isFingerCurled(landmarks, tipIdx, pipIdx, mcpIdx, wristIdx = 0) {
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  const mcp = landmarks[mcpIdx];
  const wrist = landmarks[wristIdx];

  const tipDist = dist3D(tip, wrist);
  const mcpDist = dist3D(mcp, wrist);

  return tipDist < mcpDist * 1.20 || dist3D(tip, mcp) < dist3D(pip, mcp) * 0.95;
}

export function analyzeHand(landmarks) {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];

  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  const thumbExt = isFingerExtended(landmarks, 4, 3, 2, 0);
  const indexExt = isFingerExtended(landmarks, 8, 7, 5, 0);
  const middleExt = isFingerExtended(landmarks, 12, 11, 9, 0);
  const ringExt = isFingerExtended(landmarks, 16, 15, 13, 0);
  const pinkyExt = isFingerExtended(landmarks, 20, 19, 17, 0);

  const thumbCurled = isFingerCurled(landmarks, 4, 3, 2, 0);
  const indexCurled = isFingerCurled(landmarks, 8, 7, 5, 0);
  const middleCurled = isFingerCurled(landmarks, 12, 11, 9, 0);
  const ringCurled = isFingerCurled(landmarks, 16, 15, 13, 0);
  const pinkyCurled = isFingerCurled(landmarks, 20, 19, 17, 0);

  const extendedCount = [thumbExt, indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;
  const fourFingersExt = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

  const palmCenter = {
    x: (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4,
    y: (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4,
    z: ((wrist.z || 0) + (indexMcp.z || 0) + (middleMcp.z || 0) + (pinkyMcp.z || 0)) / 4
  };

  // Average distance from tips to wrist (openness metric)
  const avgTipDist = (dist3D(indexTip, wrist) + dist3D(middleTip, wrist) + dist3D(ringTip, wrist) + dist3D(pinkyTip, wrist)) / 4;

  // Inter-finger geometric relationships
  const fingerSpread = dist2D(indexTip, pinkyTip);
  const thumbIndexDist = dist2D(thumbTip, indexTip);
  const indexMiddleDist = dist2D(indexTip, middleTip);

  // Closed fist (all 4 fingers curled)
  const isFist = fourFingersExt <= 1 && (indexCurled || middleCurled) && (ringCurled || pinkyCurled);

  // Flat open palm (requires index, middle, ring all extended and fingers not pinched into an OK sign)
  const isFlatPalm = fourFingersExt >= 3 && indexExt && middleExt && ringExt && thumbIndexDist > 0.070 && fingerSpread < 0.35;

  // Single-finger index pointing (Index extended, ring & pinky curled, middle curled)
  const isIndexPointing = indexExt && !ringExt && !pinkyExt && middleCurled &&
                          dist2D(indexTip, palmCenter) > 0.095 &&
                          dist2D(indexTip, wrist) > dist2D(middleTip, wrist) * 1.15;

  // Index and middle pointing together (strictly held together, NOT spread into a V)
  const isTwoFingerPointing = indexExt && middleExt && !ringExt && !pinkyExt &&
                              indexMiddleDist <= 0.055 &&
                              dist2D(indexTip, palmCenter) > 0.10;

  // V / Peace sign (index & middle spread apart into V)
  const isVOrPeaceSign = indexExt && middleExt && !ringExt && !pinkyExt && indexMiddleDist > 0.065;

  // OK sign (thumb & index touching in circle, middle and ring extended pointing upward)
  const isOkSign = thumbIndexDist < 0.065 && middleExt && ringExt && middleTip.y < middleMcp.y;

  return {
    wrist,
    thumbTip,
    indexTip,
    middleTip,
    ringTip,
    pinkyTip,
    indexMcp,
    middleMcp,
    pinkyMcp,
    palmCenter,
    thumbExt,
    indexExt,
    middleExt,
    ringExt,
    pinkyExt,
    thumbCurled,
    indexCurled,
    middleCurled,
    ringCurled,
    pinkyCurled,
    extendedCount,
    fourFingersExt,
    avgTipDist,
    fingerSpread,
    thumbIndexDist,
    indexMiddleDist,
    isFist,
    isFlatPalm,
    isIndexPointing,
    isTwoFingerPointing,
    isVOrPeaceSign,
    isOkSign
  };
}

export const SIGN_CONFIGS = {
  HOME: {
    minScore: 0.88,
    requiredFrames: 8,
    minHands: 2,
    ruleName: 'HOME_TWO_HAND_ROOF_APEX',
    description: 'Two hands meeting at apex (/ \\) like a roof, calm hold'
  },
  WORK: {
    minScore: 0.85,
    requiredFrames: 7,
    minHands: 1,
    ruleName: 'WORK_VERTICAL_TAPPING',
    description: 'Rhythmic vertical tapping with fists or wrists (Style A/B)'
  },
  PLEASE: {
    minScore: 0.88,
    requiredFrames: 8,
    minHands: 1,
    ruleName: 'PLEASE_POINTING_OR_PRAYER',
    description: 'Index pointing or two-handed prayer / namaste gesture'
  },
  GO: {
    minScore: 0.88,
    requiredFrames: 8,
    minHands: 1,
    ruleName: 'GO_FORWARD_OPEN_PALM',
    description: 'Open flat palm held or pushed forward in chest area'
  },
  COME: {
    minScore: 0.85,
    requiredFrames: 7,
    minHands: 1,
    ruleName: 'COME_INWARD_BECKON',
    description: 'Inward beckoning curl or pull stroke toward chest'
  }
};

export class HeuristicIslSignRecognizer {
  constructor() {
    this.motionTrail = [];
    this.maxTrail = 24; // ~0.8s buffer for gesture kinematics

    this.lastTriggeredWord = null;
    this.lastTriggerTime = 0;
    this.debounceMs = 2400; // Cooldown after triggering

    // Require sustained completed action before triggering
    this.candidateWord = null;
    this.candidateFrames = 0;
    this.candidateRule = null;
    this.debugMode = false;
  }

  setDebugMode(enabled) {
    this.debugMode = Boolean(enabled);
  }

  reset() {
    this.motionTrail = [];
    this.lastTriggeredWord = null;
    this.lastTriggerTime = 0;
    this.candidateWord = null;
    this.candidateFrames = 0;
    this.candidateRule = null;
  }

  classifyFrame(multiHandLandmarks) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      this.motionTrail = [];
      this.candidateFrames = Math.max(0, this.candidateFrames - 2);
      if (this.candidateFrames === 0) this.candidateWord = null;
      return null;
    }

    const hands = multiHandLandmarks.map(analyzeHand);
    const primary = hands[0];

    // Push palm center & openness to motion trail
    this.motionTrail.push({
      x: primary.palmCenter.x,
      y: primary.palmCenter.y,
      z: primary.palmCenter.z,
      openness: primary.avgTipDist,
      time: performance.now()
    });
    if (this.motionTrail.length > this.maxTrail) {
      this.motionTrail.shift();
    }

    // =========================================================================
    // Kinematic motion & trajectory analysis
    // =========================================================================
    let pathLen = 0;
    let horizontalTravel = 0;
    let verticalTravel = 0;
    let xReversals = 0;
    let yReversals = 0;
    let deltaOpenness = 0;
    let deltaZ = 0;
    let deltaX = 0;
    let deltaY = 0;
    let instantSpeed = 0;
    let isEntering = false;
    let isWaving = false;

    const trailLen = this.motionTrail.length;
    if (trailLen >= 4) {
      let lastDxSign = 0;
      let lastDySign = 0;

      for (let i = 1; i < trailLen; i++) {
        const dx = this.motionTrail[i].x - this.motionTrail[i - 1].x;
        const dy = this.motionTrail[i].y - this.motionTrail[i - 1].y;
        const segDist = Math.sqrt(dx * dx + dy * dy);
        pathLen += segDist;
        horizontalTravel += Math.abs(dx);
        verticalTravel += Math.abs(dy);

        // Detect horizontal reversals (waving side-to-side)
        if (Math.abs(dx) > 0.012) {
          const dxSign = dx > 0 ? 1 : -1;
          if (lastDxSign !== 0 && dxSign !== lastDxSign) {
            xReversals++;
          }
          lastDxSign = dxSign;
        }

        // Detect vertical reversals (erratic up and down motion)
        if (Math.abs(dy) > 0.012) {
          const dySign = dy > 0 ? 1 : -1;
          if (lastDySign !== 0 && dySign !== lastDySign) {
            yReversals++;
          }
          lastDySign = dySign;
        }
      }

      const oldest = this.motionTrail[0];
      const newest = this.motionTrail[trailLen - 1];
      deltaX = newest.x - oldest.x;
      deltaY = newest.y - oldest.y;
      deltaZ = newest.z - oldest.z;
      deltaOpenness = newest.openness - oldest.openness;

      // Speed over the last 3-4 frames
      const recentSegs = Math.min(4, trailLen - 1);
      let recentDist = 0;
      for (let i = trailLen - recentSegs; i < trailLen; i++) {
        const dx = this.motionTrail[i].x - this.motionTrail[i - 1].x;
        const dy = this.motionTrail[i].y - this.motionTrail[i - 1].y;
        recentDist += Math.sqrt(dx * dx + dy * dy);
      }
      instantSpeed = recentDist / recentSegs;

      // Waving: multiple side-to-side oscillations or strong horizontal dominance
      isWaving = (xReversals >= 2 && horizontalTravel > 0.06) ||
                 (horizontalTravel > 0.12 && horizontalTravel > verticalTravel * 1.5);

      // Entering camera: started near edge and moved quickly into frame
      const isFromEdge = oldest.x < 0.12 || oldest.x > 0.88 || oldest.y > 0.88 || oldest.y < 0.12;
      isEntering = isFromEdge && pathLen > 0.12 && instantSpeed > 0.035;
    }

    const scores = {
      HOME: 0,
      WORK: 0,
      GO: 0,
      COME: 0,
      PLEASE: 0
    };

    const matchedRules = {
      HOME: null,
      WORK: null,
      GO: null,
      COME: null,
      PLEASE: null
    };

    // =========================================================================
    // 1. HOME: Two hands meeting at apex (/ \) like a roof
    // Minimum required features:
    // - EXACTLY 2 hands
    // - Index & middle fingertips touching/near apex (tipDistIndex < 0.16, tipDistMiddle < 0.18)
    // - Wrists spread wider than tips (wristDist > 0.20 && wristDist > max(tipDist)*1.35)
    // - Wrists below fingertips
    // - Fingers extended
    // - Calm hold in chest area, no waving or entering
    // =========================================================================
    if (hands.length >= 2) {
      const h1 = hands[0];
      const h2 = hands[1];

      const tipDistIndex = dist2D(h1.indexTip, h2.indexTip);
      const tipDistMiddle = dist2D(h1.middleTip, h2.middleTip);
      const wristDist = dist2D(h1.wrist, h2.wrist);

      const tipsTouching = tipDistIndex < 0.16 && tipDistMiddle < 0.18;
      const wristsSpread = wristDist > 0.20 && wristDist > Math.max(tipDistIndex, tipDistMiddle) * 1.35;
      const wristsBelowTips = h1.wrist.y > h1.indexTip.y - 0.02 && h2.wrist.y > h2.indexTip.y - 0.02;
      const fingersOpen = (h1.fourFingersExt >= 2 || h1.isFlatPalm) && (h2.fourFingersExt >= 2 || h2.isFlatPalm);
      const inChestArea = h1.palmCenter.y >= 0.20 && h1.palmCenter.y <= 0.78 &&
                          h2.palmCenter.y >= 0.20 && h2.palmCenter.y <= 0.78 &&
                          Math.abs(h1.palmCenter.x - 0.5) < 0.35 &&
                          Math.abs(h2.palmCenter.x - 0.5) < 0.35;

      const isCalm = instantSpeed < 0.045 && !isWaving && !isEntering;

      if (tipsTouching && wristsSpread && wristsBelowTips && fingersOpen && inChestArea && isCalm) {
        scores.HOME = 0.98;
        matchedRules.HOME = 'HOME_TWO_HAND_ROOF_APEX';
      }
    }

    // =========================================================================
    // 2. WORK: Tapping/touching wrists or vertical rhythmic downward tapping
    // Minimum required features:
    // - Posture: Curled hands / fists / wrist-touch
    // - Temporal Movement: MANDATORY active vertical tapping motion
    //                      (verticalTravel >= 0.035, vertical dominant, no waving)
    // - Static crossed arms or stationary hands touching are REJECTED!
    // =========================================================================
    // Style A: Two-handed WORK (wrists/fists in contact with rhythmic tapping)
    if (hands.length >= 2 && scores.HOME < 0.50) {
      const h1 = hands[0];
      const h2 = hands[1];

      const wristDist = dist2D(h1.wrist, h2.wrist);
      const palmDist = dist2D(h1.palmCenter, h2.palmCenter);
      const h1WristToH2Palm = dist2D(h1.wrist, h2.palmCenter);
      const h2WristToH1Palm = dist2D(h2.wrist, h1.palmCenter);
      const minHandDist = Math.min(wristDist, palmDist, h1WristToH2Palm, h2WristToH1Palm);

      const handsInContact = minHandDist < 0.35;
      const inTorsoArea = (h1.palmCenter.y + h2.palmCenter.y) / 2 > 0.25 &&
                          (h1.palmCenter.y + h2.palmCenter.y) / 2 < 0.95;

      const bothFists = (h1.fourFingersExt <= 2 && h2.fourFingersExt <= 2);
      const wristContact = (h1WristToH2Palm < 0.28 || h2WristToH1Palm < 0.28 || wristDist < 0.30);

      const isPrayerGesture = h1.isFlatPalm && h2.isFlatPalm && palmDist < 0.18 &&
                              h1.wrist.y > h1.middleTip.y && h2.wrist.y > h2.middleTip.y;

      // CRITICAL REJECTION: Static crossed arms WITHOUT vertical tapping must be rejected!
      const isVerticalTapping = verticalTravel >= 0.035 &&
                                verticalTravel > horizontalTravel * 1.05 &&
                                !isWaving &&
                                !isEntering;

      if (handsInContact && inTorsoArea && !isPrayerGesture && (bothFists || wristContact) && isVerticalTapping) {
        scores.WORK = 0.98;
        matchedRules.WORK = 'WORK_TWO_HAND_WRIST_TAPPING';
      }
    }

    // Style B: One-handed WORK (vertical downward rhythmic tapping with curled hand/fist)
    if (scores.WORK < 0.50 && scores.HOME < 0.50) {
      hands.forEach((h) => {
        const inTorsoArea = h.palmCenter.y >= 0.28 && h.palmCenter.y <= 0.88 &&
                            h.palmCenter.x >= 0.15 && h.palmCenter.x <= 0.85;

        // Must be curled in a fist or tapping handshape (NOT open flat palm, NOT pointing index)
        const isFistOrCurled = (h.fourFingersExt <= 1 || h.isFist) &&
                               !h.isIndexPointing &&
                               !h.isTwoFingerPointing &&
                               !h.isFlatPalm;

        // CRITICAL REJECTION: A static fist is NOT WORK!
        // Must have active vertical tapping motion:
        const isVerticalTapping = verticalTravel >= 0.038 &&
                                  verticalTravel > horizontalTravel * 1.05 &&
                                  !isWaving &&
                                  !isEntering &&
                                  Math.abs(deltaOpenness) < 0.025;

        if (inTorsoArea && isFistOrCurled && isVerticalTapping) {
          scores.WORK = Math.max(scores.WORK, 0.96);
          matchedRules.WORK = 'WORK_ONE_HAND_VERTICAL_TAPPING';
        }
      });
    }

    // =========================================================================
    // 3. PLEASE: Decisive index finger pointing OR two hands in Prayer / Namaste
    // Minimum required features:
    // - Style A: 2 hands, flat palms together in front of chest pointing UP, calm hold
    // - Style B: 1 hand, index extended, ring & pinky curled, tip extended > 0.09 from palm
    //   REJECTIONS: Peace / V sign is rejected, OK sign is rejected, flat palm is rejected
    // =========================================================================
    // Style A: Two-hand ISL Prayer / Namaste in front of chest
    if (hands.length >= 2 && scores.HOME < 0.50 && scores.WORK < 0.50) {
      const h1 = hands[0];
      const h2 = hands[1];

      const palmDist = dist2D(h1.palmCenter, h2.palmCenter);
      const wristDist = dist2D(h1.wrist, h2.wrist);
      const bothFlat = (h1.fourFingersExt >= 2 || h1.isFlatPalm) && (h2.fourFingersExt >= 2 || h2.isFlatPalm);
      const fingersPointingUp = h1.wrist.y > h1.middleTip.y && h2.wrist.y > h2.middleTip.y;
      const palmsTogether = palmDist < 0.20 && wristDist < 0.24;
      const atChestLevel = h1.palmCenter.y >= 0.25 && h1.palmCenter.y <= 0.80;
      const isCalm = instantSpeed < 0.045 && !isWaving && !isEntering;

      if (bothFlat && fingersPointingUp && palmsTogether && atChestLevel && isCalm) {
        scores.PLEASE = 0.98;
        matchedRules.PLEASE = 'PLEASE_TWO_HAND_PRAYER_NAMASTE';
      }
    }

    // Style B: Decisive index finger pointing
    hands.forEach((h) => {
      // Must NOT be Peace / V sign and must NOT be OK sign
      const isPointingShape = (h.isIndexPointing || (h.isTwoFingerPointing && !h.isVOrPeaceSign)) && !h.isOkSign;

      if (isPointingShape) {
        const isNotFlatPalm = !h.isFlatPalm && h.fourFingersExt <= 2;
        const tipDist = dist2D(h.indexTip, h.palmCenter);
        const isDecisivePointing = tipDist > 0.09;
        const inSigningArea = h.palmCenter.y >= 0.28 && h.palmCenter.y <= 0.82 &&
                              h.palmCenter.x >= 0.18 && h.palmCenter.x <= 0.82;
        const isCalm = !isWaving && !isEntering && instantSpeed < 0.050;

        if (isNotFlatPalm && isDecisivePointing && inSigningArea && isCalm) {
          scores.PLEASE = Math.max(scores.PLEASE, 0.97);
          matchedRules.PLEASE = 'PLEASE_ONE_HAND_INDEX_POINTING';
        }
      }
    });

    // =========================================================================
    // 4. GO: Open flat palm held or pushed forward in chest area
    // Minimum required features:
    // - Open flat palm: at least 3 extended fingers (index, middle, ring all extended)
    // - Wrist below middle tip (fingers pointing upward/forward)
    // - Chest area
    // - REJECTIONS:
    //   * OK sign is rejected (!h.isOkSign)
    //   * Peace / V sign is rejected (!h.isVOrPeaceSign)
    //   * Single index pointing is rejected (!h.isIndexPointing)
    //   * Side-to-side waving is rejected (!isWaving)
    //   * Rapid flailing or camera entering is rejected
    //   * Up/down bouncing is rejected
    //   * Beckoning inward (curling/pulling) is rejected
    // =========================================================================
    if (scores.PLEASE < 0.50) {
      hands.forEach((h) => {
        const inChestArea = h.palmCenter.y >= 0.26 && h.palmCenter.y <= 0.78 &&
                            h.palmCenter.x >= 0.22 && h.palmCenter.x <= 0.78;

        const hasFlatPalm = (h.fourFingersExt >= 3 || h.isFlatPalm) &&
                            h.indexExt && h.middleExt && h.ringExt &&
                            !h.isOkSign && !h.isVOrPeaceSign;

        const notPointing = !h.isIndexPointing && !h.isTwoFingerPointing;
        const fingersUpward = h.wrist.y > h.middleTip.y - 0.03;

        const isNotWaving = !isWaving;
        const isNotEntering = !isEntering;
        const isNotFlailing = instantSpeed < 0.045;
        const isNotBouncingUpDown = yReversals < 2 || verticalTravel < 0.10;
        const isNotBeckoningIn = deltaOpenness >= -0.010 && deltaZ >= -0.008;
        const handsCoordinated = hands.length === 1 || dist2D(hands[0].palmCenter, hands[1].palmCenter) < 0.38;

        if (hasFlatPalm && inChestArea && notPointing && fingersUpward &&
            scores.WORK < 0.50 && isNotWaving && isNotEntering && isNotFlailing &&
            isNotBouncingUpDown && isNotBeckoningIn && handsCoordinated) {
          scores.GO = Math.max(scores.GO, 0.97);
          matchedRules.GO = 'GO_FORWARD_OPEN_PALM';
        }
      });
    }

    // =========================================================================
    // 5. COME: Inward beckoning stroke towards chest
    // Minimum required features:
    // - Hand in front of chest/signing space
    // - MANDATORY TEMPORAL MOVEMENT: Active inward curling (deltaOpenness < -0.015)
    //   OR inward pull stroke towards signer in Z (deltaZ < -0.010 && pathLen > 0.04)
    // - REJECTIONS:
    //   * Moving away (deltaZ > 0.015) is rejected
    //   * Pointing out is rejected
    //   * Flat open palm is rejected
    //   * Vertical rhythmic tapping is rejected (that is WORK)
    //   * Side-to-side waving is rejected
    // =========================================================================
    if (scores.WORK < 0.50 && scores.HOME < 0.50 && scores.PLEASE < 0.50) {
      hands.forEach((h) => {
        const inSigningArea = h.palmCenter.y >= 0.25 && h.palmCenter.y <= 0.85 &&
                              h.palmCenter.x >= 0.16 && h.palmCenter.x <= 0.84;

        // Beckoning: fingers actively curling inward toward palm
        const isCurlingIn = deltaOpenness < -0.015 && inSigningArea;
        // Inward pull stroke towards the signer (closer in Z)
        const isPullingTowardsSelf = deltaZ < -0.010 && pathLen > 0.04 && inSigningArea;
        // Beckoning hold phase: fingers curled after beckoning motion
        const isBeckonHold = h.fourFingersExt <= 2 && (deltaOpenness < -0.005 || deltaZ < -0.005) && inSigningArea;

        const notMovingAway = deltaZ <= 0.015 && deltaOpenness <= 0.015;
        const notPointingOut = !h.isIndexPointing && !h.isTwoFingerPointing;
        const notWaving = !isWaving && !isEntering;
        const notVerticalTapping = !(verticalTravel >= 0.035 && verticalTravel > horizontalTravel * 1.05);

        // Hand is either actively curling inward, or holding curled state after beckon (reject static flat palm)
        const isNotStaticFlatPalm = deltaOpenness < -0.012 || deltaZ < -0.008 || !h.isFlatPalm;
        const notWrongSign = !h.isOkSign && !h.isVOrPeaceSign;

        if ((isCurlingIn || isPullingTowardsSelf || isBeckonHold) &&
            notMovingAway && notPointingOut && isNotStaticFlatPalm && notWrongSign && notWaving && notVerticalTapping) {
          scores.GO = 0;
          scores.COME = Math.max(scores.COME, 0.96);
          matchedRules.COME = 'COME_INWARD_BECKON';
        }
      });
    }

    // =========================================================================
    // Strict Mutual Disambiguation
    // =========================================================================
    if (scores.HOME > 0.70) {
      scores.WORK = 0;
      scores.GO = 0;
      scores.PLEASE = 0;
      scores.COME = 0;
    } else if (scores.WORK > 0.70) {
      scores.COME = 0;
      scores.GO = 0;
      scores.PLEASE = 0;
    } else if (scores.GO > 0.70) {
      scores.PLEASE = 0;
      scores.COME = 0;
    } else if (scores.PLEASE > 0.70) {
      scores.GO = 0;
      scores.COME = 0;
    }

    // Evaluate candidates against SIGN-SPECIFIC thresholds
    let bestWord = null;
    let highestScore = 0;
    let winningRule = 'NONE';

    for (const [word, score] of Object.entries(scores)) {
      const config = SIGN_CONFIGS[word];
      const threshold = config ? config.minScore : 0.85;
      if (score > highestScore && score >= threshold) {
        highestScore = score;
        bestWord = word;
        winningRule = matchedRules[word] || 'UNKNOWN_RULE';
      }
    }

    // IF NO WORD PASSED REJECTION CRITERIA:
    if (!bestWord) {
      this.candidateFrames = Math.max(0, this.candidateFrames - 2);
      if (this.candidateFrames === 0) {
        this.candidateWord = null;
        this.candidateRule = null;
      }
      return {
        word: 'NO_SIGN',
        confidence: 0,
        rule: 'NONE',
        progress: 0,
        isTriggerable: false,
        isCharging: false
      };
    }

    // Sustained confirmation filter: require sign-specific consecutive matching frames
    if (bestWord === this.candidateWord) {
      this.candidateFrames++;
    } else {
      this.candidateWord = bestWord;
      this.candidateRule = winningRule;
      this.candidateFrames = 1;
    }

    const signConfig = SIGN_CONFIGS[this.candidateWord] || { requiredFrames: 8 };
    const requiredFrames = signConfig.requiredFrames;

    // ONLY trigger when the full sign-specific requiredFrames have completed!
    if (this.candidateFrames >= requiredFrames) {
      const now = performance.now();
      const isCooldownOver =
        this.candidateWord !== this.lastTriggeredWord ||
        now - this.lastTriggerTime > this.debounceMs;

      const result = {
        word: this.candidateWord,
        confidence: Math.round(highestScore * 100),
        rule: this.candidateRule || winningRule,
        progress: 100,
        isTriggerable: isCooldownOver,
        isCharging: false,
        stableCount: this.candidateFrames
      };

      if (this.debugMode) {
        console.log(`[ISL Debug] TRIGGERED: ${result.word} | Score: ${result.confidence}% | Rule: ${result.rule} | Frames: ${this.candidateFrames}`);
      }

      if (isCooldownOver) {
        this.lastTriggeredWord = this.candidateWord;
        this.lastTriggerTime = now;
      }

      return result;
    }

    // Charging before threshold: do NOT output any word before confirmed. Return NO_SIGN.
    const progress = Math.min(100, Math.round((this.candidateFrames / requiredFrames) * 100));
    return {
      word: 'NO_SIGN',
      candidateWord: this.candidateWord,
      confidence: Math.round(highestScore * 100),
      rule: this.candidateRule || winningRule,
      progress,
      isTriggerable: false,
      isCharging: this.candidateFrames >= 4
    };
  }
}

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
    this.rejectionThreshold = options.rejectionThreshold || modelBundle.rejectionThreshold || 0.70;
    this.windowSize = 22;
    this.minWindowFrames = 10;
    this.debounceMs = 800;

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
    // Decisive matches (>= 90%) trigger with 1 confirmed frame.
    // Moderate matches (70%-90%) require 2 consecutive frames.
    const requiredFrames = topProb >= 0.90 ? 1 : 2;

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
    this.mode = options.mode || 'ml'; // 'ml' by default, or 'heuristic'
    this.mlRecognizer = new MlSignRecognizer(options);
    this.heuristicRecognizer = new HeuristicIslSignRecognizer();
  }

  setEngine(mode) {
    if (mode === 'ml' || mode === 'heuristic') {
      this.mode = mode;
      this.reset();
    }
  }

  getEngine() {
    return this.mode;
  }

  setDebugMode(enabled) {
    this.mlRecognizer.setDebugMode(enabled);
    this.heuristicRecognizer.setDebugMode(enabled);
  }

  reset() {
    this.mlRecognizer.reset();
    this.heuristicRecognizer.reset();
  }

  classifyFrame(multiHandLandmarks) {
    if (this.mode === 'heuristic') {
      return this.heuristicRecognizer.classifyFrame(multiHandLandmarks);
    }
    return this.mlRecognizer.classifyFrame(multiHandLandmarks);
  }
}


