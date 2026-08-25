// Internal team test accounts. These get relaxed session rules: they may stay
// signed in on multiple devices at once (login does NOT rotate the bearer
// token or destroy other sessions). All other accounts keep strict
// single-active-session behavior.
export const TEAM_EMAILS = new Set(
  [
    'test@test.com',
    'sudinsr@test.com', 'sudinus@test.com',
    'hetalsr@test.com', 'hetalus@test.com',
    'amandasr@test.com', 'amandaus@test.com',
    'aseemsr@test.com', 'aseemus@test.com',
    'gaurisr@test.com', 'gaurius@test.com',
    'mullinsr@test.com', 'mullinus@test.com',
    'marshallsr@test.com', 'marshallus@test.com',
    'daesr@test.com', 'daeus@test.com',
    'sirishsr@test.com', 'sirishus@test.com',
    'kerrysr@test.com', 'kerryus@test.com',
    'kevinsr@test.com', 'kevinus@test.com',
    'benjysr@test.com', 'benjyus@test.com',
  ].map((e) => e.toLowerCase()),
);

export function isTeamAccount(email: string | null | undefined): boolean {
  return !!email && TEAM_EMAILS.has(email.toLowerCase());
}

// Team members (any @test.com account except the owner) are paused from
// creating new reports while the site redesign is in progress. Applies in
// both development and production. Remove this gate when the redesign ships.
export const TEAM_RUNS_PAUSED = true;
export function isPausedTeamMember(email: string | null | undefined): boolean {
  if (!TEAM_RUNS_PAUSED || !email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith('@test.com') && lower !== 'test@test.com';
}
