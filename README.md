# ai-document-analyzer

Aplicacion full-stack con setup guiado para conectar Oracle Autonomous Database y servicios OCI desde el wizard inicial.

## Despliegue rapido con Docker

La version publica inicial esta pensada para correr como una sola imagen Docker. El contenedor sirve:

- frontend estatico por `nginx`
- backend FastAPI por `uvicorn`
- proxy interno en `/api`

Ejemplo de arranque:

```bash
docker run -d \
  --name ai-document-analyzer \
  -p 8080:80 \
  -v ai_document_analyzer_data:/app/apps/backend/data \
  -v ai_document_analyzer_wallet:/app/apps/backend/wallet \
  -v ai_document_analyzer_keys:/app/apps/backend/keys \
  -v ai_document_analyzer_logs:/app/apps/backend/logs \
  ghcr.io/<owner>/ai-document-analyzer:v0.1.0
```

Luego abre `http://localhost:8080` o la IP publica de tu VM en OCI.

### Volumenes persistentes

La imagen usa estos directorios persistentes:

- `/app/apps/backend/data`
- `/app/apps/backend/wallet`
- `/app/apps/backend/keys`
- `/app/apps/backend/logs`

Esto permite que el wizard conserve configuracion y artefactos entre reinicios.

### Flujo del wizard

En el primer arranque, el usuario completa todo desde la UI:

1. Sube el `wallet.zip`
2. Selecciona el alias del `tnsnames.ora`
3. Prueba y guarda la conexion ADB
4. Sube el `key.pem`
5. Prueba OCI, Object Storage y Generative AI
6. Ejecuta la instalacion SQL
7. Completa el setup

La imagen publica no incluye credenciales, wallet ni datos reales.

### Actualizar a una nueva version

```bash
docker pull ghcr.io/<owner>/ai-document-analyzer:v0.1.0
docker stop ai-document-analyzer
docker rm ai-document-analyzer
docker run -d \
  --name ai-document-analyzer \
  -p 8080:80 \
  -v ai_document_analyzer_data:/app/apps/backend/data \
  -v ai_document_analyzer_wallet:/app/apps/backend/wallet \
  -v ai_document_analyzer_keys:/app/apps/backend/keys \
  -v ai_document_analyzer_logs:/app/apps/backend/logs \
  ghcr.io/<owner>/ai-document-analyzer:v0.1.0
```

## Desarrollo local

Proyecto listo para ejecutarse desde la raiz del workspace.

### Requisitos

- Windows con PowerShell
- Node.js y npm instalados
- Entorno virtual del backend en `apps/backend/.venv`

### Levantar el proyecto

Ejecuta desde la raiz del repositorio:

```powershell
.\scripts\dev.ps1
```

Esto abre dos consolas:

- Backend FastAPI en `http://127.0.0.1:8012/`
- Frontend Vite en `http://localhost:5173/`

En Cursor o VS Code, usa la tarea integrada `Dev: Start Project` para abrir ambos procesos en terminales del editor.

La tarea del backend usa un runner de desarrollo que limita el `reload` a codigo fuente y excluye directorios de runtime como `apps/backend/data` y `apps/backend/logs`. Esto evita que la ingesta de documentos reinicie el backend mientras escribe OCR, imagenes de paginas o artefactos temporales.

`Dev: Start Project` no se usa como comando de PowerShell. Es una tarea del editor.

En Cursor:

1. Abre la carpeta raiz del repositorio
2. Presiona `Ctrl+Shift+P`
3. Escribe `Tasks: Run Task`
4. Presiona Enter
5. Elige `Dev: Start Project`

Otra forma:

1. Menu `Terminal`
2. `Run Task...`
3. Elige `Dev: Start Project`

Si necesitas reinstalar dependencias del frontend:

```powershell
.\scripts\dev.ps1 -InstallFrontendDeps
```

Si prefieres levantar el backend sin `--reload`:

```powershell
.\scripts\dev.ps1 -NoReload
```

Si quieres forzar ventanas externas incluso desde Cursor o VS Code:

```powershell
.\scripts\dev.ps1 -ExternalWindows
```

## Verificacion rapida

```powershell
.\scripts\check-project.ps1
```

La validacion hace dos cosas:

- comprueba que el backend importa correctamente
- compila el frontend para confirmar que no hay errores de build
