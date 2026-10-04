import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase, backendConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/bi/BrandLogo";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Ikaros BI CS" },
      { name: "description", content: "Acesso interno ao BI de Customer Success do Ikaros." },
      { property: "og:title", content: "Entrar — Ikaros BI CS" },
      { property: "og:description", content: "Acesso interno ao BI de CS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
    if (!backendConfigured) { setMsg("O acesso interno ainda não foi configurado."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg("E-mail ou senha inválidos.");
    else await nav({ to: "/" });
    } catch { setMsg("Não foi possível entrar. Tente novamente."); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 bi-card rounded-lg border border-border bg-card p-8">
        <div>
          <BrandLogo className="mb-5 h-auto w-48" />
          <div className="bi-eyebrow text-muted-foreground">BI Customer Success · acesso interno</div>
        </div>
        <div className="space-y-1"><Label htmlFor="e">E-mail</Label><Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="p">Senha</Label><Input id="p" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <Button className="w-full" disabled={busy}>Entrar</Button>
        <p className="text-xs text-muted-foreground">Contas são provisionadas pelo administrador. Solicite seu acesso ao responsável pelo BI.</p>

      </form>
    </div>
  );
}

