declare module "heic-convert" {
  const convert: (opts: { buffer: Buffer | Uint8Array; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer | Uint8Array>;
  export default convert;
}
