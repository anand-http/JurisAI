import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Router } from "express";
import { notFound } from "../../lib/errors.js";
import type { RequestHandler } from "express";

export interface FileStorage {
  put(key: string, body: Buffer, contentType: string, downloadName: string): Promise<void>;
  /**
   * Short-lived download URL. Exports contain client case facts, so objects are never public.
   * A URL starting with "/" is relative to the API and is made absolute by the caller.
   */
  signedUrl(key: string): Promise<string>;
}

export class S3FileStorage implements FileStorage {
  private readonly s3: S3Client;

  constructor(
    region: string,
    private readonly bucket: string,
    private readonly urlTtlSeconds: number,
  ) {
    this.s3 = new S3Client({ region });
  }

  async put(key: string, body: Buffer, contentType: string, downloadName: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: `attachment; filename="${downloadName.replace(/[^\w.-]/g, "_")}"`,
        ServerSideEncryption: "AES256",
      }),
    );
  }

  signedUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.urlTtlSeconds,
    });
  }
}

/** Used when S3 is not configured, so the rest of the API still boots in development. */
export class UnconfiguredFileStorage implements FileStorage {
  async put(): Promise<void> {
    throw new Error("File storage is not configured (set S3_BUCKET)");
  }
  async signedUrl(): Promise<string> {
    throw new Error("File storage is not configured (set S3_BUCKET)");
  }
}

/**
 * Development only: keeps exports on local disk so export works without an S3 bucket.
 * Files are served by the API at /dev-files/<key>, to the signed-in owner only.
 */
export class LocalFileStorage implements FileStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async signedUrl(key: string): Promise<string> {
    return `/dev-files/${key}`;
  }

  /** Mounted at /dev-files. Keys look like exports/<userId>/<draftId>/<time>.docx. */
  router(requireAuth: RequestHandler): Router {
    const router = Router();
    router.get("/*path", requireAuth, async (req, res) => {
      const segments = ([] as string[]).concat(req.params.path ?? []);
      const key = segments.join("/");
      const ownPrefix = `exports/${req.auth!.userId}/`;
      if (!key.startsWith(ownPrefix) || segments.some((s) => s === ".." || s === "." || s === "")) throw notFound();
      const path = join(this.root, key);
      const exists = await stat(path).then((s) => s.isFile(), () => false);
      if (!exists) throw notFound();
      // The key is validated above; allow the dot-folder root (.dev-exports), which send() hides by default.
      res.download(path, basename(path), { dotfiles: "allow" });
    });
    return router;
  }
}
