import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SignInPage } from "@/pages/SignIn";
import { DashboardPage } from "@/pages/Dashboard";
import { NewProductPage } from "@/pages/NewProduct";
import { ProductDetailPage } from "@/pages/ProductDetail";
import { BRDPage } from "@/pages/BRD";
import { PlanningPage } from "@/pages/Planning";
import { TasksPage } from "@/pages/Tasks";
import { InfosecPage } from "@/pages/Infosec";
import { UatPage } from "@/pages/Uat";
import { BugsPage } from "@/pages/Bugs";
import { DiagramsPage } from "@/pages/Diagrams";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/products/new" element={<NewProductPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/products/:id/brd" element={<BRDPage />} />
            <Route path="/products/:id/planning" element={<PlanningPage />} />
            <Route path="/products/:id/tasks" element={<TasksPage />} />
            <Route path="/products/:id/infosec" element={<InfosecPage />} />
            <Route path="/products/:id/uat" element={<UatPage />} />
            <Route path="/products/:id/bugs" element={<BugsPage />} />
            <Route path="/products/:id/diagrams" element={<DiagramsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" toastOptions={{ classNames: { toast: "rounded-xl shadow-3" } }} />
    </AuthProvider>
  );
}
