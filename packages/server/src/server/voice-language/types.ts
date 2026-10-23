// Hizuri: one spoken language's words. The voice code holds no words of any language; it reads
// them here. Words it listens for (stop words, its name, noise phrases) are matched in every
// language at once, so a stop word works whatever the user speaks. Lines it says aloud come from
// the language the session hears (detect.ts). Regex fragments are joined into one pattern with
// `|`, so each must stand on its own.

/** Reads numbers spelled out in words (session/voice/number-words.ts). */
export interface NumberWords {
  /** 0-9, cardinals and ordinals. */
  units: readonly (readonly [RegExp, number])[];
  /** 10-19. */
  teens: readonly (readonly [RegExp, number])[];
  /** 20, 30 … 90. */
  tens: readonly (readonly [RegExp, number])[];
  /** Whole hundreds said as one word (100 … 900). */
  hundreds: readonly (readonly [RegExp, number])[];
  /** A word that turns the units before it into hundreds (“two hundred”). */
  hundredWord?: RegExp;
  /** Thousand, million, billion. */
  multipliers: readonly (readonly [RegExp, number])[];
  /** One word for 1.5. */
  oneAndHalf?: RegExp;
  /** Joins a unit and a digit into a decimal: “two point five”. */
  decimalJoin?: RegExp;
  /** Comes after a whole number and before `half`: “two and a half”. */
  halfJoin?: RegExp;
  /** Allowed between `halfJoin` and `half`. */
  halfFiller?: RegExp;
  half?: RegExp;
}

/** A recogniser of this language writes Latin names in its own letters (“Show” → its spelling). */
export interface LatinSpelling {
  /** Two Latin letters that make one native letter (sh, ch…), applied first. */
  pairs: readonly (readonly [RegExp, string])[];
  letters: Readonly<Record<string, string>>;
  /** Native consonants by sound class (p t k f s x l r m n h); voiced and voiceless merged. */
  consonants: Readonly<Record<string, string>>;
}

export interface VoiceLanguage {
  /** ISO 639-1. */
  code: string;
  /** The Unicode script of its letters, for \p{Script=…}. */
  script: string;
  /**
   * The local speech models' folder of a small streaming recogniser for this language's stop words
   * (stop-spotter.ts): a sherpa-onnx streaming transducer. A language without one uses English's.
   */
  stopSpotterModel?: string;
  /** Letters its recogniser writes either way; the first is folded into the second. */
  letterFolds: readonly (readonly [string, string])[];

  // --- Heard: matched in every language at once -----------------------------------------------

  /** The default assistant name as this language writes it (assistant-name.ts). */
  defaultName: string;
  /** The default name in every form the recogniser writes; PASEO_ASSISTANT_NAME_FORMS replaces it. */
  nameForms: readonly string[];
  /** A pause request opens with one of these (prefixes). */
  pauseStarts: readonly string[];
  /** Whole stop words, anywhere in the phrase. */
  stopWords: readonly string[];
  /** After a pause: go on (prefixes, anywhere). */
  continueWords: readonly string[];
  /**
   * The user asks the assistant to let them finish (fragments, anywhere): a hold on its replies
   * (floor-manager.ts).
   */
  holdPhrases: readonly string[];
  /** The user is done: the hold ends when a phrase ends on one of these (fragments). */
  holdEnds: readonly string[];
  /** An order to the assistant near the start of a phrase (“tell me”): the hold ends. */
  orderWords: readonly string[];
  /** Whole words that may fill a pure pause request (“wait, someone's calling me”); the name forms are added. */
  pauseFillers: readonly string[];
  /** Abandon the reply for good. */
  dropWords: readonly string[];
  /** A phrase opening with one of these interrupts a busy agent instead of steering it. */
  wakeWords: readonly string[];
  /** During a paced reply, a phrase opening with one of these cuts it (PASEO_BARGE_STOP_RE). */
  bargeStopWords: readonly string[];
  /** Words the English pass must never rewrite (its own recogniser's control words); the name forms are added. */
  controlWords: readonly string[];
  /** The user's short answer at the end of the assistant's echo. */
  answerWords: readonly string[];
  /** Phrases a recogniser invents from noise. */
  junkPhrases: readonly string[];
  /** One- and two-letter words that are a whole answer on their own. */
  shortWords: readonly string[];
  /** A thought cannot end on these. */
  openEndWords: readonly string[];
  /**
   * The user only signals they listen (“uh-huh”): such a phrase neither cuts the assistant nor
   * holds its reply.
   */
  backchannelWords: readonly string[];

  // --- The fast front's line check ------------------------------------------------------------

  /** Words that name the speaker instead of speaking: narration (the name forms are added). */
  stageWords: readonly string[];
  /** “Answer:” style labels before a line. */
  lineLabels: readonly string[];
  /** Claims of work done. */
  doneWords: readonly string[];
  /** “Done” words a line may use when it names an item the assistant's page shows as done. */
  boardDoneWords: readonly string[];
  /** Times and a bare “no”: facts only the slower agent knows. */
  timeClaims: readonly string[];
  /** A line opening with this answers no. */
  noWord: string;
  /** Stems (first five letters) every board line shares. */
  genericStems: readonly string[];
  /** “<count> agents”: group 1 is the count. */
  agentCount: RegExp;
  /** The count says none. */
  noneCount: RegExp;
  countWords: Readonly<Record<string, number>>;

  // --- The fast reply (fast-reply.ts) ---------------------------------------------------------

  /** Labelling examples; `other` is a name of someone near the user, `name` the assistant's. */
  fastReplyExamples: (
    other: string | undefined,
    name: string,
  ) => readonly (readonly [string, string])[];
  fastReplyAcks: readonly string[];
  fastReplyTails: readonly string[];
  fastReplyHere: string;
  fastReplyRepeat: string;
  /** “about …” before a topic label. */
  topicPrefix: RegExp;
  /** First-person pronouns: a label holding one is a sentence, not a topic. */
  firstPerson: readonly string[];

  // --- The secretary (secretary.ts) -----------------------------------------------------------

  /** “Call the main one”: the verb part; the handoff words follow it. */
  handoffCall: string;
  /** Besides the assistant's name forms, which are always added. */
  handoffWords: readonly string[];
  /** `{name}` is the assistant's name (assistant-name.ts). */
  secretaryLines: Readonly<Record<string, string>>;

  // --- Lines said aloud -----------------------------------------------------------------------

  emptyPhrase: string;
  compactHoldFirst: string;
  compactHoldNext: string;

  numbers: NumberWords;
  /** Set when its recogniser spells Latin words in its own letters. */
  latinSpelling?: LatinSpelling;
}
