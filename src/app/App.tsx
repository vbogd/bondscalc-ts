import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CalculatorPage } from "../pages/CalculatorPage";
import { SearchPage } from "../pages/SearchPage";
import { AppShell } from "../shared/ui/AppShell";
import { queryClient } from "./queryClient";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route index element={<SearchPage />} />
            <Route path="/bond/:secid" element={<CalculatorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
