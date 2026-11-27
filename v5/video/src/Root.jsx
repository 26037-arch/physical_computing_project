// 장면마다 컴포지션 하나 (render.mjs 가 장면별로 렌더해 이어 붙인다). Full 은 스튜디오 미리보기용.
import { Composition, Series } from 'remotion';
import { useFonts } from './components/Fonts.jsx';
import timeline from './generated/timeline.json';
import { Cfop } from './scenes/Cfop.jsx';
import { Clip } from './scenes/Clip.jsx';
import { Ida } from './scenes/Ida.jsx';
import { Outro } from './scenes/Outro.jsx';
import { Title } from './scenes/Title.jsx';

const COMPONENTS = { title: Title, cfop: Cfop, ida: Ida, cup: Clip, hood: Clip, lifter: Clip, outro: Outro };

const withFonts = (C) => (props) => {
  useFonts();
  return <C {...props} />;
};
const WRAPPED = Object.fromEntries(Object.entries(COMPONENTS).map(([k, C]) => [k, withFonts(C)]));

const Full = () => {
  useFonts();
  return (
    <Series>
      {timeline.scenes.map((s) => {
        const C = COMPONENTS[s.id];
        return <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}><C scene={s} /></Series.Sequence>;
      })}
    </Series>
  );
};

export const Root = () => (
  <>
    {timeline.scenes.map((s) => (
      <Composition key={s.id} id={s.id} component={WRAPPED[s.id]} defaultProps={{ scene: s }}
        durationInFrames={s.durationInFrames} fps={timeline.fps} width={timeline.width} height={timeline.height} />
    ))}
    <Composition id="full" component={Full} durationInFrames={timeline.totalFrames} fps={timeline.fps} width={timeline.width} height={timeline.height} />
  </>
);
