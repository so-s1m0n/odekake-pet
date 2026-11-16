#!/usr/bin/env bash
# scripts/check-commit-safety.sh
# コミット前の安全検査（CONCEPT 5.3 / 5.4）:
#   1. リポジトリ内の .kiro/ が許可リスト（steering / specs / hooks / agents）内だけか
#   2. 資格情報区域（~/.kiro, ~/.local/share/kiro-cli）由来と疑われるファイルが混入していないか
#   3. 追跡対象ファイルに秘密パターン（APIキー・トークン・秘密鍵など）がないか
# 使い方: bash scripts/check-commit-safety.sh （違反があれば exit 1）
set -u
cd "$(dirname "$0")/.."

fail=0

echo "== 1. .kiro 許可リスト検査 =="
while IFS= read -r f; do
  case "$f" in
    .kiro/steering/*|.kiro/specs/*|.kiro/hooks/*|.kiro/agents/*) ;;
    *) echo "NG: 許可リスト外の .kiro ファイル: $f"; fail=1 ;;
  esac
done < <(git ls-files '.kiro/*')

echo "== 2. 資格情報ファイルの混入検査 =="
while IFS= read -r f; do
  case "$f" in
    *.pem|*.key|*credentials*|*secret*|.env|*/.env|*id_rsa*|*id_ed25519*)
      echo "NG: 資格情報と疑われるファイル: $f"; fail=1 ;;
  esac
done < <(git ls-files)

echo "== 3. 秘密パターンの grep 検査 =="
# このスクリプト自身とテスト用ダミーは対象外にする
PATTERN='(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[0-9A-Za-z]{36}|sk-[0-9A-Za-z]{32,}|xox[baprs]-[0-9A-Za-z-]+|AIza[0-9A-Za-z_-]{35})'
if git grep -nE "$PATTERN" -- . ':(exclude)scripts/check-commit-safety.sh' > /tmp/secret_hits.txt 2>/dev/null; then
  echo "NG: 秘密パターンの一致があります:"
  cat /tmp/secret_hits.txt
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "OK: コミット安全検査を通過しました"
else
  echo "NG: コミット安全検査に失敗しました"
fi
exit $fail
