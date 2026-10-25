export type LessonId = "pythagoras" | "moments";

export type LessonPage = {
  title: string;
  text: string;
  formula?: string;
};

export type QuizQuestion = {
  id: string;
  subject: "Maths" | "Physics";
  prompt: string;
  choices: string[];
  answer: number;
  explain: string;
};

export const LESSON_BOOK: Record<LessonId, { title: string; pages: LessonPage[] }> = {
  pythagoras: {
    title: "Pythagoras: squares and right triangles",
    pages: [
      { title: "A right triangle", text: "The Pythagorean theorem links the three sides of a right triangle. The longest side, opposite the right angle, is the hypotenuse." },
      { title: "Compare areas", text: "Build a square on each side. The two smaller square areas add up to the area on the hypotenuse.", formula: "a² + b² = c²" },
      { title: "Our 3–4–5 triangle", text: "Pip and Nova will place the 5×5 and 4×4 squares together, then finish the 3×3 square. Watch the measured slot indicators as they move.", formula: "3² + 4² = 5²  →  9 + 16 = 25" },
    ],
  },
  moments: {
    title: "Moments: mass, distance and balance",
    pages: [
      { title: "A turning effect", text: "A moment describes how strongly a weight turns a beam around its pivot. A heavier weight or a longer distance creates a larger moment." },
      { title: "Compare both sides", text: "The beam balances when the turning effects on its left and right sides are equal.", formula: "moment = mass × distance" },
      { title: "Watch the robots test it", text: "Pip moves the 200 g weight on the left rail; Nova moves the 100 g weight on the right. Their positions and the measured beam tilt update as the experiment runs.", formula: "200 g × 10 cm = 100 g × 20 cm" },
    ],
  },
};

// A varied, authored bank keeps answers and explanations checkable while giving
// learners different values and examples across attempts.
export const QUIZ_BANK: QuizQuestion[] = [
  { id: "pythagoras-1", subject: "Maths", prompt: "Which side is opposite the right angle?", choices: ["The hypotenuse", "The shortest side", "Either leg"], answer: 0, explain: "The hypotenuse is opposite the right angle and is the longest side." },
  { id: "pythagoras-2", subject: "Maths", prompt: "If the legs are 3 and 4, what is the hypotenuse?", choices: ["5", "7", "12"], answer: 0, explain: "3² + 4² = 9 + 16 = 25, and √25 = 5." },
  { id: "pythagoras-3", subject: "Maths", prompt: "What does the 25 represent in this square demonstration?", choices: ["The area of the square on the hypotenuse", "The length of the hypotenuse", "The number of triangles"], answer: 0, explain: "The 5×5 square has area 25 unit squares; it is not a side length of 25." },
  { id: "pythagoras-4", subject: "Maths", prompt: "A right triangle has legs 5 and 12. What is its hypotenuse?", choices: ["13", "17", "60"], answer: 0, explain: "5² + 12² = 25 + 144 = 169, and √169 = 13." },
  { id: "moments-1", subject: "Physics", prompt: "What two quantities determine a simple turning moment?", choices: ["Mass and distance from the pivot", "Color and length of the beam", "Speed and temperature"], answer: 0, explain: "Moment is mass multiplied by its perpendicular distance from the pivot." },
  { id: "moments-2", subject: "Physics", prompt: "Which has the larger moment: 200 g at 10 cm or 100 g at 20 cm?", choices: ["They are equal", "200 g at 10 cm", "100 g at 20 cm"], answer: 0, explain: "Both give 2000 g·cm, so their moments are equal." },
  { id: "moments-3", subject: "Physics", prompt: "If the right side dips, what does that tell you about the moments?", choices: ["The right moment is larger", "The left moment is larger", "The moments must be equal"], answer: 0, explain: "The side that dips has the larger turning moment in this setup." },
  { id: "moments-4", subject: "Physics", prompt: "Keeping the mass the same, what happens when it moves farther from the pivot?", choices: ["Its moment increases", "Its moment decreases", "Its moment stays zero"], answer: 0, explain: "Increasing distance from the pivot increases moment when mass is unchanged." },
];

export function makeQuizQuestions(random = Math.random): QuizQuestion[] {
  const maths = QUIZ_BANK.filter(q => q.subject === "Maths");
  const physics = QUIZ_BANK.filter(q => q.subject === "Physics");
  const pick = (items: QuizQuestion[]) => [...items].sort(() => random() - 0.5).slice(0, 3);
  return [...pick(maths), ...pick(physics)];
}
