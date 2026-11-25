import webRaw from '../../../models/robot_v5h/assembly_web.json';
import scriptRaw from '../../../docs/V5H_ASSEMBLY_STEPS.json';

export type Circle = { c: [number, number]; d: number };
export type MeshData = { positions: number[]; indices: number[] };
export type Piece = {
  inst: string;
  id: string;
  sub: string | null;
  name: string;
  group: string;
  plane: string;
  color?: string;
  outline: [number, number][];
  holes: Circle[];
  cutouts: [number, number][][];
  matrix: number[];
  finish?: string[];
  finished_mesh?: MeshData;
};
export type Part = {
  inst: string;
  desc: string;
  kind: 'box' | 'cylinder' | 'mesh';
  color?: string;
  size?: number[];
  mesh?: MeshData;
  matrix: number[];
};
export type Web = {
  thickness: number;
  pieces: Piece[];
  parts: Part[];
  bbox: [number[], number[]];
  table_zw: number;
  tilt_deg: number;
};
export type JoinKind = 'glue' | 'bolt' | 'place' | 'drill' | 'check';
export type View = 'front' | 'back' | 'left' | 'right' | 'top' | 'iso' | 'iso-back';
export type Step = {
  n: number;
  module: string;
  title: string;
  add: string[];
  fasteners: string[];
  join: JoinKind;
  text: string;
  tip?: string;
  check?: string;
  from: [number, number, number];
  focus: string[];
  view: View;
};
export type Mod = { id: string; title: string; color: string };
export type Script = {
  title: string;
  scope: string;
  modules: Mod[];
  tools: string[];
  notes: { assumed_state: string; rules: string[] } & Record<string, unknown>;
  steps: Step[];
};

export const web = webRaw as unknown as Web;
export const script = scriptRaw as unknown as Script;
export const steps = script.steps;
export const modules = script.modules;

export const JOIN_LABEL: Record<JoinKind, string> = {
  glue: '순간접착',
  bolt: '볼트·너트 체결',
  place: '놓기·끼우기',
  drill: '가공 (뚫기·깎기·표시)',
  check: '확인·손 시험',
};

/** 인스턴스 → 처음 나오는 단계 index (add 또는 3D 철물) */
export const firstStep = new Map<string, number>();
const known = new Set<string>([...web.pieces.map((p) => p.inst), ...web.parts.map((p) => p.inst)]);
steps.forEach((st, i) => {
  for (const k of [...st.add, ...st.fasteners]) {
    if (known.has(k) && !firstStep.has(k)) firstStep.set(k, i);
  }
});

export const baseName = (inst: string) => inst.split('#')[0];
export const partDesc = new Map(web.parts.map((p) => [p.inst, p.desc]));
/** 3D 모델이 없는 철물의 이름 (대본 notes.names 기준) */
export const fastenerNoModel: Record<string, string> = {
  F02: '커플링 멈춤나사',
  F06: '원형 혼 나사 (M2)',
  F07: '혼 중심나사',
  F10: 'SG90 고정 나사 (M2)',
};
