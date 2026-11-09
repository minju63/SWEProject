import { useState } from 'react';

// 화면 위에 떠 있는 AI 비서 "Dr.부" 버튼 자리
// TODO(AI 비서 담당): 캐릭터 이미지 교체, 드래그 이동·숨기기, 누르면 대화창 열기
export default function AssistantButton() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <div className="assistant">
      <button type="button" className="assistant-face" aria-label="Dr.부와 대화하기">
        Dr.부
      </button>
      <button
        type="button"
        className="assistant-close"
        aria-label="Dr.부 숨기기"
        onClick={() => setHidden(true)}
      >
        ×
      </button>
    </div>
  );
}
