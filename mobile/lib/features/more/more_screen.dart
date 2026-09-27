import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/auth_provider.dart';
import '../../core/theme.dart';
import '../../widgets/widgets.dart';
import '../charts/charts_screen.dart';
import '../h2h/h2h_screen.dart';
import '../impact/impact_screen.dart';
import '../pulse/pulse_screen.dart';
import '../seasons/seasons_screen.dart';
import '../studio/content_studio_screen.dart';
import '../teams/teams_screen.dart';
import '../venues/venues_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  static const _site = 'https://crickrida.rkjat.in';

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          CrickCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: CrickTheme.cyan.withValues(alpha: 0.15),
                  child: Text(
                    auth.isAuthenticated && auth.displayName.isNotEmpty
                        ? auth.displayName[0].toUpperCase()
                        : '?',
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: CrickTheme.cyan,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        auth.isAuthenticated
                            ? auth.displayName
                            : 'Free for everyone',
                        style: GoogleFonts.spaceGrotesk(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        auth.isAuthenticated
                            ? '${auth.user?['email'] ?? ''}'
                            : 'Every stat and tool · no account needed',
                        style: const TextStyle(
                          color: CrickTheme.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (auth.isAuthenticated)
                  TextButton(
                    onPressed: () => auth.logout(),
                    child: const Text('Logout'),
                  ),
              ],
            ),
          ),
          const SectionHeader('Explore'),
          _tile(
            context,
            Icons.dashboard_customize_rounded,
            'Content Studio',
            const ContentStudioScreen(),
            CrickTheme.lime,
          ),
          _tile(
            context,
            Icons.bolt_rounded,
            'Cricket Pulse',
            const PulseScreen(),
            CrickTheme.amber,
          ),
          _tile(
            context,
            Icons.groups_rounded,
            'Teams',
            const TeamsScreen(),
            CrickTheme.magenta,
          ),
          _tile(
            context,
            Icons.stadium_outlined,
            'Venues',
            const VenuesScreen(),
            CrickTheme.purple,
          ),
          _tile(
            context,
            Icons.calendar_month_rounded,
            'Seasons',
            const SeasonsScreen(),
            CrickTheme.cyan,
          ),
          _tile(
            context,
            Icons.sports_kabaddi_rounded,
            'Head to Head',
            const H2HScreen(),
            CrickTheme.lime,
          ),
          _tile(
            context,
            Icons.bar_chart_rounded,
            'Charts',
            const ChartsScreen(),
            CrickTheme.amber,
          ),
          _tile(
            context,
            Icons.insights_rounded,
            'Player Impact',
            const ImpactScreen(),
            CrickTheme.magenta,
          ),
          const SectionHeader('Links'),
          CrickCard(
            onTap: () => _openUrl(context, _site),
            child: const Row(
              children: [
                Icon(Icons.open_in_new, color: CrickTheme.cyan),
                SizedBox(width: 12),
                Expanded(child: Text('Open web dashboard')),
                Icon(Icons.chevron_right, color: CrickTheme.textMuted),
              ],
            ),
          ),
          CrickCard(
            onTap: () => _openUrl(context, '$_site/privacy'),
            child: const Row(
              children: [
                Icon(Icons.privacy_tip_outlined, color: CrickTheme.purple),
                SizedBox(width: 12),
                Expanded(child: Text('Privacy policy')),
                Icon(Icons.chevron_right, color: CrickTheme.textMuted),
              ],
            ),
          ),
          CrickCard(
            onTap: () => _openUrl(context, '$_site/terms'),
            child: const Row(
              children: [
                Icon(Icons.description_outlined, color: CrickTheme.amber),
                SizedBox(width: 12),
                Expanded(child: Text('Terms of use')),
                Icon(Icons.chevron_right, color: CrickTheme.textMuted),
              ],
            ),
          ),
          if (auth.isAuthenticated) ...[
            const SectionHeader('Account'),
            CrickCard(
              onTap: () => _confirmDeleteAccount(context, auth),
              child: const Row(
                children: [
                  Icon(Icons.delete_forever_outlined, color: CrickTheme.danger),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Delete account',
                          style: TextStyle(
                            color: CrickTheme.danger,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Permanently remove your profile and usage data',
                          style: TextStyle(
                            color: CrickTheme.textMuted,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, color: CrickTheme.textMuted),
                ],
              ),
            ),
          ] else
            CrickCard(
              onTap: () => _openUrl(context, '$_site/account-deletion'),
              child: const Row(
                children: [
                  Icon(
                    Icons.manage_accounts_outlined,
                    color: CrickTheme.textSecondary,
                  ),
                  SizedBox(width: 12),
                  Expanded(child: Text('Account deletion information')),
                  Icon(Icons.chevron_right, color: CrickTheme.textMuted),
                ],
              ),
            ),
          CrickCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Crickrida Mobile',
                  style: GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Full IPL analytics client powered by the same FastAPI backend as crickrida.rkjat.in',
                  style: TextStyle(
                    color: CrickTheme.textSecondary,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
        ],
      ),
    );
  }

  Widget _tile(
    BuildContext context,
    IconData icon,
    String title,
    Widget page,
    Color color,
  ) {
    return CrickCard(
      onTap: () =>
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => page)),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          const Icon(Icons.chevron_right, color: CrickTheme.textMuted),
        ],
      ),
    );
  }

  Future<void> _openUrl(BuildContext context, String url) async {
    try {
      final opened = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
      if (opened || !context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open the link. Please try again.'),
        ),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open the link. Please try again.'),
        ),
      );
    }
  }

  Future<void> _confirmDeleteAccount(
    BuildContext context,
    AuthProvider auth,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(
          Icons.warning_amber_rounded,
          color: CrickTheme.danger,
          size: 36,
        ),
        title: const Text('Delete your account?'),
        content: const Text(
          'This permanently deletes your profile, active sessions, and account-linked usage records. This cannot be undone.',
          style: TextStyle(color: CrickTheme.textSecondary, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: CrickTheme.danger,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete permanently'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await auth.deleteAccount();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Your Crickrida account was deleted.')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Account deletion failed: $error')),
        );
      }
    }
  }
}
