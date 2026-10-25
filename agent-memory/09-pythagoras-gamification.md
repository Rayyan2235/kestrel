# Pythagoras gamification: squares you push into place

The idea: the learner (or a bot) physically assembles the theorem. Squares are real objects with countable unit grids. A right triangle is outlined on the floor. A square only "fits" on the side whose length equals its edge.

## Core mechanic

- A tile with side n shows an n × n grid, so its area is countable (n² tiles).
- The floor shows a right triangle with legs a and b. Each side has a slot outline.
- Push tiles onto slots. A slot lights when its tile is on it (±4 cm in the sandbox).
- The reveal: once a² and b² are in place, the learner predicts the size of the hypotenuse square, then checks by placing it.

## Levels (proposed)

1. **Build it.** Given 3×3, 4×4 and 5×5, place them on a 3-4-5 triangle. Count: 9 + 16 = 25.
2. **Missing square.** Two squares are placed. Choose the third from a tray (4×4, 5×5, 6×6, 7×7) and predict before pushing.
3. **Make the triangle.** Given squares 36 and 64, set the hypotenuse to a length that makes a right angle (10). Wrong choices visibly leave a gap or overlap.
4. **Not every triangle.** Three squares 4, 9 and 16 can't close a right triangle, because 4 + 9 ≠ 16. Spot why.
5. **Rearrange proof (extension).** Cut a² and b² into pieces that tile c². This illustrates a general proof, versus a finite example.

## Bots in the puzzle

- **Good teacher / bad teacher.** Two bots each place squares and explain. One makes a plausible mistake (adds side lengths: 3 + 4 = 7). The learner has to say which bot is right and why. This needs 2 bots and live dialogue.
- **Your bot.** The learner drives their own duck, by keyboard now and voice later, to push squares themselves.
- Hint ladder (ADR 0004): another try, then a hint ("count the little squares"), then a demonstration (a bot pushes the square in), then a new variant.

## Honesty and maths notes

- A 3-4-5 example is not a proof. Say so, and offer level 5.
- Non-integer hypotenuses (1-1-√2) can't be tiled by whole unit squares. Use them to show the area still matches.
- Units: one tile is one unit². Keep lengths and areas labelled.
