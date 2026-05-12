import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("worklog_user") || "null"); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("worklog_token", data.token);
    localStorage.setItem("worklog_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const registerCompany = async (payload) => {
    const { data } = await api.post("/auth/register-company", payload);
    localStorage.setItem("worklog_token", data.token);
    localStorage.setItem("worklog_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("worklog_token");
    localStorage.removeItem("worklog_user");
    setUser(null);
    window.location.href = "/login";
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      localStorage.setItem("worklog_user", JSON.stringify(data));
    } catch {} finally { setLoading(false); }
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, registerCompany, refresh, loading }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);

export const ROLE_COLOR = {
  super_admin: "#0F172A",
  hr: "#16A34A",
  supervisor: "#4F46E5",
  developer: "#0D9488",
  team_member: "#2563EB",
  employee: "#7C3AED",
};
export const ROLE_LABEL = {
  super_admin: "Super Admin",
  hr: "HR Manager",
  supervisor: "Supervisor",
  developer: "Developer",
  team_member: "Team Member",
  employee: "Employee",
};

export const PRIORITY_COLOR = { critical: "#DC2626", high: "#D97706", medium: "#0284C7", low: "#64748B" };
