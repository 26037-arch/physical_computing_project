'use strict';
const fs=require('fs');
const path=require('path');
const C=require('../sim/cube.js');
const solved=new C.Cube();
const moved=new C.Cube().apply(C.parseMoves('F'));
const asText=c=>c.toFacelets().map(i=>'URFDLB'[i]).join('');
// The STATE strings come from the same cube model as the existing simulator.
const a=asText(solved),b=asText(moved);
const yaml=`name: V3 manual confirm, abort, partial-state retention
version: 1
author: physical_computing_project
steps:
  - wait-serial: "READY"
  - write-serial: "M F R\\n"
  - wait-serial: "PREPARE F: ENGAGE FB; LOCK B; PARK F"
  - write-serial: "HX\\n"
  - delay: 100ms
  - write-serial: "X\\n"
  - wait-serial: "ABORTED completed=0"
  - write-serial: "P\\n"
  - wait-serial: "STATE ${a}"
  - write-serial: "M F R\\n"
  - wait-serial: "PREPARE F: ENGAGE FB; LOCK B; PARK F"
  - write-serial: "H\\n"
  - wait-serial: "PREPARE R: ENGAGE RL; LOCK L; PARK R"
  - write-serial: "X\\n"
  - wait-serial: "ABORTED completed=1"
  - write-serial: "P\\n"
  - wait-serial: "STATE ${b}"
  - write-serial: "Q 1\\n"
  - wait-serial: "MOTORS OFF"
  - write-serial: "M F'\\n"
  - wait-serial: "MOVED 1"
  - write-serial: "P\\n"
  - wait-serial: "STATE ${a}"
`;
fs.writeFileSync(path.join(__dirname,'../tests/manual_v3.test.yaml'),yaml);
