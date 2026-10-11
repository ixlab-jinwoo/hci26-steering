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
src/core/             shared code: tunnel geometry, steering trial engine, statistics,
                      CSV, storage, charts, version
scripts/build.mjs     esbuild bundle → single HTML file
test/                 unit tests
```

## Releasing

Pushing a version tag publishes the file to GitHub Pages and attaches it to the GitHub release of that tag:

```sh
git tag v2.0.0
git push origin v2.0.0
```

A release created on GitHub with a new `v…` tag does the same. One-time setup: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Every exported record contains the version, so data can be traced back to the
code that produced it.

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
