import { useState } from 'react';

import { CasesPage, MemoryPage } from '../pages';

type CaseProps = Parameters<typeof CasesPage>[0];

/** 占验：案例（待回填 / 已应验）与记忆画像合为一条复盘链（P0 拍板 #1） */
export function JournalPage(props: CaseProps) {
  const [tab, setTab] = useState<'cases' | 'memory'>('cases');

  if (!props.personId) {
    return (
      <div className="page-fade">
        <div className="seg-bar">
          <h2>占验</h2>
        </div>
        <div className="empty-state">
          <strong>还没有档案</strong>
          先建一个档案，才开始有占验可看。
          {props.onGotoSettings ? (
            <p>
              <button type="button" className="sm" onClick={props.onGotoSettings}>
                去「文房」建档案
              </button>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page-fade">
      <div className="seg-bar">
        <h2>占验</h2>
        <span className="spacer" />
        <span className="seg">
          <button
            type="button"
            className={tab === 'cases' ? 'active' : ''}
            onClick={() => setTab('cases')}
          >
            案例与回填
          </button>
          <button
            type="button"
            className={tab === 'memory' ? 'active' : ''}
            onClick={() => setTab('memory')}
          >
            记忆与画像
          </button>
        </span>
      </div>
      {tab === 'cases' ? <CasesPage {...props} /> : <MemoryPage personId={props.personId} />}
    </div>
  );
}
