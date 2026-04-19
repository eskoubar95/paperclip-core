import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { assetService } from "../services/assets.js";

/**
 * Unauthenticated image delivery for agent avatars (Slack `icon_url`, etc.).
 * Access is gated by an unguessable per-agent token stored in `agents.avatar_access_token`.
 */
export function publicAgentAvatarRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const assetsApi = assetService(db);

  router.get("/:accessToken", async (req, res, next) => {
    const accessToken = req.params.accessToken as string;
    if (!accessToken || accessToken.length < 16) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    try {
      const row = await db
        .select()
        .from(agents)
        .where(eq(agents.avatarAccessToken, accessToken))
        .then((rows) => rows[0] ?? null);

      if (!row?.avatarAssetId) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const asset = await assetsApi.getById(row.avatarAssetId);
      if (!asset || asset.companyId !== row.companyId) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const object = await storage.getObject(asset.companyId, asset.objectKey);
      const responseContentType = asset.contentType || object.contentType || "application/octet-stream";
      res.setHeader("Content-Type", responseContentType);
      res.setHeader("Content-Length", String(asset.byteSize || object.contentLength || 0));
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");

      object.stream.on("error", (err) => {
        next(err);
      });
      object.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
