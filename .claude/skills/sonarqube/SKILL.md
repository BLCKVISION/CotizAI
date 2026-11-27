---
name: sonarqube
description: Analiza este proyecto con un SonarQube local (Docker) y reporta calificación de seguridad, vulnerabilidades, security hotspots, bugs y code smells. Úsala cuando pidan el score o las vulnerabilidades de SonarQube, o comprobar una corrección.
---

# SonarQube local

Ejecuta desde la raíz del proyecto:

    bash .claude/skills/sonarqube/scripts/scan.sh

Requisitos: Docker, `python3` y unos 4 GB de RAM libres. La primera vez descarga las imágenes oficiales.

## Qué hace
1. Arranca (o reutiliza) el contenedor `cotizai-sonar`, solo accesible en `127.0.0.1:19999`, con la telemetría desactivada.
2. Copia los archivos que Git publicaría, sin `.env` (solo los `.env.example`) ni la carpeta `ignorar/`.
3. Analiza la copia y muestra las métricas, los problemas de seguridad y los hotspots.

La contraseña y el token del SonarQube local se guardan en `~/.local/state/cotizai-sonar`, fuera del repositorio.
No los muestres ni los copies al proyecto.

## Cómo informar
- Di qué carpeta y commit se analizaron. El resultado puede diferir de otro SonarQube (versión, perfil, rama o reglas).
- La calificación va de A (mejor) a E (peor).
- Este análisis no sustituye la revisión de dependencias con CVE.
- No marques un problema como falso positivo sin leer el código señalado.
- Reportar no implica corregir: pregunta antes de cambiar código si no lo pidieron.

## Detenerlo
    docker stop cotizai-sonar
