import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
export function MemberAvatar({ src, name }: { src?: string | null | undefined; name: string }) {
  return src ? (
    <img
      src={src}
      alt={`Foto de ${name}`}
      className="h-10 w-10 shrink-0 rounded-full object-cover border"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold"
    >
      {name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join("")
        .toUpperCase() || "CS"}
    </span>
  );
}
export function AvatarPicker({
  value,
  name,
  onChange,
}: {
  value: string | null | undefined;
  name: string;
  onChange: (v: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function select(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Escolha PNG, JPG ou WebP com até 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      const size = Math.min(bmp.width, bmp.height);
      ctx.drawImage(
        bmp,
        (bmp.width - size) / 2,
        (bmp.height - size) / 2,
        size,
        size,
        0,
        0,
        320,
        320,
      );
      bmp.close();
      const data = canvas.toDataURL("image/jpeg", 0.8);
      if (data.length > 350000) throw new Error();
      onChange(data);
    } catch {
      setError("Não foi possível carregar a foto. Escolha outra imagem.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Foto de perfil</span>
      <div className="flex items-center gap-3">
        <MemberAvatar src={value} name={name} />
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Arquivo da foto de perfil"
          className="hidden"
          onChange={(e) => void select(e.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Carregando…" : "Escolher foto"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remover
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
