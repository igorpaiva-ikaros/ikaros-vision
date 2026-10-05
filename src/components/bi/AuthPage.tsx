import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useBi } from "@/lib/bi-context";
import { supabase, backendConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/bi/BrandLogo";
import { Label } from "@/components/ui/label";

export function AuthPage() {
  const nav = useNavigate();
  const { session, state, profile } = useBi();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && profile && state && state.status !== "forbidden" && state.status !== "error") {
      void nav({ to: profile.role === "cs" ? "/operacao" : "/", replace: true });
    }
  }, [session, state, profile, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
    if (!backendConfigured) { setMsg("O acesso interno ainda não foi configurado."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMsg("E-mail ou senha inválidos.");
    else { setPassword(""); }
    } catch { setMsg("Não foi possível entrar. Tente novamente."); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 bi-card rounded-lg border border-border bg-card p-8">
        <div>
          <BrandLogo className="mb-5 h-auto w-48" />
          <div className="bi-eyebrow text-muted-foreground">Customer Success · acesso interno</div>
          <h1 className="mt-5 font-display text-3xl">Entrar no Ikaros Vision</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use sua conta autorizada para acessar o painel da empresa.</p>
        </div>
        <div className="space-y-1"><Label htmlFor="e">E-mail</Label><Input id="e" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="p">Senha</Label><Input id="p" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {msg && <p role="alert" className="text-sm text-muted-foreground">{msg}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button>
        <p className="text-xs text-muted-foreground">Uso interno da IKAROS. O CS acessa sua carteira. Administradores acessam a gestão. Não há cadastro público.</p>

      </form>
    </div>
  );
}
