import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PortalProvider } from "@/store/PortalProvider";
import { ToastProvider } from "@/components/ui";
import { Shell } from "@/components/shell/Shell";
import { CommandCenterPage } from "@/pages/CommandCenter";
import { ActivityPage, LeadDetailPage } from "@/pages/Activity";
import { WalletPage } from "@/pages/Wallet";
import { SettingsPage, BusinessProfilePage, NotificationsPage, AgentProfilePage } from "@/pages/Settings";
import { SupportPage } from "@/pages/Support";
import "@/styles/base.css";

/**
 * FROZEN ROUTE MAP (Wave 0)
 *   /                          Agent Command Center (global)
 *   /command-center/:leadId    Agent Command Center with a lead in context (?workflow=<kind>)
 *   /activity                  Activity (all leads)
 *   /activity/:leadId          Lead detail (activity feed)
 *   /wallet                    Wallet (modal over the command center)
 *   /settings                  Settings hub
 *   /settings/business         Business Profile
 *   /settings/notifications    Notifications
 *   /settings/agent            Agent Profile
 *   /support                   Support
 */
export default function App() {
  return (
    <ThemeProvider>
      <PortalProvider>
        <ToastProvider>
          <BrowserRouter>
            <Shell>
              <Routes>
                <Route path="/" element={<CommandCenterPage />} />
                <Route path="/command-center/:leadId" element={<CommandCenterPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/activity/:leadId" element={<LeadDetailPage />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/business" element={<BusinessProfilePage />} />
                <Route path="/settings/notifications" element={<NotificationsPage />} />
                <Route path="/settings/agent" element={<AgentProfilePage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/leads" element={<Navigate to="/activity" replace />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </BrowserRouter>
        </ToastProvider>
      </PortalProvider>
    </ThemeProvider>
  );
}
