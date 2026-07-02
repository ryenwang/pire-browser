# Changelog

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
