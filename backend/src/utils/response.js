export const ok = (res, data = null, status = 200) =>
  res.status(status).json({ success: true, data, message: null });

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
