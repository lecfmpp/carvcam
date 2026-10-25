#!/usr/bin/env bash
# Mac: dois cliques neste arquivo abrem o Terminal e rodam o CarvCAM (mesmo que testar-carvcam.sh).
cd "$(dirname "$0")"
bash ./testar-carvcam.sh "$@"
status=$?
if [ $status -ne 0 ]; then
  echo
  echo "Algo deu errado (código $status). Copie as mensagens acima e mande para quem está ajudando."
fi
read -r -p "Pressione Enter para fechar…" _
