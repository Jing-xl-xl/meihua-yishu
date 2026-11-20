import { SignBoard } from '../../components/SignBoard';

/** 山天大畜（上艮下乾），动三 —— 设计金样例 */
const BEN_LINES = [7, 7, 7, 8, 8, 7];
const POEM: [string, string] = ['疑云渐散见青山', '静待春来事自成'];

const GRADES = [
  { grade: 'great', note: '用生体 · 体旺' },
  { grade: 'good', note: '体克用 · 体平' },
  { grade: 'neutral', note: '体生用 · 体旺' },
  { grade: 'bad', note: '用克体 · 体平' },
  { grade: 'terrible', note: '用克体 · 体衰' },
] as const;

/**
 * 设计预览（P0 验收用，不进导航）
 * 用途：五档签牌同屏对照，做像素级设计验收；不接真实数据。
 */
export function PreviewPage() {
  return (
    <div className="page-fade">
      <div className="seg-bar">
        <h2>设计预览 · 签牌五档</h2>
        <span className="spacer" />
        <span className="hint">本页仅供设计验收，不读真实数据</span>
      </div>
      <div className="preview-grid">
        {GRADES.map((g) => (
          <div className="preview-cell" key={g.grade}>
            <SignBoard
              grade={g.grade}
              ben={{ name: '山天大畜', lines: BEN_LINES, movingYao: 3 }}
              poem={{ lines: POEM, source: 'rule' }}
              question="明日面试是否顺利"
            />
            <p className="hint preview-note">
              {g.grade} · {g.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
