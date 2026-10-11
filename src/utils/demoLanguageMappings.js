export const DEMO_VOCABULARY = {
  COME: {
    id: 'COME',
    en: 'Come',
    hi: 'आओ',
    enVariants: ['come here', 'come', 'coming', 'came', 'approach'],
    hiVariants: ['आ जाइए', 'आ जाओ', 'आइये', 'आइए', 'आओ', 'आना', 'aao', 'aaiye', 'aana', 'come here', 'come']
  },
  HOME: {
    id: 'HOME',
    en: 'Home',
    hi: 'घर',
    enVariants: ['home', 'house', 'household'],
    hiVariants: ['अपना घर', 'घर', 'मकान', 'गृह', 'ghar', 'makan', 'makaan', 'home', 'house']
  },
  PLEASE: {
    id: 'PLEASE',
    en: 'Please',
    hi: 'कृपया',
    enVariants: ['please', 'kindly', 'plz', 'pls'],
    hiVariants: ['कृपया', 'कृप्या', 'प्लीज़', 'प्लीज', 'kripya', 'kripaya', 'please', 'plz', 'pls']
  },
  WORK: {
    id: 'WORK',
    en: 'Work',
    hi: 'काम',
    enVariants: ['work', 'job', 'task', 'working'],
    hiVariants: ['काम', 'कार्य', 'नौकरी', 'kaam', 'karya', 'work', 'job']
  },
  GO: {
    id: 'GO',
    en: 'Go',
    hi: 'जाओ',
    enVariants: ['go away', 'go', 'going', 'gone', 'leave'],
    hiVariants: ['जाओ', 'जाइये', 'जाएं', 'जा', 'जाना', 'jaao', 'jao', 'jaaiye', 'jaana', 'go away', 'go']
  },
  WHERE: {
    id: 'WHERE',
    en: 'Where',
    hi: 'कहाँ',
    enVariants: ['where is it', 'where are you', 'which place', 'where'],
    hiVariants: ['किस जगह', 'कहाँ', 'कहा', 'किधर', 'kahan', 'kaha', 'kidhar', 'where']
  },
  DEAF: {
    id: 'DEAF',
    en: 'Deaf',
    hi: 'बधिर',
    enVariants: ['hard of hearing', 'hearing impaired', 'deaf'],
    hiVariants: ['सुनने में असमर्थ', 'बधिर', 'बहरा', 'बहरे', 'badhir', 'behra', 'deaf']
  },
  LIKE: {
    id: 'LIKE',
    en: 'Like',
    hi: 'पसंद',
    enVariants: ['like', 'love', 'likes', 'liking'],
    hiVariants: ['पसंद करना', 'अच्छा लगना', 'पसंद है', 'पसंद', 'pasand', 'pasand hai', 'like', 'love']
  },
  NEVER: {
    id: 'NEVER',
    en: 'Never',
    hi: 'कभी नहीं',
    enVariants: ['not ever', 'not at all', 'never'],
    hiVariants: ['कभी नहीं', 'कभी नही', 'कदापि नहीं', 'kabhi nahi', 'kabhi nhi', 'never']
  },
  PERFECT: {
    id: 'PERFECT',
    en: 'Perfect',
    hi: 'बिल्कुल सही',
    enVariants: ['perfect', 'exactly', 'excellent', 'awesome', 'great'],
    hiVariants: ['बिल्कुल सही', 'एकदम सही', 'परफेक्ट', 'शानदार', 'बढ़िया', 'shandaar', 'badhiya', 'perfect']
  },
  HE: {
    id: 'HE',
    en: 'He',
    hi: 'वह',
    enVariants: ['he is', 'he', 'him', 'his'],
    hiVariants: ['उसने', 'उसका', 'वह', 'वो', 'usne', 'woh', 'wo', 'he', 'him']
  }
};

