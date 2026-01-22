# Dokumentacja ExEF

## 📚 Nawigacja

- **[Kontrybucja](CONTRIBUTING.md)** — zasady współpracy i release
- **[Testowanie](TESTING.md)** — jak uruchamiać testy (w tym E2E)
- **[Wersje](#wersjonowane-notatki-release)** — historię zmian

---

## 📄 Dokumentacja

- `CONTRIBUTING.md` — zasady kontrybucji
- `TESTING.md` — jak uruchamiać testy (w tym E2E)

---

## 🏷️ Wersjonowane notatki release

Tworzone przez `make push`:

| Wersja | Changelog | TODO |
|--------|-----------|------|
| [v0.1.2](v/v0.1.2/changelog.md) | [📝](v/v0.1.2/changelog.md) | [📋](v/v0.1.2/todo.md) |
| [v0.1.1](v/v0.1.1/changelog.md) | [📝](v/v0.1.1/changelog.md) | [📋](v/v0.1.1/todo.md) |

---

## 🚀 Szybki start

```bash
# Zbuduj lokalną usługę
make exef-local-bin

# Uruchom web service przez Docker
make exef-web-up

# Zobacz wszystkie dostępne komendy
make help
```

## Testowanie UI / pliki przykładowe

Instrukcja testów manualnych (UI + linki do plików CSV/XML) jest w głównym README:

- [`README.md` → "Testowanie UI (local-service)"](../README.md#testowanie-ui-local-service)
