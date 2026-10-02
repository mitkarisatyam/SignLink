// Upcoming Roadmap Signs for user to explore/test (next phase)
export const UPCOMING_ROADMAP_SIGNS = [
  { id: 'FRIEND', label: 'FRIEND', desc: 'Interlocking index finger hooks back and forth', category: 'Social' },
  { id: 'SCHOOL', label: 'SCHOOL', desc: 'Double rhythmic horizontal clapping motion of open palms', category: 'Education' },
  { id: 'FAMILY', label: 'FAMILY', desc: 'Two F-hands circling outward to meet at little fingers', category: 'Relationship' },
  { id: 'DOCTOR', label: 'DOCTOR', desc: 'Right fingertips tapping inside of left wrist pulse point', category: 'Healthcare' },
  { id: 'TIME', label: 'TIME', desc: 'Index finger tapping the back of the opposite wrist', category: 'Temporal' }
];

// Rich Phonetic & Variant Dictionary for all 5 Supported Signs
// Ensures 1-attempt instant recognition regardless of accents, plurals, or speech-to-text quirks
export const SIGN_DICTIONARY = {
  HOME: {
    id: 'HOME',
    label: 'HOME',
    keywords: [
      'home', 'homes', 'hom', 'house', 'household', 'housing',
      'whom', 'hum', 'hoam', 'houm', 'hone', 'holme', 'apna ghar', 'ghar'
    ]
  },
  COME: {
    id: 'COME',
    label: 'COME',
    keywords: [
      'come', 'coming', 'came', 'comes', 'come here', 'kam', 'kum', 'calm',
      'approach', 'aao', 'aana'
    ]
  },
  PLEASE: {
    id: 'PLEASE',
    label: 'PLEASE',
    keywords: [
      'please', 'plz', 'pleas', 'pleased', 'pleasing', 'kindly', 'request',
      'kripya', 'pls'
    ]
  },
  WORK: {
    id: 'WORK',
    label: 'WORK',
    keywords: [
      'work', 'working', 'works', 'worked', 'job', 'task', 'office', 'kaam',
      'wark', 'wurk'
    ]
  },
  GO: {
    id: 'GO',
    label: 'GO',
    keywords: [
      'go', 'going', 'goes', 'gone', 'went', 'leave', 'move', 'jaana', 'jaao',
      'goh', 'gou'
    ]
  },
  WHERE: {
    id: 'WHERE',
    label: 'WHERE',
    keywords: [
      'where', 'kahan', 'kidhar', 'kaha', 'location', 'where are you', 'which place'
    ]
  },
  DEAF: {
    id: 'DEAF',
    label: 'DEAF',
    keywords: [
      'deaf', 'deafness', 'hard of hearing', 'hearing impaired', 'behray', 'sunai nahi deta', 'def', 'death', 'deff'
    ]
  },
  LIKE: {
    id: 'LIKE',
    label: 'LIKE',
    keywords: [
      'like', 'likes', 'liked', 'liking', 'pasand', 'pasand hai', 'love'
    ]
  },
  NEVER: {
    id: 'NEVER',
    label: 'NEVER',
    keywords: [
      'never', 'kabhi nahi', 'not at all', 'no way', 'bilkul nahi'
    ]
  },
  PERFECT: {
    id: 'PERFECT',
    label: 'PERFECT',
    keywords: [
      'perfect', 'perfection', 'perfectly', 'shandaar', 'badhiya', 'sahi', 'mast', 'awesome', 'great'
    ]
  },
  HE: {
    id: 'HE',
    label: 'HE',
    keywords: [
      'he', 'him', 'his', 'person', 'woh', 'wo', 'aadmi', 'man', 'guy', 'hey', 'hee', 'he is'
    ]
  }
};

const ALL_SIGN_IDS = [
  'HOME', 'COME', 'PLEASE', 'WORK', 'GO',
  'WHERE', 'DEAF', 'LIKE', 'NEVER', 'PERFECT', 'HE'
];

/**
 * Robust matcher for spoken text -> one of the supported signs
 * Analyzes speech in 1 attempt.
 */
export function matchSignFromSpeech(rawText) {
  if (!rawText) return null;
  const clean = rawText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // 1. Direct single-word exact match (Highest Priority)
  for (const signId of ALL_SIGN_IDS) {
    const info = SIGN_DICTIONARY[signId];
    if (words.length === 1 && (words[0] === signId.toLowerCase() || words[0] === info.label.toLowerCase())) {
      return signId;
    }
  }

  // 2. Multi-word phrase matches first
  const multiWordEntries = [];
  for (const signId of ALL_SIGN_IDS) {
    for (const kw of SIGN_DICTIONARY[signId].keywords) {
      if (kw.includes(' ')) {
        multiWordEntries.push({ signId, kw });
      }
    }
  }
  multiWordEntries.sort((a, b) => b.kw.length - a.kw.length);
  for (const item of multiWordEntries) {
    const regex = new RegExp(`\\b${item.kw}\\b`, 'i');
    if (regex.test(clean)) {
      return item.signId;
    }
  }

  // 3. Single-word token inclusion match
  for (const signId of ALL_SIGN_IDS) {
    const signKeywords = SIGN_DICTIONARY[signId].keywords;
    for (const kw of signKeywords) {
      if (!kw.includes(' ') && words.includes(kw)) {
        return signId;
      }
    }
  }

  // 4. Substring match with word boundary
  for (const signId of ALL_SIGN_IDS) {
    const signKeywords = SIGN_DICTIONARY[signId].keywords;
    for (const kw of signKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(clean)) {
        return signId;
      }
    }
  }

  return null;
}

/**
 * Extracts multiple sequential signs from a single spoken sentence.
 */
export function matchAllSignsFromSpeech(rawText) {
  if (!rawText) return [];
  const clean = rawText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const matchedSigns = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let foundMatch = null;
    
    // Check phrase matches starting at this word
    for (const signId of ALL_SIGN_IDS) {
       for (const kw of SIGN_DICTIONARY[signId].keywords) {
         if (kw.includes(' ')) {
           const kwWords = kw.split(' ');
           let matchPhrase = true;
           for (let j = 0; j < kwWords.length; j++) {
             if (i + j >= words.length || words[i + j] !== kwWords[j]) {
               matchPhrase = false;
               break;
             }
           }
           if (matchPhrase) {
             foundMatch = signId;
             i += kwWords.length - 1; // skip words
             break;
           }
         }
       }
       if (foundMatch) break;
    }

    if (!foundMatch) {
      // Check single word match
      for (const signId of ALL_SIGN_IDS) {
        if (word === signId.toLowerCase() || word === SIGN_DICTIONARY[signId].label.toLowerCase()) {
          foundMatch = signId;
          break;
        }
        for (const kw of SIGN_DICTIONARY[signId].keywords) {
          if (!kw.includes(' ') && word === kw) {
            foundMatch = signId;
            break;
          }
        }
        if (foundMatch) break;
      }
    }

    if (foundMatch) {
      matchedSigns.push(foundMatch);
    }
  }

  return matchedSigns;
}
