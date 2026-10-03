export type LessonStatus = "locked" | "in_progress" | "mastered";

export interface MicroLessonMeta {
  id: string;
  name: string;
  index: number;
  path: string;
  hasVideo: boolean;
  hasQuiz: boolean;
  hasNarration: boolean;
  hasInteractiveModule: boolean;
  videoPath: string | null;
  quizPath: string | null;
  narrationPath: string | null;
  interactiveModulePath: string | null;
}

export type InteractiveModuleType =
  | "decision_dilemma"
  | "historical_investigator"
  | "civic_action_lab";

export type InvestigationIcon =
  | "scroll"
  | "shield"
  | "scale"
  | "landmark"
  | "feather";

export interface InvestigationCard {
  id: string;
  label: string;
  detail: string;
  icon: InvestigationIcon;
}

export interface DilemmaOption {
  id: string;
  text: string;
  historical_outcome: string;
  socratic_feedback: string;
  is_optimal: boolean;
}

export interface DilemmaChallenge {
  prompt: string;
  options: DilemmaOption[];
}

export interface InteractiveModuleData {
  module_type: InteractiveModuleType;
  scenario_title: string;
  scenario_context: string;
  role: string;
  investigation_cards: InvestigationCard[];
  dilemma_challenge: DilemmaChallenge;
}

export type LessonJourneyStep = "watch" | "immersion" | "quiz";

export interface ChapterMeta {
  id: string;
  /** Folder-derived label, e.g. "Chapter 12". */
  name: string;
  /** Official textbook title when present in chapter_catalog.json. */
  title: string | null;
  path: string;
  microLessons: MicroLessonMeta[];
}

export interface SubjectMeta {
  id: string;
  /** Folder-derived label. */
  name: string;
  /** Clean book label when present in chapter_catalog.json. */
  displayName: string | null;
  path: string;
  chapters: ChapterMeta[];
}

export interface ClassMeta {
  id: string;
  name: string;
  path: string;
  subjects: SubjectMeta[];
}

export interface CurriculumTree {
  root: string;
  classes: ClassMeta[];
}

export type QuizItemType =
  | "numeric_entry"
  | "boolean_flags"
  | "multi_step_ordering"
  | "multiple_choice"
  | "multiple_select"
  | "match_following"
  | "text_entry";

export interface OrderingItem {
  id: string;
  label: string;
}

export interface BooleanStatement {
  text: string;
  correct_flag: boolean;
}

export interface QuizItemBase {
  id: string;
  type: QuizItemType;
  question: string;
  hints?: string[];
  hint_1?: string;
  hint_2?: string;
  solution_step?: string;
  explanation?: string;
  video_remediation_timestamp_seconds?: number;
}

export interface NumericEntryItem extends QuizItemBase {
  type: "numeric_entry";
  correct_answer: number | string;
  unit?: string;
  tolerance?: number;
}

export interface BooleanFlagsItem extends QuizItemBase {
  type: "boolean_flags";
  statements: BooleanStatement[];
}

export interface MultiStepOrderingItem extends QuizItemBase {
  type: "multi_step_ordering";
  items?: OrderingItem[] | string[];
  correct_order: string[];
}

export interface MultipleChoiceItem extends QuizItemBase {
  type: "multiple_choice";
  options: string[];
  correct_answer: string;
}

