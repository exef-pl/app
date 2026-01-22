# 🤝 Kontrybucja

## 📚 Nawigacja

- **[⬅️ Powrót](README.md)** — główna dokumentacja
- **[🧪 Testowanie](TESTING.md)** — jak uruchamiać testy

---

Wkład w rozwój projektu przyjmowany jest w formie pull requestów oraz zgłoszeń w Issues.

Zalecany przebieg prac:

- opis problemu lub propozycji zmiany (Issue),
- implementacja w osobnej gałęzi,
- dołączenie testów dla zmian zachowania,
- utrzymanie jakości: uruchomienie testów oraz podstawowych kontroli jakości,
- krótki opis zmian i uzasadnienie w PR.

## 🏷️ Release / tagowanie

W tym repo zalecany sposób publikacji zmian to:

- commitujesz zmiany,
- uruchamiasz `make push` (automatycznie bump wersji, generacja `docs/v/<tag>/...`, commit release, tag i push).

Zobacz **[docs/TESTING.md](TESTING.md)** oraz **[README.md](README.md)**.

---

## 🔧 Przydatne komendy

```bash
# Sprawdź status repozytorium
git status

# Zobacz ostatnie zmiany
git log --oneline -10

# Zbuduj projekt
make exef-all

# Uruchom testy
pytest
```
