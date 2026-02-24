"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// For NEXT_PUBLIC_* vars, Next.js inlines them at build time into process.env on the client.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_SUPABASE_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export default function AuthClient() {
  const router = useRouter();
  const supabase = useMemo(() => (HAS_SUPABASE_ENV ? createSupabaseBrowserClient() : null), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!HAS_SUPABASE_ENV) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-md px-4 py-12">
          <Card className="shadow-sm border-amber-500/50">
            <CardHeader>
              <CardTitle className="text-base">Configuration manquante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Les variables <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
                <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ne sont pas définies (ou pas encore prises en compte).
              </p>
              <p className="font-medium text-foreground">Sur Vercel :</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Ouvre le projet → Settings → Environment Variables</li>
                <li>Ajoute <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> et <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> pour l’environnement Production</li>
                <li>Redéploie le projet (Deployments → … → Redeploy)</li>
              </ol>
              <p>Les variables <code>NEXT_PUBLIC_*</code> sont injectées au build : un simple save ne suffit pas, il faut un nouveau déploiement.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!supabase) return null;

  const client = supabase;

  async function onSignUp() {
    setIsLoading(true);
    try {
      const { error } = await client.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast.success("Compte créé", {
        description: "Si Supabase demande une confirmation email, vérifie ta boîte mail.",
      });
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error("Signup error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSignIn() {
    setIsLoading(true);
    try {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast.success("Connecté");
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error("Login error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onMagicLink() {
    setIsLoading(true);
    try {
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });
      if (error) throw error;
      toast.success("Magic link envoyé", { description: "Check ton email." });
    } catch (err) {
      toast.error("Magic link error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-md px-4 py-12">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">UGC Factory — Connexion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
              />
            </div>

            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Signup</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="space-y-2">
                <Button className="w-full" onClick={onSignIn} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Se connecter
                </Button>
                <div className="text-center text-xs text-muted-foreground">ou</div>
                <Button className="w-full" variant="secondary" onClick={onMagicLink} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Magic link (email)
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="space-y-2">
                <Button className="w-full" onClick={onSignUp} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Créer un compte
                </Button>
                <Separator className="my-2" />
                <div className="text-xs text-muted-foreground">
                  Tu pourras sauvegarder tes anciennes images, prompts, scripts et vidéos.
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

