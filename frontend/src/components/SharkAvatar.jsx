import faceImage from '../assets/drbu-face.webp';

// Dr.부 캐릭터 얼굴 (동그란 영역에 맞춰 잘라 둔 이미지: src/assets/drbu-face.webp)
export default function SharkAvatar({ size = 56 }) {
  return (
    <img
      className="shark-img"
      src={faceImage}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
