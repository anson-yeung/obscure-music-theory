# Pitch-class set calculator

Plain HTML, CSS and JavaScript. No build step and no dependencies: open `index.html` with
VS Code's Go Live, or double-click it.

Five pages: the home page, the calculator, Transformations (Tn and In of a set, all 24 results,
and its transpositional and inversional symmetry), and Set classes (a searchable table of all 224
classes, filtered by cardinality, interval vector, Z-relation or number of distinct forms; a clock face
beside the table stays in view, and clicking a Forte name shows that class on it, with Play notes and
Play chord). The set in
the URL hash carries from the calculator to Transformations and Subsets and supersets.

Subsets and supersets: all 223 classes on one map, a row for each number of notes. Choose one and the classes
inside it light up blue below it, and the classes it sits inside light up yellow above it. Below the map the chosen
class stands in the middle with the classes directly above it (one note more) and below it (one note fewer);
choose any of them to move there. It takes a Forte name (`4-Z15`) or a set (`0146`) in the URL hash.

Calculator: type pitch classes with no spaces (`0146`, `014AB`): each digit is one pitch class, and A and B are
10 and 11. Or use the clock face or the four-octave keyboard. A key is its pitch class, and the same
pitch class can be pressed in several octaves. Play notes and Play chord sound the pressed keys in
the octaves they sit in.

Shows normal form, prime form (Forte), Forte name, interval vector, complement, Z-mate,
symmetries and the interval vector, with the interval classes beside it and every pair drawn as a
chord. The URL hash holds the
set, so a link shares it.

```
index.html            home
calculator.html
transformations.html
set-classes.html
subsets-and-supersets.html
css/base.css          tokens, header, clock, keyboard, shared controls
css/*.css             one file for each page
js/forte-table.js     the 223 Forte set classes
js/theory.js          pitch-class set theory, no DOM (also loads in Node)
js/lattice.js         which class sits inside which, for Subsets and supersets (also loads in Node)
js/common.js          helpers shared by the pages: clock, keyboard, hash, motion, piano sound
audio/salamander/     the piano recordings (see below)
js/*.js               one file for each page
tests/theory.test.js
```

Tests: `node --test tests/*.test.js`

The Forte class names come from music21's tables. Prime forms come from this project's own
algorithm, and all 4,095 non-empty pitch-class sets were checked against music21's Forte names.

The piano sound is the Salamander Grand Piano by Alexander Holm (a Yamaha C5, sampled every minor
third), licensed CC BY 3.0, as trimmed and hosted by the Tone.js project
(https://github.com/Tonejs/audio/tree/master/salamander). The page must be served over http, as the
samples are fetched; opened from disk it falls back to a synthesized piano.
