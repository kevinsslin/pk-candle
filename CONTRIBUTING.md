# Contributing

Thanks for helping improve PK Candle!

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

- Web: `apps/web`
- Server: `apps/server`

## Tests

```bash
pnpm lint
pnpm -C apps/web typecheck
pnpm -C apps/server typecheck
pnpm test
```

## Commit style

- Use short, clear messages (e.g. `feat(ui): ...`, `fix(server): ...`).
- Keep changes focused per commit when possible.

## PR checklist

- [ ] Tested locally
- [ ] No secrets in code
- [ ] Docs updated if behavior changes

