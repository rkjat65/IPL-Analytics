import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Matches from './pages/Matches'
import MatchDetail from './pages/MatchDetail'
import BattingRecords from './pages/BattingRecords'
import BowlingRecords from './pages/BowlingRecords'
import PlayerProfile from './pages/PlayerProfile'
import Teams from './pages/Teams'
import TeamProfile from './pages/TeamProfile'
import Venues from './pages/Venues'
import VenueProfile from './pages/VenueProfile'
import Seasons from './pages/Seasons'
import HeadToHead from './pages/HeadToHead'
import BattingCompare from './pages/BattingCompare'
import ContentStudio from './pages/ContentStudio'
import SocialCompose from './pages/SocialCompose'
// AdvancedAnalytics removed — Team Form Index moved to Content Studio
import CricketPulse from './pages/CricketPulse'
import PlayerImpact from './pages/PlayerImpact'
import Charts from './pages/Charts'
import FAQ from './pages/FAQ'
import Admin from './pages/Admin'
import NotFound from './pages/NotFound'
import { AccountDeletion, PrivacyPolicy, TermsOfUse } from './pages/Legal'

export default function App() {
  return (
    <Routes>
      {/* Default: land straight on the dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      {/* Admin-only sign-in. There are no public accounts; /login stays for password-reset links. */}
      <Route path="/admin/login" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/account-deletion" element={<AccountDeletion />} />

      {/* App routes (with sidebar/header layout) */}
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:matchId" element={<MatchDetail />} />
        <Route path="/batting" element={<BattingRecords />} />
        <Route path="/batting/compare" element={<BattingCompare />} />
        <Route path="/batting/:playerName" element={<PlayerProfile />} />
        <Route path="/bowling" element={<BowlingRecords />} />
        <Route path="/bowling/:playerName" element={<PlayerProfile />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamName" element={<TeamProfile />} />
        <Route path="/venues" element={<Venues />} />
        <Route path="/venues/:venueName" element={<VenueProfile />} />
        <Route path="/seasons" element={<Seasons />} />
        <Route path="/seasons/:year" element={<Seasons />} />
        <Route path="/players/:playerName" element={<PlayerProfile />} />
        <Route path="/h2h" element={<HeadToHead />} />
        <Route path="/content-studio" element={<ContentStudio />} />
        <Route path="/ask" element={<Navigate to="/dashboard" replace />} />
        <Route path="/social" element={<Navigate to="/admin/social" replace />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/pulse" element={<CricketPulse />} />
        <Route path="/player-impact" element={<PlayerImpact />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/admin/social" element={<ProtectedRoute><SocialCompose /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
