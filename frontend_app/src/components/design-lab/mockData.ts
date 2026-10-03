export type MockLesson = {
  id: string;
  title: string;
  duration: string;
  status: "done" | "current" | "locked";
};

export type MockChapter = {
  id: string;
  title: string;
  lessons: MockLesson[];
};

export type MockSubject = {
  id: string;
  title: string;
  chapters: MockChapter[];
};

export const MOCK_STATS = {
  streak: 7,
  mastery: 68,
  shields: 3,
  classLabel: "Class 7",
};

export const MOCK_TRANSCRIPT = [
  {
    t: "0:12",
    text: "Hey Saanvi! Today we look beyond price tags and ask how markets shape everyday life.",
  },
  {
    t: "0:48",
    text: "Surat's textile market supplies cotton and synthetic fabrics across the country.",
  },
  {
    t: "1:35",
    text: "Ima Keithal in Imphal is run by about three thousand women entrepreneurs.",
  },
  {
    t: "2:20",
    text: "Smart consumers look for FSSAI, ISI from BIS, AGMARK, and BEE star ratings.",
  },
];

export const MOCK_CURRICULUM: MockSubject[] = [
  {
    id: "ss",
    title: "Social Science",
    chapters: [
      {
        id: "ch12",
        title: "Ch 12 · Understanding Markets",
        lessons: [
          {
            id: "ml5",
            title: "Markets in People's Lives",
            duration: "3:15",
            status: "done",
          },
          {
            id: "ml6",
            title: "Government's Role in Markets",
            duration: "3:10",
            status: "current",
          },
          {
            id: "ml7",
            title: "Certification Marks & Smart Consumers",
            duration: "3:12",
            status: "locked",
          },
        ],
      },
      {
        id: "ch11",
        title: "Ch 11 · The Rise of Empires",
        lessons: [
          {
            id: "c11-1",
            title: "Empires and Trade Routes",
            duration: "4:02",
            status: "done",
          },
        ],
      },
    ],
  },
];

export const EXAM_PREP_CARDS = [
  {
    id: "practice",
    title: "Practice Arena",
    blurb: "Timed MCQs from this chapter — anti-guessing mode on.",
  },
  {
    id: "written",
    title: "Written Prep",
    blurb: "FSSAI, MSP, and label fields — examiner-style answers.",
  },
  {
    id: "flashcards",
    title: "Flashcards",
    blurb: "Flip through BIS, AGMARK, BEE, and key definitions.",
  },
];

export function findLesson(
  lessonId: string
): { subject: MockSubject; chapter: MockChapter; lesson: MockLesson } | null {
  for (const subject of MOCK_CURRICULUM) {
    for (const chapter of subject.chapters) {
      const lesson = chapter.lessons.find((l) => l.id === lessonId);
      if (lesson) return { subject, chapter, lesson };
    }
  }
  return null;
}
