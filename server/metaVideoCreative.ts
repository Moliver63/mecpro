/** Add the thumbnail field Meta requires for object_story_spec.video_data. */
export function withMetaVideoThumbnail<T extends Record<string, unknown>>(
  videoData: T,
  imageHash?: string | null,
  imageUrl?: string | null,
): (T & ({ image_hash: string } | { image_url: string })) | null {
  if (imageHash) {
    const { image_url: _imageUrl, ...withoutImageUrl } = videoData as T & { image_url?: string };
    return { ...withoutImageUrl, image_hash: imageHash } as T & { image_hash: string };
  }
  if (imageUrl) {
    const { image_hash: _imageHash, ...withoutImageHash } = videoData as T & { image_hash?: string };
    return { ...withoutImageHash, image_url: imageUrl } as T & { image_url: string };
  }
  return null;
}
