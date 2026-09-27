import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'

// Every page is its own chunk, downloaded when first visited.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const Matches = lazy(() => import('./pages/Matches'))
const MatchDetail = lazy(() => import('./pages/MatchDetail'))
const BattingRecords = lazy(() => import('./pages/BattingRecords'))
const BowlingRecords = lazy(() => import('./pages/BowlingRecords'))
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'))
const Teams = lazy(() => import('./pages/Teams'))
const TeamProfile = lazy(() => import('./pages/TeamProfile'))
const Venues = lazy(() => import('./pages/Venues'))
const VenueProfile = lazy(() => import('./pages/VenueProfile'))
const Seasons = lazy(() => import('./pages/Seasons'))
const HeadToHead = lazy(() => import('./pages/HeadToHead'))
const BattingCompare = lazy(() => import('./pages/BattingCompare'))
const BowlingCompare = lazy(() => import('./pages/BowlingCompare'))
const Fantasy = lazy(() => import('./pages/Fantasy'))
const Quiz = lazy(() => import('./pages/Quiz'))
const ContentStudio = lazy(() => import('./pages/ContentStudio'))
const SocialCompose = lazy(() => import('./pages/SocialCompose'))
const CricketPulse = lazy(() => import('./pages/CricketPulse'))
const PlayerImpact = lazy(() => import('./pages/PlayerImpact'))
const Charts = lazy(() => import('./pages/Charts'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Admin = lazy(() => import('./pages/Admin'))
const NotFound = lazy(() => import('./pages/NotFound'))
const legal = (name) => lazy(() => import('./pages/Legal').then(m => ({ default: m[name] })))
const PrivacyPolicy = legal('PrivacyPolicy')
const TermsOfUse = legal('TermsOfUse')
const AccountDeletion = legal('AccountDeletion')

// Warm the chunks visitors open most, once the first page is idle.
if (typeof window !== 'undefined') {
  const warm = () => {
    import('./pages/BattingRecords'); import('./pages/Matches'); import('./pages/PlayerProfile')
  }
  ;(window.requestIdleCallback || ((cb) => setTimeout(cb, 2000)))(warm)
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
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
        <Route path="/bowling/compare" element={<BowlingCompare />} />
        <Route path="/fantasy" element={<Fantasy />} />
        <Route path="/quiz" element={<Quiz />} />
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
    </Suspense>
  )
}
