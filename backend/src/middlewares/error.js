export function notFound(req, res) {
  res.status(404).json({
    success: false,
    data: null,
    message: `경로를 찾을 수 없습니다: ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}

// 인자 4개 고정. Express 5는 async 핸들러의 throw도 여기로 전달한다.
export function errorHandler(err, req, res, next) {
  const internalCode = typeof err.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(err.code)
    ? err.code : 'INTERNAL_ERROR';
  if (!err.status) {
    console.error('API error', internalCode);
  }
  res.status(err.status || 500).json({
    success: false,
    data: null,
    message: err.status ? err.message : '서버 오류가 발생했습니다.',
    code: err.status ? err.code || 'INTERNAL_ERROR' : internalCode,
  });
}
