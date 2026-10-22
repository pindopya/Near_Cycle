import multer from 'multer';
import { AppError } from '../utils/response.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_REQUEST = 5;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasValidImageSignature(file) {
  const buffer = file.buffer;
  if (!Buffer.isBuffer(buffer)) return false;

  if (file.mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (file.mimetype === 'image/png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
  }

  if (file.mimetype === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: MAX_IMAGES_PER_REQUEST,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new AppError(400, 'INVALID_IMAGE_TYPE', 'รองรับเฉพาะไฟล์ JPG, PNG และ WEBP'));
      return;
    }
    callback(null, true);
  },
});

export function uploadDonationImages(req, res, next) {
  upload.array('images', MAX_IMAGES_PER_REQUEST)(req, res, (error) => {
    if (!error) {
      if (!req.files?.length) {
        next(new AppError(400, 'IMAGE_REQUIRED', 'กรุณาแนบรูปอย่างน้อย 1 รูป'));
        return;
      }

      if (req.files.some((file) => !hasValidImageSignature(file))) {
        next(new AppError(400, 'INVALID_IMAGE_CONTENT', 'เนื้อหาไฟล์รูปไม่ตรงกับชนิดไฟล์ที่รองรับ'));
        return;
      }

      next();
      return;
    }

    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(400, 'IMAGE_TOO_LARGE', 'รูปแต่ละไฟล์ต้องมีขนาดไม่เกิน 5 MB'));
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError(400, 'TOO_MANY_IMAGES', `อัปโหลดได้ไม่เกิน ${MAX_IMAGES_PER_REQUEST} รูปต่อครั้ง`));
        return;
      }
    }

    next(error);
  });
}
