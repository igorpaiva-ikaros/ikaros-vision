export const MAX_CASE_FILE = 50 * 1024 * 1024;
export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export function caseFile(file: { name: string; type: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = FILE_TYPES[extension];
  if (
    !mime ||
    (file.type && file.type !== mime && !(extension === "webm" && file.type === "audio/webm"))
  )
    throw new Error("Use PDF, imagem, vídeo, áudio, DOCX, XLSX, CSV ou TXT.");
  if (file.size <= 0 || file.size > MAX_CASE_FILE)
    throw new Error("Cada anexo pode ter até 50 MB e não pode estar vazio.");
  return {
    mime: file.type || mime,
    name: file.name.slice(0, 250),
    safeName: file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-180),
  };
}
