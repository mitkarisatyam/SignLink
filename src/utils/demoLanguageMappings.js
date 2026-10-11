export const DEMO_VOCABULARY = {
  COME: {
    id: 'COME',
    en: 'Come',
    hi: 'आओ',
    hiPhonetic: 'Aao',
    enVariants: ['come here', 'come', 'coming', 'came', 'approach'],
    hiVariants: ['आ जाइए', 'आ जाओ', 'आइये', 'आइए', 'आओ', 'आना', 'aao', 'aaiye', 'aana', 'come here', 'come']
  },
  HOME: {
    id: 'HOME',
    en: 'Home',
    hi: 'घर',
    hiPhonetic: 'Ghar',
    enVariants: ['home', 'house', 'household'],
    hiVariants: ['अपना घर', 'घर', 'मकान', 'गृह', 'ghar', 'makan', 'makaan', 'home', 'house']
  },
  PLEASE: {
    id: 'PLEASE',
    en: 'Please',
    hi: 'कृपया',
    hiPhonetic: 'Kripya',
    enVariants: ['please', 'kindly', 'plz', 'pls'],
    hiVariants: ['कृपया', 'कृप्या', 'प्लीज़', 'प्लीज', 'kripya', 'kripaya', 'please', 'plz', 'pls']
  },
  WORK: {
    id: 'WORK',
    en: 'Work',
    hi: 'काम',
    hiPhonetic: 'Kaam',
    enVariants: ['work', 'job', 'task', 'working'],
    hiVariants: ['काम', 'कार्य', 'नौकरी', 'kaam', 'karya', 'work', 'job']
  },
  GO: {
    id: 'GO',
    en: 'Go',
    hi: 'जाओ',
    hiPhonetic: 'Jaao',
    enVariants: ['go away', 'go', 'going', 'gone', 'leave'],
    hiVariants: ['जाओ', 'जाइये', 'जाएं', 'जा', 'जाना', 'jaao', 'jao', 'jaaiye', 'jaana', 'go away', 'go']
  },
  WHERE: {
    id: 'WHERE',
    en: 'Where',
    hi: 'कहाँ',
    hiPhonetic: 'Kahaan',
    enVariants: ['where is it', 'where are you', 'which place', 'where'],
    hiVariants: ['किस जगह', 'कहाँ', 'कहा', 'किधर', 'kahan', 'kaha', 'kidhar', 'where']
  },
  DEAF: {
    id: 'DEAF',
    en: 'Deaf',
    hi: 'बधिर',
    hiPhonetic: 'Badhir',
    enVariants: ['hard of hearing', 'hearing impaired', 'deaf'],
    hiVariants: ['सुनने में असमर्थ', 'बधिर', 'बहरा', 'बहरे', 'badhir', 'behra', 'deaf']
  },
  LIKE: {
    id: 'LIKE',
    en: 'Like',
    hi: 'पसंद',
    hiPhonetic: 'Pasand',
    enVariants: ['like', 'love', 'likes', 'liking'],
    hiVariants: ['पसंद करना', 'अच्छा लगना', 'पसंद है', 'पसंद', 'pasand', 'pasand hai', 'like', 'love']
  },
  NEVER: {
    id: 'NEVER',
    en: 'Never',
    hi: 'कभी नहीं',
    hiPhonetic: 'Kabhi nahi',
    enVariants: ['not ever', 'not at all', 'never'],
    hiVariants: ['कभी नहीं', 'कभी नही', 'कदापि नहीं', 'kabhi nahi', 'kabhi nhi', 'never']
  },
  PERFECT: {
    id: 'PERFECT',
    en: 'Perfect',
    hi: 'बिल्कुल सही',
    hiPhonetic: 'Bilkul sahi',
    enVariants: ['perfect', 'exactly', 'excellent', 'awesome', 'great'],
    hiVariants: ['बिल्कुल सही', 'एकदम सही', 'परफेक्ट', 'शानदार', 'बढ़िया', 'shandaar', 'badhiya', 'perfect']
  },
  HE: {
    id: 'HE',
    en: 'He',
    hi: 'वह',
    hiPhonetic: 'Vah',
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

export function getPhoneticForConcept(conceptId) {
  const concept = DEMO_VOCABULARY[conceptId];
  if (!concept) return conceptId;
  return concept.hiPhonetic || concept.hi || concept.en;
}

export function findBestTtsVoice(voices, isHindi) {
  if (!voices || voices.length === 0) return null;

  if (isHindi) {
    // 1. Genuine Hindi voice (hi-IN, Google हिन्दी, Microsoft Hemant, Microsoft Kalpana)
    const hiVoice = voices.find(v => 
      (v.lang && (v.lang.toLowerCase().startsWith('hi') || v.lang.toLowerCase().replace('_', '-').includes('hi-in'))) ||
      (v.name && (v.name.toLowerCase().includes('hindi') || v.name.includes('हिन्दी') || v.name.toLowerCase().includes('kalpana') || v.name.toLowerCase().includes('hemant')))
    );
    if (hiVoice) return { voice: hiVoice, isNativeHindi: true };

    // 2. Indian English voice (which pronounces phonetic Hindi words like Kaam, Ghar naturally)
    const inVoice = voices.find(v => 
      (v.lang && v.lang.toLowerCase().includes('en-in')) ||
      (v.name && (v.name.toLowerCase().includes('india') || v.name.toLowerCase().includes('heera') || v.name.toLowerCase().includes('neerja')))
    );
    if (inVoice) return { voice: inVoice, isNativeHindi: false };

    // 3. Fallback to any natural English/system voice
    const engVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Online'))) ||
                     voices.find(v => v.lang.startsWith('en')) ||
                     voices[0];
    return { voice: engVoice, isNativeHindi: false };
  } else {
    // English
    const engVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('US'))) ||
                     voices.find(v => v.lang.startsWith('en')) ||
                     voices[0];
    return { voice: engVoice, isNativeHindi: false };
  }
}