/**
 * Finds all matching concepts in chronological order of appearance in the recognized speech.
 * Returns an array of unique sequential concept IDs, e.g. ['PLEASE', 'HOME', 'COME'].
 */
export function matchSpeechToConceptSequence(transcript, isHindi) {
  if (!transcript) return [];
  const cleanTranscript = transcript.trim().toLowerCase();
  if (!cleanTranscript) return [];

  const foundOccurrences = [];

  for (const [id, data] of Object.entries(DEMO_VOCABULARY)) {
    // Combine primary language variants and fallback variants
    const primaryVariants = isHindi ? data.hiVariants : data.enVariants;
    const secondaryVariants = isHindi ? data.enVariants : data.hiVariants;
    const allVariants = [...new Set([...primaryVariants, ...secondaryVariants])];

    // Check each variant in transcript
    for (const variant of allVariants) {
      const v = variant.toLowerCase().trim();
      if (!v) continue;

      let searchPos = 0;
      while (searchPos < cleanTranscript.length) {
        const idx = cleanTranscript.indexOf(v, searchPos);
        if (idx === -1) break;

        // Check boundary before
        const prevChar = idx > 0 ? cleanTranscript[idx - 1] : ' ';
        const isPrevBoundary = /[\s,.\-!?;:\n\r]/.test(prevChar) || idx === 0;

        // Check boundary after
        const nextCharIdx = idx + v.length;
        const nextChar = nextCharIdx < cleanTranscript.length ? cleanTranscript[nextCharIdx] : ' ';
        const isNextBoundary = /[\s,.\-!?;:\n\r]/.test(nextChar) || nextCharIdx === cleanTranscript.length;

        // For Devanagari or multi-byte text, token substring boundaries
        if (isPrevBoundary && isNextBoundary) {
          foundOccurrences.push({
            id,
            startIndex: idx,
            endIndex: nextCharIdx,
            length: v.length,
            variant: v
          });
          break; // move to next concept variant
        }

        searchPos = idx + 1;
      }
    }
  }

  if (foundOccurrences.length === 0) return [];

  // Sort by starting index (appearance order)
  foundOccurrences.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    return b.length - a.length; // prioritize longer match at same start
  });

  // Filter overlapping spans and eliminate immediate consecutive duplicates
  const sequence = [];
  let lastEnd = -1;

  for (const occ of foundOccurrences) {
    if (occ.startIndex >= lastEnd) {
      if (sequence.length === 0 || sequence[sequence.length - 1] !== occ.id) {
        sequence.push(occ.id);
      }
      lastEnd = occ.endIndex;
    }
  }

  return sequence;
}

/**
 * Finds the first matching concept ID from recognized speech text.
 * Returns null if not found.
 */
export function matchSpeechToConceptId(transcript, isHindi) {
  const seq = matchSpeechToConceptSequence(transcript, isHindi);
  return seq.length > 0 ? seq[0] : null;
}

export function getLabelForConcept(conceptId, isHindi) {
  const concept = DEMO_VOCABULARY[conceptId];
  if (!concept) return conceptId;
  return isHindi ? concept.hi : concept.en;
}

export function formatConceptSequence(conceptIds, isHindi, separator = ' • ') {
  if (!conceptIds || conceptIds.length === 0) return '';
  return conceptIds.map(id => getLabelForConcept(id, isHindi)).join(separator);
}

/**
 * Maps any label (Hindi, English, or variant) back to its canonical concept ID.
 */
export function getConceptIdFromLabel(label) {
  if (!label) return null;
  const clean = String(label).trim().toLowerCase();
  
  for (const [id, data] of Object.entries(DEMO_VOCABULARY)) {
    if (id.toLowerCase() === clean) return id;
    if (data.en.toLowerCase() === clean) return id;
    if (data.hi === label.trim()) return id;
    if (data.hiVariants.some(v => v.toLowerCase() === clean)) return id;
    if (data.enVariants.some(v => v.toLowerCase() === clean)) return id;
  }
  return null;
}
