# EXEF Desktop

Aplikacja desktopowa EXEF dla Windows, macOS i Linux.

## Wymagania

- Node.js 18+
- npm lub yarn

## Instalacja

```bash
cd desktop
npm install
```

## Uruchomienie w trybie deweloperskim

```bash
npm start
```

## Budowanie aplikacji

### Wszystkie platformy
```bash
npm run build
```

### Tylko Linux
```bash
npm run build:linux
```

### Tylko Windows
```bash
npm run build:win
```

### Tylko macOS
```bash
npm run build:mac
```

## Funkcje

### v2.0.0
- ✅ Natywna aplikacja Electron
- ✅ Menu w języku polskim
- ✅ Skróty klawiaturowe
- ✅ Tryb offline z lokalną bazą SQLite
- ✅ Automatyczna synchronizacja gdy online

### Planowane
- Auto-update mechanism
- Powiadomienia systemowe
- Integracja z systemem plików

## Architektura

```
desktop/
├── main.js          # Główny proces Electron
├── preload.js       # Preload script (IPC bridge)
├── renderer/        # Pliki offline UI
│   └── index.html
├── assets/          # Ikony i zasoby
│   └── icon.svg
└── package.json
```

## Tryby pracy

### Online Mode
Aplikacja łączy się z serwerem backend i ładuje UI z serwera.
Wszystkie dane są synchronizowane w czasie rzeczywistym.

### Offline Mode
Aplikacja używa lokalnej bazy SQLite.
Dane są synchronizowane gdy połączenie zostanie przywrócone.

## Konfiguracja

Ustawienia są przechowywane w:
- **Linux**: `~/.config/exef-desktop/config.json`
- **macOS**: `~/Library/Application Support/exef-desktop/config.json`
- **Windows**: `%APPDATA%/exef-desktop/config.json`