export interface MultipleSelectItem extends QuizItemBase {
  type: "multiple_select";
  options: string[];
  correct_answers: string[];
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface MatchFollowingItem extends QuizItemBase {
  type: "match_following";
  pairs: MatchPair[];
}

export interface TextEntryItem extends QuizItemBase {
  type: "text_entry";
  correct_answer: string;
}

export type QuizItem =
  | NumericEntryItem
  | BooleanFlagsItem
  | MultiStepOrderingItem
  | MultipleChoiceItem
  | MultipleSelectItem
  | MatchFollowingItem
  | TextEntryItem;

export interface GatingConfig {
  questions_per_attempt?: number;
  pass_threshold?: number;
  max_attempts?: number;
}

export interface QuizPayload {
  gating_config?: GatingConfig;
  item_pool: QuizItem[];
  video_remediation_timestamp_seconds?: number;
}

export interface LessonProgress {
  status: LessonStatus;
  attempts: number;
  seenItemIds: string[];
  lastScore: number | null;
  masteredAt: string | null;
}

export type AppMode = "learn" | "exam_prep";

export interface ConceptBookmark {
  timestamp: number;
  endTime?: number;
  title: string;
  type?: string;
  artifactId?: string;
  artifactImageUrl?: string;
}

export interface LessonDetailsPayload {
  lesson_title?: string;
  student_name?: string;
  duration?: number;
  bookmarks: ConceptBookmark[];
}

export interface MistakeRecord {
  id: string;
  lessonPath: string;
  lessonName?: string;
  question: string;
  item: QuizItem;
  failedAt: string;
  attemptCount: number;
}

export type PracticeMode = "workout" | "mock" | "all";

export type ChapterPracticeItem = QuizItem & {
  lessonPath: string;
  lessonName: string;
  lessonIndex: number;
};

export interface ChapterPracticeResponse {
  chapterPath: string;
  chapterName: string;
  totalAvailable: number;
  mode: PracticeMode;
  questions: ChapterPracticeItem[];
}

export type SubjectiveArchetype =
  | "define"
  | "differentiate"
  | "give_reasons"
  | "describe_instrument"
  | "points";

export interface RubricStep {
  step: string;
  marks_allocated: number;
  criterion: string;
}

export interface SubjectiveQuestion {
  id: string;
  archetype: SubjectiveArchetype;
  marks: 1 | 2 | 3 | 5;
  question: string;
  mandatory_keywords: string[];
  structural_template?: {
    format: "points" | "two_column_table" | "diagram_and_working";
    columns?: [string, string]; // e.g. ["Weather", "Climate"]
    rows?: string[];
    prompts?: string[];
    expected_points_count: number;
  };
  marking_rubric: RubricStep[];
  exemplar_answer: string;
  examiner_tips: string;
  artifact_ref?: string;
  lessonPath?: string;
  lessonName?: string;
}

export interface WrittenGradingResult {
  score: number;
  max_marks: number;
  percentage: number;
  keyword_analysis: {
    matched: string[];
    missing: string[];
    coverage_pct: number;
  };
  rubric_breakdown: {
    step: string;
    marks_awarded: number;
    max_marks: number;
    criterion: string;
    feedback: string;
  }[];
  examiner_comment: string;
  cbse_band: string;
}

export interface WrittenSubmissionRecord {
  id: string;
  questionId: string;
  chapterPath: string;
  score: number;
  max_marks: number;
  percentage: number;
  submittedAt: string;
  userAnswer: string | Record<string, unknown>;
  result?: WrittenGradingResult;
}

export interface ConceptFlashcard {
  id: string;
  title: string;
  bullets: string[];
  trickQuestion: string;
  trickAnswer?: string;
  artifactPath?: string;
  lessonPath: string;
  lessonName: string;
}

export interface FlashcardsResponse {
  chapterPath: string;
  chapterName: string;
  totalCount: number;
  cards: ConceptFlashcard[];
}

export interface RevisionDiagram {
  id: string;
  title: string;
  artifactPath: string;
  callouts: string[]; // blank labels for pen practice; answers hidden on print sheet
  answers: string[];
}

export interface RevisionSheetPayload {
  chapterPath: string;
  chapterName: string;
  classLabel: string;
  subjectLabel: string;
  diagrams: RevisionDiagram[];
  questions: {
    id: string;
    marks: number;
    question: string;
    archetype: string;
  }[];
  selfCheckUrl: string;
  generatedAt: string;
}

export interface ProgressState {
  lessons: Record<string, LessonProgress>;
  streak: number;
  lastActiveDate: string | null;
  selectedLessonPath: string | null;
  mode?: AppMode;
  marathonEnabled?: boolean;
  mistakeVault?: Record<string, MistakeRecord>;
  writtenSubmissions?: Record<string, WrittenSubmissionRecord>;
}
