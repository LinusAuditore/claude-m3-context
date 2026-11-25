# m3-context

A Claude Code mod that puts a **Material 3 Expressive** context meter in the band above the prompt.

- **Cookie badge** with the context percentage. It slowly spins at rest and, while Claude is working, morphs through the M3 Expressive loading-indicator shapes (soft burst, cookie, pentagon, pill, sunny, four-sided cookie, oval).
- **Wavy progress track** with a stop indicator. The wave drifts slowly at rest and flows faster while a turn runs.
- **Tonal color roles** from the M3 baseline palette: primary below 60%, tertiary from 60%, error from 85%. Light and dark follow the app.
- **Auto-compact marker** on the track, where auto-compaction will run.
- **Rate-limit rings** for each window your account reports (5h, 7d, spend limit).
- Respects *reduce motion*. The terminal gets a text and progress-bar version.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install m3-context --marketplace LinusAuditore/claude-m3-context
```

Answer `y` to add the marketplace, then pick a scope (user is first; press Enter).

From a shell:

```bash
claude plugin install m3-context --marketplace LinusAuditore/claude-m3-context
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `LinusAuditore/claude-m3-context`, then **Add plugin**.

## Notes

- The meter appears after the session's first response, when Claude Code first reports context usage.
- On desktop the band's pixel width is estimated from its column count (8.4 px per column). If the track stops short of, or runs past, the edge on your setup, adjust `ADVANCE` in `hooks/register.tsx`.
- The auto-compact threshold comes from Claude Code's local `/context` estimate; no extra API calls are made.

## Development

```bash
claude plugin validate .
claude plugin test .
```

## License

MIT
