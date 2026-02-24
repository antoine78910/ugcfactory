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

export default function AuthClient() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSignUp() {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
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
      const { error } = await supabase.auth.signInWithPassword({
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
      const { error } = await supabase.auth.signInWithOtp({
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

