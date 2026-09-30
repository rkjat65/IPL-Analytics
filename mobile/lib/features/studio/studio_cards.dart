import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/formatters.dart';
import '../../core/teams.dart';
import '../../core/theme.dart';
import '../../widgets/widgets.dart';

/// Canvas sizes by orientation — not social platform names.
enum CardFormat {
  landscape(Size(1200, 675), 'Landscape', '16:9', Icons.crop_landscape_rounded),
  square(Size(1080, 1080), 'Square', '1:1', Icons.crop_square_rounded),
  portrait(Size(1080, 1920), 'Portrait', '9:16', Icons.crop_portrait_rounded);

  const CardFormat(this.dims, this.label, this.ratio, this.icon);
  final Size dims;
  final String label;
  final String ratio;
  final IconData icon;

  bool get isPortrait => dims.height > dims.width;
  bool get isSquare => (dims.width - dims.height).abs() < 2;
  bool get isLandscape => dims.width > dims.height;
}

// ── Shared scaffold ──────────────────────────────────────────────

class _StudioScaffold extends StatelessWidget {
  const _StudioScaffold({
    required this.format,
    required this.accent,
    required this.child,
  });

  final CardFormat format;
  final Color accent;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final pad = format.isPortrait ? 44.0 : 36.0;
    return Container(
      width: format.dims.width,
      height: format.dims.height,
      color: CrickTheme.bgPrimary,
      child: Stack(
        children: [
          Positioned.fill(child: CustomPaint(painter: _DotGridPainter())),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              height: 6,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [accent, accent.withValues(alpha: 0.12)],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.fromLTRB(pad, pad + 6, pad, pad * 0.85),
              child: child,
            ),
          ),
          Positioned(
            left: pad,
            bottom: 18,
            child: Text(
              'CRICKRIDA',
              style: GoogleFonts.jetBrainsMono(
                color: CrickTheme.textMuted,
                fontSize: format.isPortrait ? 18 : 15,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.4,
              ),
            ),
          ),
          Positioned(
            right: pad,
            bottom: 18,
            child: Text(
              'crickrida.com',
              style: GoogleFonts.jetBrainsMono(
                color: CrickTheme.textMuted,
                fontSize: format.isPortrait ? 16 : 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DotGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = CrickTheme.textMuted.withValues(alpha: 0.1);
    const step = 24.0;
    for (double x = 12; x < size.width; x += step) {
      for (double y = 12; y < size.height; y += step) {
        canvas.drawCircle(Offset(x, y), 1, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ── Metric tile: fonts scale with cell size ──────────────────────

class StudioMetricTile extends StatelessWidget {
  const StudioMetricTile({
    super.key,
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final h = c.maxHeight;
        final w = c.maxWidth;
        final minSide = h < w ? h : w;
        // Dense, readable — scales with cell
        final labelSize = (minSide * 0.13).clamp(14.0, 36.0);
        final valueSize = (minSide * 0.34).clamp(28.0, 92.0);
        final padH = (w * 0.06).clamp(6.0, 20.0);
        final padV = (h * 0.08).clamp(6.0, 18.0);
        final radius = (minSide * 0.08).clamp(10.0, 20.0);

        return Container(
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(
              color: color.withValues(alpha: 0.32),
              width: 1.5,
            ),
          ),
          padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jetBrainsMono(
                  color: color,
                  fontSize: labelSize,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                  height: 1.1,
                ),
              ),
              SizedBox(height: (h * 0.05).clamp(4.0, 14.0)),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jetBrainsMono(
                  color: CrickTheme.textPrimary,
                  fontSize: valueSize,
                  fontWeight: FontWeight.w800,
                  height: 1.0,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// 2-row grid that **fills** available height (no fixed aspect void).
class StudioMetricGrid extends StatelessWidget {
  const StudioMetricGrid({
    super.key,
    required this.items,
    required this.colors,
    this.columns = 4,
    this.gap = 14,
  });

  final List<(String, String)> items;
  final List<Color> colors;
  final int columns;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final rows = <List<(String, String)>>[];
    for (var i = 0; i < items.length; i += columns) {
      rows.add(items.sublist(i, (i + columns).clamp(0, items.length)));
    }

    return Column(
      children: [
        for (var r = 0; r < rows.length; r++) ...[
          if (r > 0) SizedBox(height: gap),
          Expanded(
            child: Row(
              children: [
                for (var c = 0; c < columns; c++) ...[
                  if (c > 0) SizedBox(width: gap),
                  Expanded(
                    child: c < rows[r].length
                        ? StudioMetricTile(
                            label: rows[r][c].$1,
                            value: rows[r][c].$2,
                            color: colors[(r * columns + c) % colors.length],
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

const _metricColors = [
  CrickTheme.cyan,
  CrickTheme.magenta,
  CrickTheme.lime,
  CrickTheme.amber,
  CrickTheme.purple,
  CrickTheme.cyan,
  CrickTheme.magenta,
  CrickTheme.lime,
];

// ── Player card ──────────────────────────────────────────────────

class StudioPlayerCard extends StatelessWidget {
  const StudioPlayerCard({
    super.key,
    required this.playerName,
    required this.stats,
    required this.type,
    required this.format,
  });

  final String playerName;
  final Map<String, dynamic> stats;
  final String type;
  final CardFormat format;

  List<(String, String)> get _metrics {
    if (type == 'batting') {
      return [
        ('MAT', formatNumber(stats['matches'])),
        ('INN', formatNumber(stats['innings'])),
        ('AVG', formatDecimal(stats['avg'])),
        ('SR', formatDecimal(stats['sr'])),
        ('50s', formatNumber(stats['fifties'])),
        ('100s', formatNumber(stats['hundreds'])),
        ('6s', formatNumber(stats['sixes'])),
        ('4s', formatNumber(stats['fours'])),
      ];
    }
    return [
      ('MAT', formatNumber(stats['matches'])),
      ('INN', formatNumber(stats['innings'])),
      ('AVG', formatDecimal(stats['avg'])),
      ('ECON', formatDecimal(stats['economy'])),
      ('SR', formatDecimal(stats['sr'])),
      ('BEST', (stats['best_figures'] ?? stats['best'] ?? '—').toString()),
      ('4W', formatNumber(stats['four_wickets'])),
      ('5W', formatNumber(stats['five_wickets'])),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final accent = type == 'batting' ? CrickTheme.cyan : CrickTheme.magenta;
    final hero = type == 'batting'
        ? formatNumber(stats['runs'])
        : formatNumber(stats['wickets']);
    final heroLabel = type == 'batting' ? 'RUNS' : 'WICKETS';
    final metrics = _metrics;

    if (format.isPortrait) {
      return _StudioScaffold(
        format: format,
        accent: accent,
        child: Column(
          children: [
            // ~6%
            Text(
              type == 'batting' ? 'BATTING' : 'BOWLING',
              style: GoogleFonts.jetBrainsMono(
                color: accent,
                fontWeight: FontWeight.w800,
                fontSize: 30,
                letterSpacing: 5,
              ),
            ),
            const SizedBox(height: 20),
            // Photo ~22%
            PlayerAvatar(
              name: playerName,
              size: 300,
              radius: 34,
              borderColor: accent,
            ),
            const SizedBox(height: 18),
            // Name + hero ~16%
            Text(
              playerName,
              textAlign: TextAlign.center,
              style: GoogleFonts.spaceGrotesk(
                fontSize: 52,
                fontWeight: FontWeight.w800,
                height: 1.05,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              hero,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 96,
                fontWeight: FontWeight.w800,
                color: accent,
                height: 1,
              ),
            ),
            Text(
              heroLabel,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                letterSpacing: 3,
                color: CrickTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 22),
            // Stats fill rest
            Expanded(
              child: StudioMetricGrid(
                items: metrics,
                colors: _metricColors,
                columns: 2,
                gap: 16,
              ),
            ),
            const SizedBox(height: 36), // room for footer watermark
          ],
        ),
      );
    }

    // Landscape + Square: header flex + stats fill remaining
    final avatarSize = format.isSquare ? 168.0 : 128.0;
    final nameSize = format.isSquare ? 44.0 : 40.0;
    final heroSize = format.isSquare ? 72.0 : 62.0;
    final headerFlex = format.isSquare ? 34 : 32;
    final statsFlex = format.isSquare ? 58 : 56;

    return _StudioScaffold(
      format: format,
      accent: accent,
      child: Column(
        children: [
          Expanded(
            flex: headerFlex,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                PlayerAvatar(
                  name: playerName,
                  size: avatarSize,
                  radius: 24,
                  borderColor: accent,
                ),
                SizedBox(width: format.isSquare ? 28 : 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        type == 'batting' ? 'BATTING STATS' : 'BOWLING STATS',
                        style: GoogleFonts.jetBrainsMono(
                          color: accent,
                          fontWeight: FontWeight.w800,
                          fontSize: format.isSquare ? 18 : 16,
                          letterSpacing: 2.2,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        playerName,
                        style: GoogleFonts.spaceGrotesk(
                          fontSize: nameSize,
                          fontWeight: FontWeight.w800,
                          height: 1.05,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      hero,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: heroSize,
                        fontWeight: FontWeight.w800,
                        color: accent,
                        height: 1,
                      ),
                    ),
                    Text(
                      heroLabel,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: CrickTheme.textSecondary,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(height: 2, color: accent.withValues(alpha: 0.35)),
          SizedBox(height: format.isSquare ? 18 : 14),
          Expanded(
            flex: statsFlex,
            child: StudioMetricGrid(
              items: metrics,
              colors: _metricColors,
              columns: 4,
              gap: format.isSquare ? 16 : 12,
            ),
          ),
          const SizedBox(height: 28), // footer watermark clearance
        ],
      ),
    );
  }
}

// ── Comparison ───────────────────────────────────────────────────

class StudioComparisonCard extends StatelessWidget {
  const StudioComparisonCard({
    super.key,
    required this.p1Name,
    required this.p2Name,
    required this.p1Stats,
    required this.p2Stats,
    required this.format,
  });

  final String p1Name;
  final String p2Name;
  final Map<String, dynamic> p1Stats;
  final Map<String, dynamic> p2Stats;
  final CardFormat format;

  @override
  Widget build(BuildContext context) {
    final metrics = [
      ('Runs', formatNumber(p1Stats['runs']), formatNumber(p2Stats['runs'])),
      ('Avg', formatDecimal(p1Stats['avg']), formatDecimal(p2Stats['avg'])),
      ('SR', formatDecimal(p1Stats['sr']), formatDecimal(p2Stats['sr'])),
      (
        '50s',
        formatNumber(p1Stats['fifties']),
        formatNumber(p2Stats['fifties']),
      ),
      ('6s', formatNumber(p1Stats['sixes']), formatNumber(p2Stats['sixes'])),
    ];
    final avatar = format.isPortrait
        ? 190.0
        : (format.isSquare ? 140.0 : 112.0);

    return _StudioScaffold(
      format: format,
      accent: CrickTheme.lime,
      child: Column(
        children: [
          Text(
            'COMPARISON',
            style: GoogleFonts.jetBrainsMono(
              color: CrickTheme.lime,
              fontWeight: FontWeight.w800,
              letterSpacing: 3,
              fontSize: format.isPortrait ? 28 : 18,
            ),
          ),
          SizedBox(height: format.isPortrait ? 20 : 14),
          Row(
            children: [
              Expanded(child: _head(p1Name, CrickTheme.cyan, avatar)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'VS',
                  style: GoogleFonts.spaceGrotesk(
                    fontSize: format.isPortrait ? 36 : 26,
                    fontWeight: FontWeight.w800,
                    color: CrickTheme.textMuted,
                  ),
                ),
              ),
              Expanded(child: _head(p2Name, CrickTheme.magenta, avatar)),
            ],
          ),
          SizedBox(height: format.isPortrait ? 20 : 12),
          Expanded(
            child: Column(
              children: [
                for (var i = 0; i < metrics.length; i++) ...[
                  if (i > 0) SizedBox(height: format.isPortrait ? 10 : 8),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, c) {
                        final fs = (c.maxHeight * 0.38).clamp(20.0, 40.0);
                        final ls = (c.maxHeight * 0.22).clamp(12.0, 20.0);
                        final m = metrics[i];
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          decoration: BoxDecoration(
                            color: CrickTheme.bgCard,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: CrickTheme.borderSubtle),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  m.$2,
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: fs,
                                    fontWeight: FontWeight.w800,
                                    color: CrickTheme.cyan,
                                  ),
                                ),
                              ),
                              Text(
                                m.$1,
                                style: GoogleFonts.jetBrainsMono(
                                  color: CrickTheme.textSecondary,
                                  fontSize: ls,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  m.$3,
                                  textAlign: TextAlign.right,
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: fs,
                                    fontWeight: FontWeight.w800,
                                    color: CrickTheme.magenta,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 28),
        ],
      ),
    );
  }

  Widget _head(String name, Color color, double size) {
    return Column(
      children: [
        PlayerAvatar(
          name: name,
          size: size,
          radius: size * 0.16,
          borderColor: color,
        ),
        const SizedBox(height: 10),
        Text(
          name,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.spaceGrotesk(
            fontSize: size > 150 ? 26 : 18,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ],
    );
  }
}

// ── Match ────────────────────────────────────────────────────────

class StudioMatchCard extends StatelessWidget {
  const StudioMatchCard({super.key, required this.match, required this.format});
  final Map<String, dynamic> match;
  final CardFormat format;

  @override
  Widget build(BuildContext context) {
    final info = match['info'] is Map
        ? Map<String, dynamic>.from(match['info'] as Map)
        : match;
    final t1 = (info['team1'] ?? match['team1'] ?? 'Team 1').toString();
    final t2 = (info['team2'] ?? match['team2'] ?? 'Team 2').toString();
    final logo = format.isPortrait ? 140.0 : (format.isSquare ? 110.0 : 92.0);

    return _StudioScaffold(
      format: format,
      accent: CrickTheme.magenta,
      child: Column(
        children: [
          Text(
            'MATCH',
            style: GoogleFonts.jetBrainsMono(
              color: CrickTheme.magenta,
              fontWeight: FontWeight.w800,
              letterSpacing: 3,
              fontSize: format.isPortrait ? 28 : 18,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatDate(info['date'] ?? match['date']),
            style: GoogleFonts.jetBrainsMono(
              color: CrickTheme.textMuted,
              fontSize: 18,
            ),
          ),
          const Spacer(flex: 2),
          Row(
            children: [
              Expanded(child: _team(t1, logo)),
              Text(
                'VS',
                style: GoogleFonts.spaceGrotesk(
                  fontSize: format.isPortrait ? 42 : 32,
                  fontWeight: FontWeight.w800,
                  color: CrickTheme.cyan,
                ),
              ),
              Expanded(child: _team(t2, logo)),
            ],
          ),
          const Spacer(flex: 2),
          Text(
            matchResult({...info, ...match}),
            textAlign: TextAlign.center,
            style: GoogleFonts.spaceGrotesk(
              fontSize: format.isPortrait ? 34 : 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            (info['venue'] ?? match['venue'] ?? '').toString(),
            textAlign: TextAlign.center,
            style: TextStyle(
              color: CrickTheme.textSecondary,
              fontSize: format.isPortrait ? 18 : 15,
            ),
          ),
          if ((info['player_of_match'] ?? match['player_of_match']) !=
              null) ...[
            const SizedBox(height: 14),
            Text(
              'PoM · ${info['player_of_match'] ?? match['player_of_match']}',
              style: GoogleFonts.jetBrainsMono(
                color: CrickTheme.amber,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
          const Spacer(flex: 1),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _team(String team, double logo) {
    return Column(
      children: [
        TeamLogo(team: team, size: logo),
        const SizedBox(height: 10),
        Text(
          teamAbbr(team),
          style: GoogleFonts.spaceGrotesk(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: teamColor(team),
          ),
        ),
      ],
    );
  }
}

// ── Record ───────────────────────────────────────────────────────

class StudioRecordCard extends StatelessWidget {
  const StudioRecordCard({
    super.key,
    required this.title,
    required this.value,
    required this.subtitle,
    required this.format,
  });

  final String title;
  final String value;
  final String subtitle;
  final CardFormat format;

  @override
  Widget build(BuildContext context) {
    return _StudioScaffold(
      format: format,
      accent: CrickTheme.amber,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'RECORD',
            style: GoogleFonts.jetBrainsMono(
              color: CrickTheme.amber,
              fontWeight: FontWeight.w800,
              letterSpacing: 4,
              fontSize: format.isPortrait ? 28 : 18,
            ),
          ),
          SizedBox(height: format.isPortrait ? 28 : 18),
          Text(
            title,
            textAlign: TextAlign.center,
            style: GoogleFonts.spaceGrotesk(
              fontSize: format.isPortrait ? 44 : 36,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: format.isPortrait ? 24 : 16),
          Text(
            value,
            textAlign: TextAlign.center,
            style: GoogleFonts.jetBrainsMono(
              fontSize: format.isPortrait ? 110 : 84,
              fontWeight: FontWeight.w800,
              color: CrickTheme.cyan,
              height: 1,
            ),
          ),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: CrickTheme.textSecondary,
                fontSize: format.isPortrait ? 26 : 20,
              ),
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Season ───────────────────────────────────────────────────────

class StudioSeasonCard extends StatelessWidget {
  const StudioSeasonCard({
    super.key,
    required this.season,
    required this.data,
    required this.format,
  });

  final String season;
  final Map<String, dynamic> data;
  final CardFormat format;

  @override
  Widget build(BuildContext context) {
    final winner = (data['winner'] ?? data['champion'] ?? '—').toString();
    final items = <(String, String)>[
      ('MATCHES', formatNumber(data['matches'] ?? data['total_matches'])),
      ('RUNS', formatNumber(data['total_runs'] ?? data['runs'])),
      ('SIXES', formatNumber(data['sixes'] ?? data['total_sixes'])),
      ('CHAMPION', winner),
    ];
    final colors = [
      CrickTheme.cyan,
      CrickTheme.lime,
      CrickTheme.amber,
      CrickTheme.magenta,
    ];

    return _StudioScaffold(
      format: format,
      accent: CrickTheme.cyan,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SEASON RECAP',
            style: GoogleFonts.jetBrainsMono(
              color: CrickTheme.cyan,
              fontWeight: FontWeight.w800,
              letterSpacing: 2,
              fontSize: format.isPortrait ? 24 : 16,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'IPL $season',
            style: GoogleFonts.spaceGrotesk(
              fontSize: format.isPortrait ? 56 : 44,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: format.isPortrait ? 22 : 16),
          Expanded(
            child: StudioMetricGrid(
              items: items,
              colors: colors,
              columns: 2,
              gap: 16,
            ),
          ),
          const SizedBox(height: 28),
        ],
      ),
    );
  }
}
