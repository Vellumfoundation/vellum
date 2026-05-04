#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

require_command curl
require_command jq
require_command tar

mkdir -p "$BIN_DIR"

if [ -x "$OP_DEPLOYER" ]; then
  log_success "op-deployer already installed at $OP_DEPLOYER"
  "$OP_DEPLOYER" --version || true
  exit 0
fi

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) log_error "Unsupported OS: $(uname -s)"; exit 1 ;;
esac

case "$(uname -m)" in
  aarch64|arm64) arch="arm64" ;;
  x86_64|amd64) arch="amd64" ;;
  *) log_error "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

platform="$os-$arch"
releases_url="https://api.github.com/repos/ethereum-optimism/optimism/releases"

log_info "Finding latest op-deployer release for $platform"
tag_name="$(curl -fsS "$releases_url?per_page=100" | jq -r '.[] | select(.tag_name | startswith("op-deployer/")) | .tag_name' | sort -V | tail -1)"

if [ -z "$tag_name" ]; then
  log_error "Could not find an op-deployer release."
  exit 1
fi

release_info="$(curl -fsS "$releases_url/tags/$tag_name")"
asset_name="$(echo "$release_info" | jq -r ".assets[] | select(.name | contains(\"op-deployer\") and contains(\"$platform\")) | .name" | head -1)"

if [ -z "$asset_name" ]; then
  log_error "No op-deployer asset found for $platform in $tag_name"
  echo "$release_info" | jq -r '.assets[] | select(.name | contains("op-deployer")) | .name'
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

download_url="https://github.com/ethereum-optimism/optimism/releases/download/$tag_name/$asset_name"
log_info "Downloading $download_url"
curl -fL -o "$tmpdir/op-deployer.tar.gz" "$download_url"
tar -xzf "$tmpdir/op-deployer.tar.gz" -C "$tmpdir"

binary_path="$(find "$tmpdir" -type f -name 'op-deployer*' -perm /111 | head -1)"
if [ -z "$binary_path" ]; then
  log_error "Could not find op-deployer binary in archive."
  exit 1
fi

install -m 0755 "$binary_path" "$OP_DEPLOYER"
log_success "Installed $("$OP_DEPLOYER" --version) at $OP_DEPLOYER"
