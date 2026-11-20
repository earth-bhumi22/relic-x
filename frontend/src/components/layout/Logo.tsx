// Owner: A (Arvind)
// The RELIC-X mark: a square tile cut along both diagonals into four shards, one for each edge a fragment has
// (N, E, S, W). The gaps between the shards draw the "X". The north shard has slipped out of place; on hover
// (or focus) of the surrounding link it snaps home. Colours come from the nav tokens, so it follows the theme.
export default function Logo({ size = "1.75rem" }: { size?: string }) {
  return (
    <svg className="logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <polygon className="shard shard-s" points="16,16 28,28 4,28" />
      <polygon className="shard shard-e" points="16,16 28,4 28,28" />
      <polygon className="shard shard-w" points="16,16 4,28 4,4" />
      <polygon className="shard shard-n" points="16,16 4,4 28,4" />
    </svg>
  );
}
