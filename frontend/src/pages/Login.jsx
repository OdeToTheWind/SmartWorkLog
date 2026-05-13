import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import ApkDownloadBanner from "../components/ApkDownloadBanner";
import { toast } from "sonner";

export default function Login() {
  const { login, registerCompany } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(false);

  const doLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      nav("/");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const doRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await registerCompany({ company_name: companyName, admin_name: adminName, admin_email: email, admin_password: password });
      toast.success("Company created! You're signed in as Super Admin.");
      nav("/");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-4"><ApkDownloadBanner /></div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center font-bold text-white" style={{ background: "#0F172A" }}>W</div>
            <div className="text-left">
              <div className="font-semibold tracking-tight text-lg">Smart WorkLog</div>
              <div className="label-eyebrow">AI workforce</div>
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-2 text-sm">Sign in to your account or create a new company.</p>
        </div>

        <Tabs defaultValue="login" className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6">
          <TabsList className="grid grid-cols-2 mb-6">
            <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">New company</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={doLogin} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full" data-testid="login-submit">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={doRegister} className="space-y-4">
              <div>
                <Label htmlFor="company">Company name</Label>
                <Input id="company" data-testid="register-company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="adminName">Your name</Label>
                <Input id="adminName" data-testid="register-admin-name" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="remail">Email</Label>
                <Input id="remail" data-testid="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="rpassword">Password</Label>
                <Input id="rpassword" data-testid="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" disabled={loading} className="w-full" data-testid="register-submit">
                {loading ? "Creating..." : "Create company & sign in"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
