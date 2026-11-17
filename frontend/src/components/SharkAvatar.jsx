// Dr.부 캐릭터 (임시 일러스트). 디자인 이미지가 나오면 이 컴포넌트만 교체한다.
export default function SharkAvatar({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#dbe9ff" />
      <path d="M32 6c3 6 4 9 4 12H28c0-3 1-6 4-12Z" fill="#2f7bf5" />
      <ellipse cx="32" cy="36" rx="22" ry="20" fill="#4f95f7" />
      <ellipse cx="32" cy="44" rx="15" ry="11" fill="#eaf3ff" />
      <circle cx="23" cy="31" r="4.2" fill="#fff" />
      <circle cx="41" cy="31" r="4.2" fill="#fff" />
      <circle cx="23.6" cy="31.4" r="2.2" fill="#191f28" />
      <circle cx="41.4" cy="31.4" r="2.2" fill="#191f28" />
      <path
        d="M22 42c3 4 17 4 20 0-1 7-5 9-10 9s-9-2-10-9Z"
        fill="#fff"
        stroke="#2a62c4"
        strokeWidth="1.2"
      />
    </svg>
  );
}
