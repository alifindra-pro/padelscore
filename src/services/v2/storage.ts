import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { MAX_AVATAR_BYTES, AVATAR_SIZE_MESSAGE } from "@/lib/upload-limits";
const client = () => {
  const isNeon = Boolean(process.env.AWS_ENDPOINT_URL_S3);
  const endpoint = isNeon
    ? process.env.AWS_ENDPOINT_URL_S3
    : process.env.S3_ENDPOINT;
  const accessKeyId = isNeon
    ? process.env.AWS_ACCESS_KEY_ID
    : process.env.S3_ACCESS_KEY;
  const secretAccessKey = isNeon
    ? process.env.AWS_SECRET_ACCESS_KEY
    : process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey)
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "Penyimpanan foto belum dikonfigurasi",
    );
  return new S3Client({
    endpoint,
    region:
      (isNeon ? process.env.AWS_REGION : process.env.S3_REGION) ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
};
const bucket = () =>
  process.env.AWS_ENDPOINT_URL_S3
    ? "assets"
    : (process.env.S3_BUCKET ?? "padel");
export async function saveAvatar(file: File, userId: string) {
  if (file.size > MAX_AVATAR_BYTES || file.size === 0)
    throw AppError.badRequest(AVATAR_SIZE_MESSAGE);
  const buffer = Buffer.from(await file.arrayBuffer());
  let image;
  try {
    const metadata = await sharp(buffer, {
      limitInputPixels: 25000000,
    }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
      throw new Error();
    image = await sharp(buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw AppError.badRequest(
      "Isi gambar harus JPEG, PNG, atau WebP yang valid",
    );
  }
  const key = `avatars/${userId}/${randomUUID()}.webp`;
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: image,
      ContentType: "image/webp",
    }),
  );
  return key;
}
export async function readAvatar(key: string) {
  const result = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  return result.Body?.transformToByteArray();
}
export async function deleteAvatar(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function saveSponsorLogo(file: File, tournamentId: string) {
  if (file.size === 0 || file.size > MAX_AVATAR_BYTES)
    throw AppError.badRequest("Logo maksimal 4 MB");
  let image: Buffer;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer, {
      limitInputPixels: 25000000,
    }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
      throw new Error();
    image = await sharp(buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize(800, 400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw AppError.badRequest(
      "Logo harus berupa JPEG, PNG, atau WebP yang valid",
    );
  }
  const key = `sponsors/${tournamentId}/${randomUUID()}.webp`;
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: image,
      ContentType: "image/webp",
    }),
  );
  return key;
}

export async function saveTournamentHeader(
  file: File,
  tournamentId: string,
  kind: "banner" | "logo",
) {
  if (!file.size || file.size > MAX_AVATAR_BYTES)
    throw AppError.badRequest("Gambar maksimal 4 MB");
  let image: Buffer;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer, {
      limitInputPixels: 25000000,
    }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
      throw new Error();
    image = await sharp(buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize(kind === "banner" ? 1600 : 400, kind === "banner" ? 600 : 400, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw AppError.badRequest("Gambar harus JPEG, PNG, atau WebP yang valid");
  }
  const key = `tournament-headers/${tournamentId}/${kind}-${randomUUID()}.webp`;
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: image,
      ContentType: "image/webp",
    }),
  );
  return key;
}
