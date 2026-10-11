# HCI 2026: pointing, crossing and steering

In-browser experiments for the HCI 2026 course, built as **one self-contained HTML file**: students download
`hci26-steering.html`, open it with a double-click, run an experiment and export their data as CSV. Nothing is
uploaded; no server or network is needed.

| Part         | Format                 | What students compare                                           |
| ------------ | ---------------------- | --------------------------------------------------------------- |
| Assignment 1 | in-class team activity | Fitts' law (pointing) vs. crossing at equal index of difficulty |
| Assignment 2 | individual homework    | linear vs. circular steering at equal index of difficulty       |
| Merge        | teams and instructor   | results of many exported CSV files together                     |

## Getting the file

- **Download**: `hci26-steering.html` is attached to every [release](https://github.com/ixlab-jinwoo/hci26-steering/releases)
  (`releases/latest/download/hci26-steering.html` always points to the newest one).
- **Online**: the same file is published on GitHub Pages at https://ixlab-jinwoo.github.io/hci26-steering/. Tablets
  (iPad, Android) cannot run a downloaded HTML file; they use this address instead.

## Assignment 1: Fitts' law vs. crossing

A 1D reciprocal task (as in Fitts 1954) with two techniques at the same index of difficulty ID = log₂(A/W + 1):

- **Pointing**: click inside a bar of width W (along the movement).
- **Crossing**: sweep through a goal segment of length W (across the movement) without clicking, as in Accot & Zhai
  (2002).

Design: A ∈ {240, 480} px × W ∈ {15, 30, 60} px (ID 2.3–5.0 bits) × 2 techniques = 12 sequences in random order, after
one practice sequence per technique. Each sequence has 10 timed movements; the first activation only starts the clock.
Misses are counted and the sequence goes on. Mouse, touchpad and pen are allowed; the device is recorded.

Analysis per participant and condition (ISO 9241-9, Soukoreff & MacKenzie 2004): mean MT, effective width We = 4.133 ×
SD of the activation points, IDe = log₂(Ae/We + 1), throughput TP = IDe / MT; per technique the fit MT = a + b·ID and the
mean TP. Figures: MT vs. ID, TP vs. ID, velocity profile towards the target over normalised time, error rate.

The CSV has one row per timed movement, including the velocity profile in 20 time slices (`v01`–`v20`), so the merge
view can redraw every figure from CSV files alone.

## Assignment 2: linear vs. circular steering

Steering through tunnels (Accot & Zhai 1997): press in the green start zone, keep the button pressed (or the pen on the
screen) and steer to the finish line; leaving the tunnel or letting go fails the trial, which is then repeated later in
the block (up to 3 attempts). Both shapes have the same index of difficulty ID = L / W:

- **Linear**: a straight tunnel of length L, left to right or right to left.
- **Circular**: a full circle of circumference L (radius L / 2π), clockwise or counter-clockwise.

Design: L ∈ {500, 800} px × W ∈ {20, 30, 40} px (ID 12.5–40) × 2 shapes; 12 practice trials, then 2 blocks of 48 trials
(4 per condition, directions balanced) in random order; about 12 minutes. The session is saved after every trial, so a
reload continues where it stopped.

Input: mouse or stylus only. Finger touches are ignored; a touchpad has to be ruled out by the student (browsers report
it as a mouse); a mismatch between the chosen device and the actual pointer type is pointed out once. The window has to
be at least 960 × 580 CSS pixels.

Analysis per participant: mean MT of completed trials, error rate (failed attempts), throughput ID / MT, per shape the
fit MT = a + b·ID and IP = 1000/b; speed along the path in 20 pieces (`s01`–`s20`), path length / L and the offset
towards the centre of the circle. Figures: MT vs. ID, throughput vs. ID, speed profiles per width, error rate, path
length vs. width; in the merge view also each participant's slope b for both shapes.

## Merge view

Drop the CSV files of a team or a class. Files are recognised by their `assignment` column; a participant session that
is loaded twice is skipped, and mixed app versions are flagged. Each participant is analysed on their own first; tables
and figures show the mean over participants with 95 % confidence intervals (Student t), plus paired comparisons
between the two conditions. The merged rows and a one-row-per-participant summary can be downloaded as CSV.

## Development

```sh
npm ci            # esbuild and d3
npm run build     # → dist/hci26-steering.html (also dist/index.html for Pages)
npm run watch     # rebuild on every change in src/
npm test          # unit tests (node --test)
```

Open `dist/hci26-steering.html` directly in a browser; no web server is needed.

```
src/index.html        page template (CSS and JS are inlined by the build)
src/styles.css
src/main.js           hash router: #/, #/a1, #/a2, #/merge
src/home.js           start page
src/a1/               Assignment 1: design, reciprocal pointing/crossing engine, analysis, views
src/a2/               Assignment 2: design, tunnel stage, analysis, views
src/merge/            merge view
src/core/             shared code: tunnel geometry, steering trial engine, statistics,
                      CSV, storage, charts, version
scripts/build.mjs     esbuild bundle → single HTML file
test/                 unit tests
```

## Releasing

Publish a release on GitHub (**Releases → Draft a new release**, any new tag name such as `v2.0.0` or `A2-1.0`). The
Deploy workflow then builds the file from that tag, attaches `hci26-steering.html` to the release and publishes the same
file on GitHub Pages; the tag name is shown on the start page as the version. Pushes to master alone change nothing that
students see. To publish an existing release on GitHub Pages again, run the Deploy workflow by hand from the Actions tab
(with its tag, or empty for the latest release).

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every exported record contains
the version, so data can be traced back to the code that produced it.

# Contributors

This project started as a Fitts's law visualisation for the User Interface Technology course at the University of
Copenhagen in 2012 (Simon Wallner, Otilia Danet, Trine Eilersen, Jesper Tved), with spell checking by Vicki Brown and
Rich Morin in 2015. It was turned into a steering law test and then into the HCI 2026 assignments in 2026.

# License

This project is licensed under the MIT license; used libraries might have their own licenses (D3: ISC license).

Copyright (c) 2012 Simon Wallner, Jesper Tved

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
