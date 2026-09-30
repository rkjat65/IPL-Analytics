class AppConfig {
  /// Production API base (no trailing slash).
  static const String apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://crickrida.com',
  );

  /// Store builds use neutral initials and team badges by default. Enable
  /// third-party photos/logos only after confirming the required media rights.
  static const bool useRemoteMedia = bool.fromEnvironment(
    'USE_REMOTE_MEDIA',
    defaultValue: false,
  );

  static String get apiPrefix => '$apiBase/api';

  static String playerImage(String name) =>
      '$apiPrefix/players/${Uri.encodeComponent(name)}/image';

  static String teamImage(String filename) =>
      '$apiPrefix/team-images/$filename';

  static String venueImage(String name) =>
      '$apiPrefix/venues/${Uri.encodeComponent(name)}/image';
}
