import { getAllPersonalizedSigns } from './personalizeStorage';

/**
 * Compute Euclidean distance between two feature vectors of the same length.
 */
function euclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Standard Dynamic Time Warping (DTW) distance.
 * @param {Array<Float32Array>} seq1 Sequence of feature vectors
 * @param {Array<Float32Array>} seq2 Sequence of feature vectors
 * @returns {number} The DTW distance
 */
export function computeDTW(seq1, seq2) {
  const n = seq1.length;
  const m = seq2.length;
  
  const dtw = Array.from({ length: n + 1 }, () => new Float32Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = euclideanDistance(seq1[i - 1], seq2[j - 1]);
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],    // insertion
        dtw[i][j - 1],    // deletion
        dtw[i - 1][j - 1] // match
      );
    }
  }

  // Normalize by length of the warping path (approximation: n + m)
  return dtw[n][m] / (n + m);
}

/**
 * Class to hold user templates and perform classification.
 */
export class DtwRecognizer {
  constructor() {
    this.templates = {}; // { 'COME': [seq1, seq2, ...], 'HOME': [...] }
    this.isLoaded = false;
  }

  async loadProfile() {
    const data = await getAllPersonalizedSigns();
    this.templates = {};
    for (const item of data) {
      if (item.templates && item.templates.length > 0) {
        this.templates[item.signId] = item.templates;
      }
    }
    this.isLoaded = true;
    console.log('[DTW] Loaded personal profile. Signs with templates:', Object.keys(this.templates));
  }

  hasProfile() {
    return Object.keys(this.templates).length > 0;
  }

  /**
   * Classify a new sequence against all loaded templates.
   * @param {Array<Float32Array>} inputSeq Standardized 20x151 feature sequence
   * @param {number} threshold Optional threshold to reject if distance is too high
   * @returns {Object} Best match { word, confidence, distance, rule }
   */
  classify(inputSeq, threshold = 6.0) {
    if (!this.hasProfile()) {
      return { word: 'NO_SIGN', confidence: 0, distance: Infinity };
    }

    let bestWord = 'NO_SIGN';
    let bestDist = Infinity;

    // For each sign, compare with all examples and take the minimum distance
    for (const [signId, examples] of Object.entries(this.templates)) {
      for (const templateSeq of examples) {
        const dist = computeDTW(inputSeq, templateSeq);
        if (dist < bestDist) {
          bestDist = dist;
          bestWord = signId;
        }
      }
    }

    if (bestDist > threshold) {
      return {
        word: 'NO_SIGN',
        candidateWord: bestWord,
        distance: bestDist,
        confidence: 0,
        rule: 'DTW_REJECTED'
      };
    }

    // Convert distance to a pseudo-confidence (0 to 100)
    // threshold maps to ~50%, 0 maps to 100%
    const conf = Math.max(0, Math.min(100, Math.round((1 - (bestDist / threshold)) * 50 + 50)));

    return {
      word: bestWord,
      confidence: conf,
      distance: bestDist,
      rule: 'PERSONALIZED_DTW'
    };
  }
}
