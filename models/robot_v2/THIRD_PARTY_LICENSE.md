# Printable cube geometry attribution

The spherical tracks, edge skids, corner contact plates, and center/core layout
are adapted from Jared Deckard's **3x3x3 Cube Puzzle**:
https://github.com/deckar01/3x3x3-cube-puzzle

Pinned source commit: `a29a109c5c8af86f143f382861175513b53608f0`.
Relevant files: `pieces/{center,core,corner,edge}.scad`,
`settings/default.scad`, and `utils/rounded-cube.scad`.

Modifications: analytical CadQuery BReps; 0.30 mm nominal piece gap; edge drive
sockets; M3 insert/spring center interface; rounding approximation within
0.01 mm for the center capsule; generated STEP/STL and robot interfaces.
The upstream source and this derivative have not been physically verified by
this project. The upstream README describes assembly; its issue #1 still lists
physical printing/documentation tasks. Do not describe this as a proven print.

## MIT License

Copyright (c) 2017 Jared Deckard

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