export function getConceptIdFromLabel(label) {
  if (!label) return null;
  const rawStr = label.toString().trim();
  const upper = rawStr.toUpperCase();
  if (DEMO_VOCABULARY[upper]) return upper;

  const lower = rawStr.toLowerCase();
  for (const [id, data] of Object.entries(DEMO_VOCABULARY)) {
    if (id.toLowerCase() === lower) return id;
    if (data.en && data.en.toLowerCase() === lower) return id;
    if (data.hi && data.hi.trim() === rawStr) return id;
    if (data.hiPhonetic && data.hiPhonetic.toLowerCase() === lower) return id;
    if (data.enVariants && data.enVariants.some(v => v.toLowerCase() === lower)) return id;
    if (data.hiVariants && data.hiVariants.some(v => v.toLowerCase() === lower || v.trim() === rawStr)) return id;
  }
  return null;
}

const COMMON_DEVANAGARI_FALLBACKS = {
  'काम': 'Kaam',
  'कार्य': 'Karya',
  'घर': 'Ghar',
  'मकान': 'Makaan',
  'कृपया': 'Kripya',
  'कृप्या': 'Kripya',
  'आओ': 'Aao',
  'आइए': 'Aaiye',
  'आना': 'Aana',
  'जाओ': 'Jaao',
  'जाना': 'Jaana',
  'कहाँ': 'Kahaan',
  'किधर': 'Kidhar',
  'बधिर': 'Badhir',
  'पसंद': 'Pasand',
  'कभी नहीं': 'Kabhi nahi',
  'बिल्कुल सही': 'Bilkul sahi',
  'शानदार': 'Shandaar',
  'वह': 'Vah',
  'वो': 'Voh',
  'नमस्ते': 'Namaste',
  'धन्यवाद': 'Dhanyavaad',
  'मदद': 'Madad'
};

export function devanagariToPhonetic(text) {
  if (!text) return '';
  const trimmed = text.toString().trim();
  if (COMMON_DEVANAGARI_FALLBACKS[trimmed]) return COMMON_DEVANAGARI_FALLBACKS[trimmed];

  // If text contains Devanagari characters (U+0900 to U+097F)
  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  if (!hasDevanagari) return trimmed;

  // Check word-by-word in fallback dictionary
  const words = trimmed.split(/\s+/);
  const converted = words.map(w => COMMON_DEVANAGARI_FALLBACKS[w] || w);
  return converted.join(' ');
}

export function speakConceptText(conceptIdOrText, isHindi, options = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Cancel any prior utterance & unpause stuck Chrome audio
  try {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (e) {}

  const voices = window.speechSynthesis.getVoices();
  const voiceMatch = findBestTtsVoice(voices, isHindi);
  const voice = voiceMatch?.voice || null;
  const isNativeHindi = Boolean(voiceMatch?.isNativeHindi);

  let textToSpeak = '';
  // Try resolving concept from ID, label, or Hindi text
  const conceptId = getConceptIdFromLabel(conceptIdOrText) || 
                    (typeof conceptIdOrText === 'string' && DEMO_VOCABULARY[conceptIdOrText.toUpperCase()] ? conceptIdOrText.toUpperCase() : null);
  const concept = conceptId ? DEMO_VOCABULARY[conceptId] : null;

  if (concept) {
    if (isHindi) {
      // If native Hindi voice is present, speak Devanagari (e.g. 'काम')
      // If NO native Hindi voice is present (typical on Windows/Chrome), speak the clear phonetic Romanized transcription ('Kaam', 'Ghar', 'Aao') so speech is NEVER silent!
      textToSpeak = isNativeHindi ? concept.hi : (concept.hiPhonetic || concept.en);
    } else {
      textToSpeak = concept.en;
    }
  } else {
    // If arbitrary string passed:
    if (isHindi && !isNativeHindi) {
      textToSpeak = devanagariToPhonetic(conceptIdOrText);
    } else {
      textToSpeak = conceptIdOrText;
    }
  }

  if (!textToSpeak) return;

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  
  if (isNativeHindi) {
    utterance.lang = 'hi-IN';
    utterance.rate = 0.95;
  } else if (isHindi) {
    // Speaking phonetic Hindi via Indian English / system fallback voice
    utterance.lang = voice?.lang || 'en-IN';
    utterance.rate = 0.88; // Slightly measured rate for clear phonetic delivery
  } else {
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
  }

  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  if (voice) {
    utterance.voice = voice;
  }

  // Chrome watchdog to prevent audio engine freezing mid-speech
  const resumeWatchdog = setInterval(() => {
    if (!window.speechSynthesis.speaking) {
      clearInterval(resumeWatchdog);
    } else {
      window.speechSynthesis.resume();
    }
  }, 1000);

  utterance.onend = () => {
    clearInterval(resumeWatchdog);
    if (options.onEnd) options.onEnd();
  };
  utterance.onerror = (err) => {
    clearInterval(resumeWatchdog);
    console.warn('[TTS] Synthesis error:', err);
    if (options.onError) options.onError(err);
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('[TTS] speak failed:', err);
  }
}

