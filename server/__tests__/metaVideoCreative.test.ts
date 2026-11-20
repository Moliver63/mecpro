import assert from "node:assert/strict";
import test from "node:test";
import { withMetaVideoThumbnail } from "../metaVideoCreative.ts";

test("video_data usa image_hash quando hash e URL estão disponíveis", () => {
  const payload = withMetaVideoThumbnail(
    { video_id: "video-1", image_url: "https://example.com/old.jpg" },
    "meta-image-hash",
    "https://example.com/thumb.jpg",
  );

  assert.equal(payload.image_hash, "meta-image-hash");
  assert.equal("image_url" in payload, false);
});

test("video_data repassa image_url quando a conversão para hash não está disponível", () => {
  const payload = withMetaVideoThumbnail(
    { video_id: "video-1" },
    null,
    "https://example.com/thumb.jpg",
  );

  assert.equal(payload.image_url, "https://example.com/thumb.jpg");
});

test("video_data recusa envio sem thumbnail", () => {
  assert.equal(withMetaVideoThumbnail({ video_id: "video-1" }, null, null), null);
});
