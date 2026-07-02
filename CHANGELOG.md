# Changelog

## 0.2.9

- Keeps `pire-browser mcp --help` useful from the JavaScript launcher when the optional native platform package is missing, so MCP-first agents can still discover `mcp --tools core` and profile guidance before repair.

## 0.2.8

- Marks Pi core runtime imports as optional peers so direct npm installs stay lean and avoid pulling Pi's dependency tree into normal CLI installs.
- Clarifies that skipped or blocked npm lifecycle scripts should be followed by an explicit `pire-browser install`.

## 0.2.7

- Keeps top-level help and setup/diagnostic command help available from the JavaScript launcher when the optional native platform package is missing.
- Points missing-native help output to version-matched skills and the concrete `--include=optional` reinstall command.

## 0.2.6

- Extends missing native package repair guidance to the first-run `install` and lower-level `setup` commands, including JSON output for agents.

## 0.2.5

- Keeps `doctor --json` and `install-status --json` useful when the optional native platform package is missing by serving a launcher-level diagnostic with concrete `--include=optional` reinstall guidance.
- Updates postinstall and installed-agent setup guidance to prefer the agent-browser-style `install` command over lower-level `setup` wording.

## 0.2.4

- Adds launcher-served `--version`, `-V`, and `version --json` output so agents can verify installed package resolution even when native setup needs repair.
- Aligns npm package, platform package, and Rust native version metadata for clearer public release diagnostics.
- Adds publish metadata checks so platform packages keep npm provenance-compatible repository metadata.

## 0.2.3

- Added deterministic Pi duplicate-install recovery with `pire-browser pi conflicts` and `pire-browser pi repair`.
- Kept old GitHub/local/ZIP-era install cleanup conservative, report-backed, and available through `npx -y pire-browser@latest pi repair` when Pi cannot start.

## 0.2.2

- Published public npm baseline for `pire-browser`.
- Ships local Firefox automation, Pi extension adapters, installed-agent guidance, public docs, and version-matched optional native packages.
