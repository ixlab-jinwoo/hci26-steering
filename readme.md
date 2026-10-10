# Steering Law Test

An interactive test of the steering law [Accot & Zhai 1997] in the browser. Participants drag the pointer through a
tunnel without touching its walls; the page records every trial and shows movement time, errors, speed and throughput
as the data comes in.

The project started as an interactive visualisation of Fitts's law (multidirectional tapping); the tapping task has been
replaced by steering tasks.

## Tasks

| Task            | Parameters                                           | Index of difficulty         |
| --------------- | ---------------------------------------------------- | --------------------------- |
| Straight tunnel | length A, width W, 8 directions                      | A / W                       |
| Circular tunnel | radius R, width W, clockwise / counter-clockwise     | 2πR / W                     |
| Tapered tunnel  | length A, start width W₁, end width W₂, 8 directions | A / (W₁ − W₂) · ln(W₁ / W₂) |

The ID of every tunnel is computed by integrating ∫ ds / W(s) numerically along its centreline (`js/geometry.js`), so
new shapes only need a new centreline generator.

A trial is drag based: press in the green start zone, hold the button and drag through the tunnel. Timing starts at the
start line and stops at the finish line (crossing times are interpolated between pointer samples).

- **Free mode**: set the tunnel with sliders; rounds of 8 trials with alternating directions, optional randomisation.
- **Experiment mode**: a full factorial design (sizes entered as lists), conditions randomised within each shape,
  optional practice sequence per shape. Each run goes into its own data set.
- **Error policy**: _strict_ ends a trial as an error when the pointer leaves the tunnel (in experiment mode the trial
  is repeated at the end of its sequence, up to 3 attempts); _lenient_ only counts exits, their position and the time
  spent outside.

## Figures

Live, for the current tunnel: path in tunnel coordinates, speed along the tunnel, lateral offset distribution, MT over
ID.

Evaluation, across data sets:

- MT over nominal or effective ID with the steering law fit, and a table with a, b, R², IP = 1/b, throughput and τ
- MT over ID by shape, with one fit across shapes
- error rate over ID
- local law: speed over local tunnel width, v = W / τ
- mean speed profile along the tunnel, per shape and width
- effective vs. nominal width
- throughput distribution

The effective width follows Kulikov, MacKenzie & Stuerzlinger (2005): We = 4.133 · σ of the lateral offset. For tunnels
with varying width the offset is first divided by the local width.

## Data

Data is kept in the browser's `localStorage` and can be exported as CSV (one row per trial) or JSON (including the raw
pointer samples `t, x, y, s, d` of every trial). JSON exports can be imported again. Sizes are in CSS pixels; keep the
browser zoom at 100 %.

## Running

The page uses ES modules, which browsers do not load from `file://`. Serve the folder with any static web server:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Unit tests (Node 18+, no dependencies):

```sh
npm test
```

## Structure

```
index.html           page, explanation and figure containers
css/style.css
js/geometry.js       tunnel model, ID integration, tunnel coordinates
js/trial.js          trial state machine (DOM free)
js/experiment.js     conditions, sequences, session queue
js/analysis.js       statistics, effective width, local law, speed profiles
js/data.js           data sets, auto-save, CSV/JSON export
js/stage.js          drawing of the test area
js/plots/            live and evaluation figures (D3 v7)
js/main.js           wiring
vendor/              D3 v7.9.0 (ISC license)
test/                unit tests (node --test)
```

## References

- Accot, J., & Zhai, S. (1997). Beyond Fitts' law: models for trajectory-based HCI tasks. CHI '97.
- Accot, J., & Zhai, S. (1999). Performance evaluation of input devices in trajectory-based tasks: an application of
  the steering law. CHI '99.
- Kulikov, S., MacKenzie, I. S., & Stuerzlinger, W. (2005). Measuring the effective parameters of steering motions.
  CHI '05 Extended Abstracts.

# Contributors

This project was originally created as a Fitts's law visualisation for the User Interface Technology course at the
University of Copenhagen in 2012. Additional spell checking by Vicki Brown and Rich Morin in 2015. Converted to a
steering law test in 2026.

# License

This project is licensed under the MIT license; used libraries might have their own licenses.

Copyright (c) 2012 Simon Wallner, Jesper Tved

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
