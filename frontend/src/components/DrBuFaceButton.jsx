import { useAssistantStore } from '../store/assistantStore';
import SharkAvatar from './SharkAvatar.jsx';

// Dr.부를 숨겼을 때만 헤더 알림 옆에 보이는 얼굴 버튼 (FR-A06). 누르면 대화창을 열면서 캐릭터를 다시 띄운다.
export default function DrBuFaceButton() {
  const hidden = useAssistantStore((s) => s.hidden);
  const show = useAssistantStore((s) => s.show);
  const openChat = useAssistantStore((s) => s.openChat);
  if (!hidden) return null;
  return (
    <button
      type="button"
      className="drbu-face"
      aria-label="Dr.부 다시 불러오기"
      onClick={() => {
        show();
        openChat({ mode: 'free' });
      }}
    >
      <SharkAvatar size={36} />
    </button>
  );
}
