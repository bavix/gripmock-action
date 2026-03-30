# GripMock GitHub Action

Run [GripMock](https://github.com/bavix/gripmock) in your workflow with a single step.

The action wraps **the fastest and most reliable gRPC mock server** for CI scenarios.

This action:

- downloads GripMock binary from GitHub Releases (`latest` or pinned version)
- starts GripMock in background
- waits for readiness (`/api/health/readiness`)
- exposes connection outputs for test steps
- stops GripMock automatically in the post step

## Quick start

```yaml
name: test

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Start GripMock
        uses: bavix/gripmock-action@v1
        with:
          source: proto/service.proto
          stub: stubs

      - name: Run tests
        run: go test ./...
```

## Recommended API

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `source` | `""` | Single descriptor source (`.proto`, `.pb`, `buf.build/...`, `grpc://...`, `grpcs://...`) |
| `sources` | `""` | Extra sources, one per line |
| `stub` | `""` | Stub folder/file passed as `--stub` |
| `imports` | `""` | Proto import directories, one per line (`--imports`) |
| `plugins` | `""` | Plugin paths (`.so`), one per line (`--plugins`) |
| `extra-args` | `""` | Additional raw args, one per line |
| `version` | `latest` | GripMock version (`latest`, `3.7.1`, `v3.7.1`) |
| `github-token` | `""` | Optional token used only for authenticated `latest` fallback to GitHub API |
| `grpc-host` | `127.0.0.1` | `GRPC_HOST` env |
| `grpc-port` | `4770` | `GRPC_PORT` env |
| `http-host` | `127.0.0.1` | `HTTP_HOST` env |
| `http-port` | `4771` | `HTTP_PORT` env |
| `log-level` | `info` | `LOG_LEVEL` env |
| `env` | `""` | Extra env vars, one `KEY=VALUE` per line |
| `wait` | `true` | Wait for readiness before finishing step |
| `wait-timeout` | `30s` | Max readiness wait time (`ms`, `s`, `m`) |
| `wait-interval` | `500ms` | Poll interval while waiting |
| `auto-stop` | `true` | Stop GripMock in post step |
| `log-file` | `${{ runner.temp }}/gripmock.log` | File to write GripMock logs |

### Outputs

| Output | Description |
| --- | --- |
| `version` | Resolved GripMock version (without `v`) |
| `binary-path` | Full path to downloaded binary |
| `pid` | GripMock process id |
| `grpc-addr` | `<grpc-host>:<grpc-port>` |
| `http-addr` | `<http-host>:<http-port>` |
| `grpc-port` | Effective gRPC port |
| `http-port` | Effective HTTP port |
| `readiness-url` | Health endpoint URL used by waiter |
| `log-file` | Effective log file path |

## Advanced examples

### BSR module + custom env

```yaml
- name: Start GripMock from BSR
  uses: bavix/gripmock-action@v1
  with:
    source: buf.build/connectrpc/eliza
    stub: stubs
    env: |
      BSR_BUF_TOKEN=${{ secrets.BSR_BUF_TOKEN }}
```

### Reflection source with replay mode

```yaml
- name: Start replay mode
  uses: bavix/gripmock-action@v1
  with:
    source: grpc+replay://localhost:50051
    wait-timeout: 60s
```

### Multiple proto files and imports

```yaml
- name: Start GripMock with multiple sources
  uses: bavix/gripmock-action@v1
  with:
    source: proto/a.proto
    sources: |
      proto/b.proto
      proto/c.proto
    imports: |
      proto
      third_party
```

## Notes

- Use pinned `version` in CI for reproducibility.
- If `version` is pinned (`x.y.z`), the action does not call GitHub release API.
- For `version: latest`, the action resolves via redirect first; API fallback is used only when `github-token` is provided.
- `extra-args` is parsed line-by-line; each line is one CLI argument.
- If startup fails, the action prints the last part of the log file.
- Node runtime is `node24` (requires GitHub Actions Runner `v2.327.1+`).

## Project structure

This repository follows the same structure used by mature JavaScript actions (for example, `actions/checkout`):

- `action.yml` - action metadata and API contract
- `src/` - editable source code
- `dist/` - runtime files used by GitHub Actions (`runs.main` and `runs.post`)
- `.github/workflows/ci.yml` - CI validation (build + syntax checks)
- `.github/workflows/check-dist.yml` - dedicated guard that `dist/` is always committed and in sync
- `scripts/build.mjs` - deterministic build step (`src` -> `dist`)

Development commands:

```bash
npm run build
npm run check
```

Smoke validation in pull requests (`.github/workflows/release-smoke.yml`) runs this action against:

- local Greeter descriptor source as `.proto`
- local Greeter descriptor source as compiled `.pb`
- BSR source `buf.build/connectrpc/eliza`
- reflection and upstream modes: `grpc://`, `grpc+proxy://`, `grpc+replay://`, `grpc+capture://` (using `bavix/greeter-server`)

## License

[MIT](LICENSE)
