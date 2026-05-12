import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import CriticalBanner from "./components/CriticalBanner";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import People from "./pages/People";
import Notifications from "./pages/Notifications";
import Leave from "./pages/Leave";
import AuditLog from "./pages/AuditLog";
import Leaderboard from "./pages/Leaderboard";
import DailyUpdate from "./pages/DailyUpdate";
import { Toaster } from "./components/ui/sonner";
import "@/App.css";

const Protected = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <CriticalBanner user={user} />
      {children}
    </Layout>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
          <Route path="/people" element={<Protected><People /></Protected>} />
          <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
          <Route path="/leave" element={<Protected><Leave /></Protected>} />
          <Route path="/audit" element={<Protected><AuditLog /></Protected>} />
          <Route path="/leaderboard" element={<Protected><Leaderboard /></Protected>} />
          <Route path="/daily-update" element={<Protected><DailyUpdate /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
