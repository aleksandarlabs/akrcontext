Prepárame los comandos para integrar la rama $ARGUMENTS en main. NO ejecutes nada, solo genera texto que yo copie y pego.

1. Muestra el diff resumido (archivos tocados).
2. Dame los comandos en este orden exacto:

git fetch origin
git rebase origin/main
git switch main
git pull --ff-only origin main
git merge --squash {rama}
git commit -m "{tipo}({scope}): {descripción}"
git push origin main
git branch -D {rama}

3. Redacta el mensaje de commit tú, siguiendo Conventional Commits, basándote en los cambios reales del diff.
4. Si el proyecto tiene test/lint, incluye el comando entre el rebase y el switch.
5. Si detectas conflictos potenciales, avísame antes de dar los comandos.